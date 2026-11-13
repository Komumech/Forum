import fs from 'fs';
import path from 'path';

const FIREBASE_PROJECT_ID = 'forum-8f34e';
const FIRESTORE_DB_ID = '(default)';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DB_ID}/documents`;

export interface InviteMeetingMeta {
  roomId: string;
  title: string;
  hostName: string;
  description: string;
  coverImage: string;
  startTimeIso: string;
  acceptedCount: number;
}

function readFsString(field: any): string {
  if (!field || typeof field !== 'object') return '';
  if (typeof field.stringValue === 'string') return field.stringValue;
  return '';
}

function readFsTimestamp(field: any): string {
  if (!field || typeof field !== 'object') return '';
  if (typeof field.timestampValue === 'string') return field.timestampValue;
  return '';
}

function readFsArrayCount(field: any): number {
  const vals = field?.arrayValue?.values;
  return Array.isArray(vals) ? vals.length : 0;
}

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeDocFields(docJson: any, roomId: string): InviteMeetingMeta {
  const f = docJson?.fields || {};
  const acceptedCount = readFsArrayCount(f.acceptedUids) || readFsArrayCount(f.participants);
  return {
    roomId,
    title: readFsString(f.title) || `Forum Meeting`,
    hostName: readFsString(f.hostName) || 'Forum Host',
    description: readFsString(f.description) || 'Join this Forum video meeting and add it directly to your calendar.',
    coverImage: readFsString(f.coverImage) || '',
    startTimeIso: readFsTimestamp(f.startTime),
    acceptedCount,
  };
}

export async function fetchMeetingForInvite(roomId: string): Promise<InviteMeetingMeta> {
  const cleanId = String(roomId || '').trim();
  const fallback: InviteMeetingMeta = {
    roomId: cleanId,
    title: 'Forum Meeting Invite',
    hostName: 'Forum Host',
    description: 'Open link to add this meeting automatically to your Forum Calendar and join the call.',
    coverImage: '',
    startTimeIso: '',
    acceptedCount: 0,
  };
  if (!cleanId) return fallback;

  try {
    const resp = await fetch(`${FIRESTORE_BASE}/meetings/${encodeURIComponent(cleanId)}`, {
      signal: AbortSignal.timeout(4500),
    });
    if (resp.ok) {
      const json = await resp.json();
      return decodeDocFields(json, cleanId);
    }
  } catch {}

  try {
    const queryResp = await fetch(`${FIRESTORE_BASE}:runQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(4500),
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'meetings' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'roomId' },
              op: 'EQUAL',
              value: { stringValue: cleanId },
            },
          },
          limit: 1,
        },
      }),
    });
    if (queryResp.ok) {
      const rows = (await queryResp.json()) as any[];
      const docMatch = rows?.find((r) => r?.document?.fields);
      if (docMatch?.document) {
        return decodeDocFields(docMatch.document, cleanId);
      }
    }
  } catch {}

  try {
    const roomResp = await fetch(`${FIRESTORE_BASE}/rooms/${encodeURIComponent(cleanId)}`, {
      signal: AbortSignal.timeout(3500),
    });
    if (roomResp.ok) {
      const json = await roomResp.json();
      const f = json?.fields || {};
      return {
        ...fallback,
        title: readFsString(f.title) || fallback.title,
        hostName: readFsString(f.hostName) || fallback.hostName,
      };
    }
  } catch {}

  return fallback;
}

async function loadCoverImageBuffer(coverImage: string): Promise<Buffer | null> {
  if (!coverImage) return null;
  if (coverImage.startsWith('data:image/')) {
    const commaIdx = coverImage.indexOf(',');
    if (commaIdx === -1) return null;
    const base64Part = coverImage.slice(commaIdx + 1);
    return Buffer.from(base64Part, 'base64');
  }
  if (/^https?:\/\//i.test(coverImage)) {
    try {
      const r = await fetch(coverImage, { signal: AbortSignal.timeout(4500) });
      if (!r.ok) return null;
      const arr = await r.arrayBuffer();
      return Buffer.from(arr);
    } catch {
      return null;
    }
  }
  return null;
}

function loadForumLogoBuffer(): Buffer | null {
  const candidates = [
    path.join(process.cwd(), 'public', 'forum-logo.png'),
    path.join(process.cwd(), 'dist', 'forum-logo.png'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p);
      }
    } catch {}
  }
  return null;
}

