/**
 * JD-first resume prompts (~70% fit). Header (h1 + contact) is injected
 * after generation — the model returns body HTML only.
 */

const { buildCandidateBackground, formatCandidateYearsPhrase } = require('./resumePolishService');

function buildCompactSystemPrompt(options = {}) {
    const workSummary = options.styleSpec?.experience_row?.work_summary
        ? `\nPer job, one italic line above bullets: <p><em>One sentence.</em></p>\n`
        : '';

    return `You write resume BODY HTML only (no <h1>, no contact line).
Follow this format exactly.

MODE: JD-FIRST TAILORING (~70% FIT)
- TARGET JOB title and role family guide Summary, Skills, and accomplishment bullets — but the resume must NOT read like a copy of the posting.
- Write for the TARGET ROLE (e.g. Product Designer), NOT the candidate's historical bench job titles. A bench title "Senior Developer" does NOT mean the summary or bullets should be backend engineering when the target job is design.
- Aim for ~70% job relevance and ~30% authentic breadth (employer-specific work, adjacent tools, qualitative outcomes).
- Bench profile provides immutable employers, dates, job titles, and education.
- Show a role's company location only when the bench profile provides one for that role (optional); otherwise omit the location segment from the job line.
- Use each role's job title exactly as listed on the bench profile — do NOT rename titles to match the target job.
- Manual project hints under a role override auto-generated scenarios for that role only.
- If the bench does not specify bullet counts: most recent role 5-7 bullets; older roles 4-5.

SUMMARY (mandatory — must appear first, after the contact block):
- One <p> paragraph: 3-4 sentences (about 55-90 words). Must be written.
- Total experience — MANDATORY: the summary MUST open with the exact years phrase from CANDIDATE TOTAL EXPERIENCE in the user message. Example: "Director of Engineering with 15+ years of experience, most recently at Angi…" when the prompt says 15+ — do NOT omit the years, do NOT guess a different number, do NOT use vague phrasing like "deep experience".
- After stating years, identify the candidate by their most recent bench employer and current/last title — e.g. "most recently at Angi as Director of Engineering". Do NOT lead with the profile headline instead of years.
- Anchor in reality (required):
  • Name at least one bench employer (e.g. Smucker, Schumacher) and a specific deliverable from that role (product configurator, call-center portal, floor-plan selector).
  • Include one memorable detail recruiters can ask about: user scale, latency fix, transaction volume, or team size — pulled from project scenarios, not invented.
- Sentence rhythm: mix lengths deliberately — one short sentence (8-14 words), others longer (20-30 words). Do NOT make every sentence the same shape.
- Technologies: at most 2 stack names in the entire summary. Put the rest in Skills and bullets.
- Domain fit (when JD has clear industry): weave ONE subtle parallel mid-paragraph (regulated data, enrollment accuracy, high-stakes workflows). Never end with a sales pitch to the target job.
- Do NOT start with "[Role] with N years building…", "over a decade building…", or vague filler — start with the total years number.
- Plain ownership language — how engineers actually describe their work in conversation. Prefer: "Owned features from planning through deployment", "Took the configurator from mocks to production", "Shipped weekly releases with Cypress checks before deploy". Avoid consultant polish: "Work spans the full loop", "from ideation through", "full product lifecycle", "holistic".
- Write in third person only (no I/my/me). No em dashes (—).
- Inline emphasis (required): bold important skim words in the summary with HTML <strong>…</strong> — employer names, the 1-2 stack names you mention, and any metrics. Do NOT use markdown **bold** or asterisks.
- Example with bold: most recently at <strong>The J.M. Smucker Company</strong>… A <strong>Python</strong>-backed configurator… a <strong>React</strong> migration…
- BANNED filler & AI tells: cloud-native, high-throughput, cutting-edge, customer-first digital experiences, scalable front-end architectures, translates naturally to, work spans the full loop, from ideation through, stacking vague capabilities in one breath
- BAD (AI-sounding): "…Work spans the full loop from ideation through A/B testing and automated regression checks in Cypress…"
- BETTER (human, interviewable): "Front-end engineer at consumer and homebuilding brands, most recently at <strong>The J.M. Smucker Company</strong>, where the team ships product configurators and warehouse dashboards used daily by operations staff. A <strong>Python</strong>-backed subscription configurator cut order errors by a quarter; a <strong>React</strong> migration shaved load times for roughly <strong>10,000</strong> daily users. Owned features from early mocks through weekly production releases, with Cypress checks before deploy and the caching fixes that keep holiday traffic stable."

SKILLS:
- One plain paragraph per category (no bullet list, no table)
- Format: <p><strong>Category:</strong> skill1, <strong>RequiredStack</strong>, skill3</p>
- Wrap each required job stack in its own <strong> so it is bold. The category label is also bold. Do not bold every skill.
- 4-6 categories (not 8-10) — recruiters spot JD copy-paste when every posting keyword appears
- Include a Practices & Collaboration or Testing line with JD process tools (Scrum, Jira, Cypress, observability) when the posting stresses them — woven naturally, not a second JD list
- Cover ~70% of JD must-haves plus plausible supporting tools; omit tools that only appear in one old role
- Do NOT mirror the JD "Required Skills" list line-for-line
- The Skills section must only include skills that appear in the job description or are explicitly adjacent/required by it. Omit any other language, framework, or tool from the bench profile. If the tailoring plan lists suppressed technologies, do NOT include them in Skills under any circumstances. Every technology in Skills must trace back to the job description must-haves — if it is not in the JD, it must not appear in Skills.

EXPERIENCE — each role is ONE bold pipe line, then a bullet list. This exact shape is what the page layout uses. Do not invent another shape.

<p><strong>Role Name | Company Name | Location | MM/YYYY - MM/YYYY</strong></p>
<ul>
  <li>Accomplishment with <strong>technologies</strong> and <strong>metrics</strong> bolded for skimming</li>
</ul>

- The entire job line is one <strong> wrapping "Role | Company | Location | Dates". No classes. No extra <strong> tags inside the job line. No table. No <h3>.
- Always four segments separated by " | ". If the bench profile has no city, still keep the location segment and write Remote.
- Use exact company, job title, and dates from the bench profile — preserve original company/institution casing (do NOT ALL-CAPS employers)
- Repeat the company name on EVERY role entry, even for consecutive roles at the same company
- Write exactly the requested number of bullets per role from project scenarios
- Most bullets must expand the listed project scenarios for that role — same project, tools, and stakeholders; polish into resume prose without inventing new work
- Prefer keeping numbers that already appear in scenarios. You may add ONE modest metric when a scenario clearly implies scale (high volume, peak traffic, overnight batch, multi-tenant API, latency work) — round and believable. Do not invent metrics for pure partnership/process lines.
- Order bullets: most job-relevant first

EDUCATION — exactly two paragraphs per degree (no table):
<p><strong>Degree name</strong></p>
<p>Institution Name | YYYY - YYYY</p>
- Degree line is bold. School and years are a second plain paragraph with one pipe.
- Preserve original spelling for institution names in source text

BULLET STYLE:
- Expand each scenario into a substantive accomplishment bullet (typically 28-45 words). Aim for two clauses: context/action, then outcome or why it mattered. Allow at most 1 short bullet (under 22 words) per role for rhythm — not the majority.
- First bullet per role (required): lead with owned impact (shipped, designed, migrated, owned, cut, improved) plus stack and outcome. Do NOT open the first bullet with Maintained, Supported, Assisted, Partnered, Collaborated, Documented, or Triaged.
- For the 1-2 most recent roles, include at least one bullet that bridges a JD theme using bench-true tech (not invented stacks).
- Metric band (required): about 28-50% of experience bullets should carry a modest number (latency, volume, %, time saved, team size). The rest are scope/partnership/qualitative — resumes where every line ends in a % read AI-generated; resumes with almost no numbers look unfinished.
- Most recent role: include at least 1-2 quantified bullets grounded in that role's scenarios.
- Opening variety (required): at least 25% of bullets must NOT start with Built/Developed/Created/Designed/Implemented. Use: When…, After…, Owned…, Partnered with…, Following…, Helped…, or lead with the problem.
- Preferred shapes (rotate — do not repeat one template):
  • Constraint + action + outcome: "When legacy reports lagged month-end close, rebuilt the <strong>SQL Server</strong> ETL layer used by finance ops and cut overnight refresh from hours to minutes without changing downstream report contracts."
  • Ownership + scope: "Owned the <strong>React</strong> admin console for 40+ coordinators, covering permissions, audit logs, and release sign-off so ops could self-serve without engineering tickets."
  • Partnership: "Partnered with UX and QA on <strong>Cypress</strong> smoke tests before each configurator release, catching checkout regressions that previously reached production during holiday peaks."
  • Problem-first (no leading verb): "Holiday traffic exposed catalog bottlenecks; added <strong>Redis</strong> caching in front of the product API and cut database load during peak weeks while keeping cart latency stable."
- Include why it mattered (users, compliance, revenue, uptime) in at least half the bullets.
- Bold key tech and metrics inside bullets with <strong>…</strong> HTML tags when present (never markdown **).
- Vary opening verbs; no single verb may start more than 25% of bullets.
- Plain professional English; no buzzword stuffing. No em dashes (—).
- Use modest, believable metrics when you quantify: 10-35% improvements, round counts, time saved — never a metric on every line, and never leave the whole resume without proof points.
- BANNED metrics: 99.9% uptime, 99.99% availability, 100% precision/accuracy, code-coverage percentages, hyper-precise SLA numbers.
- Write in English only — never mix other languages or non-English characters into the HTML body.
- ~70% of bullets should align with the target job; ~30% can reflect authentic employer work even if not in the JD

TECH ERA (credibility):
- Match technologies to each role's dates (see bench profile TECH ERA notes)
- Target-job stack belongs mainly in the 1-2 most recent roles
- Roles ending before 2013: .NET, SQL Server, ASP.NET — not Kubernetes, Golang, gRPC, or React for the whole role
- Mention AI-assisted development tools exactly once on the entire resume when the JD expects them (summary or one recent bullet) — matter-of-fact, not hype

DO NOT:
- Use <table>, <div>, <h3>, or class attributes. Allowed tags: h2, p, strong, ul, li, em
- Split a job line into several <strong> tags or several paragraphs
- Group or merge multiple roles at the same company — repeat the company name on each job line
- Use plain <p> for bullets — use <ul><li>
- Invent employers or change dates
- Use first person (I/my)
- Emit <h1> or a contact line (name, email, phone, LinkedIn) — those are added after you write

Return ONLY HTML body. Section headings: <h2>SUMMARY</h2>, <h2>SKILLS</h2>, <h2>EXPERIENCE</h2>, <h2>EDUCATION</h2>
Use SUMMARY, SKILLS, EXPERIENCE, EDUCATION.
Keep any private reasoning short, then emit the resume immediately.${workSummary}`.trim();
}

