var EaglerRuntimeGenerations = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/contracts/runtime-generations.mts
  var runtime_generations_exports = {};
  __export(runtime_generations_exports, {
    RUNTIME_CACHE_MAX_PREVIOUS: () => RUNTIME_CACHE_MAX_PREVIOUS,
    RUNTIME_CACHE_PROTOCOL: () => RUNTIME_CACHE_PROTOCOL,
    RUNTIME_CAPABILITIES: () => RUNTIME_CAPABILITIES,
    RUNTIME_GENERATION_FILE: () => RUNTIME_GENERATION_FILE,
    RUNTIME_GENERATION_SCHEMA: () => RUNTIME_GENERATION_SCHEMA,
    RUNTIME_IMPORT: () => RUNTIME_IMPORT,
    RUNTIME_MANIFEST_FILE: () => RUNTIME_MANIFEST_FILE,
    RUNTIME_MANIFEST_SCHEMA: () => RUNTIME_MANIFEST_SCHEMA,
    RUNTIME_PREPARE: () => RUNTIME_PREPARE,
    RUNTIME_PROGRESS: () => RUNTIME_PROGRESS,
    RUNTIME_PROTOCOL: () => RUNTIME_PROTOCOL,
    canonicalRuntimePayload: () => canonicalRuntimePayload,
    findRuntimeGroup: () => findRuntimeGroup,
    isRuntimePath: () => isRuntimePath,
    isRuntimeRoot: () => isRuntimeRoot,
    parseRuntimeDownloadProgress: () => parseRuntimeDownloadProgress,
    parseRuntimeGenerationPath: () => parseRuntimeGenerationPath,
    runtimeGenerationBase: () => runtimeGenerationBase,
    runtimeGenerationEntry: () => runtimeGenerationEntry,
    validateRuntimeGeneration: () => validateRuntimeGeneration,
    validateRuntimeImportRequest: () => validateRuntimeImportRequest,
    validateRuntimeManifest: () => validateRuntimeManifest,
    validateRuntimePrepareRequest: () => validateRuntimePrepareRequest
  });
  var RUNTIME_MANIFEST_SCHEMA = "eagler-touhou/runtime-manifest/1";
  var RUNTIME_GENERATION_SCHEMA = "eagler-touhou/runtime-generation/1";
  var RUNTIME_MANIFEST_FILE = "runtime-manifest.json";
  var RUNTIME_GENERATION_FILE = "runtime-generation.json";
  var RUNTIME_PROTOCOL = "eagler-touhou/1";
  var RUNTIME_PREPARE = "PREPARE_RUNTIME_GENERATION";
  var RUNTIME_CAPABILITIES = "GET_RUNTIME_GENERATION_CAPABILITIES";
  var RUNTIME_PROGRESS = "RUNTIME_GENERATION_PROGRESS";
  var RUNTIME_IMPORT = "IMPORT_RUNTIME_GENERATION";
  var RUNTIME_CACHE_PROTOCOL = "eagler-touhou/runtime-cache/2";
  var RUNTIME_CACHE_MAX_PREVIOUS = 2;
  var SHA256 = /^[a-f0-9]{64}$/;
  var SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  function isRuntimePath(value) {
    return typeof value === "string" && value.length <= 1024 && value.split("/").every((part) => SEGMENT.test(part) && part !== "." && part !== "..");
  }
  function isRuntimeRoot(value) {
    return typeof value === "string" && value.startsWith("runtime/") && value.endsWith("/") && isRuntimePath(value.slice(0, -1)) && value.split("/").length >= 3 && !value.split("/").some((part) => SHA256.test(part));
  }
  function record(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }
  function canonicalRuntimePayload(entry, files) {
    if (!isRuntimePath(entry) || !entry.endsWith(".html") || !Array.isArray(files) || !files.length || files.length > 2048) throw new Error("Invalid Runtime generation file set");
    const seen = /* @__PURE__ */ new Set();
    for (const file of files) {
      if (!record(file) || !isRuntimePath(file.path) || file.path === RUNTIME_GENERATION_FILE || seen.has(file.path) || typeof file.bytes !== "number" || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || typeof file.sha256 !== "string" || !SHA256.test(file.sha256)) {
        throw new Error("Invalid Runtime file identity");
      }
      seen.add(file.path);
    }
    if (!seen.has(entry)) throw new Error("Runtime entry is not in its file set");
    const ordered = [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    return JSON.stringify([
      RUNTIME_GENERATION_SCHEMA,
      entry,
      ordered.map((file) => [file.path, file.bytes, file.sha256])
    ]);
  }
  function validateRuntimeGeneration(value) {
    if (!record(value) || typeof value.generation !== "string" || !SHA256.test(value.generation) || typeof value.entry !== "string" || !Array.isArray(value.files)) throw new Error("Invalid Runtime generation");
    canonicalRuntimePayload(value.entry, value.files);
    return {
      generation: value.generation,
      entry: value.entry,
      files: value.files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }))
    };
  }
  function validateRuntimeManifest(value) {
    if (!record(value) || value.schema !== RUNTIME_MANIFEST_SCHEMA || value.protocol !== RUNTIME_PROTOCOL || !Array.isArray(value.groups) || value.groups.length > 64) throw new Error("Unsupported Runtime Manifest");
    const roots = /* @__PURE__ */ new Set();
    const groups = value.groups.map((raw) => {
      if (!record(raw) || !isRuntimeRoot(raw.root) || roots.has(raw.root) || !Array.isArray(raw.previous) || raw.previous.length > RUNTIME_CACHE_MAX_PREVIOUS) throw new Error("Invalid Runtime group");
      roots.add(raw.root);
      const current = validateRuntimeGeneration(raw.current);
      const previous = raw.previous.map(validateRuntimeGeneration);
      const ids = /* @__PURE__ */ new Set([current.generation]);
      for (const item of previous) {
        if (ids.has(item.generation) || item.entry !== current.entry) throw new Error("Invalid Runtime rollback set");
        ids.add(item.generation);
      }
      return { root: raw.root, current, previous };
    });
    return { schema: RUNTIME_MANIFEST_SCHEMA, protocol: RUNTIME_PROTOCOL, groups };
  }
  function runtimeGenerationBase(root, generation) {
    if (!isRuntimeRoot(root) || !SHA256.test(generation)) throw new Error("Invalid immutable Runtime base");
    return `${root}${generation}/`;
  }
  function runtimeGenerationEntry(root, generation) {
    return runtimeGenerationBase(root, generation.generation) + generation.entry;
  }
  function parseRuntimeGenerationPath(path) {
    if (!isRuntimePath(path) || !path.startsWith("runtime/")) return null;
    const parts = path.split("/");
    const index = parts.findIndex((part) => SHA256.test(part));
    if (index < 2 || index === parts.length - 1) return null;
    const root = parts.slice(0, index).join("/") + "/";
    const generation = parts[index];
    const file = parts.slice(index + 1).join("/");
    return isRuntimeRoot(root) ? { root, generation, file } : null;
  }
  function findRuntimeGroup(manifest, path) {
    const immutable = parseRuntimeGenerationPath(path);
    return immutable ? manifest.groups.find((group) => group.root === immutable.root) : manifest.groups.find((group) => path === group.root + group.current.entry);
  }
  function validateRuntimeImportRequest(value) {
    if (!record(value) || value.type !== RUNTIME_IMPORT || !isRuntimeRoot(value.root)) throw new Error("Invalid Runtime import");
    const descriptor = validateRuntimeGeneration(value.descriptor);
    if (!Array.isArray(value.files) || value.files.length !== descriptor.files.length) throw new Error("Incomplete Runtime import");
    const seen = /* @__PURE__ */ new Set();
    const files = value.files.map((raw) => {
      if (!record(raw) || typeof raw.path !== "string" || seen.has(raw.path) || Object.prototype.toString.call(raw.buffer) !== "[object ArrayBuffer]") throw new Error("Invalid Runtime import file");
      const file = descriptor.files.find((file2) => file2.path === raw.path);
      if (!file || raw.buffer.byteLength !== file.bytes) throw new Error("Runtime import size mismatch");
      seen.add(raw.path);
      return { path: raw.path, buffer: raw.buffer };
    });
    return { root: value.root, descriptor, files };
  }
  function parseRuntimeDownloadProgress(value) {
    if (!record(value) || value.type !== RUNTIME_PROGRESS || value.protocol !== RUNTIME_CACHE_PROTOCOL || typeof value.path !== "string" || !isRuntimePath(value.path) || !["requesting", "receiving", "complete", "failed"].includes(String(value.phase)) || !Number.isSafeInteger(value.loaded) || Number(value.loaded) < 0 || !Number.isSafeInteger(value.total) || Number(value.total) < 0 || Number(value.total) > 0 && Number(value.loaded) > Number(value.total)) return null;
    return value;
  }
  function validateRuntimePrepareRequest(value) {
    if (!record(value) || value.type !== RUNTIME_PREPARE || !isRuntimePath(value.entry) || !value.entry.startsWith("runtime/") || !value.entry.endsWith(".html")) throw new Error("Invalid Runtime preparation entry");
    const exclude = value.exclude ?? [];
    if (value.localOnly !== void 0 && typeof value.localOnly !== "boolean") throw new Error("Invalid Runtime local-only mode");
    if (value.progress !== void 0 && typeof value.progress !== "boolean") throw new Error("Invalid Runtime progress mode");
    if (!Array.isArray(exclude) || exclude.length > RUNTIME_CACHE_MAX_PREVIOUS + 1 || exclude.some((id) => typeof id !== "string" || !SHA256.test(id)) || new Set(exclude).size !== exclude.length) {
      throw new Error("Invalid Runtime preparation exclusions");
    }
    return {
      type: RUNTIME_PREPARE,
      entry: value.entry,
      exclude: [...exclude],
      ...value.localOnly === void 0 ? {} : { localOnly: value.localOnly },
      ...value.progress === void 0 ? {} : { progress: value.progress },
      ...value.catalog === void 0 ? {} : { catalog: validateRuntimeManifest(value.catalog) }
    };
  }
  return __toCommonJS(runtime_generations_exports);
})();

