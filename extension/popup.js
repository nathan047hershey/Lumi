import {
    getSettings,
    saveSettings,
    login,
    me,
    listProfiles,
    normalizeBaseUrl
} from './lib/api.js';

const $ = (id) => document.getElementById(id);

function show(el, on) {
    el.classList.toggle('hidden', !on);
}

function setPill(text, kind = 'muted') {
    const pill = $('statusPill');
    pill.textContent = text;
    pill.className = `pill ${kind}`;
}

function isLoopbackUrl(url) {
    return /localhost|127\.0\.0\.1/i.test(String(url || ''));
}

/** If a Lumi tab is open, prefer that host over stale localhost defaults. */
function urlsFromPage(raw) {
    try {
        const u = new URL(raw);
        if (!/^https?:$/i.test(u.protocol)) return null;
        const host = u.hostname.toLowerCase();
        const port = u.port || (u.protocol === 'https:' ? '443' : '80');

        // Vercel / hosted Next — API lives under /api on the same origin.
        if (
            host.endsWith('.vercel.app')
            || host.endsWith('.vercel.sh')
            || (u.protocol === 'https:' && port === '443' && !isLoopbackUrl(host))
        ) {
            const origin = `${u.protocol}//${u.hostname}`;
            return {
                apiBaseUrl: `${origin}/api`,
                frontendBaseUrl: origin
            };
        }

        if (!['5173', '9017', '4173', '3000'].includes(port)) return null;
        const origin = `${u.protocol}//${u.hostname}${port ? `:${port}` : ''}`;
        if (port === '9017') {
            return { apiBaseUrl: origin, frontendBaseUrl: origin };
        }
        // Next on :3000 / Vite :5173 — API under /api or separate :9017.
        if (port === '3000') {
            return { apiBaseUrl: `${origin}/api`, frontendBaseUrl: origin };
        }
        const origin9017 = `${u.protocol}//${u.hostname}:9017`;
        return {
            apiBaseUrl: origin9017,
            frontendBaseUrl: origin
        };
    } catch {
        return null;
    }
}

async function adoptServerUrls(settings) {
    let tabs = [];
    try {
        tabs = await chrome.tabs.query({});
    } catch {
        return settings;
    }
    // Prefer Vercel / hosted desk whenever a Lumi tab is open — overrides stale :9017.
    const inferredList = tabs.map((t) => urlsFromPage(t.url || '')).filter(Boolean);
    const vercel = inferredList.find((u) => /\.vercel\.(app|sh)|\/api$/i.test(u.apiBaseUrl));
    const inferred = vercel || inferredList[0];
    if (!inferred) return settings;
    const storedIsLocal = isLoopbackUrl(settings.apiBaseUrl) || !settings.apiBaseUrl;
    const remote = !isLoopbackUrl(inferred.apiBaseUrl);
    if ((storedIsLocal && remote) || (vercel && settings.apiBaseUrl !== inferred.apiBaseUrl)) {
        await saveSettings(inferred);
        return { ...settings, ...inferred };
    }
    return settings;
}

