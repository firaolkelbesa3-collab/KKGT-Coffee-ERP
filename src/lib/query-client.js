import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { get, set, del } from 'idb-keyval';

export const queryClientInstance = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      // Keep cached data in memory + persisted storage for 24h so the app has
      // something to show instantly offline. Online, queries still refetch when
      // stale (staleTime below), so users see fresh data when connected.
      gcTime: 1000 * 60 * 60 * 24, // 24h
      staleTime: 1000 * 30,        // 30s — refetch in background when online
      // When a query fails (e.g. offline) but we have cached data, keep showing it.
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});

// IndexedDB-backed persister (via idb-keyval). IndexedDB has far more room than
// localStorage, which matters for an ERP caching hundreds of records.
export const asyncPersister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get(key),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  // Bump this key when the cache shape changes to invalidate stale persisted data.
  key: 'kkgt-rq-cache-v1',
  throttleTime: 1000,
});
