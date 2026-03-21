/**
 * ============================================================
 *  PHASE 9 — OFFLINE STORE  (IndexedDB via idb)
 * ============================================================
 */
import { openDB } from 'idb';

const DB_NAME    = 'vyapari_offline';
const DB_VERSION = 1;

export const getDB = async () =>
  openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // ── Cache stores ───────────────────────────────────────
      if (!db.objectStoreNames.contains('invoices')) {
        const s = db.createObjectStore('invoices', { keyPath: 'id' });
        s.createIndex('by_biz',    'business_id');
        s.createIndex('by_date',   'invoice_date');
        s.createIndex('by_status', 'status');
      }
      if (!db.objectStoreNames.contains('parties')) {
        const s = db.createObjectStore('parties', { keyPath: 'id' });
        s.createIndex('by_biz',  'business_id');
        s.createIndex('by_type', 'party_type');
      }
      if (!db.objectStoreNames.contains('items')) {
        const s = db.createObjectStore('items', { keyPath: 'id' });
        s.createIndex('by_biz', 'business_id');
      }
      if (!db.objectStoreNames.contains('accounts')) {
        const s = db.createObjectStore('accounts', { keyPath: 'id' });
        s.createIndex('by_biz', 'business_id');
      }
      if (!db.objectStoreNames.contains('dashboard')) {
        db.createObjectStore('dashboard', { keyPath: 'bizId' });
      }
      // ── Offline queue ──────────────────────────────────────
      if (!db.objectStoreNames.contains('offlineQueue')) {
        const q = db.createObjectStore('offlineQueue', { keyPath: 'localId' });
        q.createIndex('by_biz',    'businessId');
        q.createIndex('by_synced', 'synced');
      }
    },
  });

// ── Cache helpers ──────────────────────────────────────────

export const cacheRecords = async (store, records) => {
  if (!records?.length) return;
  const db = await getDB();
  const tx = db.transaction(store, 'readwrite');
  await Promise.all(records.map(r => tx.store.put(r)));
  await tx.done;
};

export const cacheRecord = async (store, record) => {
  const db = await getDB();
  await db.put(store, record);
};

export const getCachedRecords = async (store, bizId) => {
  const db = await getDB();
  return db.getAllFromIndex(store, 'by_biz', bizId);
};

export const getCachedRecord = async (store, id) => {
  const db = await getDB();
  return db.get(store, id);
};

export const cacheDashboard = async (bizId, data) => {
  const db = await getDB();
  await db.put('dashboard', { bizId, data, cachedAt: Date.now() });
};

export const getCachedDashboard = async (bizId) => {
  const db  = await getDB();
  const row = await db.get('dashboard', bizId);
  if (!row || Date.now() - row.cachedAt > 5 * 60 * 1000) return null;
  return row.data;
};

// ── Offline queue ──────────────────────────────────────────

export const enqueueOffline = async (item) => {
  const db      = await getDB();
  const localId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await db.put('offlineQueue', {
    localId,
    businessId: item.businessId,
    entity:     item.entity,
    operation:  item.operation,
    entityId:   item.entityId || null,
    payload:    item.payload,
    synced:     false,
    createdAt:  Date.now(),
    retries:    0,
    error:      null,
  });
  return localId;
};

export const getPendingQueue = async (bizId) => {
  const db  = await getDB();
  const all = await db.getAllFromIndex('offlineQueue', 'by_biz', bizId);
  return all.filter(i => !i.synced).sort((a, b) => a.createdAt - b.createdAt);
};

export const markSynced = async (localId) => {
  const db   = await getDB();
  const item = await db.get('offlineQueue', localId);
  if (item) await db.put('offlineQueue', { ...item, synced: true, syncedAt: Date.now() });
};

export const markFailed = async (localId, error) => {
  const db   = await getDB();
  const item = await db.get('offlineQueue', localId);
  if (item) await db.put('offlineQueue', { ...item, retries: item.retries + 1, error });
};

export const getPendingCount = async (bizId) =>
  (await getPendingQueue(bizId)).length;

export const purgeSyncedItems = async () => {
  const db     = await getDB();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const all    = await db.getAll('offlineQueue');
  const stale  = all.filter(i => i.synced && i.syncedAt < cutoff);
  if (!stale.length) return;
  const tx = db.transaction('offlineQueue', 'readwrite');
  await Promise.all(stale.map(i => tx.store.delete(i.localId)));
  await tx.done;
};

// ── Prefetch all business data for offline use ─────────────
export const prefetchBusinessData = async (bizId, { partyApi, itemApi, accountApi }) => {
  try {
    const [p, it, ac] = await Promise.allSettled([
      partyApi.list(bizId,   { limit: 500 }),
      itemApi.list(bizId,    { limit: 500 }),
      accountApi.list(bizId, {}),
    ]);
    if (p.status  === 'fulfilled') await cacheRecords('parties',  (p.value.data.data || []).map(r => ({ ...r, business_id: bizId })));
    if (it.status === 'fulfilled') await cacheRecords('items',    (it.value.data.data || []).map(r => ({ ...r, business_id: bizId })));
    if (ac.status === 'fulfilled') await cacheRecords('accounts', (ac.value.data.accounts || []).map(r => ({ ...r, business_id: bizId })));
    console.log('[Offline] Prefetch done for', bizId);
  } catch (err) {
    console.warn('[Offline] Prefetch error:', err.message);
  }
};
