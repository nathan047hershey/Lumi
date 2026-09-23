/**
 * MAIN-world page filler — runs in the page's JS realm so React controlled
 * inputs accept native setter + InputEvent(insertText) + focus/blur.
 * Injected via chrome.scripting.executeScript({ world: 'MAIN' }).
 */
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
