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

getCvRootHandle().then(() => refreshLabel()).catch(() => refreshLabel());
