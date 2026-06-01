import { get, set } from 'idb-keyval';

/**
 * Offline write queue (Phase 2.5).
 *
 * Pure IndexedDB-backed storage + a tiny event emitter. Holds create/update
 * operations made while offline so they can be replayed when the connection
 * returns. Intentionally has NO imports from the app/client layer so there's
 * no circular dependency — the client (supabaseClient.js) owns the replay
 * logic and just uses this for storage.
 *
 * Queue item shape:
 *   {
 *     id:        string,   // queue entry id (uuid)
 *     entity:    string,   // table name, e.g. 'purchase_records'
 *     type:      'create' | 'update',
 *     payload:   object,   // the cleaned record to write
 *     recordId?: string,   // for updates: the row id
 *     tempId:    string,   // optimistic id shown in the UI until synced
 *     createdAt: string,   // ISO timestamp
 *   }
 */

const QUEUE_KEY = 'kkgt-sync-queue-v1';
const listeners = new Set();

function emit(count) {
  for (const fn of listeners) {
    try { fn(count); } catch { /* ignore listener errors */ }
  }
}

/** Subscribe to queue-length changes. Returns an unsubscribe fn. */
export function onQueueChange(fn) {
  listeners.add(fn);
  // Push the current count immediately so subscribers render correctly on mount.
  getQueue().then(q => fn(q.length)).catch(() => fn(0));
  return () => listeners.delete(fn);
}

export async function getQueue() {
  try {
    return (await get(QUEUE_KEY)) || [];
  } catch {
    return [];
  }
}

export async function getQueueCount() {
  return (await getQueue()).length;
}

export async function enqueue(op) {
  const queue = await getQueue();
  const entry = {
    id: (crypto?.randomUUID?.() || `q_${Date.now()}_${Math.random().toString(36).slice(2)}`),
    createdAt: new Date().toISOString(),
    ...op,
  };
  queue.push(entry);
  await set(QUEUE_KEY, queue);
  emit(queue.length);
  return entry;
}

export async function removeFromQueue(id) {
  const queue = await getQueue();
  const next = queue.filter(e => e.id !== id);
  await set(QUEUE_KEY, next);
  emit(next.length);
  return next.length;
}

export async function clearQueue() {
  await set(QUEUE_KEY, []);
  emit(0);
}
