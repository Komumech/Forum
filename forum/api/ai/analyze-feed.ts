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

  const { imageBase64 } = req.body || {};
  if (!imageBase64) {
    return res.status(400).json({ error: 'Missing imageBase64 snapshot' });
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.status(503).json({ error: 'Gemini API key is not configured on this server.' });
  }

  try {
    const base64Data = String(imageBase64).replace(/^data:image\/[a-zA-Z]+;base64,/, '');

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data,
            },
          },
          {
            text: `You are an expert computational photography engineer and video colorist analyzing this webcam feed snapshot in real-time.
Evaluate the lighting and complexion conditions:
1. Is the scene underexposed / dark, overexposed, backlit (bright background, dim face), or normal?
2. Does the scene have a warm/yellow tungsten bulb cast, cool blue fluorescent shadow, or natural daylight?
3. What are the optimal color correction values?

Respond ONLY with valid JSON in this exact structure without markdown fences:
{
  "sceneCondition": "lowlight" | "backlit" | "normal" | "overexposed" | "warm_cast" | "cool_cast",
  "brightness": number between 90 and 135,
  "contrast": number between 95 and 125,
  "saturation": number between 100 and 125,
  "warmth": number between -15 and 15,
  "shadowLift": number between 0 and 35,
  "skinSmoothing": number between 0 and 100,
  "diagnosis": "Short 1-sentence explanation of detected lighting and what was adjusted"
}`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
      },
    });

    const textOutput = response.text?.trim() || '';
    const parsed = JSON.parse(textOutput);
    return res.status(200).json({
      status: 'success',
      source: 'gemini',
      enhancements: parsed,
    });
  } catch (err) {
    const { status, message } = extractGeminiError(err, 'Failed to analyze frame');
    console.warn('[api/ai/analyze-feed] Gemini error:', message);
    return res.status(status).json({ error: message });
  }
}
