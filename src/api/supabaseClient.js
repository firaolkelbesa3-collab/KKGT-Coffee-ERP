import { createClient } from '@supabase/supabase-js'

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

// Drop virtual fields + convert empty strings to null for cleaner inserts.
function cleanPayload(obj) {
  const clean = {}
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'created_date' || key === 'updated_date') continue
    clean[key] = value === '' ? null : value
  }
  return clean
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
      const { data: { user } } = await supabase.auth.getUser()
      const payload = cleanPayload({ ...record, created_by: user?.id })
      const { data, error } = await supabase
        .from(tableName).insert(payload).select().single()
      if (error) {
        console.error(`[db.${tableName}.create]`, error.message)
        throw error
      }
      return addVirtualFields(data)
    },

    update: async (id, updates) => {
      const payload = cleanPayload({ ...updates })
      const { data, error } = await supabase
        .from(tableName).update(payload).eq('id', id).select().single()
      if (error) {
        console.error(`[db.${tableName}.update]`, error.message)
        throw error
      }
      return addVirtualFields(data)
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