"use strict";

// Read-only migration from the unreleased fixed-URL snapshot format. Never
// manufacture a generation from revision labels without checking every byte.
async function migrateLegacyRuntimeSnapshots({ scopeUrl, root, entry, sha256, importSnapshot }) {
  const { canonicalRuntimePayload, isRuntimePath } = EaglerRuntimeGenerations;
  const prefix = `eagler-touhou-runtime-${encodeURIComponent(scopeUrl.pathname)}-`;
  const marker = new URL("./__runtime-cache__/complete", scopeUrl).href;
  for (const name of await caches.keys()) {
    if (!name.startsWith(prefix) || name.endsWith("-state")) continue;
    try {
      const cache = await caches.open(name);
      const old = await (await cache.match(marker))?.json();
      if (old?.complete !== true || old.group?.root !== root || !Array.isArray(old.group.entries) ||
          !old.group.entries.length || old.group.entries.length > 2048) continue;
      const files = [], responses = new Map();
      for (const item of old.group.entries) {
        if (typeof item.url !== "string" || !item.url.startsWith(root)) throw new Error("Invalid legacy Runtime path");
        const path = item.url.slice(root.length);
        if (!isRuntimePath(path) || responses.has(path) || !/^[a-f0-9]{64}$/.test(item.revision || "")) throw new Error("Invalid legacy Runtime identity");
        const response = await cache.match(new URL(item.url, scopeUrl).href);
        if (!response?.ok) throw new Error("Legacy Runtime is incomplete");
        const bytes = await response.clone().arrayBuffer();
        if (await sha256(bytes) !== item.revision) throw new Error("Legacy Runtime bytes disagree with their revision");
        files.push({ path, bytes: bytes.byteLength, sha256: item.revision });
        responses.set(path, response);
      }
      files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
      const generation = await sha256(new TextEncoder().encode(canonicalRuntimePayload(entry, files)));
      await importSnapshot(root, { generation, entry, files }, responses, Number(old.observedAt || old.createdAt) || 0);
    } catch { /* Unknown, partial, or poisoned snapshots are not fallback targets. */ }
  }
}

