export type GroqQuestion = {
  id: string;
  label: string;
  options?: string[];
};

type GroqContext = {
  candidate: string;
  years: string;
  city: string;
  summary: string;
  experience: string;
  education: string;
  locked: string;
  company: string;
  title: string;
  job: string;
};

function groqKeys() {
  const keys: string[] = [];
  const add = (value?: string) => {
    const key = String(value || "").trim();
    if (key && !keys.includes(key) && !/your-|example|placeholder|changeme/i.test(key)) keys.push(key);
  };
  add(process.env.GROQ_API_KEY);
  for (let i = 1; i <= 20; i += 1) add(process.env[`GROQ_API_KEY_${i}`]);
  return keys;
}

export async function chatJson<T>(system: string, user: string, timeoutMs = 40000): Promise<T | null> {
  const keys = groqKeys();
  for (const key of keys) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
          temperature: 0.3,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: controller.signal,
      });
      if (response.status === 429 || response.status === 401 || response.status === 403) continue;
      if (!response.ok) continue;
      const json = await response.json();
      const text = json.choices?.[0]?.message?.content || "";
      if (!text) continue;
      return JSON.parse(text) as T;
    } catch {
      continue;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function snapToOption(answer: string, options: string[]) {
  if (!options.length) return answer.trim();
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const wanted = norm(answer);
  const hit = options.find((option) => {
    const text = norm(option);
    return text === wanted || text.includes(wanted) || (wanted && wanted.includes(text));
  });
  return hit || "";
}

export async function askGroq(context: GroqContext, questions: GroqQuestion[]) {
  if (!questions.length) return [] as Array<{ id: string; answer: string }>;
  const keys = groqKeys();
  if (!keys.length) return [];

  const body = {
    model: "llama-3.3-70b-versatile",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You fill job-application questions. Reply with JSON {\"answers\":[{\"id\":\"\",\"answer\":\"\"}]}. Use only facts in the profile and locked facts. Never invent employers, schools, degrees, or years. If a question matches a locked fact, copy that fact. If options are given, answer with one option exactly. Yes/no stays Yes or No. Written answers are 1-3 sentences in first person.",
      },
      {
        role: "user",
        content: JSON.stringify({
          ...context,
          questions: questions.map((question) => ({
            id: question.id,
            question: question.label,
            options: question.options?.slice(0, 12) || [],
          })),
        }),
      },
    ],
  };

  let lastError = "Groq did not answer";
  for (const key of keys) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (response.status === 429 || response.status === 401 || response.status === 403) {
        lastError = `Groq key skipped (${response.status})`;
        continue;
      }
      if (!response.ok) {
        lastError = `Groq error ${response.status}`;
        continue;
      }
      const json = await response.json();
      const text = json.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(text) as { answers?: Array<{ id: string; answer: string }> };
      const byId = new Map(questions.map((question) => [question.id, question]));
      return (parsed.answers || [])
        .map((row) => {
          const question = byId.get(String(row.id));
          if (!question || !row.answer) return null;
          const answer = question.options?.length ? snapToOption(row.answer, question.options) : String(row.answer).trim();
          return answer ? { id: question.id, answer } : null;
        })
        .filter((row): row is { id: string; answer: string } => !!row);
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastError) return [];
  return [];
}

export async function draftScreeningAnswers(input: {
  company: string;
  title: string;
  description: string;
  profile: { firstName: string; lastName: string; yearsOfExperience?: string | null; resumePrompt?: string | null };
  questions: Array<{ key: string; label: string }>;
}) {
  const answers = await askGroq(
    {
      candidate: `${input.profile.firstName} ${input.profile.lastName}`,
      years: input.profile.yearsOfExperience || "",
      city: "",
      summary: (input.profile.resumePrompt || "").slice(0, 500),
      experience: "",
      education: "",
      locked: "",
      company: input.company,
      title: input.title,
      job: String(input.description || "").slice(0, 1200),
    },
    input.questions.map((question) => ({ id: question.key, label: question.label })),
  );
  return answers.map((row) => ({ key: row.id, answer: row.answer }));
}
