(() => {
    if (window.__lumiMainPickInstalled) return;
    window.__lumiMainPickInstalled = true;

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const click = (el) => {
        for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
            el.dispatchEvent(new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window,
                buttons: 1
            }));
        }
        try { el.click(); } catch (_) { /* ignore */ }
    };

    const score = (text, wanted, kind) => {
        const tl = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const w = String(wanted || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (!tl || !w) return 0;
        if (kind === 'how_heard' || /\blinkedin\b/.test(w)) {
            if (/^other\b|wasn't familiar|not familiar|don't know|none of/.test(tl)) return -1;
            if (/\blinkedin\b/.test(tl)) return 99;
        }
        if (kind === 'data_protection' || /\b(agree|acknowledge|consent|accept)\b/.test(w)) {
            if (/do not|don't|decline|disagree/.test(tl)) return -1;
            if (/\b(acknowledge|i agree|consent|accept)\b/.test(tl)) return 96;
            if (/^yes\b/.test(tl)) return 80;
        }
        if (kind === 'veteran_status' || /\bprotected veteran\b/.test(w)) {
            if (/not a protected veteran|i am not a veteran|not a veteran/.test(tl)) return 98;
            if (/don't wish|do not wish|prefer not/.test(tl)) return -1;
            return 0;
        }
        if (kind === 'disability_status' || /\bdisabilit/.test(w)) {
            if (/do not have a disability|don't have a disability|no, i do not/.test(tl)) return 98;
            if (/^yes\b/.test(tl)) return -1;
            if (/^no\b/.test(tl)) return 80;
        }
        if (kind === 'hispanic_latino') {
            if (/not hispanic|not latino|^no\b/.test(tl)) return 96;
            if (/^yes\b/.test(tl)) return -1;
        }
        if (kind === 'race_ethnicity' || /african american|\bblack\b/.test(w)) {
            if (/black or african|black\s*\/\s*of african|african descent|^black$|african american/.test(tl)) return 99;
        }
        if (kind === 'gender') {
            if (/^(male|man)$/.test(w)) {
                if (tl === 'man' || tl === 'male') return 98;
                if (tl === 'cis-man') return 90;
            }
            if (/^(female|woman)$/.test(w)) {
                if (tl === 'woman' || tl === 'female') return 98;
                if (tl === 'cis-woman') return 90;
            }
        }
        if (/^(yes|no)$/.test(w)) {
            if (tl === w) return 100;
            if (tl.startsWith(`${w} `) || tl.startsWith(`${w},`)) return 90;
        }
        if (tl === w) return 100;
        if (w.length > 8 && tl.length > 8 && (tl.includes(w) || w.includes(tl))) return 85;
        return 0;
    };

    async function pick(inputId, token, wanted, kind) {
        const input = (inputId && document.getElementById(inputId))
            || document.querySelector(`[data-lumi-pick="${token}"]`);
        if (!input) return { ok: false, chosen: '' };
        const visible = () => {
            const listId = input.getAttribute('aria-controls');
            const menu = listId ? document.getElementById(listId) : null;
            if (!menu) return [];
            return [...menu.querySelectorAll('[role="option"], .select__option')].filter((el) => {
                const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
                if (!text || text.length > 220) return false;
                const rect = el.getBoundingClientRect();
                return rect.width > 8 && rect.height > 8;
            }).slice(0, 30);
        };
        const choose = () => {
            let best = null;
            let bestScore = 0;
            for (const option of visible()) {
                const text = (option.textContent || '').replace(/\s+/g, ' ').trim();
                const next = score(text, wanted, kind);
                if (next > bestScore) {
                    bestScore = next;
                    best = option;
                }
            }
            if (!best || bestScore < 70) return '';
            click(best);
            return (best.textContent || '').replace(/\s+/g, ' ').trim();
        };
        try { input.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (_) { /* ignore */ }
        click(input);
        try { input.focus(); } catch (_) { /* ignore */ }
        await sleep(220);
        if (!visible().length) {
            click(input);
            await sleep(280);
        }
        const chosen = choose();
        await sleep(80);
        const shown = String(input.closest('.select__control')?.innerText || '').replace(/\s+/g, ' ').trim();
        const placeholderOnly = !shown || /^select(\.\.\.|…)?$/i.test(shown);
        try {
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        } catch (_) { /* ignore */ }
        return { ok: !!(chosen && !placeholderOnly), chosen: shown || chosen || '' };
    }

    window.addEventListener('message', (ev) => {
        const data = ev.data;
        if (ev.source !== window || !data || data.source !== 'lumi-main-pick') return;
        pick(data.inputId || '', data.token || '', data.wanted || '', data.kind || '').then((result) => {
            window.postMessage({
                source: 'lumi-main-pick-done',
                token: data.token || '',
                result
            }, '*');
        }).catch(() => {
            window.postMessage({
                source: 'lumi-main-pick-done',
                token: data.token || '',
                result: { ok: false, chosen: '' }
            }, '*');
        });
    });
})();
