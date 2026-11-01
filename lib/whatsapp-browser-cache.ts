"use client";

type CacheRecord = {
  id: string;
  savedAt: number;
  messages?: any[];
  groups?: any[];
  snapshotAt?: number;
  complete?: boolean;
  count?: number;
};

const DATABASE_NAME = 'momen-whatsapp-browser-cache';
const STORE_NAME = 'snapshots';
const DATABASE_VERSION = 1;

let databasePromise: Promise<IDBDatabase | null> | null = null;
const chatWriteQueues = new Map<string, Promise<void>>();

function cacheScope(): string {
  try {
    return localStorage.getItem('hawalat_custom_lists_owner') || 'local-dev';
  } catch {
    return 'local-dev';
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return Promise.resolve(null);
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return databasePromise;
}

function readRecord(id: string): Promise<CacheRecord | null> {
  return openDatabase().then((database) => new Promise<CacheRecord | null>((resolve) => {
    if (!database) return resolve(null);
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(`${cacheScope()}:${id}`);
    request.onsuccess = () => resolve((request.result as CacheRecord) || null);
    request.onerror = () => resolve(null);
  })).catch(() => null);
}

function writeRecord(record: Omit<CacheRecord, 'savedAt'> & { savedAt?: number }): Promise<void> {
  return openDatabase().then((database) => new Promise<void>((resolve) => {
    if (!database) return resolve();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({
      ...record,
      id: `${cacheScope()}:${record.id}`,
      savedAt: Date.now(),
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  })).catch(() => {});
}

export async function loadCachedOverview(): Promise<CacheRecord | null> {
  return readRecord('overview');
}

export async function saveCachedOverview(groups: any[], messages: any[], snapshotAt?: number): Promise<void> {
  if (!Array.isArray(groups) || !Array.isArray(messages)) return;
  return writeRecord({ id: 'overview', groups, messages, snapshotAt });
}

export async function hasCachedFullHistory(): Promise<boolean> {
  const record = await readRecord('full-history');
  return Boolean(record?.complete && Date.now() - record.savedAt < 7 * 24 * 60 * 60 * 1000);
}

export async function saveCachedFullHistory(messages: any[], groups: any[], snapshotAt?: number): Promise<void> {
  if (!Array.isArray(messages) || !messages.length || !Array.isArray(groups)) return;
  const byChat = new Map<string, any[]>();
  const latestByChat = new Map<string, any>();
  for (const message of messages) {
    if (!message?.id) continue;
    const key = message.chatJid || message.chatName;
    if (!key) continue;
    const history = byChat.get(key) || [];
    history.push(message);
    byChat.set(key, history);
    const latest = latestByChat.get(key);
    if (!latest || (message.timestampMs || 0) > (latest.timestampMs || 0)) latestByChat.set(key, message);
  }

  const database = await openDatabase();
  if (!database || !byChat.size) return;
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    for (const [chatKey, history] of byChat) {
      history.sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
      store.put({
        id: `${cacheScope()}:chat:${chatKey}`,
        savedAt: Date.now(),
        messages: history,
      } satisfies CacheRecord);
    }
    store.put({
      id: `${cacheScope()}:overview`,
      savedAt: Date.now(),
      snapshotAt,
      groups,
      messages: [...latestByChat.values()],
    } satisfies CacheRecord);
    store.put({
      id: `${cacheScope()}:full-history`,
      savedAt: Date.now(),
      complete: true,
      count: messages.length,
    } satisfies CacheRecord);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

export async function loadCachedChatHistory(chatKey: string): Promise<CacheRecord | null> {
  if (!chatKey) return null;
  return readRecord(`chat:${chatKey}`);
}

export async function saveCachedChatHistory(chatKey: string, messages: any[]): Promise<void> {
  if (!chatKey || !Array.isArray(messages) || messages.length === 0) return;
  const queueKey = `${cacheScope()}:chat:${chatKey}`;
  const previous = chatWriteQueues.get(queueKey) || Promise.resolve();
  let next: Promise<void>;
  next = previous.catch(() => {}).then(async () => {
    const current = await loadCachedChatHistory(chatKey);
    const merged = new Map<string, any>();
    for (const message of current?.messages || []) {
      if (message?.id) merged.set(message.id, message);
    }
    for (const message of messages) {
      if (message?.id) merged.set(message.id, { ...merged.get(message.id), ...message });
    }
    const sorted = [...merged.values()].sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
    await writeRecord({ id: `chat:${chatKey}`, messages: sorted });
  }).finally(() => {
    if (chatWriteQueues.get(queueKey) === next) chatWriteQueues.delete(queueKey);
  });
  chatWriteQueues.set(queueKey, next);
  return next;
}
