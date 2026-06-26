// Minimal OpenRouter chat helper (mirrors the call shape in api/search.js).
// Used by the newsletter generator for prose only. Key stays in env.

const DEFAULT_MODEL = 'google/gemini-3.1-flash-lite';

export function hasLLM() {
  return !!process.env.OPENROUTER_API_KEY;
}

// messages: [{role, content}]. Returns the assistant text content (string).
export async function chat({ messages, model, temperature = 0.4, maxTokens = 1200, timeoutMs = 30000 }) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set');
  const useModel = model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        ...(process.env.OPENROUTER_TITLE ? { 'X-Title': process.env.OPENROUTER_TITLE } : { 'X-Title': 'Bangalore Site Newsletter' }),
      },
      body: JSON.stringify({
        model: useModel,
        messages,
        temperature,
        max_tokens: maxTokens,
        provider: { allow_fallbacks: false },
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`OpenRouter ${r.status}: ${t.slice(0, 200)}`);
    }
    const j = await r.json();
    return { text: j?.choices?.[0]?.message?.content || '', model: j?.model || useModel };
  } finally {
    clearTimeout(timer);
  }
}
