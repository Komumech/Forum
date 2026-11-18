import { AccessToken } from 'livekit-server-sdk';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const room = String(req?.query?.room || req?.body?.room || '').trim();
  const username = String(req?.query?.username || req?.body?.username || '').trim();
  const rawMetadata = req?.query?.metadata ?? req?.body?.metadata ?? '';
  const metadata = typeof rawMetadata === 'object' ? JSON.stringify(rawMetadata) : String(rawMetadata);
  const subscriberOnly =
    req?.query?.subscriberOnly === 'true' || req?.body?.subscriberOnly === true;

  if (!room || !username) {
    return res.status(400).json({ error: 'Missing room or username parameter' });
  }

  const apiKey = process.env.LIVEKIT_API_KEY || 'APIKKz48zYgzLs5';
  const apiSecret =
    process.env.LIVEKIT_API_SECRET || 'xxFMWxVfAtzMUJf1WXGHZj2Kp7plcChVagiQJAfYNzcB';

  try {
    const at = new AccessToken(apiKey, apiSecret, {
      identity: username,
      metadata,
    });

    at.addGrant({
      roomJoin: true,
      room,
      canPublish: !subscriberOnly,
      canSubscribe: true,
      canPublishData: !subscriberOnly,
      canUpdateOwnMetadata: !subscriberOnly,
    });

    const token = await at.toJwt();
    return res.status(200).json({ token, room, username });
  } catch (err: any) {
    console.error('[api/get-participant-token] Error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to generate token' });
  }
}
