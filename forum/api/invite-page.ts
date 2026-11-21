import fs from 'fs';
import path from 'path';

const FIREBASE_PROJECT_ID = 'forum-8f34e';
const FIRESTORE_DB_ID = '(default)';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DB_ID}/documents`;

interface InviteMeta {
  roomId: string;
  title: string;
  hostName: string;
  description: string;
  coverImage: string;
}

function readFsString(field: any): string {
  if (!field || typeof field !== 'object') return '';
  return typeof field.stringValue === 'string' ? field.stringValue : '';
}

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeDocFields(docJson: any, roomId: string): InviteMeta {
  const f = docJson?.fields || {};
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
  };
}

async function fetchMeetingForInvite(roomId: string): Promise<InviteMeta> {
  const cleanId = String(roomId || '').trim();
  const fallback: InviteMeta = {
    roomId: cleanId,
    title: 'Forum Meeting Invite',
    hostName: 'Forum Host',
    description: 'Open link to add this meeting automatically to your Forum Calendar and join the call.',
    coverImage: '',
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

function injectInviteMetaHtml(
  html: string,
  origin: string,
  roomId: string,
  meta: InviteMeta
): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const titleText = `${meta.title} · Komu Forum`;
  const descText =
    meta.description ||
    `${meta.hostName} invited you to join ${meta.title}. Open to add automatically to your Forum Calendar.`;
  const hasCover = Boolean(meta.coverImage && meta.coverImage.trim().length > 0);
  const coverHash = meta.coverImage
    ? `${meta.coverImage.length}-${meta.coverImage.slice(-12).replace(/[^a-zA-Z0-9]/g, '')}`
    : 'logo';
  const ogImageUrl = hasCover
    ? `${cleanOrigin}/api/invite-og?id=${encodeURIComponent(roomId)}&v=${encodeURIComponent(coverHash)}`
    : `${cleanOrigin}/forum-logo.png`;
  const inviteUrl = `${cleanOrigin}/invite/${encodeURIComponent(roomId)}`;

  const escapedTitle = escapeXml(titleText);
  const escapedDesc = escapeXml(descText);
  const escapedImg = escapeXml(ogImageUrl);
  const escapedUrl = escapeXml(inviteUrl);

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

async function loadBaseIndexHtml(origin: string): Promise<string> {
  const distHtml = path.join(process.cwd(), 'dist', 'index.html');
  try {
    if (fs.existsSync(distHtml)) {
      return fs.readFileSync(distHtml, 'utf8');
    }
  } catch {}

  try {
    const resp = await fetch(`${origin.replace(/\/+$/, '')}/index.html`, {
      signal: AbortSignal.timeout(4000),
    });
    if (resp.ok) {
      return await resp.text();
    }
  } catch {}

  const rootHtml = path.join(process.cwd(), 'index.html');
  try {
    if (fs.existsSync(rootHtml)) {
      return fs.readFileSync(rootHtml, 'utf8');
    }
  } catch {}

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Forum Invite</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
}

export default async function handler(req: any, res: any) {
  const rawId = req?.query?.id || '';
  const roomId = Array.isArray(rawId) ? rawId[0] : String(rawId).trim();
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(
    req?.headers?.['x-forwarded-host'] || req?.headers?.host || 'komu-forum.vercel.app'
  ).split(',')[0].trim();
  const origin = `${proto}://${host}`;

  try {
    const [baseHtml, meta] = await Promise.all([
      loadBaseIndexHtml(origin),
      fetchMeetingForInvite(roomId),
    ]);
    const finalHtml = injectInviteMetaHtml(baseHtml, origin, roomId, meta);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    return res.status(200).send(finalHtml);
  } catch (err) {
    console.error('[api/invite-page] Error serving invite page:', err);
    const fallbackHtml = await loadBaseIndexHtml(origin);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(fallbackHtml);
  }
}
