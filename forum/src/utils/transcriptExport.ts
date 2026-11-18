export interface TranscriptExportTurn {
  speaker: string;
  timeLabel?: string;
  text: string;
}

export interface DownloadTranscriptOptions {
  title: string;
  roomId?: string;
  dateText?: string;
  participants?: string[];
  turns?: TranscriptExportTurn[];
  rawBody?: string;
  fileNameBase?: string;
}

function escapeHtml(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanPlainLine(raw: string): string {
  return raw
    .replace(/^#{1,6}\s*/, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .trim();
}

export function parseMarkdownTranscriptToTurns(rawBody: string): {
  metaDate?: string;
  metaRoom?: string;
  turns: TranscriptExportTurn[];
} {
  const lines = String(rawBody || '').split(/\r?\n/);
  const turns: TranscriptExportTurn[] = [];
  let metaDate: string | undefined;
  let metaRoom: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('# ')) continue;
    if (/^##\s+Live Transcript$/i.test(line)) continue;

    const dateMatch = line.match(/^\*\*Date:\*\*\s*(.+)$/i);
    if (dateMatch) {
      metaDate = dateMatch[1].trim();
      continue;
    }
    const roomMatch = line.match(/^\*\*Room:\*\*\s*(.+)$/i);
    if (roomMatch) {
      metaRoom = roomMatch[1].trim();
      continue;
    }

    // Match **[12:29] Speaker:** message  OR  [12:29] Speaker: message
    const mdSpeakerMatch = line.match(/^\*\*\[([^\]]+)\]\s+(.+?):\*\*\s*(.*)$/);
    if (mdSpeakerMatch) {
      turns.push({
        timeLabel: mdSpeakerMatch[1].trim(),
        speaker: mdSpeakerMatch[2].trim(),
        text: mdSpeakerMatch[3].trim(),
      });
      continue;
    }

    const plainSpeakerMatch = line.match(/^\[([^\]]+)\]\s+([^:]+):\s*(.*)$/);
    if (plainSpeakerMatch) {
      turns.push({
        timeLabel: plainSpeakerMatch[1].trim(),
        speaker: plainSpeakerMatch[2].trim(),
        text: plainSpeakerMatch[3].trim(),
      });
      continue;
    }

    const clean = cleanPlainLine(line);
    if (!clean) continue;
    if (turns.length > 0) {
      turns[turns.length - 1] = {
        ...turns[turns.length - 1],
        text: `${turns[turns.length - 1].text} ${clean}`.trim(),
      };
    } else {
      turns.push({
        speaker: 'Note',
        text: clean,
      });
    }
  }

  return { metaDate, metaRoom, turns };
}

