import { createClient } from '@supabase/supabase-js'
import { enqueue, getQueue, getQueueCount, removeFromQueue } from '@/lib/offlineQueue'
import { queryClientInstance } from '@/lib/query-client'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Surface this loudly during dev — silent fail leads to confusing 401s later
   
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Set them in .env.local.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// ---------------------------------------------------------------------------
// Entity → Postgres table mapping
// ---------------------------------------------------------------------------
const TABLE = {
  PurchaseRecord:          'purchase_records',
  Purchase:                'purchases',
  Supplier:                'suppliers',
  WarehouseReceipt:        'warehouse_receipts',
  WarehouseReceiptHistory: 'warehouse_receipt_history',
  WarehouseInventory:      'warehouse_inventory',
  ProcessingBatch:         'processing_batches',
  ProcessingLog:           'processing_logs',
  OutputReport:            'output_reports',
  ExportContract:          'export_contracts',
  Export:                  'exports',
  BagReceipt:              'bag_receipts',
  SupplierBagReturn:       'supplier_bag_returns',
  SupplierBagPayment:      'supplier_bag_payments',
  SupplierBagSettlement:   'supplier_bag_settlements',
  RejectBagUsage:          'reject_bag_usages',
  Notification:            'notifications',
  NotificationSettings:    'notification_settings',
  ActivityLog:             'activity_logs',
  SampleLog:               'sample_logs',
  BuyerInspection:         'buyer_inspections',
  MaterialEntry:           'material_entries',
  MaterialRegisterEntry:   'material_register_entries',
  RolePermission:          'role_permissions',
  Attachment:              'attachments',
  User:                    'profiles',
}

// The app sorts by 'created_date'/'updated_date'; the DB uses created_at/updated_at.
const SORT_FIELD_MAP = {
  'created_date': 'created_at',
  '-created_date': '-created_at',
  'updated_date': 'updated_at',
  '-updated_date': '-updated_at',
  'date': 'created_at',
  '-date': '-created_at',
}
function mapSortField(sort) {
  if (!sort) return sort
  return SORT_FIELD_MAP[sort] ?? sort
}

function applySort(query, sort) {
  if (!sort) return query
  const mapped = mapSortField(sort)
  const desc = mapped.startsWith('-')
  const col = desc ? mapped.slice(1) : mapped
  return query.order(col, { ascending: !desc })
}

function applyFilters(query, filters) {
  if (!filters || typeof filters !== 'object') return query
  for (const [key, value] of Object.entries(filters)) {
    if (key === '$or' || value === undefined || value === null) continue
    query = query.eq(key, value)
  }
  return query
}

// Expose virtual `created_date` / `updated_date` aliases so existing code that
// references them keeps working without a global rename.
function addVirtualFields(record) {
  if (!record) return record
  return {
    ...record,
    created_date: record.created_date ?? record.created_at,
    updated_date: record.updated_date ?? record.updated_at,
  }
}
function normalizeList(data) {
  return (data || []).map(addVirtualFields)
}

// ---------------------------------------------------------------------------
// Per-table cleanup rules for writes.
//
// `strip` — columns Postgres will reject on write because they are
//   GENERATED ALWAYS AS (...) STORED, or because a trigger immediately
//   overwrites them. Sending them adds noise to the wire and can fail.
//
// JSON columns are stored as TEXT in this schema (matches the original
// Base44 entity definitions). The frontend already calls JSON.stringify()
// before sending, so we pass the string straight through.
// ---------------------------------------------------------------------------
const TABLE_RULES = {
  purchase_records: {
    // net_feresula is generated; total_paid_etb / balance_etb are set by trigger.
    strip: ['net_feresula', 'total_paid_etb', 'balance_etb'],
  },
  output_reports: {
    strip: ['export_kg', 'reject_kg'], // generated columns
  },
  reject_bag_usages: {
    strip: ['amount_etb'], // generated column
  },
  material_entries: {
    strip: ['total_cost_etb'], // generated column
  },
  material_register_entries: {
    strip: ['total_cost_etb'], // generated column
  },
}

// Drop virtual fields, strip generated/trigger-managed columns, and convert
// empty strings to null for cleaner inserts.
function cleanPayload(obj, tableName) {
  const rules = TABLE_RULES[tableName] || { strip: [] }
  const strip = new Set(['created_date', 'updated_date', ...rules.strip])
  const clean = {}
  for (const [key, value] of Object.entries(obj)) {
    if (strip.has(key)) continue
    clean[key] = value === '' ? null : value
  }
  return clean
}

