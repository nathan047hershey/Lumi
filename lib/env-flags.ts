function filled(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return false;
  return !/your-|example|replace-with|changeme|placeholder/i.test(text);
}

export function envFlag(name: string) {
  return filled(process.env[name]);
}

export function groqKeyCount() {
  let count = 0;
  if (envFlag("GROQ_API_KEY")) count += 1;
  for (let i = 1; i <= 20; i += 1) {
    if (envFlag(`GROQ_API_KEY_${i}`)) count += 1;
  }
  return count;
}

export function configuredSecrets() {
  return {
    jwt: envFlag("JWT_SECRET"),
    groq: groqKeyCount(),
    minimax: envFlag("MINIMAX_API_KEY") || envFlag("MINIMAX_API_KEY_2"),
    deepseek: envFlag("DEEPSEEK_API_KEY"),
    outlook: envFlag("OUTLOOK_CLIENT_ID"),
  };
}