async function refresh() {
    $('loginError').textContent = '';
    $('mainError').textContent = '';
    $('mainOk').textContent = '';

    let settings = await getSettings();
    settings = await adoptServerUrls(settings);
    $('apiBaseUrl').value = settings.apiBaseUrl;
    $('frontendBaseUrl').value = settings.frontendBaseUrl;
    $('autoSubmit').checked = !!settings.autoSubmit;
    try {
        const live = await chrome.storage.local.get(['lumiLiveStatus', 'lumiServerVersion', 'lumiUpdateAvailable']);
        const hint = document.querySelector('#viewLogin .hint');
        if (hint) {
            const link = live.lumiLiveStatus === 'connected' ? 'Live link: connected' : 'Live link: reconnecting';
            const upd = live.lumiUpdateAvailable ? ` · update ${live.lumiServerVersion} available` : '';
            hint.textContent = `${link}${upd}. API ${settings.apiBaseUrl}`;
        }
    } catch { /* ignore */ }

    try {
        const { lastUiMessage } = await chrome.storage.local.get(['lastUiMessage']);
        if (lastUiMessage?.message || lastUiMessage?.short) {
            const age = Date.now() - new Date(lastUiMessage.at).getTime();
            if (age < 10 * 60 * 1000) {
                const line = lastUiMessage.short
                    || `${lastUiMessage.title}: ${lastUiMessage.message}`;
                if (lastUiMessage.kind === 'error') {
                    $('mainError').textContent = line;
                } else {
                    $('mainOk').textContent = line;
                }
            }
        }
    } catch (_) { /* ignore */ }

    if (!settings.token) {
        show($('viewLogin'), true);
        show($('viewMain'), false);
        setPill('Logged out', 'muted');
        return;
    }

    try {
        const user = await me();
        await saveSettings({ user });
        show($('viewLogin'), false);
        show($('viewMain'), true);
        $('userName').textContent = user.username;
        setPill('Connected', 'ok');
        await loadProfiles(settings.selectedProfileId);
        renderLast(settings.lastResult);
        await refreshMonitor();
        await refreshCapturedQuestions();
    } catch (err) {
        if (err.status === 401) {
            await saveSettings({
                token: null,
                user: null,
                selectedProfileId: null,
                selectedProfileName: null
            });
            show($('viewLogin'), true);
            show($('viewMain'), false);
            setPill('Session expired', 'warn');
            $('loginError').textContent = 'Session expired — log in again.';
            return;
        }
        // Stale token or unreachable API — drop session so login form is usable.
        await saveSettings({
            token: null,
            user: null
        });
        show($('viewLogin'), true);
        show($('viewMain'), false);
        setPill('API offline', 'warn');
        const base = settings.apiBaseUrl || 'http://127.0.0.1:9017';
        $('loginError').textContent = err.message
            || `Cannot reach API at ${base}. Enter password and click Log in (API must be :9017).`;
    }
}

async function loadProfiles(selectedId) {
    const profiles = await listProfiles();
    const select = $('profileSelect');
    select.innerHTML = '';

    if (!Array.isArray(profiles) || profiles.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No profiles assigned';
        select.appendChild(opt);
        return;
    }

    let chosen = selectedId;
    if (!chosen) {
        const def = profiles.find((p) => p.is_default) || profiles[0];
        chosen = def?.id;
    }

    for (const p of profiles) {
        const opt = document.createElement('option');
        opt.value = String(p.id);
        opt.textContent = `${p.first_name} ${p.last_name}${p.is_default ? ' (default)' : ''}`;
        if (Number(p.id) === Number(chosen)) opt.selected = true;
        select.appendChild(opt);
    }
}

function renderLast(last) {
    const box = $('lastBox');
    const summary = $('lastSummary');
    const link = $('lastDownload');
    if (!last) {
        show(box, false);
        return;
    }
    show(box, true);
    if (last.error) {
        summary.textContent = `Error: ${last.error}`;
        show(link, false);
        return;
    }
    const fill = last.fillStats
        ? ` · filled ${last.fillStats.filled}, uploaded ${last.fillStats.uploaded}` +
          (last.fillStats.markedApplied ? ', marked applied' : '')
        : '';
    summary.textContent = [
        last.applicationId ? `App #${last.applicationId}` : null,
        last.profileName,
        last.company || last.jobTitle,
        last.autoPassed ? 'auto-passed' : (last.fromMode2 ? 'mode2' : ''),
        last.at ? new Date(last.at).toLocaleString() : ''
    ].filter(Boolean).join(' · ') + fill;

    if (last.downloadUrl) {
        link.href = last.downloadUrl;
        show(link, true);
    } else {
        show(link, false);
    }
}

function formatElapsed(ms) {
    const n = Math.max(0, Number(ms) || 0) / 1000;
    if (n < 60) return `${n < 10 ? n.toFixed(1) : Math.round(n)}s`;
    const m = Math.floor(n / 60);
    const s = Math.round(n % 60);
    return `${m}m ${s}s`;
}

