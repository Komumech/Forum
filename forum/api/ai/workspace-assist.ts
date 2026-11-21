import { extractGeminiError, generateWithResilience, getGeminiClient } from './_gemini';

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

  const { content, instruction, action, fileName } = req.body || {};
  if (!content && !instruction) {
    return res.status(400).json({ error: 'Missing content or prompt' });
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.status(503).json({ error: 'Gemini API key is not configured on this server.' });
  }

  try {
    let taskPrompt = '';
    switch (action) {
      case 'improve':
        taskPrompt =
          'Improve the clarity, precision, and professional tone of this text. Keep the core meaning intact while making it clean, succinct, and natural:';
        break;
      case 'fix':
        taskPrompt =
          'Fix all grammar, spelling, punctuation, and syntax errors in this text while preserving the original structure:';
        break;
      case 'summarize':
        taskPrompt = 'Summarize the key points in this document concisely using structured bullet points:';
        break;
      case 'format':
        taskPrompt =
          'Clean up and format this content neatly with clean headers, bullet points, or code blocks where appropriate:';
        break;
      default:
        taskPrompt = instruction ? `Perform the following editing task: ${instruction}` : 'Improve and polish this text:';
    }

    const fullPrompt = `${taskPrompt}
File: ${fileName || 'document.txt'}

Content to process:
\`\`\`
${content || ''}
\`\`\`

Return ONLY the processed text replacement without introductory greetings or meta-commentary.`;

    const resultText = await generateWithResilience(ai, fullPrompt, 2048);
    return res.status(200).json({
      status: 'success',
      source: 'gemini',
      result: resultText,
    });
  } catch (err) {
    const { status, message } = extractGeminiError(err, 'Workspace assist failed');
    console.warn('[api/ai/workspace-assist] Gemini error:', message);
    return res.status(status).json({ error: message });
  }
}
