import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import { fetchMeetingForInvite, resolveInvitePreviewImage, injectInviteMetaHtml } from "./api/_inviteHelper";
import {
  AccessToken,
  EgressClient,
  RoomServiceClient,
  StreamOutput,
  StreamProtocol,
  EncodingOptionsPreset,
} from "livekit-server-sdk";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ROOT_DIR = process.cwd();

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

  let aiAnalyzeCooldownUntil = 0;

  // AI Video Feed Lighting & Color Analysis
  app.post("/api/ai/analyze-feed", async (req, res) => {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64 snapshot" });
    }

    if (Date.now() < aiAnalyzeCooldownUntil) {
      return res.status(429).json({
        error: "AI analysis temporarily paused after rate-limit response. Try again shortly."
      });
    }

    const ai = getAIClient();
    if (!ai) {
      return res.status(503).json({ error: "Gemini API key not configured in server secrets." });
    }

    try {
      const base64Data = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
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
          responseMimeType: "application/json"
        }
      });

      const textOutput = response.text?.trim() || "";
      const parsed = JSON.parse(textOutput);
      return res.json({
        status: "success",
        source: "gemini",
        enhancements: parsed
      });
    } catch (aiErr: any) {
      const msg = String(aiErr?.message || aiErr || 'Failed to analyze frame');
      const statusCode = (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.toLowerCase().includes('quota')) ? 429 : 502;
      if (statusCode === 429) {
        aiAnalyzeCooldownUntil = Date.now() + 5 * 60 * 1000;
      }
      console.warn("[AI Feed Analyzer] Gemini API error:", msg);
      return res.status(statusCode).json({ error: msg });
    }
  });

  // AI Meeting Note-Taking & Summaries
  app.post("/api/ai/meeting-notes", async (req, res) => {
    const { transcript, existingNotes, meetingTitle, formatType, participants, duration } = req.body;
    
    if (!transcript && !existingNotes) {
      return res.status(400).json({ error: "No transcript or notes content provided yet." });
    }

    const ai = getAIClient();
    if (!ai) {
      return res.status(503).json({ error: "Gemini API key not configured in server secrets." });
    }

    const attendeesList = Array.isArray(participants) && participants.length > 0
      ? participants.join(", ")
      : "Meeting Attendees";
    const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const safeTitle = meetingTitle || "Meeting Session";
    const sourceContent = [
      transcript ? `Spoken Transcript & Chat:\n${transcript}` : '',
      existingNotes ? `Manual Notes:\n${existingNotes}` : '',
    ].filter(Boolean).join("\n\n");

    let formatInstructions = "";
    if (formatType === 'action_items') {
      formatInstructions = `Extract a clean, specific checklist of Action Items & Decisions from the session:
# Action Items: ${safeTitle}
**Date**: ${dateLabel}
**Attendees**: ${attendeesList}

## Action Items & Owners
- [ ] **[Speaker / Assignee]**: Exact concrete task, deadline or follow-up mentioned

## Key Decisions
- Concrete decisions made, attributed to who proposed/confirmed them`;
    } else if (formatType === 'summary') {
      formatInstructions = `Generate a crisp executive summary in Markdown:
# Meeting Summary: ${safeTitle}
**Date**: ${dateLabel}
**Attendees**: ${attendeesList}

## Executive Overview
(2-4 clear sentences summarizing the goal and outcome of the meeting)

## Key Points by Speaker
- **Speaker Name**: Specific points, updates, or ideas they shared

## Decisions & Next Steps
- [ ] **Owner**: Clear next steps or deliverables`;
    } else {
      formatInstructions = `Generate comprehensive, cleanly formatted AI Meeting Notes in Markdown preserving exact speaker attribution:
# AI Meeting Notes: ${safeTitle}
**Date**: ${dateLabel}
**Attendees**: ${attendeesList}

## Executive Overview
(Concise summary of the discussion and primary outcomes)

## Discussion Breakdown (Speaker Highlights)
- **Speaker Name**: Detailed summary of what they said and raised

## Key Decisions
- Explicit alignments or conclusions reached

## Action Items
- [ ] **Owner**: Specific deliverable or follow-up task

## Notable Context & Open Questions
- Any unresolved topics, links, or notes`;
    }

    const generateWithResilience = async (promptText: string): Promise<string> => {
      const attemptModel = async (modelId: string, useLowThinking: boolean) => {
        const resp = await ai.models.generateContent({
          model: modelId,
          contents: promptText,
          config: {
            maxOutputTokens: 2400,
            ...(useLowThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
          },
        });
        return resp.text?.trim() || "";
      };

      const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
        Promise.race([
          promise,
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), ms)
          ),
        ]);

      const shouldFailover = (err: any) => {
        const raw = String(err?.message || err || "");
        return (
          raw.includes("_TIMEOUT") ||
          raw.includes("503") ||
          raw.includes("UNAVAILABLE") ||
          raw.toLowerCase().includes("high demand") ||
          raw.toLowerCase().includes("temporarily unavailable")
        );
      };

      try {
        return await withTimeout(attemptModel("gemini-4-hydrogen", true), 7000, "PRIMARY");
      } catch (firstErr: any) {
        if (shouldFailover(firstErr)) {
          await new Promise((r) => setTimeout(r, 250));
          return await withTimeout(attemptModel("gemini-3.1-flash-lite", false), 10000, "FALLBACK");
        }
        throw firstErr;
      }
    };

    try {
      const prompt = `You are an expert executive meeting assistant. Transform the following real meeting conversation into clean, accurate, well-structured GitHub-flavored Markdown. Only report facts, topics, quotes, and tasks present in the source content — attribute points accurately to the named speakers.

Meeting Title: ${safeTitle}
Attendees: ${attendeesList}
${duration ? `Duration: ${duration}` : ''}

"""
${sourceContent}
"""

Required Format:
${formatInstructions}

Return ONLY the formatted Markdown document without extra preamble or code fences.`;

      const outputText = await generateWithResilience(prompt);
      if (!outputText) {
        return res.status(502).json({ error: "Gemini returned an empty notes response." });
      }

      return res.json({
        status: "success",
        source: "gemini",
        notes: outputText,
        summary: outputText,
        result: outputText
      });
    } catch (err: any) {
      let msg = String(err?.message || err || "Failed to generate AI meeting notes");
      try {
        const parsed = JSON.parse(msg);
        if (parsed?.error?.message) msg = parsed.error.message;
      } catch {}
      const statusCode = (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.toLowerCase().includes('quota')) ? 429 : 502;
      console.warn("[AI Meeting Notes] Gemini API error:", msg);
      return res.status(statusCode).json({ error: msg });
    }
  });

  // AI Shared Workspace Assistance (Text Editing, Formatting, Improving, Suggestions)
  app.post("/api/ai/workspace-assist", async (req, res) => {
    const { content, instruction, action, fileName } = req.body;

    if (!content && !instruction) {
      return res.status(400).json({ error: "Missing content or prompt" });
    }

    const ai = getAIClient();
    if (!ai) {
      return res.status(503).json({ error: "Gemini API key not configured in server secrets." });
    }

    try {
      let taskPrompt = "";
      switch (action) {
        case "improve":
          taskPrompt = "Improve the clarity, precision, and professional tone of this text. Keep the core meaning intact while making it clean, succinct, and natural:";
          break;
        case "fix":
          taskPrompt = "Fix all grammar, spelling, punctuation, and syntax errors in this text while preserving the original structure:";
          break;
        case "summarize":
          taskPrompt = "Summarize the key points in this document concisely using structured bullet points:";
          break;
        case "format":
          taskPrompt = "Clean up and format this content neatly with clean headers, bullet points, or code blocks where appropriate:";
          break;
        default:
          taskPrompt = instruction ? `Perform the following editing task: ${instruction}` : "Improve and polish this text:";
      }

      const fullPrompt = `${taskPrompt}
File: ${fileName || "document.txt"}

Content to process:
\`\`\`
${content || ""}
\`\`\`

Return ONLY the processed text replacement without introductory greetings or meta-commentary.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: fullPrompt,
        config: {
          maxOutputTokens: 2048,
        }
      });

      const resultText = response.text?.trim() || "";
      return res.json({
        status: "success",
        source: "gemini",
        result: resultText
      });
    } catch (err: any) {
      const msg = String(err?.message || err || "Workspace assist failed");
      const statusCode = (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.toLowerCase().includes('quota')) ? 429 : 502;
      console.warn("[AI Workspace Assist] Gemini API error:", msg);
      return res.status(statusCode).json({ error: msg });
    }
  });

  // Silent background microphone audio chunk transcription (prevents OS speech-to-text beep on mobile)
  app.post("/api/ai/transcribe", async (req, res) => {
    const { audioBase64, mimeType, language } = req.body || {};
    if (!audioBase64 || typeof audioBase64 !== "string") {
      return res.status(400).json({ error: "Missing audioBase64 payload" });
    }

    const ai = getAIClient();
    if (!ai) {
      return res.status(503).json({ error: "Gemini API key not configured in server secrets." });
    }

    try {
      const cleanBase64 = audioBase64.replace(/^data:audio\/[a-zA-Z0-9.+-]+;base64,/, "");
      const safeMime =
        typeof mimeType === "string" && mimeType.startsWith("audio/")
          ? mimeType.split(";")[0]
          : "audio/webm";

      const response = await ai.models.generateContent({
        model: "gemini-3.5-transcribe",
        contents: [
          {
            text: `Transcribe any clear human speech in this short audio clip verbatim${
              language ? ` (spoken language hint: ${language})` : ""
            }. If the clip contains only silence, breathing, tapping, or background noise with no clear spoken words, return an empty string "". Return ONLY the raw spoken words with normal punctuation and no brackets or labels.`,
          },
          {
            inlineData: {
              mimeType: safeMime,
              data: cleanBase64,
            },
          },
        ],
        config: {
          maxOutputTokens: 512,
        },
      });

      const raw = (response.text || "").trim();
      const normalized = raw
        .replace(/^["'`]+|["'`]+$/g, "")
        .replace(/^\[.*\]$/g, "")
        .trim();

      if (
        !normalized ||
        /^(no speech|silence|inaudible|background noise|none|empty|\.\.\.)$/i.test(normalized)
      ) {
        return res.json({ status: "ok", text: "" });
      }

      return res.json({ status: "ok", text: normalized });
    } catch (err: any) {
      const msg = String(err?.message || err || "Silent transcription failed");
      const statusCode =
        msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.toLowerCase().includes("quota")
          ? 429
          : 502;
      console.warn("[AI Transcribe] Gemini API error:", msg);
      return res.status(statusCode).json({ error: msg });
    }
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

  const getLiveKitClients = () => {
    const rawUrl = process.env.VITE_LIVEKIT_URL || process.env.LIVEKIT_URL || "https://forum-xchlx8up.livekit.cloud";
    const host = rawUrl.replace(/^wss?:\/\//, "https://");
    const apiKey = process.env.LIVEKIT_API_KEY || "APIKKz48zYgzLs5";
    const apiSecret = process.env.LIVEKIT_API_SECRET || "xxFMWxVfAtzMUJf1WXGHZj2Kp7plcChVagiQJAfYNzcB";
    return {
      egressClient: new EgressClient(host, apiKey, apiSecret),
      roomService: new RoomServiceClient(host, apiKey, apiSecret),
    };
  };

  // Start LiveKit Room Composite RTMP Stream
  app.post("/api/livekit/egress-start", async (req, res) => {
    const { room, rtmpUrl, streamKey, layout } = req.body || {};
    if (!room || !rtmpUrl) {
      return res.status(400).json({ error: "Room ID and RTMP URL are required." });
    }
    try {
      const { egressClient } = getLiveKitClients();
      const base = String(rtmpUrl).replace(/\/+$/, "");
      const fullUrl = streamKey ? `${base}/${String(streamKey).replace(/^\/+/, "")}` : base;
      const streamOutput = new StreamOutput({
        protocol: StreamProtocol.RTMP,
        urls: [fullUrl],
      });
      const info = await egressClient.startRoomCompositeEgress(
        room,
        { stream: streamOutput },
        {
          layout: layout || "grid",
          encodingOptions: EncodingOptionsPreset.H264_1080P_30,
        }
      );
      return res.json({ status: "started", egressId: info.egressId, info });
    } catch (err: any) {
      console.error("[LiveKit Egress Start] Error:", err?.message || err);
      return res.status(502).json({
        error: err?.message || "Failed to start LiveKit RTMP Egress stream. Verify RTMP endpoint and LiveKit Egress quota.",
      });
    }
  });

  // Stop LiveKit Egress Stream
  app.post("/api/livekit/egress-stop", async (req, res) => {
    const { egressId, room } = req.body || {};
    try {
      const { egressClient } = getLiveKitClients();
      if (egressId) {
        const info = await egressClient.stopEgress(egressId);
        return res.json({ status: "stopped", egressId: info.egressId });
      }
      if (room) {
        const active = await egressClient.listEgress({ roomName: room, active: true });
        await Promise.all(active.map((e) => egressClient.stopEgress(e.egressId)));
        return res.json({ status: "stopped", stoppedCount: active.length });
      }
      return res.status(400).json({ error: "egressId or room is required." });
    } catch (err: any) {
      console.error("[LiveKit Egress Stop] Error:", err?.message || err);
      return res.status(502).json({ error: err?.message || "Failed to stop Egress stream" });
    }
  });

  // Server-enforced Host Removal
  app.post("/api/livekit/remove-participant", async (req, res) => {
    const { room, identity } = req.body || {};
    if (!room || !identity) {
      return res.status(400).json({ error: "room and identity are required" });
    }
    try {
      const { roomService } = getLiveKitClients();
      await roomService.removeParticipant(room, identity);
      return res.json({ status: "removed", room, identity });
    } catch (err: any) {
      console.warn("[LiveKit RemoveParticipant] Notice:", err?.message || err);
      return res.status(200).json({ status: "fallback-data-channel", notice: err?.message });
    }
  });

  // Server-enforced Host Mute Track
  app.post("/api/livekit/mute-track", async (req, res) => {
    const { room, identity, trackSid, muted } = req.body || {};
    if (!room || !identity || !trackSid) {
      return res.status(400).json({ error: "room, identity, and trackSid are required" });
    }
    try {
      const { roomService } = getLiveKitClients();
      await roomService.mutePublishedTrack(room, identity, trackSid, muted !== false);
      return res.json({ status: "ok", room, identity, trackSid, muted: muted !== false });
    } catch (err: any) {
      console.warn("[LiveKit MuteTrack] Notice:", err?.message || err);
      return res.status(200).json({ status: "fallback-data-channel", notice: err?.message });
    }
  });

  // Dynamic Invite OpenGraph Preview Image (Meeting Cover or Forum Logo fallback)
  app.get("/api/invite-og", async (req, res) => {
    const roomId = String(req.query.id || "").trim();
    if (!roomId) {
      return res.status(400).send("Missing id");
    }
    try {
      const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim();
      const host = String(req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`).split(",")[0].trim();
      const origin = `${proto}://${host}`;
      const { buffer, contentType } = await resolveInvitePreviewImage(roomId, origin);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", String(buffer.length));
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.status(200).send(buffer);
    } catch (err) {
      console.error("[Invite OG] Failed:", err);
      return res.status(500).send("Failed to render preview image");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });

    app.get("/invite/:id", async (req, res, next) => {
      try {
        const roomId = String(req.params.id || "").trim();
        const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
        const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
        const origin = `${proto}://${host}`;
        const rawHtml = fs.readFileSync(path.join(ROOT_DIR, "index.html"), "utf8");
        const [transformed, meta] = await Promise.all([
          vite.transformIndexHtml(req.originalUrl, rawHtml),
          fetchMeetingForInvite(roomId),
        ]);
        const finalHtml = injectInviteMetaHtml(transformed, origin, roomId, meta);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(finalHtml);
      } catch (err) {
        return next(err);
      }
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));

    app.get("/invite/:id", async (req, res) => {
      try {
        const roomId = String(req.params.id || "").trim();
        const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
        const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
        const origin = `${proto}://${host}`;
        const rawHtml = fs.readFileSync(path.join(distPath, "index.html"), "utf8");
        const meta = await fetchMeetingForInvite(roomId);
        const finalHtml = injectInviteMetaHtml(rawHtml, origin, roomId, meta);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(finalHtml);
      } catch {
        return res.sendFile(path.join(distPath, "index.html"));
      }
    });

    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
