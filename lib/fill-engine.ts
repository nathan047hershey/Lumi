import { DEFAULT_AUTOFILL } from "./autofill";

export const FILL_ENGINE = "lumi-fill-v1";

export type AtsId =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workday"
  | "icims"
  | "smartrecruiters"
  | "bamboohr"
  | "oracle"
  | "rippling"
  | "gem"
  | "linkedin"
  | "generic";

export type FieldGroup = "identity" | "links" | "work" | "education" | "eeo" | "files" | "screening";
export type FieldSource = "vault" | "memory" | "default" | "ai" | "gap";
export type InputHint = "text" | "email" | "tel" | "url" | "select" | "textarea" | "file";

export type FillField = {
  key: string;
  label: string;
  value: string;
  source: FieldSource;
  confidence: number;
  group: FieldGroup;
  required: boolean;
  inputHint: InputHint;
  aliases: string[];
};

export type FillPlan = {
  engine: typeof FILL_ENGINE;
  ats: { id: AtsId; label: string };
  jobLinkId: number;
  profileId: number;
  applicationId: number | null;
  company: string;
  title: string;
  applyUrl: string;
  description?: string;
  coverage: number;
  filled: number;
  total: number;
  gaps: number;
  fields: FillField[];
};

export type ProfileVault = Record<string, string>;

type CatalogField = {
  key: string;
  label: string;
  group: FieldGroup;
  required?: boolean;
  inputHint?: InputHint;
  aliases: string[];
};

const ATS_META: Record<AtsId, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workday: "Workday",
  icims: "iCIMS",
  smartrecruiters: "SmartRecruiters",
  bamboohr: "BambooHR",
  oracle: "Oracle HCM",
  rippling: "Rippling",
  gem: "Gem",
  linkedin: "LinkedIn",
  generic: "Generic ATS",
};

export function detectAts(url: string): { id: AtsId; label: string } {
  const u = String(url || "").toLowerCase();
  const hit = (id: AtsId) => ({ id, label: ATS_META[id] });
  if (/greenhouse\.io|[?&]gh_jid=/.test(u)) return hit("greenhouse");
  if (/lever\.co/.test(u)) return hit("lever");
  if (/ashbyhq\.com/.test(u)) return hit("ashby");
  if (/myworkdayjobs\.com|workdayjobs\.com|\/wd\d/.test(u)) return hit("workday");
  if (/icims\.com/.test(u)) return hit("icims");
  if (/smartrecruiters\.com/.test(u)) return hit("smartrecruiters");
  if (/bamboohr\.com/.test(u)) return hit("bamboohr");
  if (/oraclecloud\.com|oracle\.com\/hcm/.test(u)) return hit("oracle");
  if (/rippling\.com/.test(u)) return hit("rippling");
  if (/jobs\.gem\.com/.test(u)) return hit("gem");
  if (/linkedin\.com/.test(u)) return hit("linkedin");
  return hit("generic");
}

