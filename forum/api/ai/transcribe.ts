import { extractGeminiError, getGeminiClient } from './_gemini';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { audioBase64, mimeType, language } = req.body || {};
  if (!audioBase64 || typeof audioBase64 !== 'string') {
    return res.status(400).json({ error: 'Missing audioBase64 payload' });
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.status(503).json({ error: 'Gemini API key is not configured on this server.' });
  }

  try {
    const cleanBase64 = audioBase64.replace(/^data:audio\/[a-zA-Z0-9.+-]+;base64,/, '');
    const safeMime = typeof mimeType === 'string' && mimeType.startsWith('audio/')
      ? mimeType.split(';')[0]
      : 'audio/webm';

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: [
        {
          text: `Transcribe any clear human speech in this short audio clip verbatim${
            language ? ` (spoken language hint: ${language})` : ''
          }. If the clip contains only silence, breathing, tapping, or background noise with no clear spoken words, return an empty string "". Return ONLY the raw spoken words with normal punctuation and no brackets or labels.`,
        },
        {
          inlineData: {
            mimeType: safeMime,
            data: cleanBase64,
          },
        },
      ],
      config: {
        maxOutputTokens: 512,
      },
    });

    const raw = (response.text || '').trim();
    const normalized = raw
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^\[.*\]$/g, '')
      .trim();

    if (
      !normalized ||
      /^(no speech|silence|inaudible|background noise|none|empty|\.\.\.)$/i.test(normalized)
    ) {
      return res.status(200).json({ status: 'ok', text: '' });
    }

    return res.status(200).json({ status: 'ok', text: normalized });
  } catch (err) {
    const { status, message } = extractGeminiError(err, 'Silent transcription failed');
    console.warn('[api/ai/transcribe] Gemini error:', message);
    return res.status(status).json({ error: message });
  }
}
