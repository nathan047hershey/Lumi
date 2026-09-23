/** Persist the user-picked CV root folder (File System Access handle). */

const DB_NAME = 'lumi-cv-folder';
const STORE = 'handles';
const KEY = 'root';

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('cv_folder_db'));
    });
}

export async function saveCvRootHandle(handle) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(STORE).put(handle, KEY);
    });
    db.close();
}

export async function getCvRootHandle() {
    const db = await openDb();
    const handle = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
    db.close();
    return handle || null;
}

export async function clearCvRootHandle() {
    const db = await openDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(STORE).delete(KEY);
    });
    db.close();
}

export async function ensureCvRootPermission(handle) {
    if (!handle) return 'denied';
    let perm = 'prompt';
    try {
        perm = await handle.queryPermission({ mode: 'readwrite' });
    } catch (_) {
        perm = 'prompt';
    }
    if (perm === 'granted') return perm;
    try {
        perm = await handle.requestPermission({ mode: 'readwrite' });
    } catch (_) {
        perm = 'denied';
    }
    return perm;
}
