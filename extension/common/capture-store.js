import {
  STORAGE_DATABASE_NAME,
  STORAGE_DATABASE_VERSION,
  STORAGE_OBJECT_STORE,
  TEMP_CAPTURE_TTL_MS,
} from "./constants.js";
import { tryValidateAnnotations, tryValidateCrop } from "../editor/annotation-model.js";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STORAGE_DATABASE_NAME, STORAGE_DATABASE_VERSION);
    request.onerror = () => reject(request.error || new Error("Could not open temporary capture storage."));
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORAGE_OBJECT_STORE)) {
        request.result.createObjectStore(STORAGE_OBJECT_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function runTransaction(mode, operation) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORAGE_OBJECT_STORE, mode);
    const store = transaction.objectStore(STORAGE_OBJECT_STORE);
    let result;
    try {
      result = operation(store);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("Temporary capture storage failed."));
    };
    transaction.oncomplete = () => {
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

export async function getCapture(id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9-]{16,128}$/.test(id)) {
    return null;
  }
  return runTransaction("readonly", (store) => new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onerror = () => reject(request.error || new Error("Could not read temporary capture."));
    request.onsuccess = () => {
      const record = request.result || null;
      if (!record) {
        resolve(null);
        return;
      }
      const validation = tryValidateAnnotations(record.annotations || []);
      const cropValidation = tryValidateCrop(record.crop || null);
      resolve({
        ...record,
        annotations: validation.valid ? validation.annotations : [],
        crop: cropValidation.valid ? cropValidation.crop : null,
      });
    };
  }));
}

export async function deleteCapture(id) {
  if (typeof id !== "string") {
    return;
  }
  await runTransaction("readwrite", (store) => store.delete(id));
}

export async function pruneExpiredCaptures(now = Date.now()) {
  return runTransaction("readwrite", (store) => new Promise((resolve, reject) => {
    const request = store.openCursor();
    let removed = 0;
    request.onerror = () => reject(request.error || new Error("Could not prune temporary captures."));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(removed);
        return;
      }
      if (isCaptureExpired(cursor.value, now)) {
        cursor.delete();
        removed += 1;
      }
      cursor.continue();
    };
  }));
}
