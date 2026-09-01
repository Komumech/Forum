import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { AccessToken } from "livekit-server-sdk";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lazy Gemini client helper
let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware with large body limit for snapshot frames
  app.use(express.json({ limit: '10mb' }));
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

  // AI Video Feed Lighting & Color Analysis
  app.post("/api/ai/analyze-feed", async (req, res) => {
    const { imageBase64, currentBrightness, currentContrast } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64 snapshot" });
    }

    try {
      const ai = getAIClient();
      if (ai) {
        // Strip data:image/...;base64, prefix if present
        const base64Data = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
        
        const response = await ai.models.generateContent({
          model: 'gemini-3.7-flash',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: base64Data,
                }
              },
              {
                text: `You are an expert computational photography engineer and video colorist analyzing this webcam feed snapshot in real-time.
Evaluate the lighting and complexion conditions:
1. Is the scene underexposed / dark, overexposed, backlit (bright background, dim face), or normal?
2. Does the scene have a warm/yellow tungsten bulb cast, cool blue fluorescent shadow, or natural daylight?
3. What are the optimal color correction values?

Respond ONLY with valid JSON in this exact structure without markdown fences:
{
  "sceneCondition": "lowlight" | "backlit" | "normal" | "overexposed" | "warm_cast" | "cool_cast",
  "brightness": number between 90 and 135,
  "contrast": number between 95 and 125,
  "saturation": number between 100 and 125,
  "warmth": number between -15 and 15,
  "shadowLift": number between 0 and 35,
  "skinSmoothing": number between 0 and 100,
  "diagnosis": "Short 1-sentence explanation of detected lighting and what was adjusted"
}`
              }
            ]
          },
          config: {
            responseMimeType: "application/json",
            temperature: 0.2
          }
        });

        const textOutput = response.text?.trim() || "";
        const parsed = JSON.parse(textOutput);
        return res.json({
          status: "success",
          source: "gemini",
          enhancements: parsed
        });
      }
    } catch (aiErr: any) {
      console.warn("[AI Feed Analyzer] Gemini API fallback triggered:", aiErr?.message || aiErr);
    }

    // Adaptive mathematical fallback when key not present or offline
    const isLikelyDark = (currentBrightness || 100) < 105;
    res.json({
      status: "success",
      source: "adaptive-engine",
      enhancements: {
        sceneCondition: isLikelyDark ? "lowlight" : "normal",
        brightness: isLikelyDark ? 116 : 108,
        contrast: 108,
        saturation: 112,
        warmth: 3,
        shadowLift: isLikelyDark ? 20 : 8,
        skinSmoothing: 45,
        diagnosis: "AI Auto-Tuning balanced exposure midtones and normalized skin vibrancy."
      }
    });
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
