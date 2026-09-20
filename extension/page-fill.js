/* Injected into the apply page (isolated world). Kept in sync with lib/fill-engine.ts. */
(() => {
  const norm = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  function setNative(el, value) {
    el.focus();
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function hayOf(el) {
    const bits = [el.getAttribute("name"), el.getAttribute("id"), el.getAttribute("placeholder"), el.getAttribute("aria-label"), el.getAttribute("autocomplete")];
    const id = el.getAttribute("id");
    const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : el.closest("label");
    if (label) bits.push(label.textContent);
    const wrap = el.closest("div, li, fieldset");
    const heading = wrap && wrap.querySelector("label, legend, [class*='label']");
    if (heading && heading !== label) bits.push(heading.textContent);
    return norm(bits.filter(Boolean).join(" "));
  }

  function fillDom(fields) {
    const used = new Set();
    const missing = [];
    let filled = 0;
    const controls = [...document.querySelectorAll("input, textarea, select")].filter((el) => {
      const type = (el.getAttribute("type") || "").toLowerCase();
      return !["hidden", "submit", "button", "file", "image"].includes(type);
    });
    for (const field of fields || []) {
      let match = null;
      for (const selector of field.selectors || []) {
        const found = document.querySelector(selector);
        if (found && !used.has(found)) {
          match = found;
          break;
        }
      }
      if (!match) {
        const keys = [field.label, ...(field.aliases || [])].map(norm).filter(Boolean);
        match = controls.find((el) => {
          if (used.has(el)) return false;
          const hay = hayOf(el);
          return keys.some((key) => hay === key || hay.includes(key));
        }) || null;
      }
      if (!match) {
        missing.push(field.label);
        continue;
      }
      used.add(match);
      if (match instanceof HTMLInputElement && match.type === "checkbox") {
        const yes = /^(yes|true|1)$/i.test(String(field.value).trim());
        const no = /^(no|false|0)$/i.test(String(field.value).trim());
        if (!yes && !no) {
          missing.push(field.label);
          continue;
        }
        match.checked = yes;
        match.dispatchEvent(new Event("change", { bubbles: true }));
        filled += 1;
        continue;
      }
      if (match instanceof HTMLSelectElement) {
        const opt = [...match.options].find((option) => {
          const text = norm(option.text);
          const wanted = norm(field.value);
          return text === wanted || text.includes(wanted) || wanted.includes(text);
        });
        if (!opt) {
          missing.push(field.label);
          continue;
        }
        match.value = opt.value;
        match.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (match instanceof HTMLInputElement || match instanceof HTMLTextAreaElement) {
        setNative(match, field.value);
      } else {
        missing.push(field.label);
        continue;
      }
      filled += 1;
    }
    return { filled, total: (fields || []).length, missing };
  }

  function cleanLabel(value) {
    return String(value || "").replace(/\s+/g, " ").replace(/\*+/g, "").trim().slice(0, 240);
  }

  function controlLabel(el) {
    const id = el.getAttribute("id");
    const labelled = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
    if (labelled) return cleanLabel(labelled.textContent);
    const wrap = el.closest("label");
    if (wrap) return cleanLabel(wrap.textContent);
    const box = el.closest("fieldset, li, div");
    const heading = box && box.querySelector("legend, label, [class*='label']");
    if (heading && !heading.contains(el)) return cleanLabel(heading.textContent);
    return cleanLabel(el.getAttribute("aria-label") || el.getAttribute("placeholder") || "");
  }

  function collectLiveFields() {
    const skip = /^(submit|search|password|hidden|file|image|button)$/;
    const consent = /\b(privacy|terms of|i agree|consent|acknowledge|captcha)\b/;
    const fields = [];
    let n = 0;
    const seen = new Set();
    const radioNames = new Set();
    for (const radio of document.querySelectorAll("input[type='radio']")) {
      if (radio.name) radioNames.add(radio.name);
    }
    for (const name of radioNames) {
      const group = [...document.querySelectorAll("input[type='radio']")].filter((el) => el.name === name);
      if (!group.length || group.some((el) => el.checked)) continue;
      const label = controlLabel(group[0]);
      if (!label || consent.test(norm(label))) continue;
      const options = group.map((el) => {
        const lab = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest("label");
        return cleanLabel(lab && lab.textContent) || cleanLabel(el.value);
      }).filter(Boolean);
      const id = `q${n++}`;
      group[0].setAttribute("data-lumi-q", id);
      group[0].setAttribute("data-lumi-kind", "radio");
      seen.add(group[0]);
      fields.push({ id, label, kind: "radio", options });
    }
    for (const el of document.querySelectorAll("input, textarea, select")) {
      if (seen.has(el)) continue;
      const type = (el.getAttribute("type") || el.tagName).toLowerCase();
      if (skip.test(type) || type === "radio" || type === "checkbox") continue;
      if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.value.trim()) continue;
      if (el instanceof HTMLSelectElement) {
        const current = cleanLabel(el.selectedOptions[0] && el.selectedOptions[0].text);
        if (el.value && !/^select|^choose|^-$/.test(norm(current))) continue;
      }
      const label = controlLabel(el);
      if (label.length < 2 || consent.test(norm(label))) continue;
      const id = `q${n++}`;
      el.setAttribute("data-lumi-q", id);
      const kind = el instanceof HTMLSelectElement ? "select" : el instanceof HTMLTextAreaElement ? "textarea" : "text";
      el.setAttribute("data-lumi-kind", kind);
      const options = el instanceof HTMLSelectElement
        ? [...el.options].map((option) => cleanLabel(option.text)).filter((option) => option && !/^select|^choose/.test(norm(option)))
        : [];
      fields.push({ id, label, kind, options });
      if (fields.length >= 24) break;
    }
    return fields;
  }

  function fillMarked(rows) {
    let filled = 0;
    for (const row of rows || []) {
      if (!row.answer) continue;
      const el = document.querySelector(`[data-lumi-q="${row.id}"]`);
      if (!el) continue;
      const kind = el.getAttribute("data-lumi-kind");
      if (kind === "radio" && el instanceof HTMLInputElement) {
        const group = [...document.querySelectorAll("input[type='radio']")].filter((radio) => radio.name === el.name);
        const hit = group.find((radio) => {
          const lab = radio.id ? document.querySelector(`label[for="${CSS.escape(radio.id)}"]`) : radio.closest("label");
          const text = norm((lab && lab.textContent) || radio.value);
          const wanted = norm(row.answer);
          return text === wanted || text.includes(wanted) || wanted.includes(text);
        });
        if (!hit) continue;
        hit.click();
        hit.checked = true;
        hit.dispatchEvent(new Event("change", { bubbles: true }));
        filled += 1;
        continue;
      }
      if (el instanceof HTMLSelectElement) {
        const wanted = norm(row.answer);
        const opt = [...el.options].find((option) => {
          const text = norm(option.text);
          return text === wanted || text.includes(wanted) || wanted.includes(text);
        });
        if (!opt) continue;
        el.value = opt.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        filled += 1;
        continue;
      }
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        setNative(el, row.answer);
        filled += 1;
      }
    }
    return { filled };
  }

  function labelOf(el) {
    const box = el.closest("fieldset, li, div, label");
    const heading = box && box.querySelector("label, legend");
    return norm((heading && heading.textContent) || el.getAttribute("aria-label") || "");
  }

  async function fillCombos(fields) {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const skipBtn = /^(submit|next|continue|apply|save|cancel|back|upload|search)$/;
    let filled = 0;
    for (const field of fields || []) {
      if (!field.value) continue;
      const keys = [field.label, ...(field.aliases || [])].map(norm).filter((key) => key.length > 2);
      const value = norm(field.value);
      if (!keys.length || !value) continue;
      const combo = [...document.querySelectorAll("[role='combobox'], .select__control, [aria-haspopup='listbox']")].find((el) => {
        const hay = labelOf(el);
        return keys.some((key) => hay === key || hay.includes(key));
      });
      if (combo) {
        const current = norm(combo.textContent);
        if (current === value || current.includes(value)) {
          filled += 1;
          continue;
        }
        combo.click();
        await sleep(280);
        const hit = [...document.querySelectorAll("[role='option'], .select__option")].find((option) => {
          const text = norm(option.textContent);
          return text === value || text.includes(value) || (text.length > 2 && value.includes(text));
        });
        if (hit) {
          hit.click();
          filled += 1;
          await sleep(120);
          continue;
        }
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      }
      for (const group of document.querySelectorAll("fieldset, [role='radiogroup'], [role='group']")) {
        if (!keys.some((key) => labelOf(group).includes(key))) continue;
        const hit = [...group.querySelectorAll("button, [role='radio'], label")].find((el) => {
          const text = norm(el.textContent);
          return text && text.length < 80 && !skipBtn.test(text) && (text === value || text.includes(value) || (text.length > 1 && value.includes(text)));
        });
        if (hit) {
          hit.click();
          filled += 1;
          break;
        }
      }
    }
    return { filled };
  }

  async function run(config) {
    const vault = fillDom(config.fields || []);
    const combos = await fillCombos(config.fields || []);
    const live = collectLiveFields();
    let apiFilled = 0;
    let error = "";
    if (live.length && config.origin && config.token) {
      try {
        const res = await fetch(`${config.origin}/api/extension/answers`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
          body: JSON.stringify({
            profileId: config.profileId,
            company: config.company,
            title: config.title,
            description: config.description,
            fields: live,
          }),
        });
        const data = await res.json();
        if (Array.isArray(data.answers)) apiFilled = fillMarked(data.answers).filled;
        else error = data.error || "";
      } catch (err) {
        error = err instanceof Error ? err.message : "API failed";
      }
    }
    return { filled: vault.filled, total: vault.total, combos: combos.filled, apiFilled, live: live.length, error };
  }

  window.__lumiFill = { fillDom, collectLiveFields, fillMarked, fillCombos, run };
})();
