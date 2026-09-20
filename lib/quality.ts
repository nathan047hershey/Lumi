export function scoreResume(markdown: string, jobDescription = "") {
  const text = markdown || "";
  const checks = [
    { label: "Has name heading", pass: /^#\s+\S+/m.test(text) },
    { label: "Has experience", pass: /experience/i.test(text) },
    { label: "Has education", pass: /education/i.test(text) },
    { label: "Long enough", pass: text.length > 400 },
    { label: "Mentions the company or role words", pass: jobDescription.split(/\s+/).slice(0, 12).some((w) => w.length > 4 && text.toLowerCase().includes(w.toLowerCase())) },
    { label: "Contact line present", pass: /@|linkedin|github|\+?\d{3}/i.test(text) },
  ];
  const passed = checks.filter((c) => c.pass).length;
  const score = Math.round((passed / checks.length) * 100);
  return { score, checks };
}
