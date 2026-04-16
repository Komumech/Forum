import { AccessToken } from 'livekit-server-sdk';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// This matches the path your frontend is calling: /api/get-participant-token
app.get('/api/get-participant-token', async (req, res) => {
  const { room, username } = req.query;

  if (!room || !username) {
    return res.status(400).json({ error: 'Missing room or username' });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return res.status(500).json({ error: 'Server misconfigured: Missing LiveKit keys' });
  }

  try {
    const at = new AccessToken(apiKey, apiSecret, {
      identity: username as string,
    });

    at.addGrant({ 
      roomJoin: true, 
      room: room as string, 
      canPublish: true, 
      canSubscribe: true 
    });

    const token = await at.toJwt();
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// IMPORTANT: This allows Vercel to handle the Express app
export default app;