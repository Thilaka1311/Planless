/**
 * draftCoverStorage.ts
 *
 * Lightweight IndexedDB persistence layer for custom cover image Blobs during Plan Creation.
 * Avoids storing large binary/base64 strings in localStorage, preventing quota exhaustion
 * while enabling uploaded/custom covers to survive page reload and screen navigation.
 *
 * Includes an in-memory fallback for environments without window.indexedDB (e.g. Node.js test suites).
 */

const DB_NAME = 'planless_draft_db';
const DB_VERSION = 1;
const STORE_NAME = 'draft_covers';
const COVER_KEY = 'creation_cover_blob';

// In-memory fallback
let memoryBlobCache: Blob | null = null;

function getIndexedDB(): IDBFactory | null {
  if (typeof window !== 'undefined' && window.indexedDB) {
    return window.indexedDB;
  }
  return null;
}

function openDB(): Promise<IDBDatabase> {
  const idb = getIndexedDB();
  if (!idb) {
    return Promise.reject(new Error('IndexedDB not available in current environment'));
  }

  return new Promise((resolve, reject) => {
    const request = idb.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

/**
 * Saves the custom cover image Blob to IndexedDB (or in-memory cache).
 */
export async function saveDraftCoverBlob(blob: Blob): Promise<void> {
  memoryBlobCache = blob;
  const idb = getIndexedDB();
  if (!idb) return;

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(blob, COVER_KEY);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to put blob'));
      tx.oncomplete = () => db.close();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[draftCoverStorage] Error saving cover blob to IndexedDB:', err);
  }
}

/**
 * Retrieves the custom cover image Blob from IndexedDB (or in-memory cache).
 */
export async function getDraftCoverBlob(): Promise<Blob | null> {
  if (memoryBlobCache) {
    return memoryBlobCache;
  }

  const idb = getIndexedDB();
  if (!idb) return null;

  try {
    const db = await openDB();
    const result = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(COVER_KEY);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('Failed to get blob'));
      tx.oncomplete = () => db.close();
      tx.onerror = () => reject(tx.error);
    });

    if (result instanceof Blob) {
      memoryBlobCache = result;
      return result;
    }
    return null;
  } catch (err) {
    console.warn('[draftCoverStorage] Error reading cover blob from IndexedDB:', err);
    return memoryBlobCache;
  }
}

/**
 * Clears the custom cover image Blob from IndexedDB and in-memory cache.
 */
export async function clearDraftCoverBlob(): Promise<void> {
  memoryBlobCache = null;
  const idb = getIndexedDB();
  if (!idb) return;

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(COVER_KEY);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to delete blob'));
      tx.oncomplete = () => db.close();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[draftCoverStorage] Error clearing cover blob from IndexedDB:', err);
  }
}