function sendMessage(type, payload = {}) {
    return new Promise((resolve) => {
        try {
            chrome.runtime.sendMessage({ type, ...payload }, (res) => {
                if (chrome.runtime.lastError) {
                    resolve({ ok: false, error: chrome.runtime.lastError.message });
                    return;
                }
                resolve(res || { ok: false, error: 'No response' });
            });
        } catch (err) {
            resolve({ ok: false, error: err?.message || String(err) });
        }
    });
}

let _monitorPoll = null;
let _workTick = null;
let _localWorkStart = null;
let _localWorkLabel = '';

function stopMonitorPoll() {
    if (_monitorPoll) {
        clearInterval(_monitorPoll);
        _monitorPoll = null;
    }
}

function stopWorkTick() {
    if (_workTick) {
        clearInterval(_workTick);
        _workTick = null;
    }
    _localWorkStart = null;
    _localWorkLabel = '';
}

function startWorkTick(label) {
    stopWorkTick();
    _localWorkStart = Date.now();
    _localWorkLabel = label || 'Working…';
    const phaseEl = $('monitorPhase');
    const elapsedEl = $('monitorElapsed');
    if (phaseEl) phaseEl.textContent = _localWorkLabel;
    const tick = () => {
        if (!_localWorkStart) return;
        const elapsed = Date.now() - _localWorkStart;
        if (elapsedEl) elapsedEl.textContent = `Elapsed ${formatElapsed(elapsed)}`;
        if ($('mainOk') && _localWorkLabel) {
            $('mainOk').textContent = `${_localWorkLabel} · ${formatElapsed(elapsed)}`;
        }
    };
    tick();
    _workTick = setInterval(tick, 250);
}

