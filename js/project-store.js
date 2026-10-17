const PACK_FORMAT = "OpenMapCreator/asset-pack";
export function packProject(data) {
  const assets = [],
    lookup = new Map();
  function visit(value) {
    if (typeof value === "string" && value.length > 256) {
      if (!lookup.has(value)) {
        lookup.set(value, assets.length);
        assets.push(value);
      }
      return { __omcAsset: lookup.get(value) };
    }
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, visit(item)]),
      );
    return value;
  }
  return { format: PACK_FORMAT, version: 1, data: visit(data), assets };
}
export function unpackProject(packed) {
  if (packed?.format !== PACK_FORMAT) return packed;
  function visit(value) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 1 &&
      Number.isInteger(value.__omcAsset)
    ) {
      const asset = packed.assets[value.__omcAsset];
      if (typeof asset !== "string") throw Error("Missing saved asset");
      return asset;
    }
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, visit(item)]),
      );
    return value;
  }
  return visit(packed.data);
}
export class ProjectStore {
  constructor() {
    this.connection = null;
  }
  open() {
    if (!this.connection)
      this.connection = new Promise((resolve, reject) => {
        const request = indexedDB.open("OpenMapCreator", 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("projects");
        request.onerror = () => reject(request.error);
        request.onblocked = () =>
          reject(Error("Project storage is blocked by another tab"));
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            this.connection = null;
          };
          resolve(db);
        };
      }).catch((error) => {
        this.connection = null;
        throw error;
      });
    return this.connection;
  }
  async access(mode, key, value) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("projects", mode),
        store = tx.objectStore("projects");
      const request =
        mode === "readonly"
          ? store.get(key)
          : value === undefined
            ? store.delete(key)
            : store.put(value, key);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || Error("Save transaction aborted"));
    });
  }
  read(key) {
    return this.access("readonly", key);
  }
  write(key, value) {
    return this.access("readwrite", key, value);
  }
  delete(key) {
    return this.access("readwrite", key);
  }
}
