// HTTPS site relocation. The standalone recovery page supplies its existing
// storage owners and IndexedDB primitives so HTTP recovery uses the same map.
export const SOURCE = 'https://touhou.vip';
export const TARGET = 'https://touhouonline.com';
export const PROTOCOL = 'eagler-touhou/site-relocation/2';
const POLICY = 'source-overwrite-v2';
const STATE = 'eagler-touhou-origin-migration-relocation-v1';
const JOURNAL = 'eagler-touhou-origin-migration-journal-v1';
const RUNTIME_PREFIX = 'eagler-touhou-runtime-v2-';
export const LEGACY_SAVES = ['th08-native-1.00d', 'th10-1.00a-jp', 'th10-1.00a-chs', 'th12-eagler-preview-files', 'th12-multiplayer-preview-files'];
const resourceKey = key => /^eagler-touhou-(?:game-data-import|ogg-import)-v1-/.test(key) || /^eagler-touhou-th\d+-offline-language-index-v1$/.test(key);
const utf8 = new TextEncoder();
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');

// Chunk fingerprints avoid loading a large music/resource Blob into JS memory.
// The same tagged representation is also the lossless personal ZIP format.
export async function encode(value, binaries = [], signal) {
  signal?.throwIfAborted();
  if (value === undefined) return {type: 'undefined'};
  if (typeof value === 'bigint') return {type: 'bigint', value: String(value)};
  if (typeof value === 'number' && !Number.isFinite(value)) return {type: 'number', value: String(value)};
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return {type: 'date', value: value.toISOString()};
  if (value instanceof Blob || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const blob = value instanceof Blob ? value : new Blob([value]);
    const hashes = [];
    for (let offset = 0; offset < blob.size; offset += 4 * 1024 * 1024) {
      signal?.throwIfAborted();
      hashes.push(await digest(await blob.slice(offset, offset + 4 * 1024 * 1024).arrayBuffer()));
    }
    signal?.throwIfAborted();
    const node = {type: value instanceof Blob ? 'blob' : value instanceof ArrayBuffer ? 'buffer' : value.constructor.name,
      mime: blob.type, bytes: blob.size, hashes, binary: binaries.length};
    binaries.push(blob);
    return node;
  }
  if (Array.isArray(value)) {const entries = []; for (const item of value) entries.push(await encode(item, binaries, signal)); return {type: 'array', value: entries};}
  // IDBFS/Package Store persist plain records. Reject unfamiliar types instead
  // of quietly dropping data from a purported complete backup.
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('不支持的存储数据类型');
  const entries = [];
  for (const key of Object.keys(value).sort()) entries.push([key, await encode(value[key], binaries, signal)]);
  return {type: 'object', value: entries};
}
export async function fingerprint(value, signal) {const hash = await digest(utf8.encode(JSON.stringify(await encode(value, [], signal)))); signal?.throwIfAborted(); return hash;}
export async function decode(node, binaries) {
  if (node === null || typeof node !== 'object') return node;
  if (node.type === 'undefined') return undefined;
  if (node.type === 'bigint') return BigInt(node.value);
  if (node.type === 'number') return Number(node.value);
  if (node.type === 'date') return new Date(node.value);
  if (node.type === 'object') {
    const value = Object.create(null);
    for (const [key, item] of node.value) value[key] = await decode(item, binaries);
    return value;
  }
  if (node.type === 'array') {const result = []; for (const item of node.value) result.push(await decode(item, binaries)); return result;}
  const bytes = binaries[node.binary];
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== node.bytes) throw new Error('备份文件不完整');
  const buffer = bytes.slice().buffer;
  const blob = new Blob([buffer], {type: node.mime});
  const actual = await encode(blob);
  if (JSON.stringify(actual.hashes) !== JSON.stringify(node.hashes)) throw new Error('备份文件校验失败');
  if (node.type === 'blob') return blob;
  if (node.type === 'buffer') return buffer;
  const constructors = {Uint8Array, Uint8ClampedArray, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array, DataView};
  if (!Object.hasOwn(constructors, node.type)) throw new Error('不支持的备份数据类型');
  return new constructors[node.type](buffer);
}

