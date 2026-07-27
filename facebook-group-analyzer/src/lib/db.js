/*
 * db.js — universal IndexedDB layer for Group Insight.
 * Loaded in the content script, the service worker (via importScripts) and the
 * dashboard page. Each context opens its own connection to the same database,
 * so large scraped datasets never have to travel through message passing.
 *
 * Attaches everything to globalThis.FGA.db
 */
(function (global) {
  "use strict";

  const DB_NAME = "fga_db";
  const DB_VERSION = 1;

  const STORES = {
    posts: {
      keyPath: "id",
      indexes: {
        byGroup: { keyPath: "groupId" },
        byTime: { keyPath: "timestamp" },
        byReactions: { keyPath: "reactions" },
        byComments: { keyPath: "commentCount" },
        byEngagement: { keyPath: "engagementScore" },
        byViral: { keyPath: "viralScore" }
      }
    },
    comments: {
      keyPath: "id",
      indexes: {
        byPost: { keyPath: "postId" },
        byGroup: { keyPath: "groupId" },
        byAuthor: { keyPath: "authorName" },
        byTime: { keyPath: "timestamp" }
      }
    },
    sessions: {
      keyPath: "id",
      indexes: { byGroup: { keyPath: "groupId" } }
    },
    meta: { keyPath: "key" }
  };

  let _dbPromise = null;

  function open() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const [name, def] of Object.entries(STORES)) {
          let store;
          if (!db.objectStoreNames.contains(name)) {
            store = db.createObjectStore(name, { keyPath: def.keyPath });
          } else {
            store = e.target.transaction.objectStore(name);
          }
          const indexes = def.indexes || {};
          for (const [idxName, idxDef] of Object.entries(indexes)) {
            if (!store.indexNames.contains(idxName)) {
              store.createIndex(idxName, idxDef.keyPath, {
                unique: !!idxDef.unique
              });
            }
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }

  function tx(storeNames, mode) {
    return open().then((db) => {
      const t = db.transaction(storeNames, mode);
      return t;
    });
  }

  function reqToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Upsert one record. Merges with existing to avoid clobbering richer data
  // (e.g. a later pass may have fuller text or more comments).
  async function put(store, record) {
    const t = await tx(store, "readwrite");
    const os = t.objectStore(store);
    const existing = await reqToPromise(os.get(record[STORES[store].keyPath]));
    const merged = existing ? mergeRecord(existing, record) : record;
    await reqToPromise(os.put(merged));
    return merged;
  }

  async function putMany(store, records) {
    if (!records.length) return 0;
    const t = await tx(store, "readwrite");
    const os = t.objectStore(store);
    let n = 0;
    for (const record of records) {
      const key = record[STORES[store].keyPath];
      const existing = await reqToPromise(os.get(key));
      const merged = existing ? mergeRecord(existing, record) : record;
      os.put(merged);
      n++;
    }
    await new Promise((res, rej) => {
      t.oncomplete = res;
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
    return n;
  }

  // Keep the richer value for each field. Numbers keep the max (engagement only
  // grows), text keeps the longer string, arrays are unioned.
  function mergeRecord(a, b) {
    const out = Object.assign({}, a);
    for (const k of Object.keys(b)) {
      const av = a[k];
      const bv = b[k];
      if (bv === undefined || bv === null || bv === "") continue;
      if (av === undefined || av === null || av === "") {
        out[k] = bv;
      } else if (typeof av === "number" && typeof bv === "number") {
        out[k] = k === "timestamp" || k === "scrapedAt" ? bv : Math.max(av, bv);
      } else if (typeof av === "string" && typeof bv === "string") {
        out[k] = bv.length > av.length ? bv : av;
      } else if (Array.isArray(av) && Array.isArray(bv)) {
        out[k] = Array.from(new Set([...av, ...bv]));
      } else {
        out[k] = bv;
      }
    }
    return out;
  }

  async function get(store, key) {
    const t = await tx(store, "readonly");
    return reqToPromise(t.objectStore(store).get(key));
  }

  async function getAll(store) {
    const t = await tx(store, "readonly");
    return reqToPromise(t.objectStore(store).getAll());
  }

  async function count(store) {
    const t = await tx(store, "readonly");
    return reqToPromise(t.objectStore(store).count());
  }

  async function getByIndex(store, indexName, value) {
    const t = await tx(store, "readonly");
    const idx = t.objectStore(store).index(indexName);
    return reqToPromise(idx.getAll(value));
  }

  async function clearAll() {
    const t = await tx(Object.keys(STORES), "readwrite");
    for (const name of Object.keys(STORES)) t.objectStore(name).clear();
    await new Promise((res, rej) => {
      t.oncomplete = res;
      t.onerror = () => rej(t.error);
    });
  }

  async function clearGroup(groupId) {
    for (const store of ["posts", "comments", "sessions"]) {
      const rows = await getByIndex(store, "byGroup", groupId);
      const t = await tx(store, "readwrite");
      const os = t.objectStore(store);
      for (const r of rows) os.delete(r[STORES[store].keyPath]);
      await new Promise((res) => (t.oncomplete = res));
    }
  }

  async function setMeta(key, value) {
    return put("meta", { key, value });
  }
  async function getMeta(key, fallback) {
    const row = await get("meta", key);
    return row ? row.value : fallback;
  }

  global.FGA = global.FGA || {};
  global.FGA.db = {
    open,
    put,
    putMany,
    get,
    getAll,
    count,
    getByIndex,
    clearAll,
    clearGroup,
    setMeta,
    getMeta,
    STORES
  };
})(typeof self !== "undefined" ? self : this);
