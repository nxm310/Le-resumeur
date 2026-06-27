const DB_NAME = 'LeResumeurDB';
const DB_VERSION = 1;

class ResumeurDB {
  constructor() {
    this.db = null;
  }

  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.error('Database error:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create 'sites' store
        if (!db.objectStoreNames.contains('sites')) {
          db.createObjectStore('sites', { keyPath: 'id' });
        }

        // Create 'history' store
        if (!db.objectStoreNames.contains('history')) {
          const historyStore = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
          historyStore.createIndex('siteId', 'siteId', { unique: false });
        }
      };
    });
  }

  // --- SITES OPERATIONS ---

  getAllSites() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['sites'], 'readonly');
      const store = transaction.objectStore('sites');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  getSite(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['sites'], 'readonly');
      const store = transaction.objectStore('sites');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  addSite(site) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['sites'], 'readwrite');
      const store = transaction.objectStore('sites');
      const request = store.add(site);

      request.onsuccess = () => resolve(site.id);
      request.onerror = () => reject(request.error);
    });
  }

  updateSite(site) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['sites'], 'readwrite');
      const store = transaction.objectStore('sites');
      const request = store.put(site);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  deleteSite(id) {
    return new Promise((resolve, reject) => {
      // We also need to delete history records for this site
      const transaction = this.db.transaction(['sites', 'history'], 'readwrite');
      
      // Delete site
      const sitesStore = transaction.objectStore('sites');
      sitesStore.delete(id);

      // Delete history records
      const historyStore = transaction.objectStore('history');
      const index = historyStore.index('siteId');
      const request = index.openCursor(IDBKeyRange.only(id));

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // --- HISTORY OPERATIONS ---

  addHistory(entry) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['history'], 'readwrite');
      const store = transaction.objectStore('history');
      const request = store.add(entry);

      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = () => reject(request.error);
    });
  }

  getHistoryForSite(siteId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['history'], 'readonly');
      const store = transaction.objectStore('history');
      const index = store.index('siteId');
      const request = index.getAll(IDBKeyRange.only(siteId));

      request.onsuccess = () => {
        // Sort history by timestamp descending
        const results = request.result || [];
        results.sort((a, b) => b.timestamp - a.timestamp);
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // --- GENERAL OPERATIONS ---

  clearAllData() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['sites', 'history'], 'readwrite');
      transaction.objectStore('sites').clear();
      transaction.objectStore('history').clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// Export for global access
window.dbHelper = new ResumeurDB();