"use strict";

// One registered classic SW. Immutable public URLs do the version binding;
// private snapshots provide atomic offline preparation and whole-set fallback.
function createRuntimeCache({ scopeUrl, catalog, fetchTimeoutMs = 8000, siteRouting = null }) {
  const C = EaglerRuntimeGenerations;
  const known = C.validateRuntimeManifest(catalog);
  const prefix = `eagler-touhou-runtime-v2-${encodeURIComponent(scopeUrl.pathname)}-`;
  const marker = new URL("./__runtime-cache-v2__/complete", scopeUrl).href;
  const inFlight = new Map(), protectedCaches = new Set();
  let cleanupSafe = true;
  const json = value => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
  const absolute = path => new URL(path, scopeUrl).href;
  function relative(url) {
    const parsed = new URL(url);
    if (parsed.origin !== scopeUrl.origin || !parsed.pathname.startsWith(scopeUrl.pathname)) return null;
    const path = parsed.pathname.slice(scopeUrl.pathname.length);
    return C.isRuntimePath(path) ? path : null;
  }
  async function sha256(bytes) {
    return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), n => n.toString(16).padStart(2, "0")).join("");
  }
  async function verifyGeneration(raw) {
    const generation = C.validateRuntimeGeneration(raw);
    if (await sha256(new TextEncoder().encode(C.canonicalRuntimePayload(generation.entry, generation.files))) !== generation.generation) {
      throw new Error("Runtime generation identity mismatch");
    }
    return generation;
  }
  async function checked(response, file, progress) {
    const mismatch = () => Object.assign(new Error(`Runtime integrity mismatch: ${file.path}`), {name: 'RuntimeIntegrityError'});
    if (!response?.ok) throw new Error(`Runtime file unavailable: ${file.path}`);
    const copy = response.clone();
    let bytes;
    if (!progress || !copy.body) bytes = await copy.arrayBuffer();
    else {
      const reader = copy.body.getReader(), chunks = [];
      let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value.byteLength) progress(value.byteLength);
          length += value.byteLength;
          if (length > file.bytes) throw mismatch();
          chunks.push(value);
        }
      } finally { reader.cancel().catch(() => {}); reader.releaseLock(); }
      const combined = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
      bytes = combined.buffer;
    }
    if (bytes.byteLength !== file.bytes || await sha256(bytes) !== file.sha256) throw mismatch();
    return response;
  }
  async function network(url, read, {cache = 'no-store', file, onProgress} = {}) {
    if (siteRouting) {
      let loaded = 0, success = false;
      const report = phase => onProgress?.({type: C.RUNTIME_PROGRESS, protocol: C.RUNTIME_CACHE_PROTOCOL,
        path: new URL(url).pathname.slice(scopeUrl.pathname.length), phase, loaded, total: file?.bytes || 0});
      try {
        const result = await siteRouting.run(url, async (response, progress) => {
          loaded = 0; report('requesting');
          return read(response, (bytes = 0) => {progress(); loaded += bytes; if (bytes) report('receiving');});
        }, {cache});
        success = true; return result;
      } finally { report(success ? 'complete' : 'failed'); }
    }
    const controller = new AbortController();
    let timeout, loaded = 0, success = false;
    const report = phase => onProgress?.({type: C.RUNTIME_PROGRESS, protocol: C.RUNTIME_CACHE_PROTOCOL,
      path: new URL(url).pathname.slice(scopeUrl.pathname.length), phase, loaded, total: file?.bytes || 0});
    const progress = (bytes = 0) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => controller.abort(new Error(`Runtime download stalled for ${fetchTimeoutMs} ms: ${url}`)), fetchTimeoutMs);
      if (bytes) {loaded += bytes; report('receiving');}
    };
    report('requesting');
    progress();
    try {
      const font = /\/fonts\/[^/]+\.(?:bin|ttf|ttc|otf|woff2?)$/.test(new URL(url).pathname);
      const response = await fetch(new Request(url, { cache, redirect: font ? "follow" : "error", signal: controller.signal }));
      if (!response.ok) throw new Error(`Runtime HTTP ${response.status}: ${url}`);
      progress();
      const result = await read(response, progress); success = true; return result;
    } finally { clearTimeout(timeout); report(success ? 'complete' : 'failed'); }
  }
  async function runtimeFile(url, file, onProgress) {
    const read = (response, progress) => checked(response, file, progress);
    // Immutable URLs can reuse bytes already verified by the HTTP fallback.
    // A corrupt HTTP cache entry gets one fresh verified attempt.
    try {return await network(url, read, {cache: 'default', file, onProgress});}
    catch (error) {
      if (error.name !== 'RuntimeIntegrityError') throw error;
      return network(url, read, {cache: 'reload', file, onProgress});
    }
  }
  async function latest(onProgress) {
    return network(absolute(C.RUNTIME_MANIFEST_FILE), async response => {
      const text = await response.text();
      if (text.length > 4 * 1024 * 1024) throw new Error("Runtime Manifest too large");
      return C.validateRuntimeManifest(JSON.parse(text));
    }, {onProgress});
  }
  async function snapshots(root) {
    const result = [];
    for (const name of await caches.keys()) {
      if (!name.startsWith(prefix)) continue;
      try {
        const raw = await (await (await caches.open(name)).match(marker))?.json();
        if (raw?.schema !== C.RUNTIME_CACHE_PROTOCOL || raw.complete !== true || !C.isRuntimeRoot(raw.root) ||
            (root && raw.root !== root)) continue;
        result.push({ ...raw, name, descriptor: await verifyGeneration(raw.descriptor) });
      } catch { /* An incomplete cache is never a committed generation. */ }
    }
    return result.sort((a, b) => Number(b.observedAt || b.createdAt) - Number(a.observedAt || a.createdAt));
  }
  async function complete(snapshot) {
    try {
      const cache = await caches.open(snapshot.name);
      const base = C.runtimeGenerationBase(snapshot.root, snapshot.descriptor.generation);
      for (const file of snapshot.descriptor.files) await checked(await cache.match(absolute(base + file.path)), file);
      return true;
    } catch { return false; }
  }
  async function stageBytes(root, raw, { localOnly = false, observedAt = 0, supplied, onProgress } = {}) {
    const descriptor = await verifyGeneration(raw);
    const existing = await snapshots(root);
    for (const snapshot of existing) {
      if (snapshot.descriptor.generation !== descriptor.generation || !await complete(snapshot)) continue;
      if (observedAt > snapshot.observedAt) {
        snapshot.observedAt = observedAt;
        try { await (await caches.open(snapshot.name)).put(marker, json(snapshot)); }
        catch { /* A metadata write must not prevent using a complete set. */ }
      }
      return snapshot;
    }
    const nonce = Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16)).join("-");
    const name = `${prefix}${encodeURIComponent(root)}-${descriptor.generation}-${nonce}`;
    const base = C.runtimeGenerationBase(root, descriptor.generation);
    const cache = await caches.open(name);
    const oldNames = (await caches.keys()).filter(name => name.startsWith("eagler-touhou-app-shell-"));
    let cursor = 0, stopped = false;
    try {
      await cache.put(marker, json({ schema: C.RUNTIME_CACHE_PROTOCOL, root, descriptor, complete: false, createdAt: Date.now() }));
      const writers = await Promise.allSettled(Array.from({ length: Math.min(2, descriptor.files.length) }, async () => {
        while (!stopped && cursor < descriptor.files.length) {
          try {
            const file = descriptor.files[cursor++];
            let response = supplied?.get(file.path) || null;
            if (response) await checked(response, file);
            for (const snapshot of existing) {
              if (response) break;
              const old = snapshot.descriptor.files.find(item => item.path === file.path && item.sha256 === file.sha256 && item.bytes === file.bytes);
              if (!old) continue;
              try { response = await checked(await (await caches.open(snapshot.name)).match(
                absolute(C.runtimeGenerationBase(root, snapshot.descriptor.generation) + file.path)), file); }
              catch { /* Try other verified bytes, not another version by URL. */ }
            }
            if (!response) for (const old of oldNames) {
              // A legacy cache may contain a poisoned JS/Wasm combination. The
              // current generation's actual hash, not its old label, is authority.
              try { response = await checked(await (await caches.open(old)).match(absolute(root + file.path)), file); break; }
              catch { /* Not a matching legacy byte sequence. */ }
            }
            if (!response && localOnly) throw new Error(`Runtime is not locally complete: ${file.path}`);
            response ||= await runtimeFile(absolute(base + file.path), file, onProgress);
            await cache.put(absolute(base + file.path), response);
          } catch (error) { stopped = true; throw error; }
        }
      }));
      const failure = writers.find(result => result.status === "rejected");
      if (failure) throw failure.reason;
      const snapshot = { schema: C.RUNTIME_CACHE_PROTOCOL, root, descriptor, name,
        complete: true, createdAt: Date.now(), observedAt };
      // Atomic logical commit: all writers have completed before this marker.
      await cache.put(marker, json(snapshot));
      return snapshot;
    } catch (error) {
      await caches.delete(name).catch(() => {});
      throw error;
    }
  }
  async function stage(root, raw, options = {}) {
    const descriptor = C.validateRuntimeGeneration(raw);
    const key = root + descriptor.generation + (options.localOnly ? ":local" : ":network");
    // Coalesce byte preparation of the SAME generation. Local launches bypass
    // network selection; explicit update checks supply their own current pointer.
    if (!inFlight.has(key)) {
      const listeners = new Set(), active = new Map();
      const task = {listeners, active};
      task.promise = stageBytes(root, descriptor, {...options, onProgress(progress) {
        if (['complete', 'failed'].includes(progress.phase)) active.delete(progress.path);
        else active.set(progress.path, progress);
        for (const listener of listeners) listener(progress);
      }});
      inFlight.set(key, task);
      task.promise.finally(() => { if (inFlight.get(key) === task) inFlight.delete(key); }).catch(() => {});
    }
    const task = inFlight.get(key);
    if (options.onProgress) {task.listeners.add(options.onProgress);for (const progress of task.active.values()) options.onProgress(progress);}
    try {return await task.promise;}
    finally {task.listeners.delete(options.onProgress);}
  }
  async function migrateLocal(root, entry) {
    if (typeof migrateLegacyRuntimeSnapshots !== "function") return;
    await migrateLegacyRuntimeSnapshots({scopeUrl, root, entry, sha256,
      importSnapshot: (root, descriptor, supplied, observedAt) => stage(root, descriptor, {localOnly: true, supplied, observedAt})});
  }
  async function select(path, options = {}) {
    let group, error;
    const excluded = new Set(options.exclude || []);
    if (options.localOnly) {
      const parsed = C.parseRuntimeGenerationPath(path);
      const root = parsed?.root || path.slice(0, path.lastIndexOf('/') + 1);
      const entry = parsed?.file || path.slice(path.lastIndexOf('/') + 1);
      if (!C.isRuntimeRoot(root)) throw new Error('Invalid local Runtime root');
      const findLocal = async () => {
        for (const snapshot of await snapshots(root)) {
          if (snapshot.descriptor.entry === entry && !excluded.has(snapshot.descriptor.generation) && await complete(snapshot)) return snapshot;
        }
        return null;
      };
      let local = await findLocal();
      if (!local) {await migrateLocal(root, entry); local = await findLocal();}
      if (local) return local;
      throw new Error('No complete local Runtime is available');
    }
    try {
      const manifest = Object.hasOwn(options, "catalog")
        ? C.validateRuntimeManifest(options.catalog) : await latest(options.onProgress);
      group = C.findRuntimeGroup(manifest, path);
      if (!group) throw new Error("Runtime is not published");
      if (!excluded.has(group.current.generation)) return await stage(group.root, group.current, { observedAt: Date.now(), onProgress: options.onProgress });
    } catch (cause) { error = cause; }
    group ||= C.findRuntimeGroup(known, path);
    if (group) {
      await migrateLocal(group.root, group.current.entry);
      for (const snapshot of await snapshots(group.root)) {
        if (!excluded.has(snapshot.descriptor.generation) && await complete(snapshot)) return snapshot;
      }
      // No usable local set: a retained complete server generation can still
      // recover a first visit when the current release is only partially present.
      for (const descriptor of group.previous) {
        if (excluded.has(descriptor.generation)) continue;
        try { return await stage(group.root, descriptor, {onProgress: options.onProgress}); } catch (cause) { error = cause; }
      }
      // Legacy per-file bytes can be reused only against a known whole set.
      if (!excluded.has(group.current.generation)) {
        try { return await stage(group.root, group.current, { localOnly: true }); }
        catch (cause) { error = cause; }
      }
    }
    // A publication might have completed during the first failed transaction.
    if (!options.noRetry) {
      try {
        const fresh = C.findRuntimeGroup(await latest(options.onProgress), path);
        if (fresh && !excluded.has(fresh.current.generation)) return await stage(fresh.root, fresh.current, { observedAt: Date.now(), onProgress: options.onProgress });
      } catch (cause) { error = cause; }
    }
    throw error || new Error("No complete Runtime is available");
  }
  async function prepare(path, options = {}) {
    return select(path, options);
  }
  async function collect(root) {
    if (!cleanupSafe) return;
    const all = await snapshots(root);
    const live = await self.clients.matchAll({ type: "all", includeUncontrolled: true });
    const active = new Set(live.map(client => {
      const path = relative(client.url);
      return path && C.parseRuntimeGenerationPath(path)?.generation;
    }).filter(Boolean));
    let retained = 0;
    for (const snapshot of all) {
      const keep = protectedCaches.has(snapshot.name) || active.has(snapshot.descriptor.generation) ||
        Date.now() - Math.max(snapshot.createdAt, snapshot.selectedAt || 0) < 60000;
      if (retained < 2 && await complete(snapshot)) { retained++; continue; }
      if (!keep) await caches.delete(snapshot.name);
    }
    for (const name of await caches.keys()) {
      if (!name.startsWith(prefix) || protectedCaches.has(name)) continue;
      try {
        const raw = await (await (await caches.open(name)).match(marker))?.json();
        if (raw?.schema === C.RUNTIME_CACHE_PROTOCOL && raw.root === root && raw.complete === false &&
            Date.now() - Number(raw.createdAt) > 600000) await caches.delete(name);
      } catch { /* Unknown caches are not ours to prune. */ }
    }
  }
  function deliver(response) {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.delete("Content-Encoding"); headers.delete("Content-Length");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  async function immutableResponse(path, parsed) {
    for (const snapshot of await snapshots(parsed.root).catch(() => [])) {
      if (snapshot.descriptor.generation !== parsed.generation) continue;
      const file = snapshot.descriptor.files.find(file => file.path === parsed.file);
      if (!file) break;
      const cache = await caches.open(snapshot.name);
      const cached = await cache.match(absolute(path));
      if (cached) {
        try { return deliver(await checked(cached, file)); } catch { /* Repair this exact immutable address. */ }
      }
      const fetched = await runtimeFile(absolute(path), file);
      await cache.put(absolute(path), fetched.clone()).catch(() => {});
      return deliver(fetched);
    }
    // Explicit immutable requests never follow latest or change generation. In
    // a storage-restricted browser they remain ordinary same-origin HTTP loads.
    const group = known.groups.find(group => group.root === parsed.root);
    let descriptor = group && [group.current, ...group.previous].find(item => item.generation === parsed.generation);
    if (!descriptor) descriptor = await network(absolute(C.runtimeGenerationBase(parsed.root, parsed.generation) + C.RUNTIME_GENERATION_FILE), async response => {
      const raw = await response.json();
      if (raw.schema !== C.RUNTIME_GENERATION_SCHEMA || raw.protocol !== C.RUNTIME_PROTOCOL || raw.root !== parsed.root || raw.generation !== parsed.generation) {
        throw new Error("Immutable Runtime descriptor mismatch");
      }
      return verifyGeneration(raw);
    });
    descriptor = await verifyGeneration(descriptor);
    const file = descriptor.files.find(file => file.path === parsed.file);
    if (parsed.file === C.RUNTIME_GENERATION_FILE) return deliver(json({ schema: C.RUNTIME_GENERATION_SCHEMA,
      protocol: C.RUNTIME_PROTOCOL, root: parsed.root, ...descriptor }));
    if (!file) return new Response("Unknown Runtime resource", { status: 404 });
    return deliver(await runtimeFile(absolute(path), file));
  }
  async function selectForLaunch(path, options) {
    const snapshot = await prepare(path, options);
    return markSelected(snapshot);
  }
  async function markSelected(snapshot) {
    // A prior snapshot may be selected long after creation. Protect the gap
    // between replying to the Launcher and its new document becoming a client.
    snapshot.selectedAt = Date.now();
    try { await (await caches.open(snapshot.name)).put(marker, json(snapshot)); }
    catch { cleanupSafe = false; } // usable fallback wins over optional metadata/GC
    return snapshot;
  }
  function handle(event) {
    if (event.request.method !== "GET") return null;
    const path = relative(event.request.url);
    if (!path?.startsWith("runtime/")) return null;
    const parsed = C.parseRuntimeGenerationPath(path);
    if (parsed) return immutableResponse(path, parsed);
    if (event.request.mode !== "navigate" || !path.endsWith(".html")) return null;
    return (async () => {
      const snapshot = await selectForLaunch(path);
      protectedCaches.add(snapshot.name);
      try { await collect(snapshot.root); } catch { /* GC must never block a valid launch. */ }
      finally { protectedCaches.delete(snapshot.name); }
      const target = new URL(C.runtimeGenerationEntry(snapshot.root, snapshot.descriptor), scopeUrl);
      target.search = new URL(event.request.url).search;
      return new Response(null, { status: 302, headers: { Location: target.href, "Cache-Control": "no-store" } });
    })();
  }
  async function prepareLaunch(path, options) {
    const snapshot = await selectForLaunch(path, options);
    return preparedSnapshot(snapshot);
  }
  async function importLaunch(root, descriptor, files) {
    const supplied = new Map(files.map(file => {
      const path = file.path;
      const type = /\.m?js$/.test(path) ? 'text/javascript' : /\.wasm$/.test(path) ? 'application/wasm'
        : /\.html$/.test(path) ? 'text/html' : /\.json$/.test(path) ? 'application/json' : 'application/octet-stream';
      return [path, new Response(file.buffer, {headers:{'Content-Type':type}})];
    }));
    const snapshot = await stage(root, descriptor, {localOnly:true, supplied, observedAt:Date.now()});
    return preparedSnapshot(await markSelected(snapshot));
  }
  async function preparedSnapshot(snapshot) {
    protectedCaches.add(snapshot.name);
    try { await collect(snapshot.root); } catch { /* Optional cleanup. */ }
    finally { protectedCaches.delete(snapshot.name); }
    return { ok: true, protocol: C.RUNTIME_CACHE_PROTOCOL, cached: true,
      entry: C.runtimeGenerationEntry(snapshot.root, snapshot.descriptor), generation: snapshot.descriptor.generation };
  }
  async function preparePaths(paths) {
    const groups = new Map();
    for (const path of paths) {
      const group = C.findRuntimeGroup(known, path) || known.groups.filter(group => path.startsWith(group.root)).sort((a, b) => b.root.length - a.root.length)[0];
      if (!group) throw new Error("Runtime is not declared: " + path);
      groups.set(group.root, group.root + group.current.entry);
    }
    for (const path of groups.values()) await prepare(path);
  }
  async function readyGroups() {
    const ready = new Set();
    for (const snapshot of await snapshots()) {
      if (!ready.has(snapshot.root) && await complete(snapshot)) ready.add(snapshot.root);
    }
    return [...ready].sort();
  }
  return { handle, prepareLaunch, importLaunch, preparePaths, readyGroups };
}

