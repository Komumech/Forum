import { createParticipantToken } from "../livekit-token";

type ApiRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ApiResponse = {
  status(code: number): ApiResponse;
  json(body: Record<string, unknown>): void;
};

function getValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = isRecord(req.body) ? req.body : {};
  const room = getValue(req.query?.room) ?? body.room;
  const username = getValue(req.query?.username) ?? body.username;
  const metadata = getValue(req.query?.metadata) ?? body.metadata ?? "";
  const subscriberOnly =
    getValue(req.query?.subscriberOnly) === "true" || body.subscriberOnly === true;

  if (typeof room !== "string" || !room || typeof username !== "string" || !username) {
    return res.status(400).json({ error: "Missing room or username parameter" });
  }

  try {
    const token = await createParticipantToken({
      room,
      username,
      metadata,
      subscriberOnly,
    });
    return res.status(200).json({ token, room, username });
  } catch (error) {
    console.error("[Token API] Error generating token:", error);
    const message = error instanceof Error ? error.message : "Failed to generate token";
    return res.status(message === "LiveKit server configuration missing" ? 503 : 500).json({
      error: message,
    });
  }
}
