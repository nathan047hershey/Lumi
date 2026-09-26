/**
 * MAIN-world page filler — runs in the page's JS realm so React controlled
 * inputs accept native setter + InputEvent(insertText) + focus/blur.
 * Injected via chrome.scripting.executeScript({ world: 'MAIN' }).
 */

/** Record the apply POST itself. Page wording is not the proof. */
(function installLumiSubmitWatch() {
    if (window.__lumiSubmitWatch && window.__lumiSubmitWatch.version >= 1) return;
    const watch = {
        version: 1,
        posts: [],
        greenhouseConfirmation: false
    };
    window.__lumiSubmitWatch = watch;

    function isApplyUrl(url) {
        return /greenhouse|job_app|lever\.co|ashbyhq|myworkday|smartrecruiters|icims|workable|\/applications?\b/i.test(String(url || ''));
    }

    function remember(entry) {
        watch.posts.push(entry);
        if (watch.posts.length > 8) watch.posts.shift();
    }

    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
        window.fetch = function lumiWatchedFetch(input, init) {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            const method = (init && init.method) || (input && input.method) || 'GET';
            const pending = origFetch.apply(this, arguments);
            if (!/post|put/i.test(String(method)) || !isApplyUrl(url)) return pending;
            return pending.then((res) => {
                try {
                    res.clone().text().then((body) => {
                        remember({
                            url: String(url),
                            status: res.status,
                            body: String(body || '').slice(0, 1500),
                            at: Date.now()
                        });
                    }).catch(() => {});
                } catch (_) { /* ignore */ }
                return res;
            });
        };
    }

    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function lumiWatchedOpen(method, url) {
        this.__lumiMethod = method;
        this.__lumiUrl = url;
        return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function lumiWatchedSend() {
        const xhr = this;
        if (/post|put/i.test(String(xhr.__lumiMethod || '')) && isApplyUrl(xhr.__lumiUrl)) {
            xhr.addEventListener('load', () => {
                remember({
                    url: String(xhr.__lumiUrl || ''),
                    status: xhr.status,
                    body: String(xhr.responseText || '').slice(0, 1500),
                    at: Date.now()
                });
            });
        }
        return origSend.apply(this, arguments);
    };

    window.addEventListener('message', (ev) => {
        if (ev?.data === 'greenhouse.confirmation') watch.greenhouseConfirmation = true;
    });
})();

(function lumiPageWorldFill() {
    if (window.__lumiPageFill && window.__lumiPageFill.version >= 2) return;

    function nativeValueSetter(el, value) {
        const str = value == null ? '' : String(value);
        const tag = (el.tagName || '').toUpperCase();
        let proto = window.HTMLInputElement.prototype;
        if (tag === 'TEXTAREA') proto = window.HTMLTextAreaElement.prototype;
        else if (tag === 'SELECT') proto = window.HTMLSelectElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        try {
            const tracker = el._valueTracker;
            if (tracker && typeof tracker.setValue === 'function') {
                tracker.setValue(str === '' ? ' ' : '');
            }
        } catch (_) { /* ignore */ }
        if (desc?.set) desc.set.call(el, str);
        else el.value = str;
    }

    function fireReactOnChange(el) {
        try {
            const key = Object.keys(el).find(
                (k) => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$')
            );
            if (key && key.startsWith('__reactProps$')) {
                const props = el[key];
                if (typeof props?.onChange === 'function') {
                    props.onChange({
                        target: el,
                        currentTarget: el,
                        type: 'change',
                        bubbles: true
                    });
                }
            }
        } catch (_) { /* ignore */ }
    }

    function setTextValue(el, value, { blur = true } = {}) {
        if (!el) return { ok: false, error: 'no_el' };
        const str = value == null ? '' : String(value);
        try {
            el.focus();
        } catch (_) { /* ignore */ }
        nativeValueSetter(el, str);
        try {
            el.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: str
            }));
            el.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertFromPaste',
                data: str
            }));
        } catch (_) {
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        try {
            el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        } catch (_) { /* ignore */ }
        el.dispatchEvent(new Event('change', { bubbles: true }));
        fireReactOnChange(el);
        if (blur) {
            try {
                el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
                el.blur();
            } catch (_) { /* ignore */ }
        }
        return { ok: true, value: el.value };
    }

    function setSelectValue(el, value) {
        if (!el || (el.tagName || '').toUpperCase() !== 'SELECT') {
            return { ok: false, error: 'not_select' };
        }
        const want = String(value ?? '').trim();
        const opts = [...el.options];
        let match = opts.find((o) => String(o.value) === want)
            || opts.find((o) => String(o.textContent || '').trim() === want)
            || opts.find((o) => String(o.textContent || '').trim().toLowerCase() === want.toLowerCase());
        if (!match && want) {
            match = opts.find((o) => {
                const t = String(o.textContent || '').trim().toLowerCase();
                return t.includes(want.toLowerCase()) || want.toLowerCase().includes(t);
            });
        }
        if (!match) return { ok: false, error: 'no_option' };
        try {
            el.focus();
        } catch (_) { /* ignore */ }
        const desc = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
        try {
            const tracker = el._valueTracker;
            if (tracker && typeof tracker.setValue === 'function') {
                tracker.setValue(String(match.value) === '' ? ' ' : '');
            }
        } catch (_) { /* ignore */ }
        if (match.value !== '' && desc?.set) {
            desc.set.call(el, match.value);
        } else {
            el.selectedIndex = match.index;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        fireReactOnChange(el);
        try {
            el.blur();
        } catch (_) { /* ignore */ }
        const selected = el.options[el.selectedIndex];
        return {
            ok: true,
            value: el.value,
            text: selected ? String(selected.textContent || '').trim() : ''
        };
    }

    function setChecked(el, wantOn) {
        if (!el) return { ok: false, error: 'no_el' };
        const on = !!wantOn;
        if (!!el.checked === on) return { ok: true, checked: el.checked, already: true };
        try {
            el.focus();
        } catch (_) { /* ignore */ }
        try {
            const label = el.closest('label')
                || (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null);
            if (label) label.click();
            else el.click();
        } catch (_) {
            el.checked = on;
        }
        if (!!el.checked !== on) {
            el.checked = on;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            fireReactOnChange(el);
        }
        return { ok: !!el.checked === on, checked: !!el.checked };
    }

    window.__lumiPageFill = {
        version: 2,
        setTextValue,
        setSelectValue,
        setChecked,
        nativeValueSetter
    };

    window.addEventListener('message', (ev) => {
        const data = ev?.data;
        if (!data || data.source !== 'lumi-isolated' || data.type !== 'LUMI_PAGE_FILL') return;
        const { op, value, wantOn, requestId } = data;
        let result = { ok: false, error: 'unknown_op' };
        try {
            const el = data.selector
                ? document.querySelector(data.selector)
                : null;
            if (!el && op !== 'ping') {
                result = { ok: false, error: 'el_not_found' };
            } else if (op === 'ping') {
                result = { ok: true, version: 2 };
            } else if (op === 'text') {
                result = setTextValue(el, value);
            } else if (op === 'select') {
                result = setSelectValue(el, value);
            } else if (op === 'check') {
                result = setChecked(el, wantOn);
            }
        } catch (err) {
            result = { ok: false, error: err?.message || String(err) };
        }
        window.postMessage({
            source: 'lumi-page-fill',
            type: 'LUMI_PAGE_FILL_RESULT',
            requestId,
            result
        }, '*');
    });
})();