function renderMonitorSnapshot(snap) {
    const summary = $('monitorSummary');
    const list = $('readyList');
    const phaseEl = $('monitorPhase');
    const elapsedEl = $('monitorElapsed');
    const logEl = $('monitorLog');
    if (!summary || !list) return { active: false };

    const status = snap?.status?.ok ? (snap.status.data || {}) : null;
    const queue = snap?.queue?.ok ? (snap.queue.data || {}) : null;
    const ready = snap?.ready?.ok ? (snap.ready.data || {}) : null;
    const work = snap?.work || null;
    const now = Date.now();

    const caps = status?.caps || {};
    const today = status?.today || {};
    const readyAll = status?.ready_count ?? '—';
    const readyItems = ready?.items || [];
    const parts = [];
    if (snap?.status?.ok) {
        parts.push(
            `Ready: ${readyItems.length} shown / ${readyAll} all`
            + ` · Today: ${today.userTotal ?? '—'}`
            + ` (caps ${caps.maxPerProfilePerDay || 100}/p, ${caps.maxTotalPerDay || 500}/d)`
        );
    } else if (snap?.status?.error) {
        parts.push(snap.status.error);
    }
    if (queue?.status) {
        let q = `Queue: ${queue.status}`;
        if (queue.index) q += ` ${queue.index}/${queue.total || '?'}`;
        if (queue.status === 'awaiting_captcha') {
            q += queue.captchaKind === 'login'
                ? ' — log in, then Resume'
                : ' — solve CAPTCHA, then Resume';
        }
        if (queue.lastStatusEvent) q += ` · ${queue.lastStatusEvent}`;
        parts.push(q);
    }
    summary.textContent = parts.join(' · ') || 'Monitor ready';

    const queueActive = !!(
        queue?.running
        || /running|awaiting|form_wait|filling|answers/i.test(String(queue?.status || ''))
    );
    const workActive = !!(
        work?.phase
        && !/^(done|error|idle)$/i.test(String(work.phase))
        && (now - Number(work.updatedAt || work.startedAt || 0)) < 120000
    );

    if (workActive || _localWorkStart) {
        const label = work?.label || _localWorkLabel || work?.phase || 'Working…';
        if (phaseEl) phaseEl.textContent = label;
        const started = _localWorkStart || Number(work.startedAt || work.phaseStartedAt || now);
        const phaseStart = Number(work?.phaseStartedAt || started);
        const total = formatElapsed(now - started);
        const phaseMs = formatElapsed(now - phaseStart);
        if (elapsedEl) {
            elapsedEl.textContent = `Total ${total}`
                + (work?.phase ? ` · phase ${phaseMs}` : '')
                + (work?.provider ? ` · ${work.provider}` : '');
        }
    } else if (queueActive) {
        if (phaseEl) {
            phaseEl.textContent = queue.captcha
                ? 'Waiting — CAPTCHA / login'
                : (queue.lastStatusEvent || queue.status || 'Queue running');
        }
        const qStart = Number(queue.jobStartedAt || queue.startedAt || queue.updatedAt || 0);
        if (elapsedEl) {
            elapsedEl.textContent = qStart
                ? `Job ${formatElapsed(now - qStart)}`
                : 'Queue active';
        }
    } else {
        if (phaseEl && !_localWorkStart) phaseEl.textContent = 'Idle';
        if (elapsedEl && !_localWorkStart) elapsedEl.textContent = '';
    }

    if (logEl) {
        const lines = [];
        const log = Array.isArray(queue?.uiMessageLog) ? queue.uiMessageLog : [];
        for (const row of log.slice(-4).reverse()) {
            const t = row?.short || row?.message || row?.title || '';
            if (t) lines.push(t);
        }
        if (work?.error) lines.unshift(work.error);
        logEl.textContent = lines.join('\n');
    }

    list.innerHTML = '';
    if (!snap?.ready?.ok) {
        list.innerHTML = `<div class="small muted">${snap?.ready?.error || 'Queue unavailable'}</div>`;
    } else if (!readyItems.length) {
        list.innerHTML = '<div class="small muted">No ready applications for this profile.</div>';
    } else {
        for (const item of readyItems.slice(0, 8)) {
            const row = document.createElement('div');
            row.className = 'ready-item';
            row.innerHTML = `
              <div class="strong small">${item.company_name || 'Company'} — ${item.job_role || 'Role'}</div>
              <div class="muted small">${item.first_name || ''} ${item.last_name || ''}</div>
            `;
            const btn = document.createElement('button');
            btn.className = 'btn secondary';
            btn.textContent = item.open_url ? 'Open + fill' : 'No apply URL';
            btn.disabled = !item.open_url;
            btn.addEventListener('click', () => {
                chrome.runtime.sendMessage({ type: 'OPEN_READY', item }, (res) => {
                    if (!res?.ok) {
                        $('mainError').textContent = res?.error || 'Open failed';
                    } else {
                        $('mainOk').textContent = 'Opened — bidder full fill when form appears';
                        window.close();
                    }
                });
            });
            row.appendChild(btn);
            list.appendChild(row);
        }
    }

    return { active: queueActive || workActive };
}

async function refreshMonitor() {
    const summary = $('monitorSummary');
    if (summary && summary.textContent === 'Loading…') {
        /* keep Loading until first paint */
    }
    const snap = await sendMessage('GET_MONITOR_SNAPSHOT');
    if (!snap?.ok) {
        if (summary) summary.textContent = snap?.error || 'Monitor unavailable — reopen popup';
        return { active: false };
    }
    return renderMonitorSnapshot(snap);
}

function ensureMonitorPoll() {
    stopMonitorPoll();
    _monitorPoll = setInterval(async () => {
        const { active } = await refreshMonitor();
        if (!active && !_localWorkStart) stopMonitorPoll();
    }, 1000);
}

// Keep monitor fresh while popup is open.
ensureMonitorPoll();
setTimeout(() => {
    // After first few seconds, only poll when active (refresh still runs on open).
    stopMonitorPoll();
    refreshMonitor().then(({ active }) => {
        if (active) ensureMonitorPoll();
    });
}, 4000);

try {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.lumiWorkProgress || changes.bidderQueueState || changes.lastUiMessage) {
            refreshMonitor().then(({ active }) => {
                if (active || _localWorkStart) ensureMonitorPoll();
            });
        }
    });
} catch { /* ignore */ }

