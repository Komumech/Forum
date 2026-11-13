import { renderInviteOgPng } from './_inviteHelper.js';

export default async function handler(req: any, res: any) {
  const rawId = req?.query?.id || '';
  const roomId = Array.isArray(rawId) ? rawId[0] : String(rawId);

  if (!roomId) {
    res.status(400).send('Missing id');
    return;
  }

  try {
    const imgBuffer = await renderInviteOgPng(roomId);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.status(200).send(imgBuffer);
  } catch (err) {
    console.error('[api/invite-og] Error rendering OG image:', err);
    res.status(500).send('Failed to generate preview image');
  }
}