export function normalizeLabel(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(please|your|the|a|an|of|for|to|is|are)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CATALOG: CatalogField[] = [
  { key: "firstName", label: "First name", group: "identity", required: true, aliases: ["first name", "given name", "legal first name", "fname", "forename"] },
  { key: "lastName", label: "Last name", group: "identity", required: true, aliases: ["last name", "family name", "surname", "legal last name", "lname"] },
  { key: "fullName", label: "Full name", group: "identity", aliases: ["full name", "legal name", "candidate name", "name"] },
  { key: "preferredName", label: "Preferred name", group: "identity", aliases: ["preferred name", "preferred first name", "nickname", "goes by"] },
  { key: "email", label: "Email", group: "identity", required: true, inputHint: "email", aliases: ["email", "email address", "work email", "contact email"] },
  { key: "phone", label: "Phone", group: "identity", required: true, inputHint: "tel", aliases: ["phone", "phone number", "mobile", "mobile phone", "cell", "telephone"] },
  { key: "address", label: "Street address", group: "identity", aliases: ["address", "street address", "address line 1", "home address"] },
  { key: "city", label: "City", group: "identity", aliases: ["city", "town", "locality"] },
  { key: "state", label: "State", group: "identity", inputHint: "select", aliases: ["state", "province", "region", "state province"] },
  { key: "postalCode", label: "Postal code", group: "identity", aliases: ["postal code", "zip", "zip code", "postcode"] },
  { key: "country", label: "Country", group: "identity", required: true, inputHint: "select", aliases: ["country", "country region", "location country"] },
  { key: "linkedinUrl", label: "LinkedIn", group: "links", inputHint: "url", aliases: ["linkedin", "linkedin url", "linkedin profile"] },
  { key: "githubUrl", label: "GitHub", group: "links", inputHint: "url", aliases: ["github", "github url", "git hub"] },
  { key: "websiteUrl", label: "Website", group: "links", inputHint: "url", aliases: ["website", "personal website", "portfolio", "portfolio url"] },
  { key: "workAuthorization", label: "Authorized to work", group: "work", required: true, inputHint: "select", aliases: ["authorized to work", "work authorization", "legally authorized", "eligible to work", "right to work", "work permit"] },
  { key: "requiresSponsorship", label: "Need sponsorship", group: "work", required: true, inputHint: "select", aliases: ["sponsorship", "require sponsorship", "need visa", "visa sponsorship", "future sponsorship", "h1b"] },
  { key: "yearsOfExperience", label: "Years of experience", group: "work", aliases: ["years of experience", "years experience", "total years", "yoe"] },
  { key: "salaryRange", label: "Salary expectation", group: "work", aliases: ["salary", "compensation", "expected salary", "desired salary", "pay expectation"] },
  { key: "willingToRelocate", label: "Willing to relocate", group: "work", inputHint: "select", aliases: ["relocate", "willing to relocate", "relocation"] },
  { key: "willingToTravel", label: "Willing to travel", group: "work", inputHint: "select", aliases: ["travel", "willing to travel", "travel required"] },
  { key: "noticePeriod", label: "Notice period", group: "work", aliases: ["notice period", "notice", "availability notice"] },
  { key: "earliestStartDate", label: "Earliest start", group: "work", aliases: ["start date", "earliest start", "available start", "when can you start"] },
  { key: "securityClearance", label: "Security clearance", group: "work", aliases: ["clearance", "security clearance", "active clearance"] },
  { key: "howHeard", label: "How did you hear about us", group: "work", inputHint: "select", aliases: ["how did you hear", "how you heard", "referral source", "source"] },
  { key: "school", label: "School", group: "education", aliases: ["school", "university", "college", "institution"] },
  { key: "degree", label: "Degree", group: "education", aliases: ["degree", "degree type"] },
  { key: "discipline", label: "Field of study", group: "education", aliases: ["field of study", "major", "discipline", "concentration"] },
  { key: "educationLevel", label: "Education level", group: "education", inputHint: "select", aliases: ["education level", "highest education"] },
  { key: "gender", label: "Gender", group: "eeo", inputHint: "select", aliases: ["gender", "gender identity", "sex"] },
  { key: "raceEthnicity", label: "Race / ethnicity", group: "eeo", inputHint: "select", aliases: ["race", "ethnicity", "race ethnicity"] },
  { key: "hispanicLatino", label: "Hispanic / Latino", group: "eeo", inputHint: "select", aliases: ["hispanic", "latino", "hispanic latino"] },
  { key: "disabilityStatus", label: "Disability status", group: "eeo", inputHint: "select", aliases: ["disability", "disability status", "disabled"] },
  { key: "veteranStatus", label: "Veteran status", group: "eeo", inputHint: "select", aliases: ["veteran", "veteran status", "protected veteran"] },
  { key: "over18", label: "Over 18", group: "eeo", inputHint: "select", aliases: ["over 18", "18 years", "age 18"] },
  { key: "resume", label: "Resume", group: "files", required: true, inputHint: "file", aliases: ["resume", "cv", "curriculum vitae", "attach resume"] },
  { key: "coverLetter", label: "Cover letter", group: "files", inputHint: "file", aliases: ["cover letter", "coverletter", "motivation letter"] },
];

const BY_ATS: Record<AtsId, string[]> = {
  greenhouse: ["firstName", "lastName", "email", "phone", "city", "linkedinUrl", "websiteUrl", "workAuthorization", "requiresSponsorship", "school", "degree", "gender", "hispanicLatino", "veteranStatus", "disabilityStatus", "resume", "coverLetter", "howHeard"],
  lever: ["firstName", "lastName", "email", "phone", "city", "linkedinUrl", "websiteUrl", "githubUrl", "workAuthorization", "requiresSponsorship", "salaryRange", "resume", "coverLetter", "howHeard"],
  ashby: ["firstName", "lastName", "email", "phone", "city", "linkedinUrl", "websiteUrl", "workAuthorization", "requiresSponsorship", "yearsOfExperience", "resume", "coverLetter"],
  workday: ["firstName", "lastName", "preferredName", "email", "phone", "address", "city", "state", "postalCode", "country", "workAuthorization", "requiresSponsorship", "howHeard", "resume"],
  icims: ["firstName", "lastName", "email", "phone", "city", "state", "country", "workAuthorization", "requiresSponsorship", "resume"],
  smartrecruiters: ["firstName", "lastName", "email", "phone", "city", "country", "linkedinUrl", "workAuthorization", "requiresSponsorship", "resume"],
  bamboohr: ["firstName", "lastName", "email", "phone", "city", "resume", "howHeard"],
  oracle: ["firstName", "lastName", "email", "phone", "country", "workAuthorization", "requiresSponsorship", "resume"],
  rippling: ["firstName", "lastName", "email", "phone", "linkedinUrl", "resume"],
  gem: ["firstName", "lastName", "email", "phone", "linkedinUrl", "resume"],
  linkedin: ["firstName", "lastName", "email", "phone", "city", "resume"],
  generic: ["firstName", "lastName", "email", "phone", "city", "country", "linkedinUrl", "workAuthorization", "requiresSponsorship", "resume"],
};

export function classifyLabel(label: string): CatalogField | null {
  const needle = normalizeLabel(label);
  if (!needle) return null;
  for (const field of CATALOG) {
    if (normalizeLabel(field.label) === needle || field.key.toLowerCase() === needle) return field;
    if (field.aliases.some((alias) => normalizeLabel(alias) === needle)) return field;
  }
  for (const field of CATALOG) {
    if (field.aliases.some((alias) => needle.includes(normalizeLabel(alias)) || normalizeLabel(alias).includes(needle))) {
      return field;
    }
  }
  return null;
}

export function buildVault(
  profile: Record<string, unknown>,
  defaults: Record<string, string> = DEFAULT_AUTOFILL,
): ProfileVault {
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = profile[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  };
  const first = pick("firstName");
  const last = pick("lastName");
  const vault: ProfileVault = {
    firstName: first,
    lastName: last,
    fullName: [first, pick("middleName"), last].filter(Boolean).join(" "),
    preferredName: pick("preferredName") || first,
    email: pick("email"),
    phone: pick("phone"),
    address: pick("address"),
    city: pick("city"),
    state: pick("state"),
    postalCode: pick("postalCode"),
    country: pick("country") || (pick("locationFlag") === "US" ? "United States" : pick("locationFlag")),
    linkedinUrl: pick("linkedinUrl"),
    githubUrl: pick("githubUrl"),
    websiteUrl: pick("websiteUrl", "portfolioUrl"),
    workAuthorization: pick("workAuthorization") || defaults.workAuthorization,
    requiresSponsorship: pick("requiresSponsorship") || defaults.requiresSponsorship,
    yearsOfExperience: pick("yearsOfExperience") || defaults.yearsOfExperience,
    salaryRange: pick("salaryRange"),
    willingToRelocate: pick("willingToRelocate") || defaults.willingToRelocate,
    willingToTravel: pick("willingToTravel") || defaults.willingToTravel,
    noticePeriod: pick("noticePeriod") || defaults.noticePeriod,
    earliestStartDate: pick("earliestStartDate") || defaults.earliestStartDate,
    securityClearance: pick("securityClearance") || defaults.securityClearance,
    howHeard: pick("howHeard") || defaults.howHeard,
    school: pick("school"),
    degree: pick("degree"),
    discipline: pick("discipline"),
    educationLevel: pick("educationLevel"),
    gender: pick("gender") || defaults.gender,
    raceEthnicity: pick("raceEthnicity") || defaults.raceEthnicity,
    hispanicLatino: pick("hispanicLatino") || defaults.hispanicLatino,
    disabilityStatus: pick("disabilityStatus") || defaults.disabilityStatus,
    veteranStatus: pick("veteranStatus") || defaults.veteranStatus,
    over18: pick("over18") || defaults.over18,
    resume: pick("resumePrompt") ? "Attach the generated resume for this job" : "",
    coverLetter: pick("resumePrompt"),
  };
  return vault;
}

export function extractScreeningQuestions(description: string, company: string, title: string) {
  const lines = String(description || "")
    .split(/\n|(?<=[.?!])\s+/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((line) => line.length > 12 && line.length < 180 && /[?]/.test(line));
  const unique = [...new Set(lines)].slice(0, 6);
  if (unique.length === 0) {
    return [
      `Why do you want to work at ${company || "this company"}?`,
      `What makes you a fit for ${title || "this role"}?`,
    ];
  }
  return unique;
}

function memoryMap(rows: Array<{ questionLabel: string; answer: string }>) {
  const map = new Map<string, string>();
  for (const row of rows) {
    const key = normalizeLabel(row.questionLabel);
    if (key && row.answer.trim()) map.set(key, row.answer.trim());
  }
  return map;
}

function resolveValue(
  field: CatalogField,
  vault: ProfileVault,
  memory: Map<string, string>,
): Pick<FillField, "value" | "source" | "confidence"> {
  const remembered = memory.get(normalizeLabel(field.label)) || memory.get(normalizeLabel(field.key));
  if (remembered) return { value: remembered, source: "memory", confidence: 0.96 };
  const vaulted = vault[field.key]?.trim();
  if (vaulted) {
    const source: FieldSource = DEFAULT_AUTOFILL[field.key as keyof typeof DEFAULT_AUTOFILL] && vaulted === DEFAULT_AUTOFILL[field.key as keyof typeof DEFAULT_AUTOFILL]
      ? "default"
      : "vault";
    return { value: vaulted, source, confidence: source === "vault" ? 0.92 : 0.7 };
  }
  return { value: "", source: "gap", confidence: 0 };
}

export function buildFillPlan(input: {
  atsUrl: string;
  jobLinkId: number;
  profileId: number;
  company: string;
  title: string;
  description: string;
  applyUrl: string;
  vault: ProfileVault;
  memory: Array<{ questionLabel: string; answer: string }>;
  applicationId?: number | null;
}): FillPlan {
  const ats = detectAts(input.atsUrl || input.applyUrl);
  const remembered = memoryMap(input.memory);
  const keys = BY_ATS[ats.id];
  const fields: FillField[] = keys.map((key) => {
    const spec = CATALOG.find((row) => row.key === key)!;
    const resolved = resolveValue(spec, input.vault, remembered);
    return {
      key: spec.key,
      label: spec.label,
      group: spec.group,
      required: !!spec.required,
      inputHint: spec.inputHint || (spec.group === "screening" ? "textarea" : "text"),
      aliases: spec.aliases,
      ...resolved,
    };
  });

  for (const question of extractScreeningQuestions(input.description, input.company, input.title)) {
    const classified = classifyLabel(question);
    if (classified && fields.some((field) => field.key === classified.key)) continue;
    const key = classified?.key || `q_${normalizeLabel(question).slice(0, 40).replace(/\s+/g, "_")}`;
    const spec: CatalogField = classified || {
      key,
      label: question,
      group: "screening",
      inputHint: "textarea",
      aliases: [question],
    };
    const resolved = resolveValue({ ...spec, group: "screening", aliases: spec.aliases }, input.vault, remembered);
    const fromMemory = remembered.get(normalizeLabel(question));
    fields.push({
      key,
      label: question,
      group: "screening",
      required: false,
      inputHint: "textarea",
      aliases: spec.aliases,
      value: fromMemory || resolved.value,
      source: fromMemory ? "memory" : resolved.source,
      confidence: fromMemory ? 0.96 : resolved.confidence,
    });
  }

  const total = fields.length;
  const filled = fields.filter((field) => field.value && field.source !== "gap").length;
  const gaps = fields.filter((field) => !field.value).length;
  return {
    engine: FILL_ENGINE,
    ats,
    jobLinkId: input.jobLinkId,
    profileId: input.profileId,
    applicationId: input.applicationId ?? null,
    company: input.company,
    title: input.title,
    applyUrl: input.applyUrl,
    coverage: total ? filled / total : 0,
    filled,
    total,
    gaps,
    fields,
  };
}

export function applyAiAnswers(plan: FillPlan, answers: Array<{ key: string; answer: string }>) {
  const byKey = new Map(answers.map((row) => [row.key, row.answer.trim()]));
  const fields = plan.fields.map((field) => {
    const next = byKey.get(field.key);
    if (!next || field.value) return field;
    return { ...field, value: next, source: "ai" as const, confidence: 0.62 };
  });
  const filled = fields.filter((field) => field.value).length;
  return {
    ...plan,
    fields,
    filled,
    gaps: fields.filter((field) => !field.value).length,
    coverage: fields.length ? filled / fields.length : 0,
  };
}

const KEY_SELECTORS: Record<string, string[]> = {
  firstName: ["#first_name", "input[name*='first_name']", "input[autocomplete='given-name']", "input[name='firstName']"],
  lastName: ["#last_name", "input[name*='last_name']", "input[autocomplete='family-name']", "input[name='lastName']"],
  fullName: ["input[name='name']", "input[autocomplete='name']", "#name"],
  email: ["#email", "input[type='email']", "input[autocomplete='email']", "input[name*='email']"],
  phone: ["#phone", "input[type='tel']", "input[autocomplete='tel']", "input[name*='phone']"],
  city: ["input[autocomplete='address-level2']", "input[name*='city']", "#candidate-location"],
  linkedinUrl: ["input[name*='linkedin']", "input[id*='linkedin']"],
  githubUrl: ["input[name*='github']"],
  websiteUrl: ["input[name*='website']", "input[name*='portfolio']", "input[name*='urls']"],
  resume: ["input[type='file'][id*='resume']", "input[type='file'][name*='resume']", "input[type='file']"],
};

export type PageFillInput = {
  key: string;
  label: string;
  value: string;
  aliases: string[];
  selectors: string[];
};

export function pageFillInputs(plan: FillPlan): PageFillInput[] {
  return plan.fields
    .filter((field) => field.value && field.inputHint !== "file")
    .map((field) => ({
      key: field.key,
      label: field.label,
      value: field.value,
      aliases: field.aliases,
      selectors: KEY_SELECTORS[field.key] || [],
    }));
}

/** Runs inside the apply page. No closures — Playwright serializes this function. */
export function fillDom(fields: PageFillInput[]) {
  const norm = (value: string) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const used = new Set<Element>();
  const missing: string[] = [];
  let filled = 0;

  const setNative = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    el.focus();
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  };

  const controls = [...document.querySelectorAll("input, textarea, select")].filter((el) => {
    const type = (el.getAttribute("type") || "").toLowerCase();
    return !["hidden", "submit", "button", "file", "image"].includes(type);
  });

  const hayOf = (el: Element) => {
    const bits = [
      el.getAttribute("name"),
      el.getAttribute("id"),
      el.getAttribute("placeholder"),
      el.getAttribute("aria-label"),
      el.getAttribute("autocomplete"),
    ];
    const id = el.getAttribute("id");
    const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : el.closest("label");
    if (label) bits.push(label.textContent);
    const wrap = el.closest("div, li, fieldset");
    const heading = wrap?.querySelector("label, legend, [class*='label']");
    if (heading && heading !== label) bits.push(heading.textContent);
    return norm(bits.filter(Boolean).join(" "));
  };

  for (const field of fields) {
    let match: Element | null = null;
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
      const yes = /^(yes|true|1)$/i.test(field.value.trim());
      const no = /^(no|false|0)$/i.test(field.value.trim());
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

  return { filled, total: fields.length, missing };
}

export type LiveField = {
  id: string;
  label: string;
  kind: "text" | "textarea" | "select" | "radio";
  options: string[];
};

/** Marks empty questions on the open apply page so the API can answer them. */
export function collectLiveFields(): LiveField[] {
  const cleanLabel = (value: string | null | undefined) =>
    String(value || "").replace(/\s+/g, " ").replace(/\*+/g, "").trim().slice(0, 240);
  const norm = (value: string) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const skip = /^(submit|search|password|hidden|file|image|button)$/;
  const consent = /\b(privacy|terms of|i agree|consent|acknowledge|captcha)\b/;
  const fields: LiveField[] = [];
  let n = 0;

  const textOf = (el: Element | null) => cleanLabel(el?.textContent);

  const controlLabel = (el: Element) => {
    const id = el.getAttribute("id");
    const labelled = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
    if (labelled) return textOf(labelled);
    const wrap = el.closest("label");
    if (wrap) return textOf(wrap);
    const box = el.closest("fieldset, li, div");
    const heading = box?.querySelector("legend, label, [class*='label']");
    if (heading && !heading.contains(el)) return textOf(heading);
    return cleanLabel(el.getAttribute("aria-label") || el.getAttribute("placeholder") || "");
  };

  const seen = new Set<Element>();

  const radioNames = new Set<string>();
  for (const radio of document.querySelectorAll<HTMLInputElement>("input[type='radio']")) {
    if (radio.name) radioNames.add(radio.name);
  }
  for (const name of radioNames) {
    const group = [...document.querySelectorAll<HTMLInputElement>("input[type='radio']")].filter((el) => el.name === name);
    if (!group.length || group.some((el) => el.checked)) continue;
    const label = controlLabel(group[0]);
    if (!label || consent.test(norm(label))) continue;
    const options = group.map((el) => {
      const id = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest("label");
      return textOf(id) || cleanLabel(el.value);
    }).filter(Boolean);
    const id = `q${n++}`;
    group[0].setAttribute("data-lumi-q", id);
    group[0].setAttribute("data-lumi-kind", "radio");
    seen.add(group[0]);
    fields.push({ id, label, kind: "radio", options });
  }

  const controls = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select")];
  for (const el of controls) {
    if (seen.has(el)) continue;
    const type = (el.getAttribute("type") || el.tagName).toLowerCase();
    if (skip.test(type) || type === "radio" || type === "checkbox") continue;
    if (el instanceof HTMLInputElement && el.value.trim()) continue;
    if (el instanceof HTMLTextAreaElement && el.value.trim()) continue;
    if (el instanceof HTMLSelectElement) {
      const current = cleanLabel(el.selectedOptions[0]?.text || "");
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

/** Clicks ATS dropdowns and Yes/No groups. Self-contained so Playwright can serialize it. */
export async function fillCombos(fields: Array<{ label: string; value: string; aliases?: string[] }>) {
  const norm = (value: string) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const skipBtn = /^(submit|next|continue|apply|save|cancel|back|upload|search)$/;
  let filled = 0;

  const labelOf = (el: Element) => {
    const box = el.closest("fieldset, li, div, label");
    const heading = box?.querySelector("label, legend");
    return norm(heading?.textContent || el.getAttribute("aria-label") || "");
  };

  for (const field of fields) {
    if (!field.value) continue;
    const keys = [field.label, ...(field.aliases || [])].map(norm).filter((key) => key.length > 2);
    const value = norm(field.value);
    if (!keys.length || !value) continue;

    const combos = [...document.querySelectorAll("[role='combobox'], .select__control, [aria-haspopup='listbox']")];
    const combo = combos.find((el) => {
      const hay = labelOf(el);
      return keys.some((key) => hay === key || hay.includes(key));
    });
    if (combo instanceof HTMLElement) {
      const current = norm(combo.textContent);
      if (current === value || current.includes(value)) {
        filled += 1;
        continue;
      }
      combo.click();
      await sleep(280);
      const options = [...document.querySelectorAll("[role='option'], .select__option")];
      const hit = options.find((option) => {
        const text = norm(option.textContent);
        return text === value || text.includes(value) || (text.length > 2 && value.includes(text));
      });
      if (hit instanceof HTMLElement) {
        hit.click();
        filled += 1;
        await sleep(120);
        continue;
      }
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    }

    const groups = [...document.querySelectorAll("fieldset, [role='radiogroup'], [role='group']")];
    for (const group of groups) {
      if (!keys.some((key) => labelOf(group).includes(key))) continue;
      const buttons = [...group.querySelectorAll("button, [role='radio'], label")].filter((el) => {
        const text = norm(el.textContent);
        return text.length > 0 && text.length < 80 && !skipBtn.test(text);
      });
      const hit = buttons.find((el) => {
        const text = norm(el.textContent);
        return text === value || text.includes(value) || (text.length > 1 && value.includes(text));
      });
      if (hit instanceof HTMLElement) {
        hit.click();
        filled += 1;
        break;
      }
    }
  }
  return { filled };
}

/** Fills answers onto fields marked by collectLiveFields. */
export function fillMarked(rows: Array<{ id: string; answer: string }>) {
  const norm = (value: string) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const setNative = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    el.focus();
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  };
  let filled = 0;
  const missing: string[] = [];
  for (const row of rows) {
    if (!row.answer) continue;
    const el = document.querySelector(`[data-lumi-q="${row.id}"]`);
    if (!el) {
      missing.push(row.id);
      continue;
    }
    const kind = el.getAttribute("data-lumi-kind");
    if (kind === "radio" && el instanceof HTMLInputElement) {
      const group = [...document.querySelectorAll<HTMLInputElement>("input[type='radio']")].filter((radio) => radio.name === el.name);
      const hit = group.find((radio) => {
        const lab = radio.id ? document.querySelector(`label[for="${CSS.escape(radio.id)}"]`) : radio.closest("label");
        const text = norm(lab?.textContent || radio.value);
        const wanted = norm(row.answer);
        return text === wanted || text.includes(wanted) || wanted.includes(text);
      });
      if (!hit) {
        missing.push(row.id);
        continue;
      }
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
      if (!opt) {
        missing.push(row.id);
        continue;
      }
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
  return { filled, total: rows.length, missing };
}

export function injectorScript(plan: FillPlan) {
  const payload = plan.fields
    .filter((field) => field.value && field.inputHint !== "file")
    .map((field) => ({
      label: field.label,
      value: field.value,
      aliases: field.aliases,
      hint: field.inputHint,
    }));
  return `(() => {
  const fields = ${JSON.stringify(payload)};
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const setNative = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) desc.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const controls = [...document.querySelectorAll("input, textarea, select")].filter((el) => {
    const type = (el.getAttribute("type") || "").toLowerCase();
    return !["hidden", "submit", "button", "file", "image"].includes(type) && el.offsetParent;
  });
  let filled = 0;
  for (const field of fields) {
    const keys = [field.label, ...(field.aliases || [])].map(norm);
    const match = controls.find((el) => {
      const bits = [el.getAttribute("name"), el.getAttribute("id"), el.getAttribute("placeholder"), el.getAttribute("aria-label"), el.getAttribute("autocomplete")];
      const label = el.id ? document.querySelector(\`label[for="\${CSS.escape(el.id)}"]\`) : el.closest("label");
      if (label) bits.push(label.textContent);
      const hay = norm(bits.filter(Boolean).join(" "));
      return keys.some((key) => key && (hay === key || hay.includes(key) || key.includes(hay)));
    });
    if (!match || !field.value) continue;
    if (match.tagName === "SELECT") {
      const opt = [...match.options].find((o) => norm(o.text).includes(norm(field.value)) || norm(o.value) === norm(field.value));
      if (opt) { match.value = opt.value; match.dispatchEvent(new Event("change", { bubbles: true })); filled += 1; }
    } else {
      setNative(match, field.value);
      filled += 1;
    }
  }
  console.info("[Lumi fill]", filled, "/", fields.length);
  return { filled, total: fields.length };
})();`;
}

export function answersFromPlan(plan: FillPlan) {
  return plan.fields
    .filter((field) => field.value)
    .map((field) => ({
      label: field.label,
      answer: field.value,
      source: field.source,
      key: field.key,
    }));
}
