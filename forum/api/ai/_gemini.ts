import { GoogleGenAI, ThinkingLevel } from '@google/genai';

let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

export function extractGeminiError(err: unknown, fallbackMessage: string): { status: number; message: string } {
  let msg = String((err as any)?.message || err || fallbackMessage);
  try {
    const parsed = JSON.parse(msg);
    if (parsed?.error?.message) {
      msg = parsed.error.message;
    }
  } catch {}

  const lower = msg.toLowerCase();
  const isRateLimit =
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    lower.includes('quota') ||
    lower.includes('rate limit');

  return {
    status: isRateLimit ? 429 : 502,
    message: msg || fallbackMessage,
  };
}

export async function generateWithResilience(
  ai: GoogleGenAI,
  promptText: string,
  maxOutputTokens = 2400
): Promise<string> {
  const attemptModel = async (modelId: string, useLowThinking: boolean) => {
    const resp = await ai.models.generateContent({
      model: modelId,
      contents: promptText,
      config: {
        maxOutputTokens,
        ...(useLowThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
      },
    });
    return resp.text?.trim() || '';
  };

  const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), ms)),
    ]);

  const shouldFailover = (err: unknown) => {
    const raw = String((err as any)?.message || err || '');
    return (
      raw.includes('_TIMEOUT') ||
      raw.includes('503') ||
      raw.includes('UNAVAILABLE') ||
      raw.toLowerCase().includes('high demand') ||
      raw.toLowerCase().includes('temporarily unavailable')
    );
  };

  try {
    return await withTimeout(attemptModel('gemini-4-hydrogen', true), 7000, 'PRIMARY');
  } catch (firstErr) {
    if (shouldFailover(firstErr)) {
      await new Promise((r) => setTimeout(r, 250));
      return await withTimeout(attemptModel('gemini-3.1-flash-lite', false), 10000, 'FALLBACK');
    }
    throw firstErr;
  }
}
