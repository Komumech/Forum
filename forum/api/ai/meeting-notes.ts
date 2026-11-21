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

  const { transcript, existingNotes, meetingTitle, formatType, participants, duration } = req.body || {};

  if (!transcript && !existingNotes) {
    return res.status(400).json({ error: 'No transcript or notes content provided yet.' });
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.status(503).json({ error: 'Gemini API key is not configured on this server.' });
  }

  const attendeesList =
    Array.isArray(participants) && participants.length > 0 ? participants.join(', ') : 'Meeting Attendees';
  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const safeTitle = meetingTitle || 'Meeting Session';
  const sourceContent = [
    transcript ? `Spoken Transcript & Chat:\n${transcript}` : '',
    existingNotes ? `Manual Notes:\n${existingNotes}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  let formatInstructions = '';
  if (formatType === 'action_items') {
    formatInstructions = `Extract a clean, specific checklist of Action Items & Decisions from the session:
# Action Items: ${safeTitle}
**Date**: ${dateLabel}
**Attendees**: ${attendeesList}

## Action Items & Owners
- [ ] **[Speaker / Assignee]**: Exact concrete task, deadline or follow-up mentioned

## Key Decisions
- Concrete decisions made, attributed to who proposed/confirmed them`;
  } else if (formatType === 'summary') {
    formatInstructions = `Generate a crisp executive summary in Markdown:
# Meeting Summary: ${safeTitle}
**Date**: ${dateLabel}
**Attendees**: ${attendeesList}

## Executive Overview
(2-4 clear sentences summarizing the goal and outcome of the meeting)

## Key Points by Speaker
- **Speaker Name**: Specific points, updates, or ideas they shared

## Decisions & Next Steps
- [ ] **Owner**: Clear next steps or deliverables`;
  } else {
    formatInstructions = `Generate comprehensive, cleanly formatted AI Meeting Notes in Markdown preserving exact speaker attribution:
# AI Meeting Notes: ${safeTitle}
**Date**: ${dateLabel}
**Attendees**: ${attendeesList}

## Executive Overview
(Concise summary of the discussion and primary outcomes)

## Discussion Breakdown (Speaker Highlights)
- **Speaker Name**: Detailed summary of what they said and raised

## Key Decisions
- Explicit alignments or conclusions reached

## Action Items
- [ ] **Owner**: Specific deliverable or follow-up task

## Notable Context & Open Questions
- Any unresolved topics, links, or notes`;
  }

  try {
    const prompt = `You are an expert executive meeting assistant. Transform the following real meeting conversation into clean, accurate, well-structured GitHub-flavored Markdown. Only report facts, topics, quotes, and tasks present in the source content — attribute points accurately to the named speakers.

Meeting Title: ${safeTitle}
Attendees: ${attendeesList}
${duration ? `Duration: ${duration}` : ''}

"""
${sourceContent}
"""

Required Format:
${formatInstructions}

Return ONLY the formatted Markdown document without extra preamble or code fences.`;

    const outputText = await generateWithResilience(ai, prompt, 2400);
    if (!outputText) {
      return res.status(502).json({ error: 'Gemini returned an empty notes response.' });
    }

    return res.status(200).json({
      status: 'success',
      source: 'gemini',
      notes: outputText,
      summary: outputText,
      result: outputText,
    });
  } catch (err) {
    const { status, message } = extractGeminiError(err, 'Failed to generate AI meeting notes');
    console.warn('[api/ai/meeting-notes] Gemini error:', message);
    return res.status(status).json({ error: message });
  }
}
