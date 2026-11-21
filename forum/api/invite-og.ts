import fs from 'fs';
import path from 'path';

const FIREBASE_PROJECT_ID = 'forum-8f34e';
const FIRESTORE_DB_ID = '(default)';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DB_ID}/documents`;

function readFsString(field: any): string {
  if (!field || typeof field !== 'object') return '';
  return typeof field.stringValue === 'string' ? field.stringValue : '';
}

async function fetchCoverImageForRoom(roomId: string): Promise<string> {
  const cleanId = String(roomId || '').trim();
  if (!cleanId) return '';

  try {
    const resp = await fetch(`${FIRESTORE_BASE}/meetings/${encodeURIComponent(cleanId)}`, {
      signal: AbortSignal.timeout(4500),
    });
    if (resp.ok) {
      const json = await resp.json();
      const cover = readFsString(json?.fields?.coverImage);
      if (cover) return cover;
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
      const cover = readFsString(docMatch?.document?.fields?.coverImage);
      if (cover) return cover;
    }
  } catch {}

  try {
    const roomResp = await fetch(`${FIRESTORE_BASE}/rooms/${encodeURIComponent(cleanId)}`, {
      signal: AbortSignal.timeout(3500),
    });
    if (roomResp.ok) {
      const json = await roomResp.json();
      const cover = readFsString(json?.fields?.coverImage);
      if (cover) return cover;
    }
  } catch {}

  return '';
}

async function loadLogoFallback(origin: string): Promise<Buffer> {
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

  const resp = await fetch(`${origin.replace(/\/+$/, '')}/forum-logo.png`, {
    signal: AbortSignal.timeout(3500),
  });
  const arr = await resp.arrayBuffer();
  return Buffer.from(arr);
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
    const coverImage = roomId ? (await fetchCoverImageForRoom(roomId)).trim() : '';

    if (coverImage.startsWith('data:image/')) {
      const match = coverImage.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
      if (match) {
        const buffer = Buffer.from(match[2], 'base64');
        if (buffer.length > 0) {
          res.setHeader('Content-Type', match[1].toLowerCase());
          res.setHeader('Content-Length', String(buffer.length));
          res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
          return res.status(200).send(buffer);
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
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Length', String(buffer.length));
            res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
            return res.status(200).send(buffer);
          }
        }
      } catch {}
    }

    const logoBuffer = await loadLogoFallback(origin);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', String(logoBuffer.length));
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    return res.status(200).send(logoBuffer);
  } catch (err) {
    console.error('[api/invite-og] Error serving OG image:', err);
    return res.redirect(302, `${origin}/forum-logo.png`);
  }
}