$('btnProcessQueue')?.addEventListener('click', () => {
    $('mainError').textContent = '';
    startWorkTick('Starting bidder queue…');
    ensureMonitorPoll();
    chrome.runtime.sendMessage({ type: 'PROCESS_READY_QUEUE' }, (res) => {
        const elapsed = _localWorkStart ? formatElapsed(Date.now() - _localWorkStart) : '';
        stopWorkTick();
        if (!res?.ok) {
            $('mainError').textContent = res?.error || 'Queue failed';
            $('mainOk').textContent = '';
        } else {
            $('mainOk').textContent = res.started
                ? `Queue started — watch Monitor times below${elapsed ? ` · ${elapsed}` : ''}`
                : `Queue done — processed ${res.result?.processed ?? 0}${elapsed ? ` · ${elapsed}` : ''}`;
            refreshMonitor().then(({ active }) => { if (active) ensureMonitorPoll(); });
        }
    });
});

$('btnBidderNext')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'BIDDER_NEXT' }, (res) => {
        $('mainOk').textContent = res?.ok ? 'Next — continuing queue' : (res?.error || 'Next failed');
    });
});

$('btnCaptchaResume')?.addEventListener('click', () => {
    $('mainError').textContent = '';
    chrome.runtime.sendMessage({ type: 'BIDDER_CAPTCHA_RESUME', force: true }, (res) => {
        if (!res?.ok) $('mainError').textContent = res?.error || 'Resume failed';
        else {
            $('mainOk').textContent = 'CAPTCHA resume signaled — queue continues';
            refreshMonitor();
        }
    });
});

$('btnBidderStop')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'BIDDER_STOP' }, (res) => {
        $('mainOk').textContent = res?.ok ? 'Queue stop requested' : (res?.error || 'Stop failed');
    });
});

$('btnSubmittedOk')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'SUBMITTED_OK' }, (res) => {
        if (!res?.ok) $('mainError').textContent = res?.error || 'Mark failed';
        else $('mainOk').textContent = 'Marked applied + tab closed';
    });
});

$('btnOpenCourses')?.addEventListener('click', async () => {
    const settings = await getSettings();
    const url = `${settings.frontendBaseUrl}/user/bid-courses`;
    chrome.tabs.create({ url });
});

function settingsPathForRole(role) {
    const r = String(role || 'user').toLowerCase();
    if (r === 'admin') return '/admin/bidder-settings';
    if (r === 'manager') return '/manager/bidder-settings';
    if (r === 'caller') return '/caller/settings';
    if (r === 'developer') return '/developer/settings';
    return '/user/bidder-settings';
}

$('btnOpenLumiSettings')?.addEventListener('click', async () => {
    const settings = await getSettings();
    const path = settingsPathForRole(settings.user?.role);
    const url = `${settings.frontendBaseUrl}${path}#lumi-bidder-settings`;
    chrome.tabs.create({ url });
});

$('btnLogin').addEventListener('click', async () => {
    $('loginError').textContent = '';
    const apiBaseUrl = normalizeBaseUrl($('apiBaseUrl').value);
    const frontendBaseUrl = normalizeBaseUrl($('frontendBaseUrl').value || 'http://127.0.0.1:5173');
    const username = $('username').value.trim();
    const password = $('password').value;
    // Persist URLs even if login fails — remote PCs must keep SERVER_IP, not localhost.
    await saveSettings({ apiBaseUrl, frontendBaseUrl });
    if (!username || !password) {
        $('loginError').textContent = 'Enter username and password (e.g. vincent / 123456)';
        return;
    }
    $('btnLogin').disabled = true;
    try {
        await login(username, password, apiBaseUrl);
        await saveSettings({ frontendBaseUrl, apiBaseUrl });
        $('password').value = '';
        await refresh();
    } catch (err) {
        $('loginError').textContent = err.message || 'Login failed';
        setPill('Login failed', 'warn');
    } finally {
        $('btnLogin').disabled = false;
    }
});

async function persistUrlsFromInputs() {
    const apiBaseUrl = normalizeBaseUrl($('apiBaseUrl')?.value);
    const frontendBaseUrl = normalizeBaseUrl($('frontendBaseUrl')?.value || 'http://127.0.0.1:5173');
    await saveSettings({ apiBaseUrl, frontendBaseUrl });
}