export function buildStyledTranscriptHtml(opts: DownloadTranscriptOptions): string {
  const parsed = opts.rawBody ? parseMarkdownTranscriptToTurns(opts.rawBody) : { turns: [] };
  const turns = opts.turns && opts.turns.length > 0 ? opts.turns : parsed.turns;
  const displayTitle = (opts.title || 'Meeting Transcript').replace(/^Meeting Transcript:\s*/i, '').trim() || 'Meeting Transcript';
  const dateDisplay = opts.dateText || parsed.metaDate || new Date().toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const roomDisplay = opts.roomId || parsed.metaRoom || '';

  const speakerNames = Array.from(
    new Set(
      [
        ...(opts.participants || []),
        ...turns.map((t) => t.speaker).filter((s) => s && s !== 'Note'),
      ].filter(Boolean)
    )
  );

  const turnsHtml =
    turns.length > 0
      ? turns
          .map((turn, idx) => {
            const initials = turn.speaker
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w.charAt(0).toUpperCase())
              .join('') || 'P';
            const paragraphs = turn.text
              .split(/\n+/)
              .filter(Boolean)
              .map((p) => `<p class="turn-text">${escapeHtml(p)}</p>`)
              .join('');

            return `<article class="turn-card" data-turn="${idx + 1}">
  <div class="turn-head">
    <div class="speaker-wrap">
      <span class="avatar" aria-hidden="true">${escapeHtml(initials)}</span>
      <span class="speaker-name">${escapeHtml(turn.speaker)}</span>
    </div>
    ${turn.timeLabel ? `<time class="turn-time">${escapeHtml(turn.timeLabel)}</time>` : ''}
  </div>
  <div class="turn-body">
    ${paragraphs || '<p class="turn-text muted">—</p>'}
  </div>
</article>`;
          })
          .join('\n')
      : `<div class="empty-state">No spoken transcript entries were recorded for this session.</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(displayTitle)} — Meeting Transcript</title>
  <style>
    :root {
      --bg: #f7f7f5;
      --paper: #ffffff;
      --ink: #0f172a;
      --muted: #64748b;
      --subtle: #94a3b8;
      --line: #e5e5e3;
      --surface: #fafaf8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 36px 18px 64px;
      background: var(--bg);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
      line-height: 1.65;
    }
    .sheet {
      max-width: 780px;
      margin: 0 auto;
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 16px;
      overflow: hidden;
    }
    .doc-header {
      padding: 32px 36px 26px;
      border-bottom: 1px solid var(--line);
      background: var(--paper);
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 20px;
    }
    .brand {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .print-btn {
      appearance: none;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      font-size: 12px;
      font-weight: 500;
      padding: 7px 14px;
      border-radius: 8px;
      cursor: pointer;
    }
    .print-btn:hover {
      background: #f1f1ee;
    }
    h1 {
      margin: 0 0 14px;
      font-size: 26px;
      font-weight: 500;
      letter-spacing: -0.02em;
      line-height: 1.25;
      color: var(--ink);
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 12px 20px;
      padding-top: 14px;
      border-top: 1px solid var(--line);
    }
    .meta-item {
      min-width: 0;
    }
    .meta-label {
      display: block;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--subtle);
      margin-bottom: 2px;
    }
    .meta-value {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: var(--ink);
      word-break: break-word;
    }
    .turns {
      padding: 12px 36px 32px;
    }
    .turn-card {
      padding: 20px 0;
      border-bottom: 1px solid #f0f0ed;
    }
    .turn-card:last-child {
      border-bottom: none;
    }
    .turn-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
    }
    .speaker-wrap {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .avatar {
      width: 26px;
      height: 26px;
      border-radius: 7px;
      background: #f1f5f9;
      border: 1px solid var(--line);
      color: #334155;
      font-size: 11px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .speaker-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--ink);
    }
    .turn-time {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      color: var(--subtle);
      white-space: nowrap;
    }
    .turn-body {
      padding-left: 36px;
    }
    .turn-text {
      margin: 0 0 8px;
      font-size: 14.5px;
      line-height: 1.7;
      color: #1e293b;
    }
    .turn-text:last-child {
      margin-bottom: 0;
    }
    .empty-state {
      padding: 36px 0;
      text-align: center;
      font-size: 14px;
      color: var(--muted);
    }
    .doc-footer {
      padding: 16px 36px;
      background: var(--surface);
      border-top: 1px solid var(--line);
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 8px;
      font-size: 11.5px;
      color: var(--muted);
    }
    @media (max-width: 600px) {
      body { padding: 14px 10px 40px; }
      .doc-header { padding: 22px 20px 18px; }
      h1 { font-size: 21px; }
      .turns { padding: 8px 20px 22px; }
      .turn-body { padding-left: 0; }
      .doc-footer { padding: 14px 20px; }
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .sheet { border: none; border-radius: 0; max-width: 100%; }
      .print-btn { display: none; }
      .turn-card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <header class="doc-header">
      <div class="topbar">
        <span class="brand">Komu · Meeting Transcript</span>
        <button class="print-btn" type="button" onclick="window.print()">Print / Save PDF</button>
      </div>
      <h1>${escapeHtml(displayTitle)}</h1>
      <div class="meta-grid">
        <div class="meta-item">
          <span class="meta-label">Date &amp; Time</span>
          <span class="meta-value">${escapeHtml(dateDisplay)}</span>
        </div>
        ${roomDisplay ? `<div class="meta-item">
          <span class="meta-label">Room ID</span>
          <span class="meta-value">${escapeHtml(roomDisplay)}</span>
        </div>` : ''}
        <div class="meta-item">
          <span class="meta-label">Speakers</span>
          <span class="meta-value">${escapeHtml(speakerNames.length > 0 ? speakerNames.join(', ') : 'Meeting Attendees')}</span>
        </div>
      </div>
    </header>
    <section class="turns">
      ${turnsHtml}
    </section>
    <footer class="doc-footer">
      <span>${turns.length} speaker ${turns.length === 1 ? 'entry' : 'entries'}</span>
      <span>Komu Video Conferencing</span>
    </footer>
  </main>
</body>
</html>`;
}

export function downloadStyledTranscript(opts: DownloadTranscriptOptions): void {
  const html = buildStyledTranscriptHtml(opts);
  const safeBase = (opts.fileNameBase || opts.title || opts.roomId || 'meeting-transcript')
    .replace(/^Meeting Transcript:\s*/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56) || 'meeting-transcript';

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Komu-${safeBase}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