function truncateJd(text, max = 2800) {
    const t = String(text || '').trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max)}\n…[JD truncated for speed]`;
}

function buildCompactUserPrompt({
    profile,
    jobDescription,
    contactHint,
    coreSkills = '',
    facts = {},
    validationFeedback = '',
    jobRole = '',
    backgroundMaxLen = 12000,
    jdMax = 2800
}) {
    void contactHint;
    const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
    const benchTitle = facts.currentTitle || '';
    const yearsPhrase = formatCandidateYearsPhrase(profile, facts)
        || (facts.totalYears > 0 ? `${facts.totalYears} years` : '');
    const stacks = String(coreSkills || '')
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8);
    const targetJob = String(jobRole || '').trim() || '(infer from JOB DESCRIPTION)';

    const background = buildCandidateBackground(profile, { maxLen: backgroundMaxLen });

    let prompt = `Resume body HTML for ${name || 'Candidate'}. No <h1>. No contact line. Start with <h2>SUMMARY</h2>.

CANDIDATE TOTAL EXPERIENCE: ${yearsPhrase || '(compute from bench work history; then state that number)'}
Copy this years phrase into the Summary opener exactly. Do not invent a different number.

TARGET JOB: ${targetJob}
Write Summary, Skills, and bullets for this target role family — not the bench titles.

