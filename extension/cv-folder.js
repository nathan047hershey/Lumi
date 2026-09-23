import { saveCvRootHandle, clearCvRootHandle, getCvRootHandle, ensureCvRootPermission } from './lib/cvFolderStore.js';

const statusEl = document.getElementById('status');

function setStatus(text, isErr = false) {
    statusEl.textContent = text || '';
    statusEl.classList.toggle('err', !!isErr);
}

async function refreshLabel() {
    const stored = await chrome.storage.local.get(['cvRootFolderName']);
    const name = String(stored.cvRootFolderName || '').trim();
    if (name) setStatus(`Current root: ${name}`);
    else setStatus('Current root: Downloads/CVs (default)');
}

document.getElementById('pick').addEventListener('click', async () => {
    setStatus('');
    try {
        const handle = await window.showDirectoryPicker({
            id: 'lumi-cv-root',
            mode: 'readwrite',
            startIn: 'downloads'
        });
        const perm = await ensureCvRootPermission(handle);
        if (perm !== 'granted') {
            setStatus('Folder permission was denied.', true);
            return;
        }
        await saveCvRootHandle(handle);
        await chrome.storage.local.set({
            cvRootFolderName: handle.name,
            cvRootFolderSetAt: Date.now()
        });
        setStatus(`Saved: ${handle.name}`);
        try {
            chrome.runtime.sendMessage({ type: 'CV_FOLDER_PICKED', name: handle.name });
        } catch (_) { /* ignore */ }
        setTimeout(() => window.close(), 700);
    } catch (err) {
        if (err?.name === 'AbortError') {
            setStatus('Cancelled');
            return;
        }
        setStatus(err?.message || 'Could not save folder', true);
    }
});

document.getElementById('clear').addEventListener('click', async () => {
    try {
        await clearCvRootHandle();
        await chrome.storage.local.remove(['cvRootFolderName', 'cvRootFolderSetAt']);
        setStatus('Using Downloads/CVs');
        try {
            chrome.runtime.sendMessage({ type: 'CV_FOLDER_CLEARED' });
        } catch (_) { /* ignore */ }
        setTimeout(() => window.close(), 700);
    } catch (err) {
        setStatus(err?.message || 'Could not clear folder', true);
    }
});

async function writePendingCv() {
    const { lumiPendingCvWrite } = await chrome.storage.session.get('lumiPendingCvWrite');
    if (!lumiPendingCvWrite?.base64) return { ok: false, reason: 'no_pending' };
    const handle = await getCvRootHandle();
    if (!handle) return { ok: false, reason: 'no_folder' };
    const perm = await ensureCvRootPermission(handle);
    if (perm !== 'granted') return { ok: false, reason: 'permission_denied' };
    const parts = Array.isArray(lumiPendingCvWrite.relParts)
        ? lumiPendingCvWrite.relParts.map((p) => String(p || '').trim()).filter(Boolean)
        : [];
    const filename = String(lumiPendingCvWrite.filename || 'Candidate.docx').replace(/[\\/:*?"<>|]+/g, '_');
    if (!parts.length || !filename) return { ok: false, reason: 'missing_file' };
    let dir = handle;
    for (const part of parts) {
        dir = await dir.getDirectoryHandle(part, { create: true });
    }
    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    const binary = atob(lumiPendingCvWrite.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    await writable.write(bytes);
    await writable.close();
    const result = {
        ok: true,
        folder: handle.name,
        rel: `${parts.join('/')}/${filename}`
    };
    await chrome.storage.session.set({
        lumiPendingCvWrite: { ...lumiPendingCvWrite, done: true, result }
    });
    return result;
}

document.getElementById('saveCv')?.addEventListener('click', async () => {
    setStatus('Saving CV…');
    const res = await writePendingCv().catch((err) => ({ ok: false, reason: err?.message || String(err) }));
    if (res?.ok) {
        setStatus(`Saved to ${res.folder}/${res.rel}`);
        setTimeout(() => window.close(), 900);
        return;
    }
    setStatus(res?.reason === 'permission_denied'
        ? 'Click Choose folder first, then Save CV now.'
        : (res?.reason || 'Could not save CV'), true);
});

const wantWrite = new URLSearchParams(location.search).get('write') === '1';
getCvRootHandle().then(async () => {
    await refreshLabel();
    if (!wantWrite) return;
    const saveBtn = document.getElementById('saveCv');
    if (saveBtn) saveBtn.style.display = '';
    setStatus('Saving CV to your folder…');
    const res = await writePendingCv().catch((err) => ({ ok: false, reason: err?.message || String(err) }));
    if (res?.ok) {
        setStatus(`Saved to ${res.folder}/${res.rel}`);
        setTimeout(() => window.close(), 900);
        return;
    }
    setStatus(
        res?.reason === 'permission_denied'
            ? 'Folder permission expired — click Save CV now (or Choose folder).'
            : (res?.reason || 'Click Save CV now'),
        true
    );
}).catch(() => refreshLabel());