export function createRelocation(env) {
  const {cacheNames, ownedLocalStorageKey, openExistingDatabase, dbSchema, prepareTargetDatabase, receiverDbs, request, txDone, deleteDatabase, setStatus} = env;
  const databases = new Set([...env.databases, ...LEGACY_SAVES]);
  const personalDatabase = name => databases.has(name) && (name.startsWith('/savesth') || LEGACY_SAVES.includes(name));
  const resourceDatabase = name => databases.has(name) && !personalDatabase(name);
  const ownedKey = key => (ownedLocalStorageKey(key) || /^touhou\.th\d+\.gameVersion$/.test(key) || key === 'browser-warning-dismissed') &&
    key !== 'eagler-touhou-mp-member-v1' && !/-lobby-client-v1$/.test(key);
  const personalKey = key => ownedKey(key) && !resourceKey(key);
  const ownedCache = name => cacheNames.has(name) || name.startsWith(RUNTIME_PREFIX);
  const host = window.parent === window ? window : window.parent;
  let peer, nonce, running = false, disposed = false, journal, heartbeat, refresh, connectTimer;
  let prepared, preparation, receiverId, reconnect = false, receiverAttached = false;
  let control = new AbortController();
  const check = signal => {
    signal.throwIfAborted();
    if (disposed || location.origin === SOURCE && nonce && readState()?.nonce !== nonce) throw new DOMException('Closed', 'AbortError');
  };
  const cancelledKey = () => STATE + '-cancelled-' + nonce;
  let snapshot = {phase: location.origin === SOURCE ? 'preparing' : 'connecting', detail: '', copied: 0, conflicts: 0, prepared: 0, progress: null};
  const listeners = new Set(), pending = new Map();
  const personalStages = new Map(), resourceKeys = new Map(), cacheKeys = new Map();
  const receivedPersonal = new Map(), receivedLocal = new Map();
  let receivedInventory, completedPersonal;
  let flush = async () => {};
  let transport = {open: (url, name) => window.open(url, name), post: (target, message, origin) => target.postMessage(message, origin)};
  const readState = () => {try {return JSON.parse(localStorage.getItem(STATE) || 'null');} catch {return null;}};
  const update = patch => {snapshot = {...snapshot, ...patch}; setStatus(snapshot.detail, snapshot.phase === 'error' ? 'bad' : snapshot.phase === 'complete' ? 'ok' : ''); for (const fn of listeners) fn();};
  const closeDatabases = () => {for (const db of receiverDbs.values()) db.close(); receiverDbs.clear();};
  const post = message => transport.post(peer, {protocol: PROTOCOL, nonce, ...message}, location.origin === SOURCE ? TARGET : SOURCE);
  const detach = () => {if (location.origin === TARGET && peer && !peer.closed) {try {post({type: 'detached'});} catch {}}};
  const send = (message, signal = control.signal) => new Promise((resolve, reject) => {
    check(signal);
    const id = crypto.randomUUID(), timer = setTimeout(() => {pending.delete(id); reject(new Error('接收页已关闭或响应超时，请重新打开后继续'));}, 120000);
    pending.set(id, {resolve, reject, timer});
    try {post({...message, id});} catch (error) {clearTimeout(timer); pending.delete(id); reject(error);}
  });
  function cancel(notify = true) {
    if (disposed || control.signal.aborted) return;
    control.abort(); reconnect = false; clearTimeout(connectTimer);
    if (location.origin === SOURCE) localStorage.setItem(STATE, JSON.stringify({...readState(), nonce, complete: false, cancelled: true}));
    else localStorage.setItem(cancelledKey(), '1');
    for (const item of pending.values()) {clearTimeout(item.timer); item.reject(control.signal.reason);} pending.clear();
    closeDatabases(); personalStages.clear(); prepared = undefined;
    update({phase: 'cancelled', detail: '迁移已取消。旧站数据及新站已收到的数据不会删除。'});
    if (notify && peer && !peer.closed) {try {post({type: 'cancel'});} catch {}}
  }
  const storageChanged = event => {
    if (disposed || control.signal.aborted || !event.newValue) return;
    if (location.origin === SOURCE && event.key === STATE && nonce && readState()?.nonce !== nonce) {
      control.abort(); receiverAttached = false; peer = undefined; reconnect = false;
      for (const item of pending.values()) {clearTimeout(item.timer); item.reject(control.signal.reason);} pending.clear();
      return;
    }
    if (location.origin === SOURCE && event.key === STATE && readState()?.cancelled || location.origin === TARGET && event.key === cancelledKey()) cancel();
  };
  async function openJournal() {
    if (journal) return journal;
    journal = await new Promise((resolve, reject) => {
      const req = indexedDB.open(JOURNAL, 1);
      req.onupgradeneeded = () => {req.result.createObjectStore('receipts'); req.result.createObjectStore('conflicts');};
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    return journal;
  }
  async function journalGet(store, key) {const db = await openJournal(); return request(db.transaction(store).objectStore(store).get(key));}
  async function journalPut(store, key, value, signal) {const db = await openJournal(); if (signal) check(signal); const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value, key); await txDone(tx); if (signal) check(signal);}
  async function readRecord(database, store, key) {
    const db = receiverDbs.get(database);
    if (!db?.objectStoreNames.contains(store)) throw new Error('数据库尚未准备');
    return request(db.transaction(store).objectStore(store).get(key));
  }
  const recordId = async message => fingerprint([message.database, message.store, message.key]);
  const resourceValue = (database, store, value) => {
    if (value === undefined || database !== 'eagler-touhou-package-store-v1' || store !== 'installations') return value;
    if (!value.currentGeneration) return undefined;
    return Object.fromEntries(Object.entries(value).filter(([field]) => !field.startsWith('pending')));
  };
  async function receiveRecord(message, signal) {
    check(signal);
    if (!databases.has(message.database) || message.store === 'leases') throw new Error('数据库超出迁移范围');
    const id = await recordId(message), current = await readRecord(message.database, message.store, message.key);
    const hash = await fingerprint(message.value, signal);
    if (hash !== message.hash) throw new Error('传输校验失败');
    const currentHash = await fingerprint(current, signal);
    if (currentHash !== hash) {
      if (message.database === 'eagler-touhou-package-store-v1' && message.store === 'installations' && message.value.currentGeneration) {
        const generation = await readRecord(message.database, 'generations', [message.value.game, message.value.currentGeneration]);
        if (!generation) throw new Error('资源代际尚未接收完整');
        for (const file of Object.values(generation.files || {})) if (!await readRecord(message.database, 'objects', file.objectId)) throw new Error('资源文件尚未接收完整');
      }
      check(signal);
      const db = receiverDbs.get(message.database), tx = db.transaction(message.store, 'readwrite'), store = tx.objectStore(message.store);
      if (store.keyPath == null) store.put(message.value, message.key); else store.put(message.value);
      await txDone(tx);
    }
    check(signal);
    if (await fingerprint(await readRecord(message.database, message.store, message.key), signal) !== hash) throw new Error('落盘校验失败');
    await journalPut('receipts', id, {hash}, signal);
    resourceKeys.get(message.database)?.get(message.store)?.add(await fingerprint(message.key, signal));
    return {};
  }
  async function prepareDatabase(schema, signal) {
    const previous = receiverDbs.get(schema.name);
    previous?.close(); receiverDbs.delete(schema.name);
    const current = await openExistingDatabase(schema.name);
    let compatible;
    try {compatible = !current || await fingerprint(dbSchema(current), signal) === await fingerprint(schema, signal);}
    finally {current?.close();}
    check(signal);
    if (!compatible) await deleteDatabase(schema.name);
    await prepareTargetDatabase(schema);
    check(signal);
  }
  async function commitPersonal(database, signal) {
    const stage = personalStages.get(database);
    if (!stage) throw new Error('存档尚未准备完整');
    const {records, schema} = stage;
    await prepareDatabase(schema, signal);
    const db = receiverDbs.get(database);
    if (db.objectStoreNames.length) {
      const tx = db.transaction([...db.objectStoreNames], 'readwrite'), done = txDone(tx);
      try {
        for (const name of db.objectStoreNames) tx.objectStore(name).clear();
        for (const record of records) {
          const store = tx.objectStore(record.store);
          if (store.keyPath == null) store.put(record.value, record.key); else store.put(record.value);
        }
      } catch (error) {tx.abort(); await done.catch(() => {}); throw error;}
      await done;
      check(signal);
      for (const record of records) {
        if (await fingerprint(await readRecord(database, record.store, record.key), signal) !== record.hash) throw new Error('存档落盘校验失败');
      }
    }
    receivedPersonal.set(database, stage);
    personalStages.delete(database);
    return {};
  }
  async function receive(message, signal) {
    check(signal);
    if (message.type === 'progress') return {};
    if (message.type === 'database') {
      if (!databases.has(message.schema?.name)) throw new Error('数据库超出迁移范围');
      const name = message.schema.name;
      if (personalDatabase(name)) personalStages.set(name, {schema: message.schema, records: []});
      else {
        await prepareDatabase(message.schema, signal);
        resourceKeys.set(name, new Map(message.schema.stores.map(store => [store.name, new Set()])));
      }
      return {};
    }
    if (message.type === 'record') {
      if (personalDatabase(message.database)) {
        if (await fingerprint(message.value, signal) !== message.hash) throw new Error('传输校验失败');
        const stage = personalStages.get(message.database);
        if (!stage) throw new Error('存档尚未准备');
        stage.records.push(message); return {};
      }
      return receiveRecord(message, signal);
    }
    if (message.type === 'database-end' && personalDatabase(message.database)) return commitPersonal(message.database, signal);
    if (message.type === 'local') {
      if (!ownedKey(message.key) || typeof message.value !== 'string') throw new Error('设置超出迁移范围');
      if (resourceKey(message.key)) message.value = message.value.replaceAll(SOURCE + '/.eagler-local/', TARGET + '/.eagler-local/');
      check(signal);
      localStorage.setItem(message.key, message.value);
      if (localStorage.getItem(message.key) !== message.value) throw new Error('设置落盘校验失败');
      if (personalKey(message.key)) receivedLocal.set(message.key, message.value);
      return {};
    }
    if (message.type === 'personal-end') {
      if (personalStages.size || !Array.isArray(message.databases) || message.databases.some(name => !personalDatabase(name)) ||
          !Array.isArray(message.keys) || message.keys.some(key => !personalKey(key))) throw new Error('个人数据清单无效');
      for (const name of [...databases].filter(personalDatabase)) if (!message.databases.includes(name)) {
        check(signal); receiverDbs.get(name)?.close(); receiverDbs.delete(name); await deleteDatabase(name);
      }
      for (const key of Object.keys(localStorage).filter(personalKey)) if (!message.keys.includes(key)) localStorage.removeItem(key);
      for (const name of receivedPersonal.keys()) if (!message.databases.includes(name)) receivedPersonal.delete(name);
      for (const key of receivedLocal.keys()) if (!message.keys.includes(key)) receivedLocal.delete(key);
      receivedInventory = message;
      return {};
    }
    if (message.type === 'resources-begin') {
      resourceKeys.clear(); cacheKeys.clear(); return {};
    }
    if (message.type === 'resources-end') {
      if (!Array.isArray(message.keys) || message.keys.some(key => !ownedKey(key) || !resourceKey(key))) throw new Error('资源清单无效');
      for (const name of [...databases].filter(resourceDatabase)) {
        check(signal);
        const expected = resourceKeys.get(name), db = receiverDbs.get(name);
        if (!expected) {db?.close(); receiverDbs.delete(name); await deleteDatabase(name); continue;}
        for (const store of db.objectStoreNames) {
          const extra = [];
          for (const key of await request(db.transaction(store).objectStore(store).getAllKeys())) {
            if (!expected.get(store)?.has(await fingerprint(key, signal))) extra.push(key);
          }
          if (extra.length) {
            check(signal); const tx = db.transaction(store, 'readwrite');
            for (const key of extra) tx.objectStore(store).delete(key);
            await txDone(tx);
          }
        }
      }
      if (globalThis.caches) for (const name of (await caches.keys()).filter(ownedCache)) {
        check(signal);
        const expected = cacheKeys.get(name);
        if (!expected) {await caches.delete(name); continue;}
        const cache = await caches.open(name);
        for (const req of await cache.keys()) if (!expected.has(req.url)) {check(signal); await cache.delete(req);}
      }
      for (const key of Object.keys(localStorage).filter(key => ownedKey(key) && resourceKey(key))) if (!message.keys.includes(key)) localStorage.removeItem(key);
      return {};
    }
    if (message.type === 'cache') {
      if (!ownedCache(message.cache) || new URL(message.url).origin !== SOURCE) throw new Error('缓存超出迁移范围');
      const cache = await caches.open(message.cache), url = new URL(new URL(message.url).pathname + new URL(message.url).search, TARGET).href;
      const req = new Request(url, {headers: message.requestHeaders});
      const existing = await cache.match(req);
      if (!cacheKeys.has(message.cache)) cacheKeys.set(message.cache, new Set());
      cacheKeys.get(message.cache).add(url);
      if (existing && await fingerprint(await existing.blob(), signal) === message.hash) return {};
      if (await fingerprint(message.body, signal) !== message.hash) throw new Error('缓存传输校验失败');
      await cache.put(req, new Response(message.body, {status: message.status, statusText: message.statusText, headers: message.responseHeaders}));
      if (await fingerprint(await (await cache.match(req)).blob(), signal) !== message.hash) throw new Error('缓存落盘校验失败');
      return {};
    }
    if (message.type === 'complete') {
      if (personalStages.size) throw new Error('仍有未完成的存档');
      if (await personalFingerprint(signal) !== message.personal) throw new Error('新旧站个人数据不一致，迁移尚未完成');
      completedPersonal = message.personal;
      closeDatabases();
      await journalPut('receipts', 'complete', {at: Date.now(), personal: message.personal, nonce, policy: POLICY}, signal);
      update({phase: 'complete', detail: '数据迁移完成，刷新页面即可应用迁移的设置。'});
      return {};
    }
    throw new Error('未知迁移消息');
  }
  async function messages(event) {
    const incoming = event.data;
    if (location.origin === SOURCE && nonce && readState()?.nonce !== nonce) return;
    if (disposed || event.origin !== (location.origin === SOURCE ? TARGET : SOURCE) || incoming?.protocol !== PROTOCOL || incoming.nonce !== nonce) return;
    // The top-level page owns the channel. Normalize into this frame's realm
    // so Blob, Date and plain-record checks use the receiving constructors.
    const message = host === window ? incoming : structuredClone(incoming);
    if (location.origin === SOURCE && message.type === 'probe') {
      if (readState()?.cancelled || peer && event.source !== peer) return;
      if (!peer) peer = event.source;
      post({type: 'authorized'}); return;
    }
    if (location.origin === SOURCE && message.type === 'ready' && !peer) peer = event.source;
    if (event.source !== peer) return;
    if (message.type === 'detached' && location.origin === SOURCE) {receiverAttached = false; return;}
    if (message.type === 'cancel') {cancel(false); return;}
    if (control.signal.aborted) {if (message.type === 'ready') post({type: 'cancel'}); return;}
    if (message.type === 'ready' && location.origin === SOURCE) {
      receiverAttached = true;
      clearTimeout(connectTimer);
      const changed = receiverId && receiverId !== message.receiverId;
      if (changed && running) {
        reconnect = true;
        for (const item of pending.values()) {clearTimeout(item.timer); item.reject(new Error('新站已刷新，正在重新连接'));}
        pending.clear();
      }
      receiverId = message.receiverId;
      if (!running && (changed || ['ready', 'preparing', 'connecting'].includes(snapshot.phase))) void run().catch(fail);
      return;
    }
    if (message.type === 'ack') {
      const item = pending.get(message.id); if (!item) return;
      clearTimeout(item.timer); pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error)); else item.resolve(message.result); return;
    }
    if (location.origin !== TARGET || !message.id) return;
    const signal = control.signal;
    try {
      if (message.progress && (!['personal', 'resources', 'checking'].includes(message.progress.step) ||
        !Number.isSafeInteger(message.progress.done) || !Number.isSafeInteger(message.progress.total) ||
        message.progress.done < 0 || message.progress.total < message.progress.done)) throw new Error('无效的迁移进度');
      const result = await receive(message, signal);
      check(signal);
      if (message.type !== 'complete') update({phase: 'copying', detail: '正在后台接收旧站数据，请保持旧站页面打开', copied: snapshot.copied + (['database', 'progress'].includes(message.type) ? 0 : 1), conflicts: snapshot.conflicts + (result?.conflict ? 1 : 0), ...(message.progress ? {progress: message.progress} : {})});
      post({type: 'ack', id: message.id, result});
    }
    catch (error) {if (!signal.aborted && !disposed) {post({type: 'ack', id: message.id, error: error.message}); fail(error);}}
  }
  const fail = error => {if (disposed || control.signal.aborted || error?.name === 'AbortError') return; closeDatabases(); personalStages.clear(); prepared = undefined; update({phase: 'error', detail: error?.message || String(error)});};
  async function eachDatabase(name, fn, signal) {
    signal?.throwIfAborted();
    const db = await openExistingDatabase(name); if (!db) return;
    try {
      const schema = dbSchema(db);
      await fn({type: 'database', schema});
      if (personalDatabase(name)) {
        if (!db.objectStoreNames.length) return;
        const tx = db.transaction([...db.objectStoreNames], 'readonly'), done = txDone(tx);
        const stores = await Promise.all([...db.objectStoreNames].map(async store => {
          const owner = tx.objectStore(store), [keys, values] = await Promise.all([request(owner.getAllKeys()), request(owner.getAll())]);
          return {store, keys, values};
        }));
        await done;
        for (const {store, keys, values} of stores) for (let i = 0; i < keys.length; i++) {signal?.throwIfAborted(); await fn({type: 'record', database: name, store, key: keys[i], value: values[i]});}
        return;
      }
      const order = new Map([['objects', 0], ['generations', 1], ['installations', 2]]);
      for (const store of [...db.objectStoreNames].filter(store => store !== 'leases').sort((a, b) => (order.get(a) ?? 1) - (order.get(b) ?? 1))) {
        for (const key of await request(db.transaction(store).objectStore(store).getAllKeys())) {
          signal?.throwIfAborted();
          const value = resourceValue(name, store, await request(db.transaction(store).objectStore(store).get(key)));
          if (value === undefined) continue;
          await fn({type: 'record', database: name, store, key, value});
        }
      }
    } finally {db.close();}
  }
  async function personalFingerprint(signal) {
    const values = [];
    for (const key of Object.keys(localStorage).filter(personalKey).sort()) values.push([key, localStorage.getItem(key)]);
    for (const name of [...databases].filter(personalDatabase)) await eachDatabase(name, async message => {values.push(await fingerprint(message, signal));}, signal);
    return fingerprint(values, signal);
  }
  async function resourceFingerprint(signal) {
    const values = Object.keys(localStorage).filter(key => ownedKey(key) && resourceKey(key)).sort().map(key => [key, localStorage.getItem(key)]);
    for (const name of [...databases].filter(resourceDatabase)) {
      signal?.throwIfAborted();
      const db = await openExistingDatabase(name); if (!db) continue;
      try {
        for (const store of db.objectStoreNames) {
          if (store === 'leases') continue;
          const count = await request(db.transaction(store).objectStore(store).count());
          if (count) values.push([name, store, count]);
          if (store === 'installations' && count) values.push(await request(db.transaction(store).objectStore(store).getAll()));
        }
      } finally {db.close();}
    }
    if (globalThis.caches) for (const name of (await caches.keys()).filter(ownedCache).sort()) {
      const urls = (await (await caches.open(name)).keys()).map(req => req.url).sort();
      if (urls.length) values.push([name, urls]);
    }
    return fingerprint(values, signal);
  }
  async function copyPersonal(signal) {
    const names = [];
    for (const name of [...databases].filter(personalDatabase)) {
      let present = false;
      await eachDatabase(name, async message => {present = true; await transmit(message, signal);}, signal);
      if (present) {names.push(name); await transmit({type: 'database-end', database: name}, signal);}
    }
    const keys = Object.keys(localStorage).filter(personalKey).sort();
    for (const key of keys) await transmit({type: 'local', key, value: localStorage.getItem(key)}, signal);
    await transmit({type: 'personal-end', databases: names, keys}, signal);
  }
  async function transmit(message, signal) {
    check(signal);
    if (message.type === 'record' && !message.hash) message.hash = await fingerprint(message.value, signal);
    const result = await send(message, signal);
    check(signal);
    update({copied: snapshot.copied + (['database', 'progress'].includes(message.type) ? 0 : 1), conflicts: snapshot.conflicts + (result?.conflict ? 1 : 0), ...(message.progress ? {progress: message.progress} : {})});
  }
  const reportProgress = (step, total, signal) => transmit({type: 'progress', progress: {step, done: 0, total}}, signal);
  async function visitResources(visit, signal) {
    for (const name of [...databases].filter(resourceDatabase)) await eachDatabase(name, visit, signal);
    if (globalThis.caches) for (const name of (await caches.keys()).filter(ownedCache)) {
      const cache = await caches.open(name), requests = await cache.keys();
      // Completion markers are published last. Interrupted runtime copies are
      // never offered to the game as complete offline generations.
      requests.sort((a, b) => Number(a.url.includes('/__runtime-cache-v2__/complete')) - Number(b.url.includes('/__runtime-cache-v2__/complete')));
      for (const req of requests) {
        check(signal);
        if (new URL(req.url).origin !== SOURCE) continue;
        const response = await cache.match(req);
        if (!response?.ok) throw new Error('无法读取游戏缓存');
        const body = await response.blob();
        await visit({type: 'cache', cache: name, url: req.url, requestHeaders: [...req.headers], responseHeaders: [...response.headers], status: response.status, statusText: response.statusText, body});
      }
    }
    for (const key of Object.keys(localStorage).filter(key => ownedKey(key) && resourceKey(key))) await visit({type: 'local', key, value: localStorage.getItem(key)});
  }
  async function prepareResources(signal = control.signal) {
    check(signal);
    if (preparation) return preparation;
    const task = (async () => {
      const version = await resourceFingerprint(signal);
      check(signal);
      if (prepared?.version === version) return;
      update({phase: 'preparing', detail: '正在本站后台准备迁移', prepared: 0});
      const entries = [];
      await visitResources(async message => {
        check(signal);
        // Only keys and fingerprints survive preparation. Large resources stay
        // in their existing storage until the user opens the new site.
        if (message.type === 'record') {
          const {value, ...record} = message;
          entries.push({...record, hash: await fingerprint(value, signal)});
        } else if (message.type === 'cache') {
          const {body, ...record} = message;
          entries.push({...record, hash: await fingerprint(body, signal)});
        } else entries.push(message);
        update({prepared: entries.length});
      }, signal);
      check(signal);
      if (version !== await resourceFingerprint(signal)) throw new Error('游戏资源正在更新，请更新完成后重新准备');
      prepared = {version, entries};
      update({phase: peer ? 'connecting' : 'ready', detail: '迁移已准备，前往新站后会在后台接收'});
    })();
    preparation = task;
    try {await task;} finally {if (preparation === task) preparation = undefined;}
  }
  async function copyResources(signal) {
    const opened = new Map();
    const total = prepared.entries.length;
    await transmit({type: 'resources-begin'}, signal);
    await reportProgress('resources', total, signal);
    let done = 0;
    try {
      for (const entry of prepared.entries) {
        check(signal);
        let message = entry;
        if (entry.type === 'record') {
          let db = opened.get(entry.database);
          if (!db) {db = await openExistingDatabase(entry.database); if (!db) throw new Error('资源已变化，请重新准备迁移'); opened.set(entry.database, db);}
          const value = resourceValue(entry.database, entry.store, await request(db.transaction(entry.store).objectStore(entry.store).get(entry.key)));
          if (value === undefined) throw new Error('资源已变化，请重新准备迁移');
          message = {...entry, value};
        } else if (entry.type === 'cache') {
          const response = await (await caches.open(entry.cache)).match(entry.url);
          if (!response?.ok) throw new Error('资源已变化，请重新准备迁移');
          message = {...entry, body: await response.blob()};
        }
        await transmit({...message, progress: {step: 'resources', done: ++done, total}}, signal);
      }
      await transmit({type: 'resources-end', keys: prepared.entries.filter(entry => entry.type === 'local').map(entry => entry.key)}, signal);
    } finally {for (const db of opened.values()) db.close();}
  }
  async function finishPersonal(resources = readState()?.resources, signal = control.signal) {
    // Flush the current native writer, then compare before/after the copy. A
    // save changing during transfer must not receive a stale completion receipt.
    for (let attempt = 0; attempt < 3; attempt++) {
      check(signal);
      await reportProgress('personal', 0, signal);
      await flush(); const before = await personalFingerprint(signal);
      await copyPersonal(signal);
      await reportProgress('checking', 0, signal);
      const after = await personalFingerprint(signal);
      if (before !== after) continue;
      await send({type: 'complete', personal: after}, signal);
      check(signal);
      localStorage.setItem(STATE, JSON.stringify({nonce, complete: true, policy: POLICY, personal: after, resources, resourcesCleaned: readState()?.resourcesCleaned === true, at: Date.now()}));
      update({phase: 'complete', detail: '数据已迁移至 touhouonline.com'}); return;
    }
    throw new Error('存档正在变化，稍后点击继续迁移');
  }
  async function run() {
    if (running || !peer || disposed || control.signal.aborted) return;
    const signal = control.signal;
    running = true;
    try {
      update({phase: 'copying', detail: '正在后台迁移，可以继续使用本站'});
      const operation = async () => {
        if (readState()?.resourcesCleaned) {
          await finishPersonal(await resourceFingerprint(signal), signal);
          return;
        }
        await prepareResources(signal);
        check(signal);
        update({phase: 'copying', detail: '正在后台迁移，可以继续使用本站'});
        await reportProgress('personal', 0, signal);
        await flush(); await copyPersonal(signal); const before = prepared.version; await copyResources(signal);
        await reportProgress('checking', 0, signal);
        if (before !== await resourceFingerprint(signal)) throw new Error('游戏资源正在更新，请更新完成后继续迁移');
        await finishPersonal(before, signal);
      };
      if (navigator.locks) await navigator.locks.request(PROTOCOL, {ifAvailable: true}, lock => {if (!lock) throw new Error('另一个标签页正在迁移'); return operation();});
      else await operation();
    } catch (error) {
      check(signal);
      if (!reconnect) throw error;
    } finally {
      running = false;
      if (reconnect && !disposed && !control.signal.aborted) {reconnect = false; void run().catch(fail);}
    }
  }
  async function zipLibrary() {
    if (window.fflate) return window.fflate;
    await new Promise((resolve, reject) => {const script = document.createElement('script'); script.src = new URL('vendor/fflate.min.js', location.href).href; script.onload = resolve; script.onerror = () => reject(new Error('无法加载 ZIP 工具')); document.head.append(script);});
    return window.fflate;
  }
  async function exportPersonal(conflictsOnly = false) {
    await flush();
    const records = [], local = Object.keys(localStorage).filter(personalKey).sort().map(key => [key, localStorage.getItem(key)]);
    for (const name of [...databases].filter(personalDatabase)) await eachDatabase(name, async record => {records.push(record);});
    const conflicts = [];
    const db = await openExistingDatabase(JOURNAL);
    if (db) {try {conflicts.push(...await request(db.transaction('conflicts').objectStore('conflicts').getAll()));} finally {db.close();}}
    if (conflictsOnly) {
      records.length = 0; local.length = 0;
      const schemas = new Set();
      for (const conflict of conflicts) {
        if (conflict.local && personalKey(conflict.local[0])) local.push(conflict.local);
        else if (personalDatabase(conflict.database)) {
          if (!schemas.has(conflict.database)) {schemas.add(conflict.database); records.push({type: 'database', schema: conflict.schema});}
          records.push({type: 'record', database: conflict.database, store: conflict.store, key: conflict.key, value: conflict.value});
        }
      }
      if (!records.length && !local.length) throw new Error('没有冲突的旧站个人数据');
      conflicts.length = 0;
    }
    const binaries = [], data = await encode({local, records, conflicts}, binaries), entries = {'personal-data.json': utf8.encode(JSON.stringify({format: PROTOCOL, source: location.origin, createdAt: new Date().toISOString(), data}))};
    for (let i = 0; i < binaries.length; i++) entries[`data/${i}`] = new Uint8Array(await binaries[i].arrayBuffer());
    const zip = await zipLibrary(); return new Blob([zip.zipSync(entries, {level: 1})], {type: 'application/zip'});
  }
  async function restorePersonal(file) {
    const zip = await zipLibrary(), entries = zip.unzipSync(new Uint8Array(await file.arrayBuffer()));
    const manifest = JSON.parse(new TextDecoder().decode(entries['personal-data.json']));
    if (![PROTOCOL, 'eagler-touhou/site-relocation/1'].includes(manifest.format)) throw new Error('不支持的个人数据备份');
    const binaries = []; for (const [name, bytes] of Object.entries(entries)) if (/^data\/\d+$/.test(name)) binaries[Number(name.slice(5))] = bytes;
    // Decode and validate everything before replacing any personal owner.
    const value = await decode(manifest.data, binaries), schemas = new Map();
    for (const record of value.records) {
      const name = record.type === 'database' ? record.schema?.name : record.database;
      if (!personalDatabase(name)) throw new Error('备份包含非个人数据库');
      if (record.type === 'database') schemas.set(name, record.schema);
      else if (record.type !== 'record' || !schemas.get(name)?.stores.some(store => store.name === record.store)) throw new Error('备份记录格式错误');
    }
    if (!value.local.every(([key, text]) => personalKey(key) && typeof text === 'string')) throw new Error('备份包含非个人设置');
    if (!confirm(`将恢复 ${schemas.size} 份游戏存档和 ${value.local.length} 项设置。请先关闭其他游戏标签页。同名数据将被替换，是否继续？`)) return false;
    closeDatabases();
    try {
      for (const schema of schemas.values()) await prepareTargetDatabase(schema);
      for (const name of schemas.keys()) {
        const db = receiverDbs.get(name), tx = db.transaction([...db.objectStoreNames], 'readwrite');
        const done = txDone(tx);
        try {
          for (const store of db.objectStoreNames) tx.objectStore(store).clear();
          for (const record of value.records) if (record.type === 'record' && record.database === name) {
            const store = tx.objectStore(record.store);
            if (store.keyPath == null) store.put(record.value, record.key); else store.put(record.value);
          }
        } catch (error) {tx.abort(); await done.catch(() => {}); throw error;}
        await done;
        for (const record of value.records) if (record.type === 'record' && record.database === name &&
          await fingerprint(await readRecord(name, record.store, record.key)) !== await fingerprint(record.value)) throw new Error('恢复校验失败');
      }
      for (const [key, text] of value.local) localStorage.setItem(key, text);
      for (const conflict of value.conflicts || []) if (conflict.local ? personalKey(conflict.local[0]) : personalDatabase(conflict.database)) await journalPut('conflicts', await fingerprint(conflict.local || [conflict.database, conflict.store, conflict.key]), conflict);
      return true;
    } finally {closeDatabases();}
  }
  async function cleanResources() {
    if (location.origin !== SOURCE || !readState()?.complete || readState().policy !== POLICY) throw new Error('请先完成迁移');
    if (running) throw new Error('请等待当前迁移完成后再清理');
    // Retire the completed transfer before local deletion. Its empty resource
    // inventory must never become an authoritative replacement on the new site.
    nonce = crypto.randomUUID();
    receiverAttached = false; peer = undefined; receiverId = undefined; reconnect = false; prepared = undefined;
    clearTimeout(connectTimer);
    localStorage.setItem(STATE, JSON.stringify({...readState(), nonce, resourcesCleaned: true}));
    // Other active runtimes/installers could have open resource readers. The
    // owner UI closes its native session before calling this explicit action.
    for (const name of [...databases].filter(resourceDatabase)) await deleteDatabase(name);
    if (globalThis.caches) for (const name of (await caches.keys()).filter(ownedCache)) await caches.delete(name);
    for (const key of Object.keys(localStorage).filter(key => ownedKey(key) && resourceKey(key))) localStorage.removeItem(key);
    localStorage.setItem(STATE, JSON.stringify({...readState(), resources: await resourceFingerprint()}));
  }
  const api = {
    getSnapshot: () => snapshot,
    subscribe(fn) {listeners.add(fn); return () => listeners.delete(fn);},
    setFlush(fn) {flush = fn;},
    setTransport(value) {transport = value;},
    async ensureCurrent() {
      check(control.signal);
      await flush();
      const resources = await resourceFingerprint();
      if (readState()?.complete && readState().policy === POLICY && readState().personal === await personalFingerprint() && (readState().resourcesCleaned || readState().resources === resources)) return;
      if (!peer || peer.closed || !receiverAttached) {
        update({phase: 'ready', detail: '请重新打开新站接收页，迁移最新存档后再前往新站'});
        throw new Error(snapshot.detail);
      }
      if (running) throw new Error('正在迁移，请稍后重试');
      if (!readState()?.resourcesCleaned && readState()?.resources !== resources) {try {await run();} catch (error) {fail(error); throw error;} return;}
      running = true;
      try {await finishPersonal();} catch (error) {fail(error); throw error;} finally {running = false;}
    },
    start() {
      if (location.origin !== SOURCE || disposed || running && !control.signal.aborted) return;
      if (control.signal.aborted) {control = new AbortController(); preparation = undefined;}
      nonce = crypto.randomUUID(); localStorage.setItem(STATE, JSON.stringify({...readState(), nonce, complete: false, cancelled: false}));
      const url = new URL('/', TARGET); url.hash = 'relocate=' + nonce;
      // Opening from the top-level owner preserves the opener WindowProxy
      // across old-site refreshes, allowing the receiver to reconnect itself.
      receiverId = undefined; receiverAttached = false;
      peer = transport.open(url.href, 'eaglerTouhouSiteRelocation-' + nonce);
      if (!peer) {fail(new Error('请允许本站弹窗，然后重试')); return;}
      update({phase: 'connecting', detail: '已前往新站，正在连接后台接收', progress: null});
      clearTimeout(connectTimer); connectTimer = setTimeout(() => fail(new Error('新站接收页未连接，请检查网络后重试')), 20000);
    },
    cancel, exportPersonal, restorePersonal, cleanResources,
    stopReceiving() {
      if (location.origin !== TARGET) return;
      detach(); clearInterval(heartbeat); host.removeEventListener('message', messages);
    },
    async applyReceived() {
      if (location.origin !== TARGET || snapshot.phase !== 'complete' || !receivedInventory || !completedPersonal) throw new Error('数据尚未接收完整');
      try {
        // A native game may have saved its old in-memory state while transfer
        // was finishing. Reapply the verified source snapshot after it exits.
        for (const [name, stage] of receivedPersonal) {
          personalStages.set(name, stage); await commitPersonal(name, control.signal);
        }
        for (const [key, value] of receivedLocal) localStorage.setItem(key, value);
        await receive(receivedInventory, control.signal);
        if (await personalFingerprint(control.signal) !== completedPersonal) throw new Error('迁入数据校验失败');
        closeDatabases();
      } catch (error) {fail(error); throw error;}
    },
    dispose() {
      detach();
      control.abort();
      disposed = true; clearInterval(heartbeat); clearInterval(refresh); clearTimeout(connectTimer); host.removeEventListener('message', messages); host.removeEventListener('storage', storageChanged);
      host.removeEventListener('pagehide', detach);
      for (const item of pending.values()) {clearTimeout(item.timer); item.reject(new Error('迁移页面已关闭'));} pending.clear();
      closeDatabases(); journal?.close(); listeners.clear();
      personalStages.clear(); prepared = undefined;
      receivedPersonal.clear(); receivedLocal.clear();
    },
  };
  async function initialize() {
    host.addEventListener('storage', storageChanged);
    if (location.origin === SOURCE) {
      const state = readState(); nonce = state?.nonce;
      if (state?.cancelled) cancel(false);
      else if (state?.complete && state.policy === POLICY && state.personal === await personalFingerprint() && state.resources === await resourceFingerprint()) update({phase: 'complete', detail: '数据已迁移至 touhouonline.com'});
      else if (state) update({phase: 'preparing', detail: '正在准备待迁移的数据'});
      if (disposed) return;
      host.addEventListener('message', messages);
      refresh = setInterval(() => {
        if (!peer || peer.closed || !receiverAttached || running || disposed || snapshot.phase !== 'complete') return;
        running = true;
        void finishPersonal().catch(fail).finally(() => {running = false;});
      }, 30000);
      if (!control.signal.aborted && snapshot.phase !== 'complete') {
        if (state?.resourcesCleaned) update({phase: 'ready', detail: '旧站资源已清理，可继续迁移新增存档和个人设置'});
        else void prepareResources().catch(fail);
      }
    } else if (location.origin === TARGET && new URLSearchParams(location.search).get('relocate') === 'receive') {
      if (!host.opener || !/^[a-f0-9-]{36}$/.test(location.hash.slice(1))) throw new Error('请从旧站的“前往新站”按钮进入');
      peer = host.opener; nonce = location.hash.slice(1); history.replaceState(null, '', location.pathname + location.search);
      host.addEventListener('message', messages);
      host.addEventListener('pagehide', detach);
      const receipt = await journalGet('receipts', 'complete');
      if (localStorage.getItem(cancelledKey())) cancel(false);
      else update(receipt?.nonce === nonce && receipt.policy === POLICY ? {phase: 'complete', detail: '数据迁移完成，刷新页面即可应用迁移的设置。'} : {phase: 'connecting', detail: '正在后台接收旧站数据，请保持旧站页面打开'});
      const identity = crypto.randomUUID();
      const ready = () => {
        if (disposed) return;
        if (control.signal.aborted) {if (!peer.closed) post({type: 'cancel'}); return;}
        if (peer.closed) {
          if (snapshot.phase !== 'complete') fail(new Error('旧站页面已关闭，请回到旧站重新点击“前往新站”继续迁移'));
          clearInterval(heartbeat); return;
        }
        post({type: 'ready', receiverId: identity});
      };
      ready();
      heartbeat = setInterval(ready, 2000);
    } else if (location.origin !== TARGET) throw new Error('此迁移仅适用于 touhou.vip 到 touhouonline.com');
  }
  api.ready = initialize().catch(fail);
  return api;
}