MOST RECENT BENCH TITLE (immutable on the job line; do not rename): ${benchTitle || '(see bench profile)'}

Job date lines in the bench profile are authoritative — do not change employers, titles, or dates.
${stacks.length ? `JD must-have stacks (Skills + recent bullets; at most 2 in Summary): ${stacks.join(', ')}` : ''}

MUST PASS
1. Summary is one <p>, 3-4 sentences, ~55-90 words. Opens with CANDIDATE TOTAL EXPERIENCE, then most-recent bench employer + title. Bold employers, 1-2 stacks, and metrics with <strong>.
2. Skills: 4-6 paragraphs, <p><strong>Category:</strong> …</p>. Bold each required stack with its own <strong>.
3. Each role is <p><strong>Role | Company | Location | MM/YYYY - MM/YYYY</strong></p> then <ul><li>. One <strong> around the whole job line. Repeat the company name on every role.
4. Education is two lines: <p><strong>Degree</strong></p> then <p>School | YYYY - YYYY</p>. No tables. No long dashes. No invented employers/dates.

BENCH PROFILE (immutable employers, dates, titles, education):
${background}

JOB DESCRIPTION (tailor ~70%; do not copy the posting or name the JD employer in Summary):
${truncateJd(jobDescription, jdMax)}
`;

    if (stacks.length) {
        prompt += `
Bold these stacks in Skills and Experience (at most 2 of them in Summary): ${stacks.join(', ')}
`;
    }
    if (validationFeedback) {
        prompt += `\nFIX PREVIOUS ISSUES:\n${validationFeedback}\n`;
    }
    prompt += `\nHTML body only. Start with <h2>SUMMARY</h2>. Do not explain. Do not plan.`;
    return prompt.trim();
}

module.exports = {
    buildCompactSystemPrompt,
    buildCompactUserPrompt,
    truncateJd
};
