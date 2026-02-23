import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase client (optional — app still works without it)
const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
    : null;

if (!supabase) {
  console.warn("SUPABASE_URL or SUPABASE_KEY not set — running without persistence");
}

app.use(express.json({ limit: "10mb" }));
app.use(express.static(join(__dirname, "public")));

// ─── Profile endpoints ──────────────────────────────────────────────

app.get("/api/profile", async (req, res) => {
  if (!supabase) return res.json({ profile: null });
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", "leslie")
      .single();
    if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
    res.json({ profile: data || null });
  } catch (err) {
    console.error("GET /api/profile error:", err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

app.put("/api/profile", async (req, res) => {
  if (!supabase) return res.json({ ok: true, persisted: false });
  try {
    const {
      familySize, kidsAges, dietaryNeeds, dislikes,
      budget, cookingLevel, busyNights, favorites, equipment,
    } = req.body;

    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: "leslie",
          family_size: familySize || "",
          kids_ages: kidsAges || "",
          dietary_needs: dietaryNeeds || "",
          dislikes: dislikes || "",
          budget: budget || "",
          cooking_level: cookingLevel || "",
          busy_nights: busyNights || "",
          favorites: favorites || "",
          equipment: equipment || "",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, persisted: true, profile: data });
  } catch (err) {
    console.error("PUT /api/profile error:", err);
    res.status(500).json({ error: "Failed to save profile" });
  }
});

// ─── Memories endpoints ─────────────────────────────────────────────

app.get("/api/memories", async (req, res) => {
  if (!supabase) return res.json({ memories: [] });
  try {
    const { data, error } = await supabase
      .from("memories")
      .select("*")
      .eq("user_id", "leslie")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ memories: data || [] });
  } catch (err) {
    console.error("GET /api/memories error:", err);
    res.status(500).json({ error: "Failed to fetch memories" });
  }
});

app.delete("/api/memories/:id", async (req, res) => {
  if (!supabase) return res.json({ ok: true });
  try {
    const { error } = await supabase
      .from("memories")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", "leslie");
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/memories error:", err);
    res.status(500).json({ error: "Failed to delete memory" });
  }
});

// ─── Chat endpoint ──────────────────────────────────────────────────

app.post("/api/chat", async (req, res) => {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: req.body.model || "claude-sonnet-4-20250514",
        max_tokens: req.body.max_tokens || 1500,
        system: req.body.system || "",
        messages: req.body.messages || [],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Return the response to the user immediately
    res.json(data);

    // Fire-and-forget: extract memories from this exchange
    if (supabase) {
      const msgs = req.body.messages || [];
      const lastUser = msgs.filter((m) => m.role === "user").pop();
      const assistantText = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      if (lastUser && assistantText) {
        extractMemories(ANTHROPIC_API_KEY, lastUser, assistantText).catch(
          (err) => console.error("Memory extraction error:", err)
        );
      }
    }
  } catch (err) {
    console.error("Anthropic API error:", err);
    res.status(500).json({ error: "Failed to reach Anthropic API" });
  }
});

// ─── Memory extraction (background) ────────────────────────────────

async function extractMemories(apiKey, userMsg, assistantText) {
  // Get the text content from the user message
  let userText = "";
  if (typeof userMsg.content === "string") {
    userText = userMsg.content;
  } else if (Array.isArray(userMsg.content)) {
    userText = userMsg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }

  if (!userText) return;

  const extractionPrompt = `You are a memory extraction assistant. Given this conversation exchange between a user (Leslie) and a meal planning assistant (Judy), extract any NEW facts about Leslie's family worth remembering for future conversations.

Categories you can use: preference, dislike, favorite, allergy, family_info, schedule, budget, cooking_tip

Return a JSON array of objects with "memory" and "category" fields.
Return [] if there is nothing new worth remembering.

ONLY extract concrete, specific facts. Do NOT extract:
- Generic cooking advice Judy gave
- Questions Leslie asked (unless they reveal a preference)
- Vague statements

Examples of good extractions:
- {"memory": "Jake loves pepperoni pizza", "category": "favorite"}
- {"memory": "Kendall is allergic to tree nuts", "category": "allergy"}
- {"memory": "Tuesday nights are busy because of soccer practice", "category": "schedule"}

User said: ${userText}

Judy responded: ${assistantText}

Return ONLY the JSON array, no other text.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{ role: "user", content: extractionPrompt }],
    }),
  });

  if (!response.ok) return;

  const data = await response.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  let memories;
  try {
    memories = JSON.parse(text);
  } catch {
    // Try to extract JSON array from the response
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        memories = JSON.parse(match[0]);
      } catch {
        return;
      }
    } else {
      return;
    }
  }

  if (!Array.isArray(memories) || memories.length === 0) return;

  const validCategories = new Set([
    "preference", "dislike", "favorite", "allergy",
    "family_info", "schedule", "budget", "cooking_tip",
  ]);

  const rows = memories
    .filter((m) => m.memory && m.category && validCategories.has(m.category))
    .map((m) => ({
      user_id: "leslie",
      memory: m.memory,
      category: m.category,
    }));

  if (rows.length > 0) {
    const { error } = await supabase.from("memories").insert(rows);
    if (error) console.error("Memory insert error:", error);
    else console.log(`Extracted ${rows.length} memories`);
  }
}

// Serve the app for all other routes
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Ask Judy is running on port ${PORT}`);
});