// If Postgres rejects an insert/update with "Could not find the 'X' column of
// 'Y' in the schema cache", peel that column out of the payload and retry.
// This makes the client resilient to schema drift between the frontend and
// the DB — we still log a console.warn so the missing column is visible.
const UNKNOWN_COLUMN_RX = /Could not find the '([^']+)' column of '([^']+)' in the schema cache/i
async function withUnknownColumnRetry(tableName, payload, runner) {
  let attempt = { ...payload }
  for (let i = 0; i < 25; i++) {
    const { data, error } = await runner(attempt)
    if (!error) return { data, error: null }
    const match = error.message && error.message.match(UNKNOWN_COLUMN_RX)
    if (!match || !(match[1] in attempt)) return { data: null, error }
     
    console.warn(`[db.${tableName}] dropping unknown column "${match[1]}" and retrying. Add this column to the DB to keep the value.`)
    const { [match[1]]: _omit, ...rest } = attempt
    attempt = rest
  }
  return { data: null, error: new Error('too many unknown columns; aborting') }
}

// ---------------------------------------------------------------------------
// Offline write support (Phase 2.5)
//
// When offline (or a write fails with a network error), the create/update is
// pushed to the IndexedDB sync queue and an OPTIMISTIC record is returned +
// injected into the relevant React Query list cache so the UI updates instantly.
// flushQueue() replays the queue when connectivity returns.
// ---------------------------------------------------------------------------

// Maps a table to the React Query list key so we can inject optimistic rows.
const LIST_QUERY_KEY = {
  purchase_records:        ['purchase-records'],
  warehouse_receipts:      ['warehouse-receipts'],
  processing_logs:         ['processing-logs'],
  sample_logs:             ['sample-logs'],
  output_reports:          ['output-reports'],
  export_contracts:        ['export-contracts'],
  suppliers:               ['suppliers'],
  buyer_inspections:       ['buyer-inspections'],
  bag_receipts:            ['bag-receipts'],
  material_register_entries: ['material-register-entries'],
}

function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function isNetworkError(err) {
  if (!err) return false
  const msg = (err.message || '').toLowerCase()
  return err.name === 'TypeError'
    || msg.includes('failed to fetch')
    || msg.includes('network')
    || msg.includes('fetch')
    || err.code === 'ECONNABORTED'
}

function injectOptimistic(tableName, record) {
  const key = LIST_QUERY_KEY[tableName]
  if (!key) return
  queryClientInstance.setQueryData(key, (old) =>
    Array.isArray(old) ? [record, ...old] : old
  )
}

function removeOptimistic(tableName, tempId) {
  const key = LIST_QUERY_KEY[tableName]
  if (!key) return
  queryClientInstance.setQueryData(key, (old) =>
    Array.isArray(old) ? old.filter(r => r.id !== tempId) : old
  )
}

async function enqueueOptimisticCreate(tableName, payload) {
  const tempId = `temp_${crypto?.randomUUID?.() || Date.now()}`
  const nowIso = new Date().toISOString()
  const optimistic = addVirtualFields({
    ...payload,
    id: tempId,
    created_at: nowIso,
    updated_at: nowIso,
    _pendingSync: true,
  })
  await enqueue({ entity: tableName, type: 'create', payload, tempId })
  injectOptimistic(tableName, optimistic)
  return optimistic
}

async function enqueueOptimisticUpdate(tableName, recordId, payload) {
  await enqueue({ entity: tableName, type: 'update', payload, recordId, tempId: recordId })
  return addVirtualFields({ ...payload, id: recordId, _pendingSync: true })
}

/**
 * Replay queued offline writes against Supabase. Safe to call repeatedly.
 * - Network errors stop the run (still offline) — items stay queued.
 * - Permanent errors (constraint/RLS) drop the item so it can't block forever.
 */
export async function flushQueue() {
  if (isOffline()) return { flushed: 0, pending: await getQueueCount() }
  const queue = await getQueue()
  let flushed = 0
  for (const item of queue) {
    try {
      let synced = null
      if (item.type === 'create') {
        const { data, error } = await withUnknownColumnRetry(item.entity, item.payload, p =>
          supabase.from(item.entity).insert(p).select().single()
        )
        if (error) throw error
        synced = addVirtualFields(data)
        removeOptimistic(item.entity, item.tempId)
      } else if (item.type === 'update') {
        const { data, error } = await withUnknownColumnRetry(item.entity, item.payload, p =>
          supabase.from(item.entity).update(p).eq('id', item.recordId).select().single()
        )
        if (error) throw error
        synced = addVirtualFields(data)
      }
      await removeFromQueue(item.id)
      flushed++

      // Fire deferred side effects that couldn't run offline.
      if (item.type === 'create' && item.entity === 'purchase_records' && synced) {
        try {
          const { notifyNewPurchase } = await import('@/lib/notificationService')
          notifyNewPurchase(synced).catch(() => {})
        } catch { /* ignore */ }
      }
    } catch (err) {
      if (isNetworkError(err)) break // still offline — retry on next flush
      // Permanent failure (unique violation, RLS, etc.) — drop so it can't block the queue.
      console.error(`[flushQueue] dropping un-syncable ${item.entity} item:`, err?.message)
      await removeFromQueue(item.id)
      removeOptimistic(item.entity, item.tempId)
    }
  }
  if (flushed > 0) queryClientInstance.invalidateQueries()
  return { flushed, pending: await getQueueCount() }
}

function makeEntity(tableName) {
  return {
    list: async (sort, limit) => {
      let q = supabase.from(tableName).select('*')
      q = applySort(q, sort)
      if (limit) q = q.limit(limit)
      const { data, error } = await q
      if (error) {
        console.error(`[db.${tableName}.list]`, error.message)
        throw error
      }
      return normalizeList(data)
    },

    filter: async (filters, sort, limit) => {
      let q = supabase.from(tableName).select('*')
      q = applyFilters(q, filters)
      q = applySort(q, sort)
      if (limit) q = q.limit(limit)
      const { data, error } = await q
      if (error) {
        console.error(`[db.${tableName}.filter]`, error.message)
        throw error
      }
      return normalizeList(data)
    },

    get: async (id) => {
      const { data, error } = await supabase
        .from(tableName).select('*').eq('id', id).single()
      if (error) {
        console.error(`[db.${tableName}.get]`, error.message)
        throw error
      }
      return addVirtualFields(data)
    },

    create: async (record) => {
      let user = null
      try { user = (await supabase.auth.getUser()).data.user } catch { /* offline — getUser may fail */ }
      const payload = cleanPayload({ ...record, created_by: user?.id }, tableName)

      // Explicitly offline → queue immediately.
      if (isOffline()) return enqueueOptimisticCreate(tableName, payload)

      try {
        const { data, error } = await withUnknownColumnRetry(tableName, payload, p =>
          supabase.from(tableName).insert(p).select().single()
        )
        if (error) throw error
        return addVirtualFields(data)
      } catch (err) {
        // navigator.onLine often lies (reports online with no actual internet).
        // A genuine connectivity failure surfaces as a TypeError "Failed to fetch"
        // — queue it. A real DB error (RLS/constraint) is a structured Postgrest
        // error (has .code / non-TypeError) — rethrow so the user sees it.
        if (isNetworkError(err)) return enqueueOptimisticCreate(tableName, payload)
        console.error(`[db.${tableName}.create]`, err.message)
        throw err
      }
    },

    update: async (id, updates) => {
      const payload = cleanPayload({ ...updates }, tableName)

      if (isOffline()) return enqueueOptimisticUpdate(tableName, id, payload)

      try {
        const { data, error } = await withUnknownColumnRetry(tableName, payload, p =>
          supabase.from(tableName).update(p).eq('id', id).select().single()
        )
        if (error) throw error
        return addVirtualFields(data)
      } catch (err) {
        if (isNetworkError(err)) return enqueueOptimisticUpdate(tableName, id, payload)
        console.error(`[db.${tableName}.update]`, err.message)
        throw err
      }
    },

    delete: async (id) => {
      const { error } = await supabase.from(tableName).delete().eq('id', id)
      if (error) {
        console.error(`[db.${tableName}.delete]`, error.message)
        throw error
      }
      return { success: true }
    },
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// `db.PurchaseRecord.list()` style — canonical going forward.
export const db = Object.fromEntries(
  Object.entries(TABLE).map(([name, table]) => [name, makeEntity(table)])
)

// Google-only auth surface. Email/password and self-registration are out of scope.
export const auth = {
  me: async () => {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw { status: 401, message: 'Not authenticated' }
    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', user.id).single()
    return { ...user, ...(profile || {}), email: user.email }
  },

  loginWithProvider: async (provider, redirectTo) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + (redirectTo || '/') },
    })
    if (error) throw error
  },

  logout: async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  },

  redirectToLogin: () => { window.location.href = '/login' },
}

// Edge function invocation — real, not a stub.
export const functions = {
  invoke: async (name, payload) => {
    const { data, error } = await supabase.functions.invoke(name, { body: payload })
    if (error) {
      console.warn(`[functions.invoke ${name}]`, error.message || error)
      // Non-fatal — Telegram failures must not block business workflows.
      return { ok: false, error: error.message }
    }
    return data
  },
}

// File uploads are intentionally disabled in v1. v1.1 will wire Supabase Storage.
class AttachmentsDisabledError extends Error {
  constructor() {
    super('File attachments are coming in v1.1. Uploads are temporarily disabled.')
    this.name = 'AttachmentsDisabledError'
    this.code = 'ATTACHMENTS_DISABLED'
  }
}

export const integrations = {
  Core: {
    UploadFile: async () => { throw new AttachmentsDisabledError() },
  },
}

// ---------------------------------------------------------------------------
// Backward-compat: `base44.entities.PurchaseRecord.list()` keeps working.
// Remove this alias once the codebase migrates to `db.*`.
// ---------------------------------------------------------------------------
export const base44 = {
  entities: db,
  auth,
  functions,
  integrations,
}