$('apiBaseUrl')?.addEventListener('change', () => { persistUrlsFromInputs().catch(() => {}); });
$('frontendBaseUrl')?.addEventListener('change', () => { persistUrlsFromInputs().catch(() => {}); });
$('btnTestApi')?.addEventListener('click', async () => {
    $('loginError').textContent = '';
    const apiBaseUrl = normalizeBaseUrl($('apiBaseUrl').value);
    await saveSettings({ apiBaseUrl });
    try {
        const res = await fetch(`${apiBaseUrl}/health`, { method: 'GET' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json().catch(() => ({}));
        setPill('API OK', 'ok');
        $('loginError').textContent = '';
        $('mainOk') && ($('mainOk').textContent = '');
        const hint = document.getElementById('apiTestOk');
        if (hint) hint.textContent = `API reachable (${data.status || 'ok'}) at ${apiBaseUrl}`;
        else $('loginError').textContent = `API reachable at ${apiBaseUrl}`;
        $('loginError').classList.remove('error');
        $('loginError').classList.add('ok');
        setTimeout(() => {
            $('loginError').classList.add('error');
            $('loginError').classList.remove('ok');
            if (($('loginError').textContent || '').includes('reachable')) $('loginError').textContent = '';
        }, 4000);
    } catch (err) {
        setPill('API offline', 'warn');
        $('loginError').textContent = `Cannot reach ${apiBaseUrl}/health — ${err.message || 'offline'}`;
    }
});

$('btnLogout').addEventListener('click', async () => {
    await saveSettings({
        token: null,
        user: null,
        selectedProfileId: null,
        selectedProfileName: null
    });
    await refresh();
});

$('autoSubmit').addEventListener('change', async (e) => {
    await saveSettings({ autoSubmit: !!e.target.checked });
    $('mainOk').textContent = e.target.checked
        ? 'Auto-Submit ON — use carefully'
        : 'Auto-Submit OFF — you click Submit';
});

$('btnSaveProfile').addEventListener('click', async () => {
    $('mainError').textContent = '';
    $('mainOk').textContent = '';
    const select = $('profileSelect');
    if (!select.value) {
        $('mainError').textContent = 'Select a profile';
        return;
    }
    await saveSettings({
        selectedProfileId: Number(select.value),
        selectedProfileName: select.options[select.selectedIndex]?.textContent || ''
    });
    $('mainOk').textContent = `Saved: ${select.options[select.selectedIndex]?.textContent}`;
});

async function ensureProfileSaved() {
    const settings = await getSettings();
    if (settings.selectedProfileId) return true;
    const select = $('profileSelect');
    if (!select.value) {
        $('mainError').textContent = 'Choose and save a bid profile first';
        return false;
    }
    await saveSettings({
        selectedProfileId: Number(select.value),
        selectedProfileName: select.options[select.selectedIndex]?.textContent || ''
    });
    return true;
}

$('btnGenerate').addEventListener('click', async () => {
    $('mainError').textContent = '';
    $('mainOk').textContent = '';
    if (!(await ensureProfileSaved())) return;
    $('btnGenerate').disabled = true;
    $('mainOk').textContent = 'Opening Generate page with JD…';
    setPill('Working…', 'warn');
    // Persist frontend URL if user changed it while logged in
    await saveSettings({
        frontendBaseUrl: normalizeBaseUrl($('frontendBaseUrl')?.value || (await getSettings()).frontendBaseUrl)
    });
    chrome.runtime.sendMessage({ type: 'RUN_BID_GENERATE', alsoFill: false }, async (response) => {
        $('btnGenerate').disabled = false;
        if (chrome.runtime.lastError) {
            $('mainError').textContent = chrome.runtime.lastError.message;
            setPill('Error', 'warn');
            return;
        }
        if (!response?.ok) {
            $('mainError').textContent = response?.error || 'Failed';
            $('mainOk').textContent = '';
            setPill('Failed', 'warn');
            renderLast((await getSettings()).lastResult);
            return;
        }
        $('mainOk').textContent = 'Generate page opened — watch “Generating…” in the app';
        setPill('Connected', 'ok');
        renderLast(response.result);
        await refreshMonitor();
    });
});

$('btnFill').addEventListener('click', async () => {
    $('mainError').textContent = '';
    $('mainOk').textContent = '';
    if (!(await ensureProfileSaved())) return;
    $('btnFill').disabled = true;
    startWorkTick('Autofill + Groq answers…');
    ensureMonitorPoll();
    chrome.runtime.sendMessage({ type: 'RUN_PROFILE_AUTOFILL' }, async (response) => {
        const elapsed = _localWorkStart ? formatElapsed(Date.now() - _localWorkStart) : '';
        stopWorkTick();
        $('btnFill').disabled = false;
        if (chrome.runtime.lastError) {
            $('mainError').textContent = chrome.runtime.lastError.message;
            $('mainOk').textContent = '';
            return;
        }
        if (!response?.ok) {
            $('mainError').textContent = response?.error || 'Autofill failed';
            $('mainOk').textContent = '';
            return;
        }
        $('mainOk').textContent =
            `Autofilled ${response.result?.filled || 0}`
            + (response.result?.answers ? ` · AI ${response.result.answers}` : '')
            + (response.result?.uploaded ? `, uploaded resume` : '')
            + (response.result?.questions && !response.result?.answers
                ? ` · ${response.result.questions} need Generate CV for AI`
                : '')
            + (elapsed ? ` · ${elapsed}` : '');
        if ((response.result?.filled || 0) + (response.result?.uploaded || 0) + (response.result?.answers || 0) === 0) {
            $('mainError').textContent =
                '0 fields filled — stay on the ATS apply tab, then click Autofill again.';
        }
        await refreshMonitor();
        await refreshCapturedQuestions();
    });
});

$('btnAnswerQs').addEventListener('click', async () => {
    $('mainError').textContent = '';
    $('mainOk').textContent = '';
    if (!(await ensureProfileSaved())) return;
    $('btnAnswerQs').disabled = true;
    startWorkTick('Groq answering questions…');
    ensureMonitorPoll();
    chrome.runtime.sendMessage({ type: 'RUN_ANSWER_QUESTIONS' }, async (response) => {
        const elapsed = _localWorkStart ? formatElapsed(Date.now() - _localWorkStart) : '';
        stopWorkTick();
        $('btnAnswerQs').disabled = false;
        if (chrome.runtime.lastError) {
            $('mainError').textContent = chrome.runtime.lastError.message;
            $('mainOk').textContent = '';
            return;
        }
        if (!response?.ok) {
            $('mainError').textContent = response?.error || 'Answer questions failed';
            $('mainOk').textContent = '';
            return;
        }
        $('mainOk').textContent =
            `AI answers filled: ${response.result?.answers || 0}`
            + (elapsed ? ` · ${elapsed}` : '');
        await refreshMonitor();
    });
});

$('btnMarkApplied').addEventListener('click', async () => {
    $('mainError').textContent = '';
    $('mainOk').textContent = '';
    const settings = await getSettings();
    const id = settings.lastResult?.applicationId;
    if (!id) {
        $('mainError').textContent = 'No application on last result';
        return;
    }
    chrome.runtime.sendMessage({ type: 'MARK_APPLIED', applicationId: id }, async (res) => {
        if (!res?.ok) {
            $('mainError').textContent = res?.error || 'Mark applied failed';
            return;
        }
        $('mainOk').textContent = `Marked applied (#${id})`;
        await refreshMonitor();
    });
});

$('btnRefreshReady').addEventListener('click', () => {
    refreshMonitor().then(({ active }) => { if (active) ensureMonitorPoll(); });
});

async function refreshCapturedQuestions() {
    const list = $('capturedList');
    const meta = $('capturedMeta');
    if (!list || !meta) return;
    list.innerHTML = '';
    meta.textContent = 'Loading…';
    chrome.runtime.sendMessage({ type: 'GET_CAPTURED_QUESTIONS' }, (res) => {
        if (chrome.runtime.lastError || !res?.ok) {
            meta.textContent = res?.error || chrome.runtime.lastError?.message || 'Could not load';
            return;
        }
        const pack = res.pack;
        if (!pack?.items?.length) {
            meta.textContent = 'None yet — run Autofill / Process queue on an apply form.';
            return;
        }
        const when = pack.capturedAt ? new Date(pack.capturedAt).toLocaleString() : '';
        meta.textContent = [
            pack.company || pack.jobRole ? `${pack.company || ''} · ${pack.jobRole || ''}`.replace(/^ · | · $/g, '') : 'Latest capture',
            pack.applicationId ? `#${pack.applicationId}` : '',
            when
        ].filter(Boolean).join(' · ');

        pack.items.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'captured-item';
            const q = document.createElement('div');
            q.className = 'captured-q';
            q.textContent = item.label || item.id || `Question ${index + 1}`;
            const ta = document.createElement('textarea');
            ta.value = item.answer || '';
            ta.placeholder = 'Answer…';
            const actions = document.createElement('div');
            actions.className = 'captured-actions';
            const saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.className = 'btn secondary';
            saveBtn.textContent = 'Save & learn';
            saveBtn.addEventListener('click', () => {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving…';
                chrome.runtime.sendMessage({
                    type: 'SAVE_CAPTURED_ANSWER',
                    applicationId: pack.applicationId,
                    index,
                    answer: ta.value
                }, (saveRes) => {
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save & learn';
                    if (chrome.runtime.lastError || !saveRes?.ok) {
                        $('mainError').textContent =
                            saveRes?.error || chrome.runtime.lastError?.message || 'Save failed';
                        return;
                    }
                    $('mainOk').textContent = 'Saved — Lumi will reuse this answer next time.';
                    $('mainError').textContent = '';
                });
            });
            actions.appendChild(saveBtn);
            row.appendChild(q);
            row.appendChild(ta);
            row.appendChild(actions);
            list.appendChild(row);
        });
    });
}

