import {
  STORAGE_DATABASE_NAME,
  STORAGE_DATABASE_VERSION,
  STORAGE_DRAFT_STORE,
  STORAGE_OBJECT_STORE,
  TEMP_CAPTURE_TTL_MS,
} from "./constants.js";
import { tryValidateAnnotations, tryValidateCrop } from "../editor/annotation-model.js";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STORAGE_DATABASE_NAME, STORAGE_DATABASE_VERSION);
    let expired = false;
    const timer = setTimeout(() => { expired = true; reject(new Error("Temporary storage did not open in time. Close other KoalaShot tabs and retry.")); }, 10_000);
    request.onerror = () => { clearTimeout(timer); reject(request.error || new Error("Could not open temporary capture storage.")); };
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORAGE_OBJECT_STORE)) {
        request.result.createObjectStore(STORAGE_OBJECT_STORE, { keyPath: "id" });
      }
      if (!request.result.objectStoreNames.contains(STORAGE_DRAFT_STORE)) {
        request.result.createObjectStore(STORAGE_DRAFT_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (expired) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

function runTransaction(mode, operation, storeName = STORAGE_OBJECT_STORE) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const storeNames = Array.isArray(storeName) ? storeName : [storeName];
    const transaction = database.transaction(storeNames, mode);
    const store = Array.isArray(storeName)
      ? Object.fromEntries(storeNames.map((name) => [name, transaction.objectStore(name)]))
      : transaction.objectStore(storeName);
    let result;
    let operationError;
    const timer = setTimeout(() => { operationError = new Error("Temporary storage timed out."); transaction.abort(); }, 15_000);
    try {
      result = operation(store);
      if (result?.then) result.catch((error) => { operationError = error; try { transaction.abort(); } catch { /* Already completed. */ } });
    } catch (error) {
      clearTimeout(timer);
      transaction.abort();
      database.close();
      reject(error);
      return;
    }
    transaction.onabort = transaction.onerror = () => {
      clearTimeout(timer);
      database.close();
      reject(operationError || transaction.error || new Error("Temporary capture storage failed."));
    };
    transaction.oncomplete = () => {
      clearTimeout(timer);
      database.close();
      resolve(result);
    };
  }));
}

export function isCaptureExpired(record, now = Date.now()) {
  return !record || !Number.isFinite(record.createdAt)
    || now - record.createdAt >= TEMP_CAPTURE_TTL_MS;
}

export function makeCaptureId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Secure capture ID generation is unavailable.");
  }

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function saveCapture(record) {
  if (!record?.id || !(record.blob instanceof Blob)) {
    throw new Error("Invalid temporary capture record.");
  }
  if (record.annotations !== undefined) {
    const validation = tryValidateAnnotations(record.annotations);
    if (!validation.valid) {
      throw new Error("Invalid temporary annotation draft.");
    }
    record = { ...record, annotations: validation.annotations };
  }
  if (record.crop !== undefined) {
    const validation = tryValidateCrop(record.crop);
    if (!validation.valid) {
      throw new Error("Invalid temporary crop selection.");
    }
    record = { ...record, crop: validation.crop };
  }
  await runTransaction("readwrite", (store) => store.put(record));
}

export async function saveCaptureDraft(id, annotations, crop, expectedRevision = 0, writer = "") {
  if (typeof id !== "string" || !/^[A-Za-z0-9-]{16,128}$/.test(id)) {
    throw new Error("Invalid temporary capture draft ID.");
  }
  const annotationValidation = tryValidateAnnotations(annotations);
  if (!annotationValidation.valid) {
    throw new Error("Invalid temporary annotation draft.");
  }
  const cropValidation = tryValidateCrop(crop);
  if (!cropValidation.valid) {
    throw new Error("Invalid temporary crop selection.");
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("Invalid draft revision.");
  const saved = await runTransaction("readwrite", (stores) => new Promise((resolve, reject) => {
    const request = stores[STORAGE_OBJECT_STORE].get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      if (isCaptureExpired(request.result)) { resolve(null); return; }
      const draftRequest = stores[STORAGE_DRAFT_STORE].get(id);
      draftRequest.onerror = () => reject(draftRequest.error);
      draftRequest.onsuccess = () => {
        const revision = draftRequest.result?.revision || 0;
        if (revision !== expectedRevision) {
          const error = new Error("This screenshot changed in another tab. Load the latest draft or keep your edits as a separate copy.");
          error.code = "draft-conflict"; reject(error); return;
        }
        const nextRevision = revision + 1;
        stores[STORAGE_DRAFT_STORE].put({ id, annotations: annotationValidation.annotations, crop: cropValidation.crop, revision: nextRevision, updatedAt: Date.now() });
        resolve(nextRevision);
      };
    };
  }), [STORAGE_OBJECT_STORE, STORAGE_DRAFT_STORE]);
  if (!saved) {
    const error = new Error("This screenshot was deleted or expired. The draft was not saved.");
    error.code = "capture-unavailable";
    throw error;
  }
  notifyDraft({ id, revision: saved, writer });
  return saved;
}