"use strict";
// Runtime-only registration. It never controls/preloads Launcher pages, DATA,
// fonts from shared/ or games/, or mutable save/replay content.
const programMount = new URL('./', self.location.href);
const programCache = createRuntimeCache({scopeUrl: programMount, catalog: {
  schema: EaglerRuntimeGenerations.RUNTIME_MANIFEST_SCHEMA,
  protocol: EaglerRuntimeGenerations.RUNTIME_PROTOCOL, groups: [],
}});
self.addEventListener('install', event => {event.waitUntil(self.skipWaiting());});
self.addEventListener('fetch', event => {
  const response = programCache.handle(event);
  if (response) event.respondWith(response);
});
self.addEventListener('message', event => {
  const port = event.ports?.[0], C = EaglerRuntimeGenerations;
  if (![C.RUNTIME_CAPABILITIES, C.RUNTIME_PREPARE, C.RUNTIME_IMPORT].includes(event.data?.type)) return;
  const source = event.source?.url && new URL(event.source.url);
  if (!source || source.origin !== programMount.origin || !source.pathname.startsWith(programMount.pathname)) return;
  event.waitUntil((async () => {
    try {
      if (event.data.type === C.RUNTIME_CAPABILITIES) {
        port?.postMessage({ok:true, protocol:C.RUNTIME_CACHE_PROTOCOL, localOnly:true, importFiles:true});return;
      }
      if (event.data.type === C.RUNTIME_IMPORT) {
        const request = C.validateRuntimeImportRequest(event.data);
        port?.postMessage(await programCache.importLaunch(request.root, request.descriptor, request.files));return;
      }
      const request = C.validateRuntimePrepareRequest(event.data);
      port?.postMessage(await programCache.prepareLaunch(request.entry, {
        exclude:request.exclude, ...(request.catalog ? {catalog:request.catalog} : {}),
        ...(request.localOnly ? {localOnly:true} : {}),
        ...(request.progress ? {onProgress: progress => port?.postMessage(progress)} : {}),
      }));
    } catch (error) {port?.postMessage({ok:false,error:error instanceof Error ? error.message : String(error)});}
  })());
});