export async function renderInviteOgPng(roomId: string): Promise<Buffer> {
  const { default: sharp } = await import('sharp');
  const width = 1200;
  const height = 630;
  const meta = await fetchMeetingForInvite(roomId);
  const coverBuf = await loadCoverImageBuffer(meta.coverImage);
  const rawLogo = loadForumLogoBuffer();
  const logoBadgeImg = rawLogo
    ? await sharp(rawLogo).resize(44, 44, { fit: 'contain' }).png().toBuffer()
    : null;

  // Bottom-right Forum watermark badge card
  const badgeW = 176;
  const badgeH = 68;
  const badgeSvg = Buffer.from(`
    <svg width="${badgeW}" height="${badgeH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${badgeW}" height="${badgeH}" rx="18" fill="#ffffff" fill-opacity="0.95" />
      <rect x="0.75" y="0.75" width="${badgeW - 1.5}" height="${badgeH - 1.5}" rx="17.25" fill="none" stroke="#0f172a" stroke-opacity="0.08" stroke-width="1.5" />
      <text x="78" y="42" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="25" font-weight="600" fill="#0f172a">Forum</text>
    </svg>
  `);

  const badgeX = width - badgeW - 32;
  const badgeY = height - badgeH - 28;

  if (coverBuf) {
    try {
      const subtleScrimSvg = Buffer.from(`
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="btm" x1="0" y1="0.55" x2="0" y2="1">
              <stop offset="0%" stop-color="#0f172a" stop-opacity="0" />
              <stop offset="100%" stop-color="#0f172a" stop-opacity="0.52" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="${width}" height="${height}" fill="url(#btm)" />
        </svg>
      `);

      const layers: Array<{ input: Buffer; top: number; left: number }> = [
        { input: subtleScrimSvg, top: 0, left: 0 },
        { input: badgeSvg, top: badgeY, left: badgeX },
      ];
      if (logoBadgeImg) {
        layers.push({ input: logoBadgeImg, top: badgeY + 12, left: badgeX + 18 });
      }

      return await sharp(coverBuf)
        .resize(width, height, { fit: 'cover', position: 'center' })
        .composite(layers)
        .jpeg({ quality: 86, progressive: true })
        .toBuffer();
    } catch {
      // Fall through to studio fallback card if user-provided cover buffer could not be decoded
    }
  }

  // Clean minimalist fallback card when meeting has no custom cover image
  const safeTitle = escapeXml(
    meta.title.length > 44 ? `${meta.title.slice(0, 43)}…` : meta.title
  );
  const safeHost = escapeXml(`Hosted by ${meta.hostName}`);
  const formattedTime = meta.startTimeIso
    ? escapeXml(
        new Date(meta.startTimeIso).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      )
    : `Room ${escapeXml(meta.roomId)}`;

  const cardSvg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#1e293b" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)" />
      <text x="72" y="180" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="500" fill="#94a3b8" letter-spacing="2">FORUM MEETING INVITE</text>
      <text x="72" y="275" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="56" font-weight="600" fill="#f8fafc">${safeTitle}</text>
      <text x="72" y="345" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="400" fill="#cbd5e1">${safeHost}  ·  ${formattedTime}</text>
    </svg>
  `);

  const layers: Array<{ input: Buffer; top: number; left: number }> = [
    { input: badgeSvg, top: badgeY, left: badgeX },
  ];
  if (logoBadgeImg) {
    layers.push({ input: logoBadgeImg, top: badgeY + 12, left: badgeX + 18 });
  }

  return await sharp(cardSvg)
    .composite(layers)
    .jpeg({ quality: 88, progressive: true })
    .toBuffer();
}

export function injectInviteMetaHtml(
  html: string,
  origin: string,
  roomId: string,
  meta: InviteMeetingMeta
): string {
  const titleText = `${meta.title} · Forum Invite`;
  const descText =
    meta.description ||
    `${meta.hostName} invited you to join ${meta.title}. Open to add automatically to your Forum Calendar.`;
  const ogImageUrl = `${origin}/api/invite-og?id=${encodeURIComponent(roomId)}&v=${encodeURIComponent(
    String(meta.coverImage ? meta.coverImage.length : meta.title.length)
  )}`;
  const inviteUrl = `${origin}/invite/${encodeURIComponent(roomId)}`;

  const escapedTitle = escapeXml(titleText);
  const escapedDesc = escapeXml(descText);
  const escapedImg = escapeXml(ogImageUrl);
  const escapedUrl = escapeXml(inviteUrl);

  let updated = html
    .replace(/<title>.*?<\/title>/is, `<title>${escapedTitle}</title>`)
    .replace(
      /<meta\s+name=["']description["'][^>]*>/is,
      `<meta name="description" content="${escapedDesc}" />`
    )
    .replace(
      /<meta\s+property=["']og:title["'][^>]*>/is,
      `<meta property="og:title" content="${escapedTitle}" />`
    )
    .replace(
      /<meta\s+property=["']og:description["'][^>]*>/is,
      `<meta property="og:description" content="${escapedDesc}" />`
    );

  const extraMetaTags = `
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapedUrl}" />
    <meta property="og:image" content="${escapedImg}" />
    <meta property="og:image:secure_url" content="${escapedImg}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapedTitle}" />
    <meta name="twitter:description" content="${escapedDesc}" />
    <meta name="twitter:image" content="${escapedImg}" />`;

  return updated.replace('</head>', `${extraMetaTags}\n  </head>`);
}
