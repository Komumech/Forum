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

  app.use(express.json());

  // LiveKit Token Generation Endpoint
  app.get("/api/get-participant-token", async (req, res) => {
    const room = req.query.room as string;
    const username = req.query.username as string;
    const metadata = req.query.metadata as string;

    console.log(`[Token API] Request for room: ${room}, user: ${username}`);

    if (!room || !username) {
      return res.status(400).send("Missing room or username");
    }

    const apiKey = process.env.LIVEKIT_API_KEY || "APIKKz48zYgzLs5";
    const apiSecret = process.env.LIVEKIT_API_SECRET || "xxFMWxVfAtzMUJf1WXGHZj2Kp7plcChVagiQJAfYNzcB";
    const wsUrl = process.env.LIVEKIT_URL || "https://forum-xchlx8up.livekit.cloud";

    if (!apiKey || !apiSecret) {
      console.error("[Token API] Missing API Key or Secret");
      return res.status(500).send("LiveKit server misconfigured.");
    }

    try {
      const at = new AccessToken(apiKey, apiSecret, {
        identity: username,
        metadata: metadata,
      });

      at.addGrant({
        roomJoin: true,
        room: room,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });

      const token = await at.toJwt();
      console.log(`[Token API] Generated token for ${username}`);
      res.json({ token });
    } catch (error) {
      console.error("[Token API] Error generating token:", error);
      res.status(500).send("Failed to generate token");
    }
  });

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