export async function getCapture(id, { allowInvalidDraft = false } = {}) {
  if (typeof id !== "string" || !/^[A-Za-z0-9-]{16,128}$/.test(id)) {
    return null;
  }
  // Read one consistent snapshot. A discard cannot fall between the capture
  // read and the draft read and leave initialization with an orphan original.
  const [record, draft] = await runTransaction("readonly", (stores) => Promise.all(
    [STORAGE_OBJECT_STORE, STORAGE_DRAFT_STORE].map((name) => new Promise((resolve, reject) => {
      const request = stores[name].get(id);
      request.onerror = () => reject(request.error || new Error("Could not read temporary capture."));
      request.onsuccess = () => resolve(request.result || null);
    })),
  ), [STORAGE_OBJECT_STORE, STORAGE_DRAFT_STORE]);
  if (!record) {
    return null;
  }
  if (isCaptureExpired(record)) {
    await deleteCapture(id);
    return null;
  }
  const validation = tryValidateAnnotations(draft ? draft.annotations : record.annotations === undefined ? [] : record.annotations);
  const cropValidation = tryValidateCrop(draft ? draft.crop : record.crop ?? null);
  const revision = draft?.revision ?? 0;
  if ((!validation.valid || !cropValidation.valid || !Number.isSafeInteger(revision) || revision < 0) && !allowInvalidDraft) {
    const error = new Error("The saved draft is damaged. Export is disabled to avoid losing redactions. You can open the unedited original as a separate copy.");
    error.code = "draft-invalid";
    throw error;
  }
  return {
    ...record,
    annotations: validation.valid ? validation.annotations : [],
    crop: cropValidation.valid ? cropValidation.crop : null,
    revision,
  };
}

function notifyDraft(message) {
  if (typeof BroadcastChannel !== "function") return;
  const channel = new globalThis.BroadcastChannel("koalashot-draft-updates");
  channel.postMessage(message); channel.close();
}

export function subscribeCaptureUpdates(listener) {
  if (typeof BroadcastChannel !== "function") return () => {};
  const channel = new globalThis.BroadcastChannel("koalashot-draft-updates");
  channel.onmessage = ({ data }) => {
    if (typeof data?.id === "string" && Number.isSafeInteger(data.revision)) listener(data);
  };
  return () => channel.close();
}

export async function deleteCapture(id) {
  if (typeof id !== "string") {
    return;
  }
  await runTransaction("readwrite", (stores) => {
    stores[STORAGE_OBJECT_STORE].delete(id);
    stores[STORAGE_DRAFT_STORE].delete(id);
  }, [STORAGE_OBJECT_STORE, STORAGE_DRAFT_STORE]);
  notifyDeletion([id]);
}

function notifyDeletion(ids) {
  if (typeof BroadcastChannel !== "function" || !ids.length) return;
  const channel = new globalThis.BroadcastChannel("koalashot-deleted-captures");
  channel.postMessage(ids); channel.close();
}

export function subscribeCaptureDeletion(listener) {
  if (typeof BroadcastChannel !== "function") return () => {};
  const channel = new globalThis.BroadcastChannel("koalashot-deleted-captures");
  channel.onmessage = (event) => { if (Array.isArray(event.data)) listener(event.data); };
  return () => channel.close();
}

export async function pruneExpiredCaptures(now = Date.now()) {
  const removedIds = await runTransaction("readwrite", (stores) => new Promise((resolve, reject) => {
    const request = stores[STORAGE_OBJECT_STORE].openCursor();
    const removed = [];
    request.onerror = () => reject(request.error || new Error("Could not prune temporary captures."));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(removed);
        return;
      }
      if (isCaptureExpired(cursor.value, now)) {
        stores[STORAGE_DRAFT_STORE].delete(cursor.primaryKey);
        cursor.delete();
        removed.push(cursor.primaryKey);
      }
      cursor.continue();
    };
  }), [STORAGE_OBJECT_STORE, STORAGE_DRAFT_STORE]);
  await runTransaction("readwrite", (stores) => new Promise((resolve, reject) => {
    const request = stores[STORAGE_DRAFT_STORE].openCursor();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(); return; }
      const captureRequest = stores[STORAGE_OBJECT_STORE].get(cursor.primaryKey);
      captureRequest.onerror = () => reject(captureRequest.error);
      captureRequest.onsuccess = () => {
        if (isCaptureExpired(captureRequest.result, now)) cursor.delete();
        cursor.continue();
      };
    };
  }), [STORAGE_OBJECT_STORE, STORAGE_DRAFT_STORE]);
  notifyDeletion(removedIds);
  return removedIds.length;
}
