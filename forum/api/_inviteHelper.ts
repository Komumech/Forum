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
  const hostName = readFsString(f.hostName) || 'Forum Host';
  const title = readFsString(f.title) || 'Forum Meeting';
  return {
    roomId,
    title,
    hostName,
    description:
      readFsString(f.description) ||
      `Hosted by ${hostName}. Join this Forum meeting and add it directly to your calendar.`,
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
        coverImage: readFsString(f.coverImage) || fallback.coverImage,
      };
    }
  } catch {}

  return fallback;
}

export async function resolveInvitePreviewImage(
  roomId: string,
  origin: string
): Promise<{ buffer: Buffer; contentType: string }> {
  const meta = await fetchMeetingForInvite(roomId);
  const coverImage = String(meta.coverImage || '').trim();

  if (coverImage.startsWith('data:image/')) {
    const match = coverImage.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
    if (match) {
      const contentType = match[1].toLowerCase();
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > 0) {
        return { buffer, contentType };
      }
    }
  }

  if (/^https?:\/\//i.test(coverImage)) {
    try {
      const r = await fetch(coverImage, { signal: AbortSignal.timeout(4500) });
      if (r.ok) {
        const arr = await r.arrayBuffer();
        const buffer = Buffer.from(arr);
        const contentType = r.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
        if (buffer.length > 0 && contentType.startsWith('image/')) {
          return { buffer, contentType };
        }
      }
    } catch {}
  }

  const logoCandidates = [
    path.join(process.cwd(), 'public', 'forum-logo.png'),
    path.join(process.cwd(), 'dist', 'forum-logo.png'),
  ];
  for (const p of logoCandidates) {
    try {
      if (fs.existsSync(p)) {
        return { buffer: fs.readFileSync(p), contentType: 'image/png' };
      }
    } catch {}
  }

  const fallbackResp = await fetch(`${origin}/forum-logo.png`, {
    signal: AbortSignal.timeout(3500),
  });
  const arr = await fallbackResp.arrayBuffer();
  return { buffer: Buffer.from(arr), contentType: 'image/png' };
}

export async function renderInviteOgPng(roomId: string, origin = 'https://komu-forum.vercel.app'): Promise<Buffer> {
  const { buffer } = await resolveInvitePreviewImage(roomId, origin);
  return buffer;
}

export function injectInviteMetaHtml(
  html: string,
  origin: string,
  roomId: string,
  meta: InviteMeetingMeta
): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const titleText = `${meta.title} · Komu Forum`;
  const descText =
    meta.description ||
    `${meta.hostName} invited you to join ${meta.title}. Open to add automatically to your Forum Calendar.`;
  const hasCover = Boolean(meta.coverImage && meta.coverImage.trim().length > 0);
  const coverHash = meta.coverImage ? `${meta.coverImage.length}-${meta.coverImage.slice(-12).replace(/[^a-zA-Z0-9]/g, '')}` : 'logo';
  const ogImageUrl = hasCover
    ? `${cleanOrigin}/api/invite-og?id=${encodeURIComponent(roomId)}&v=${encodeURIComponent(coverHash)}`
    : `${cleanOrigin}/forum-logo.png`;
  const inviteUrl = `${cleanOrigin}/invite/${encodeURIComponent(roomId)}`;

  const escapedTitle = escapeXml(titleText);
  const escapedDesc = escapeXml(descText);
  const escapedImg = escapeXml(ogImageUrl);
  const escapedUrl = escapeXml(inviteUrl);

  // Strip any existing title, canonical, description, og:*, and twitter:* tags so crawlers never read stale root tags
  const cleaned = html
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, '');

  const inviteMetaTags = `
    <title>${escapedTitle}</title>
    <meta name="description" content="${escapedDesc}" />
    <link rel="canonical" href="${escapedUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Komu Forum" />
    <meta property="og:url" content="${escapedUrl}" />
    <meta property="og:title" content="${escapedTitle}" />
    <meta property="og:description" content="${escapedDesc}" />
    <meta property="og:image" content="${escapedImg}" />
    <meta property="og:image:secure_url" content="${escapedImg}" />
    ${hasCover ? '' : '<meta property="og:image:width" content="327" />\n    <meta property="og:image:height" content="327" />\n    <meta property="og:image:type" content="image/png" />'}
    <meta name="twitter:card" content="${hasCover ? 'summary_large_image' : 'summary'}" />
    <meta name="twitter:url" content="${escapedUrl}" />
    <meta name="twitter:title" content="${escapedTitle}" />
    <meta name="twitter:description" content="${escapedDesc}" />
    <meta name="twitter:image" content="${escapedImg}" />`;

  return cleaned.replace('</head>', `${inviteMetaTags}\n  </head>`);
}
