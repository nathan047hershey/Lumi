import { getCvRootHandle, ensureCvRootPermission } from './lib/cvFolderStore.js';

async function writeCvToRoot(msg) {
    const handle = await getCvRootHandle();
    if (!handle) return { ok: false, reason: 'no_folder' };
    const perm = await ensureCvRootPermission(handle);
    if (perm !== 'granted') return { ok: false, reason: 'permission_denied' };

    const parts = Array.isArray(msg.relParts) ? msg.relParts.map((p) => String(p || '').trim()).filter(Boolean) : [];
    const filename = String(msg.filename || 'Candidate.docx').replace(/[\\/:*?"<>|]+/g, '_');
    const base64 = String(msg.base64 || '');
    if (!parts.length || !filename || !base64) return { ok: false, reason: 'missing_file' };

    let dir = handle;
    for (const part of parts) {
        dir = await dir.getDirectoryHandle(part, { create: true });
    }
    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    await writable.write(bytes);
    await writable.close();
    return {
        ok: true,
        folder: handle.name,
        rel: `${parts.join('/')}/${filename}`
    };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'OFFSCREEN_WRITE_CV') return undefined;
    writeCvToRoot(msg)
        .then((data) => sendResponse(data))
        .catch((err) => sendResponse({ ok: false, reason: err?.message || String(err) }));
    return true;
});
