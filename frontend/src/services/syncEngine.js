/**
 * ============================================================
 *  PHASE 9 — SYNC ENGINE
 *
 *  Runs on a timer when the app is online.
 *  Reads the offlineQueue, sends batches to /api/sync,
 *  marks items as synced, and refreshes the local cache.
 * ============================================================
 */
import api from './api';
import {
  getPendingQueue, markSynced, markFailed,
  purgeSyncedItems, prefetchBusinessData,
} from './offlineStore';
import { partyApi, itemApi, accountApi } from './api';

let syncTimer    = null;
let isSyncing    = false;
let lastBizId    = null;

// ── Check if browser is online ─────────────────────────────
export const isOnline = () => navigator.onLine;

// ── Sync all pending items for a business ─────────────────
export const syncNow = async (bizId) => {
  if (!isOnline() || isSyncing || !bizId) return;
  isSyncing = true;

  try {
    const pending = await getPendingQueue(bizId);
    if (!pending.length) return;

    console.log(`[Sync] ${pending.length} item(s) pending for ${bizId}`);

    // Batch into groups of 20 to avoid large payloads
    const BATCH = 20;
    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);

      try {
        const res = await api.post('/sync', {
          businessId: bizId,
          items: batch.map(item => ({
            clientId:  'browser',
            localId:   item.localId,
            entity:    item.entity,
            operation: item.operation,
            entityId:  item.entityId || null,
            payload:   item.payload,
          })),
        });

        // Mark all in this batch as synced
        const errors = new Set((res.data.errors || []).map(e => e.localId));
        for (const item of batch) {
          if (errors.has(item.localId)) {
            await markFailed(item.localId, 'Server rejected');
          } else {
            await markSynced(item.localId);
          }
        }

        if (res.data.synced > 0) {
          console.log(`[Sync] Synced ${res.data.synced} item(s)`);
        }
      } catch (batchErr) {
        console.warn('[Sync] Batch failed:', batchErr.message);
        for (const item of batch) {
          await markFailed(item.localId, batchErr.message);
        }
      }
    }

    // Purge old synced items
    await purgeSyncedItems();

    // Refresh cache after sync
    await prefetchBusinessData(bizId, { partyApi, itemApi, accountApi });

  } catch (err) {
    console.warn('[Sync] Sync error:', err.message);
  } finally {
    isSyncing = false;
  }
};

// ── Start background sync timer ────────────────────────────
export const startBackgroundSync = (bizId, intervalMs = 30000) => {
  if (syncTimer && lastBizId === bizId) return; // already running

  // Stop existing timer
  stopBackgroundSync();
  lastBizId = bizId;

  // Run immediately then on interval
  syncNow(bizId);
  syncTimer = setInterval(() => syncNow(bizId), intervalMs);

  // Also sync when coming back online
  const onOnline = () => {
    console.log('[Sync] Back online — syncing now');
    syncNow(bizId);
  };
  window.addEventListener('online', onOnline);

  console.log(`[Sync] Background sync started (every ${intervalMs / 1000}s)`);
};

export const stopBackgroundSync = () => {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log('[Sync] Background sync stopped');
  }
};

// ── React hook ─────────────────────────────────────────────
// (imported in useOnlineStatus hook)
export const getSyncStatus = () => ({
  online:    isOnline(),
  syncing:   isSyncing,
});
