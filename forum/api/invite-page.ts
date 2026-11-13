import fs from 'fs';
import path from 'path';
import { fetchMeetingForInvite, injectInviteMetaHtml } from './_inviteHelper';

async function loadBaseIndexHtml(origin: string): Promise<string> {
  const candidates = [
    path.join(process.cwd(), 'dist', 'index.html'),
    path.join(process.cwd(), 'index.html'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf8');
      }
    } catch {}
  }

  try {
    const resp = await fetch(`${origin}/index.html`, { signal: AbortSignal.timeout(3500) });
    if (resp.ok) {
      return await resp.text();
    }
  } catch {}

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Forum Invite</title>
    <meta name="description" content="Forum meeting invitation" />
    <meta property="og:title" content="Forum Invite" />
    <meta property="og:description" content="Forum meeting invitation" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
}

export default async function handler(req: any, res: any) {
  const rawId = req?.query?.id || '';
  const roomId = Array.isArray(rawId) ? rawId[0] : String(rawId);
  const proto = req?.headers?.['x-forwarded-proto'] || 'https';
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host || 'komu-forum.vercel.app';
  const origin = `${proto}://${host}`;

  try {
    const [baseHtml, meta] = await Promise.all([
      loadBaseIndexHtml(origin),
      fetchMeetingForInvite(roomId),
    ]);
    const finalHtml = injectInviteMetaHtml(baseHtml, origin, roomId, meta);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.status(200).send(finalHtml);
  } catch (err) {
    console.error('[api/invite-page] Error serving invite page:', err);
    const fallbackHtml = await loadBaseIndexHtml(origin);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(fallbackHtml);
  }
}
