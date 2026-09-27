(() => {
    if (window.__lumiMainPickInstalled === 3) return;
    const pickAlreadyInstalled = !!window.__lumiMainPickInstalled;
    window.__lumiMainPickInstalled = 3;

    if (!window.__lumiMainCommitInstalled) {
        window.__lumiMainCommitInstalled = true;
        const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const clickEl = (el) => {
            if (!el) return;
            for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
                el.dispatchEvent(new MouseEvent(type, {
                    bubbles: true, cancelable: true, view: window, buttons: 1
                }));
            }
            try { el.click(); } catch (_) { /* ignore */ }
        };
        const writeText = (el, value) => {
            const str = value == null ? '' : String(value);
            try { el.focus(); } catch (_) { /* ignore */ }
            {
                const proto = el.tagName === 'TEXTAREA'
                    ? window.HTMLTextAreaElement.prototype
                    : window.HTMLInputElement.prototype;
                const desc = Object.getOwnPropertyDescriptor(proto, 'value');
                try {
                    const tracker = el._valueTracker;
                    if (tracker && typeof tracker.setValue === 'function') {
                        tracker.setValue(str === '' ? ' ' : '');
                    }
                } catch (_) { /* ignore */ }
                if (desc && desc.set) desc.set.call(el, str);
                else el.value = str;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return String(el.value || '').trim();
        };
        const optionLabel = (opt) => String(opt?.label ?? opt?.name ?? opt?.value ?? '')
            .replace(/\s+/g, ' ').trim();
        const flatten = (list) => (list || []).flatMap((opt) => (
            opt?.options ? flatten(opt.options) : [opt]
        ));
        const fiberSelect = (el) => {
            const starts = [el.closest?.('.select__control'), el, el.parentElement].filter(Boolean);
            for (const start of starts) {
                const key = Object.keys(start).find((k) => (
                    k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
                ));
                let fiber = key ? start[key] : null;
                for (let depth = 0; fiber && depth < 40; depth += 1) {
                    const props = fiber.memoizedProps || {};
                    const selectProps = props.selectProps || props;
                    const options = props.options || selectProps.options || [];
                    const selectOption = props.selectOption || selectProps.selectOption || null;
                    const onChange = selectProps.onChange || props.onChange || null;
                    const setValue = props.setValue || null;
                    if ((selectOption || onChange || setValue) && (options.length || selectOption)) {
                        return { options, selectOption, onChange, setValue };
                    }
                    fiber = fiber.return;
                }
            }
            return null;
        };
        const shownValue = (el) => {
            const root = el.closest?.('.select__control') || el.parentElement;
            const single = root?.querySelector?.('.select__single-value, [class*="single-value"]');
            const chips = [...(root?.querySelectorAll?.('.select__multi-value__label, [class*="multi-value__label"]') || [])]
                .map((n) => (n.innerText || '').replace(/\s+/g, ' ').trim())
                .filter(Boolean);
            if (chips.length) return chips.join(', ');
            const text = single ? String(single.textContent || '').replace(/\s+/g, ' ').trim() : '';
            if (text && !/^select(\.\.\.|…)?$/i.test(text)) return text;
            return String(el.value || '').trim();
        };
        const pickOption = (options, value, kind) => {
            const want = String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
            const rows = flatten(options).map((opt) => ({ opt, label: optionLabel(opt) })).filter((row) => row.label);
            if (kind === 'how_heard') {
                return rows.find((row) => /linkedin/i.test(row.label) && !/^other\b/i.test(row.label)) || null;
            }
            const exact = rows.find((row) => row.label.toLowerCase() === want);
            if (exact) return exact;
            if (kind === 'state') {
                return rows.find((row) => /^other\b|not listed|none of the above|none of these/i.test(row.label)) || null;
            }
            if (want.length >= 3) {
                return rows.find((row) => {
                    const tl = row.label.toLowerCase();
                    if (/^other\b/i.test(tl) && kind !== 'state') return false;
                    return tl.includes(want) || want.includes(tl);
                }) || null;
            }
            return null;
        };
        const commitChoice = async (el, value, kind) => {
            const found = fiberSelect(el);
            const row = found ? pickOption(found.options, value, kind) : null;
            if (row) {
                try {
                    if (typeof found.selectOption === 'function') found.selectOption(row.opt);
                    else if (typeof found.onChange === 'function') {
                        found.onChange(row.opt, { action: 'select-option', option: row.opt });
                    } else if (typeof found.setValue === 'function') {
                        found.setValue(row.opt, 'select-option');
                    }
                } catch (_) { /* fall through to a click */ }
                await sleepMs(80);
                const shown = shownValue(el);
                if (shown && !/^select(\.\.\.|…)?$/i.test(shown)) return shown;
            }
            clickEl(el);
            await sleepMs(220);
            const menuId = el.getAttribute?.('aria-controls');
            const menu = menuId ? document.getElementById(menuId) : document.querySelector('[role="listbox"], .select__menu');
            const nodes = [...(menu?.querySelectorAll?.('[role="option"], .select__option') || [])];
            const hit = nodes.find((node) => {
                const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
                return pickOption([{ label: text }], value, kind);
            });
            if (hit) {
                clickEl(hit);
                await sleepMs(80);
            }
            return shownValue(el);
        };
        window.addEventListener('message', (ev) => {
            const data = ev.data;
            if (ev.source !== window || !data || data.source !== 'lumi-main-commit') return;
            const token = String(data.token || '');
            if (!/^[a-z0-9]+$/i.test(token)) return;
            const el = document.querySelector(`[data-lumi-commit="${token}"]`);
            const finish = (result) => {
                window.postMessage({
                    source: 'lumi-main-commit-done',
                    token: data.token || '',
                    result
                }, '*');
            };
            if (!el) {
                finish({ ok: false, chosen: '' });
                return;
            }
            const run = async () => {
                if (data.mode === 'choice') {
                    const chosen = await commitChoice(el, data.value, data.kind || '');
                    const ok = !!chosen && !/^select(\.\.\.|…)?$/i.test(chosen);
                    return { ok, chosen: chosen || '' };
                }
                const chosen = writeText(el, data.value);
                const want = String(data.value || '').trim();
                return { ok: !!chosen && (!want || chosen.toLowerCase().includes(want.slice(0, 12).toLowerCase())), chosen };
            };
            run().then(finish).catch(() => finish({ ok: false, chosen: '' }));
        });
    }
    if (pickAlreadyInstalled) return;

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
        if (kind === 'state') {
            if (/^other\b|somewhere else|not listed|none of the above|none of these|do not reside|not in (?:the )?list/.test(tl)) {
                return 0;
            }
            if (tl === w) return 100;
            return 0;
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
            if (!best || bestScore < 70) {
                if (kind === 'state') {
                    const other = visible().find((option) => (
                        /^other\b|somewhere else|not listed|none of the above|none of these|do not reside|not in (?:the )?list/i
                            .test((option.textContent || '').replace(/\s+/g, ' ').trim())
                    ));
                    if (other) {
                        click(other);
                        return (other.textContent || '').replace(/\s+/g, ' ').trim();
                    }
                }
                return '';
            }
            click(best);
            return (best.textContent || '').replace(/\s+/g, ' ').trim();
        };
        const howHeard = kind === 'how_heard' || /\blinkedin\b/.test(String(wanted || '').toLowerCase());
        const controlRoot = () => input.closest('.select__control') || input.parentElement;
        const setNative = (el, value) => {
            const proto = el.tagName === 'TEXTAREA'
                ? window.HTMLTextAreaElement.prototype
                : window.HTMLInputElement.prototype;
            const desc = Object.getOwnPropertyDescriptor(proto, 'value');
            try {
                const tracker = el._valueTracker;
                if (tracker && typeof tracker.setValue === 'function') tracker.setValue('');
            } catch (_) { /* ignore */ }
            if (desc && desc.set) desc.set.call(el, value);
            else el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const dropExtraChips = () => {
            if (!howHeard) return;
            const root = controlRoot();
            const removes = [...(root?.querySelectorAll?.(
                '.select__multi-value__remove, [class*="multi-value__remove"]'
            ) || [])];
            for (const btn of removes) {
                const chip = (btn.parentElement?.innerText || '').replace(/\s+/g, ' ').trim();
                if (/linkedin/i.test(chip)) continue;
                click(btn);
            }
        };
        const linkedInOnly = () => {
            const root = controlRoot();
            const chips = [...(root?.querySelectorAll?.(
                '.select__multi-value__label, [class*="multi-value__label"]'
            ) || [])]
                .map((el) => (el.innerText || '').replace(/\s+/g, ' ').trim())
                .filter(Boolean);
            if (!chips.length || chips.some((chip) => !/linkedin/i.test(chip))) return '';
            return chips.join(', ');
        };
        const clearOtherDetails = () => {
            if (!howHeard) return;
            for (const el of document.querySelectorAll('textarea, input[type="text"]')) {
                let text = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('placeholder') || ''}`;
                if (el.id) {
                    try {
                        const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
                        if (lab) text += ` ${lab.innerText || ''}`;
                    } catch (_) { /* ignore */ }
                }
                const wrap = el.closest('.field, .application-question, [class*="question"]');
                if (wrap) text += ` ${(wrap.innerText || '').slice(0, 240)}`;
                if (!/\bif you selected\b/i.test(text) || !/\bother\b/i.test(text)) continue;
                if (String(el.value || '').trim()) setNative(el, '');
            }
        };
        dropExtraChips();
        await sleep(40);
        const kept = linkedInOnly();
        if (kept) {
            clearOtherDetails();
            return { ok: true, chosen: kept };
        }
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
        dropExtraChips();
        await sleep(40);
        clearOtherDetails();
        const only = linkedInOnly();
        const shown = only || String(input.closest('.select__control')?.innerText || '').replace(/\s+/g, ' ').trim();
        const placeholderOnly = !shown || /^select(\.\.\.|…)?$/i.test(shown);
        try {
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        } catch (_) { /* ignore */ }
        return { ok: !!(only || (chosen && !placeholderOnly)), chosen: shown || chosen || '' };
    }

    const setInputValue = (el, value) => {
        const proto = el.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        try {
            const tracker = el._valueTracker;
            if (tracker && typeof tracker.setValue === 'function') tracker.setValue('');
        } catch (_) { /* ignore */ }
        if (desc && desc.set) desc.set.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const questionNear = (el) => {
        const bits = [];
        if (el.id) {
            try {
                const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
                if (lab) bits.push(lab.innerText || '');
            } catch (_) { /* ignore */ }
        }
        bits.push(el.getAttribute('aria-label') || '');
        let node = el.closest('.select__control') || el;
        for (let depth = 0; depth < 6 && node; depth += 1) {
            let prev = node.previousElementSibling;
            for (let i = 0; i < 4 && prev; i += 1, prev = prev.previousElementSibling) {
                const t = String(prev.innerText || prev.textContent || '').replace(/\s+/g, ' ').trim();
                if (t && t.length < 220) bits.push(t);
            }
            node = node.parentElement;
            if (!node || /^(FORM|BODY|HTML)$/i.test(node.tagName)) break;
        }
        return bits.join(' ').replace(/\s+/g, ' ').trim();
    };

    const repairKnownFields = async (payload) => {
        const cityLine = String(payload.cityLine || '').trim();
        const cityName = String(payload.cityName || '').trim();
        const linkedin = String(payload.linkedin || '').trim();
        const zip = String(payload.zip || '').trim();
        const employer = String(payload.employer || '').trim();
        const resumeName = String(payload.resumeName || '').trim().toLowerCase();

        const inputs = [...document.querySelectorAll('input, textarea')];
        for (const el of inputs) {
            const type = String(el.type || '').toLowerCase();
            if (['hidden', 'file', 'checkbox', 'radio', 'submit', 'button'].includes(type)) continue;
            if (el.closest('.phone-input__country, .iti__country-container')) continue;
            let q = '';
            if (el.id) {
                try {
                    const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
                    if (lab) q = String(lab.innerText || '').replace(/\s+/g, ' ').trim();
                } catch (_) { /* ignore */ }
            }
            if (!q) q = String(el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
            if (!q) {
                const prev = el.previousElementSibling || el.parentElement?.previousElementSibling;
                const nested = prev?.querySelectorAll?.('input, textarea, select, [role="combobox"]')?.length || 0;
                if (prev && !nested) q = String(prev.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 180);
            }
            if (!q) continue;
            const shown = String(el.value || '').trim();
            if (/\bif you selected\b/i.test(q) && /\bother\b/i.test(q)) {
                if (shown) setInputValue(el, '');
                continue;
            }
            if (/location\s*\(?\s*city|\bcity\b/i.test(q) && !/zip|postal|employer|linkedin/i.test(q)) {
                if (cityLine && (!shown || /^(yes|no)$/i.test(shown) || (cityName && !shown.toLowerCase().includes(cityName.toLowerCase())))) {
                    setInputValue(el, cityLine);
                }
            } else if (/\blinkedin\b/i.test(q) && !/learned|hear about|how did you|where have you/i.test(q)) {
                if (linkedin && !shown) setInputValue(el, linkedin);
            } else if (/\b(zip\s*code|postal\s*code|postcode)\b/i.test(q)) {
                if (zip && (!shown || /^(yes|no|n\/a)$/i.test(shown))) setInputValue(el, zip);
            } else if (/\b(most recent employer|current employer|current company)\b/i.test(q)) {
                if (employer && !shown) setInputValue(el, employer);
            }
        }

        if (cityName) {
            const needle = cityName.toLowerCase();
            const hit = [...document.querySelectorAll('[role="option"], .select__option, .pac-item')]
                .find((n) => {
                    const t = String(n.textContent || '').replace(/\s+/g, ' ').trim();
                    if (!t || /^(yes|no)\b/i.test(t)) return false;
                    if (!t.toLowerCase().includes(needle)) return false;
                    return n.getBoundingClientRect().height > 4;
                });
            if (hit) click(hit);
        }

        const controls = [...document.querySelectorAll('.select__control, [class*="select__control"]')];
        for (const root of controls) {
            const q = questionNear(root);
            if (!/learned about|hear about|how did you|where have you learned|where did you/i.test(q)) continue;
            const removes = [...root.querySelectorAll('.select__multi-value__remove, [class*="multi-value__remove"]')];
            for (const btn of removes) {
                const chip = String(btn.parentElement?.innerText || '').replace(/\s+/g, ' ').trim();
                if (/linkedin/i.test(chip)) continue;
                click(btn);
                await sleep(40);
            }
        }

        const fileNameNear = (input) => {
            const host = input.closest('.field, .attach, [class*="upload"], [class*="file"], label') || input.parentElement;
            const m = String(host?.innerText || '').match(/[A-Za-z0-9_.-]+\.(?:docx|pdf|doc)\b/i);
            return m ? m[0].toLowerCase() : '';
        };
        const fileInputs = [...document.querySelectorAll('input[type="file"]')];
        const resumeShown = fileInputs
            .filter((input) => {
                const q = `${questionNear(input)} ${input.id || ''} ${input.name || ''}`;
                return /\b(resume|cv)\b/i.test(q) && !/cover\s*letter/i.test(q);
            })
            .map(fileNameNear)
            .find(Boolean) || resumeName;
        if (resumeShown) {
            for (const input of fileInputs) {
                const q = `${questionNear(input)} ${input.id || ''} ${input.name || ''}`;
                if (!/cover\s*letter/i.test(q)) continue;
                if (fileNameNear(input) !== resumeShown) continue;
                const host = input.closest('.field, .attach, [class*="upload"], [class*="file"]') || input.parentElement;
                const x = [...(host?.querySelectorAll('button, a, span') || [])].find((el) => {
                    const t = String(el.textContent || '').trim();
                    return t === '×' || t === 'x' || t === 'X';
                });
                if (x) click(x);
            }
        }
    };

    window.addEventListener('message', (ev) => {
        const data = ev.data;
        if (ev.source !== window || !data || data.source !== 'lumi-main-repair') return;
        repairKnownFields(data.payload || {}).then(() => {
            window.postMessage({ source: 'lumi-main-repair-done', token: data.token || '' }, '*');
        }).catch(() => {
            window.postMessage({ source: 'lumi-main-repair-done', token: data.token || '' }, '*');
        });
    });

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