$('btnRefreshCaptured')?.addEventListener('click', () => refreshCapturedQuestions());

$('btnAiFillCaptured')?.addEventListener('click', async () => {
    $('mainError').textContent = '';
    startWorkTick('Groq filling empties…');
    ensureMonitorPoll();
    $('btnAiFillCaptured').disabled = true;
    chrome.runtime.sendMessage({ type: 'RUN_ANSWER_QUESTIONS' }, async (response) => {
        const elapsed = _localWorkStart ? formatElapsed(Date.now() - _localWorkStart) : '';
        stopWorkTick();
        $('btnAiFillCaptured').disabled = false;
        if (chrome.runtime.lastError) {
            $('mainError').textContent = chrome.runtime.lastError.message;
            $('mainOk').textContent = '';
            return;
        }
        if (!response?.ok) {
            $('mainError').textContent = response?.error || 'AI fill failed — Generate CV first';
            $('mainOk').textContent = '';
            return;
        }
        $('mainOk').textContent =
            `AI filled ${response.result?.answers || 0} answer(s)`
            + (response.result?.filled ? ` · total fields ${response.result.filled}` : '')
            + (elapsed ? ` · ${elapsed}` : '');
        await refreshCapturedQuestions();
        await refreshMonitor();
    });
});

$('btnConnectJobLinks')?.addEventListener('click', () => {
    $('mainError').textContent = '';
    $('mainOk').textContent = 'Connecting Job Links tab…';
    chrome.runtime.sendMessage({ type: 'CONNECT_JOB_LINKS' }, (res) => {
        const err = chrome.runtime.lastError;
        if (err) {
            $('mainOk').textContent = '';
            $('mainError').textContent = err.message || 'Connect failed';
            return;
        }
        if (!res?.ok) {
            $('mainOk').textContent = '';
            $('mainError').textContent = res?.error || 'No Job Links tab found — open http://127.0.0.1:5173/admin/job-links first';
            return;
        }
        $('mainOk').textContent =
            `Connected ${res.injected || 0} tab(s) · Lumi v${res.version || '?'}. Open Lumi → Check Lumi.`;
    });
});

refresh();
