import { openDatabase, ensureStore } from './storage.mjs';

const DATABASE = 'rpe-next-chart-vcs';
const VERSION = 1;

function versionDatabase() {
  return openDatabase(DATABASE, VERSION, (connection, transaction) => {
    for (const name of ['repos', 'trees', 'blobs']) ensureStore(connection, transaction, name, { keyPath: 'id' });
    const commits = ensureStore(connection, transaction, 'commits', { keyPath: 'id' });
    if (!commits.indexNames.contains('repoId')) commits.createIndex('repoId', 'repoId');
  });
}

async function access(stores, mode, action) {
  const connection = await versionDatabase();
  return new Promise((resolve, reject) => {
    const transaction = connection.transaction(stores, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined);
    let result;
    try { result = action(transaction); }
    catch (error) { transaction.abort(); connection.close(); reject(error); return; }
    transaction.oncomplete = () => { connection.close(); resolve(result?.result); };
    transaction.onerror = transaction.onabort = () => {
      connection.close();
      reject(transaction.error ?? new Error('版本数据库事务已取消'));
    };
  });
}

class IndexedVersionStore {
  ephemeral = false;

  async get(kind, id) {
    let value;
    return access([kind], 'readonly', transaction => {
      const request = transaction.objectStore(kind).get(id);
      request.onsuccess = () => { value = request.result; };
      return { get result() { return value; } };
    });
  }

  async put(kind, record) {
    return access([kind], 'readwrite', transaction => transaction.objectStore(kind).put(record));
  }

  async delete(kind, id) {
    return access([kind], 'readwrite', transaction => transaction.objectStore(kind).delete(id));
  }

  async list(kind) {
    let value = [];
    return access([kind], 'readonly', transaction => {
      const request = transaction.objectStore(kind).getAll();
      request.onsuccess = () => { value = request.result ?? []; };
      return { get result() { return value; } };
    });
  }

  async listCommits(repoId) {
    let value = [];
    return access(['commits'], 'readonly', transaction => {
      const request = transaction.objectStore('commits').index('repoId').getAll(repoId);
      request.onsuccess = () => { value = request.result ?? []; };
      return { get result() { return value; } };
    });
  }

  async clear() {
    return access(['repos', 'commits', 'trees', 'blobs'], 'readwrite', transaction => {
      for (const name of ['repos', 'commits', 'trees', 'blobs']) transaction.objectStore(name).clear();
    });
  }
}

export function createMemoryVersionStore() {
  const data = { repos: new Map(), commits: new Map(), trees: new Map(), blobs: new Map() };
  const copy = record => record === undefined ? undefined : structuredClone(record);
  return {
    ephemeral: true,
    async get(kind, id) { return copy(data[kind].get(id)); },
    async put(kind, record) { data[kind].set(record.id, copy(record)); },
    async delete(kind, id) { data[kind].delete(id); },
    async list(kind) { return [...data[kind].values()].map(copy); },
    async listCommits(repoId) { return [...data.commits.values()].filter(commit => commit.repoId === repoId).map(copy); },
    async clear() { for (const store of Object.values(data)) store.clear(); },
    data
  };
}

let sharedStore;

export function openVersionStore() {
  if (sharedStore) return sharedStore;
  sharedStore = typeof indexedDB === 'undefined' ? createMemoryVersionStore() : new IndexedVersionStore();
  return sharedStore;
}
