import { AccessToken } from "livekit-server-sdk";

type ParticipantTokenOptions = {
  room: string;
  username: string;
  metadata?: unknown;
  subscriberOnly?: boolean;
};

export async function createParticipantToken({
  room,
  username,
  metadata = "",
  subscriberOnly = false,
}: ParticipantTokenOptions): Promise<string> {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("LiveKit server configuration missing");
  }

  const token = new AccessToken(apiKey, apiSecret, {
    identity: username,
    metadata: typeof metadata === "string" ? metadata : JSON.stringify(metadata),
  });

  token.addGrant({
    roomJoin: true,
    room,
    canPublish: !subscriberOnly,
    canSubscribe: true,
    canPublishData: !subscriberOnly,
    canUpdateOwnMetadata: !subscriberOnly,
  });

  return token.toJwt();
}
