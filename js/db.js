const DB_NAME = 'labToolsDB';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains('logEntries')) {
        const store = db.createObjectStore('logEntries', { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('calcHistory')) {
        const store = db.createObjectStore('calcHistory', { keyPath: 'id' });
        store.createIndex('calcId', 'calcId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('domain', 'domain', { unique: false });
      }

      if (!db.objectStoreNames.contains('calcPresets')) {
        const store = db.createObjectStore('calcPresets', { keyPath: 'id' });
        store.createIndex('calcId', 'calcId', { unique: false });
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function wrapRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const db = {
  async put(storeName, value) {
    const store = await tx(storeName, 'readwrite');
    await wrapRequest(store.put(value));
    return value;
  },

  async get(storeName, key) {
    const store = await tx(storeName, 'readonly');
    return wrapRequest(store.get(key));
  },

  async delete(storeName, key) {
    const store = await tx(storeName, 'readwrite');
    return wrapRequest(store.delete(key));
  },

  async getAll(storeName) {
    const store = await tx(storeName, 'readonly');
    return wrapRequest(store.getAll());
  },

  async getAllByIndex(storeName, indexName, value) {
    const store = await tx(storeName, 'readonly');
    const index = store.index(indexName);
    return wrapRequest(value === undefined ? index.getAll() : index.getAll(value));
  },

  async clear(storeName) {
    const store = await tx(storeName, 'readwrite');
    return wrapRequest(store.clear());
  },

  async exportAll() {
    const stores = ['logEntries', 'calcHistory', 'calcPresets', 'settings'];
    const data = {};
    for (const s of stores) {
      data[s] = await this.getAll(s);
    }
    return { exportedAt: new Date().toISOString(), data };
  },

  async importAll(payload, { replace = false } = {}) {
    const stores = ['logEntries', 'calcHistory', 'calcPresets', 'settings'];
    for (const s of stores) {
      if (!payload.data || !Array.isArray(payload.data[s])) continue;
      if (replace) await this.clear(s);
      for (const row of payload.data[s]) {
        await this.put(s, row);
      }
    }
  },
};

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
