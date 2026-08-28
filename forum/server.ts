import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { AccessToken } from "livekit-server-sdk";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json());
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  // LiveKit Token Generation Handler
  const handleTokenGeneration = async (req: express.Request, res: express.Response) => {
    const room = (req.query.room || req.body?.room) as string;
    const username = (req.query.username || req.body?.username) as string;
    const metadata = (req.query.metadata || req.body?.metadata || "") as string;
    const subscriberOnly = req.query.subscriberOnly === "true" || req.body?.subscriberOnly === true;

    console.log(`[Token API] Request for room: ${room}, user: ${username}, subscriberOnly: ${subscriberOnly}`);

    if (!room || !username) {
      return res.status(400).json({ error: "Missing room or username parameter" });
    }

    const apiKey = process.env.LIVEKIT_API_KEY || "APIKKz48zYgzLs5";
    const apiSecret = process.env.LIVEKIT_API_SECRET || "xxFMWxVfAtzMUJf1WXGHZj2Kp7plcChVagiQJAfYNzcB";

    if (!apiKey || !apiSecret) {
      console.error("[Token API] Missing API Key or Secret");
      return res.status(500).json({ error: "LiveKit server configuration missing" });
    }

    try {
      const at = new AccessToken(apiKey, apiSecret, {
        identity: username,
        metadata: typeof metadata === "object" ? JSON.stringify(metadata) : metadata,
      });

      at.addGrant({
        roomJoin: true,
        room: room,
        canPublish: !subscriberOnly,
        canSubscribe: true,
        canPublishData: !subscriberOnly,
        canUpdateOwnMetadata: !subscriberOnly,
      });

      const token = await at.toJwt();
      console.log(`[Token API] Successfully generated token for ${username} (room: ${room})`);
      res.json({ token, room, username });
    } catch (error: any) {
      console.error("[Token API] Error generating token:", error);
      res.status(500).json({ error: error?.message || "Failed to generate token" });
    }
  };

  app.get("/api/get-participant-token", handleTokenGeneration);
  app.post("/api/get-participant-token", handleTokenGeneration);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
