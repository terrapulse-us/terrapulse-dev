import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const TAVILY_TIMEOUT_MS = 15_000;

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

interface TavilyResponse {
  results?: TavilyResult[];
}

async function tavilySearch(query: string, maxResults = 6): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TAVILY_TIMEOUT_MS);
    const resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query, max_results: maxResults, search_depth: "basic" }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return [];
    const json = (await resp.json()) as TavilyResponse;
    return json.results ?? [];
  } catch {
    return [];
  }
}

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export interface ModLinkResult {
  title: string;
  url: string;
  source: string;
  description: string;
}

router.post("/mods/search", async (req, res): Promise<void> => {
  const { prompt, vehicleYear, vehicleMake, vehicleModel } = req.body as {
    prompt?: string;
    vehicleYear?: string;
    vehicleMake?: string;
    vehicleModel?: string;
  };

  if (!prompt) {
    res.status(400).json({ error: "prompt is required." });
    return;
  }

  const vehicleStr = [vehicleYear, vehicleMake, vehicleModel].filter(Boolean).join(" ");
  const contextQuery = vehicleStr ? `${prompt} for ${vehicleStr}` : prompt;

  try {
    // Two parallel searches: one buying-intent, one editorial/review.
    // We intentionally do NOT ask Claude to produce URLs — only Tavily URLs are used.
    const [buyResults, reviewResults] = await Promise.all([
      tavilySearch(`buy ${contextQuery}`, 6),
      tavilySearch(`${contextQuery} review site:amazon.com OR site:extremeterrain.com OR site:quadratec.com OR site:summitracing.com OR site:carid.com OR site:autozone.com`, 6),
    ]);

    // Merge and deduplicate by hostname so each retailer appears at most once.
    const seen = new Set<string>();
    const merged: TavilyResult[] = [];
    for (const r of [...buyResults, ...reviewResults]) {
      const host = hostname(r.url);
      if (!seen.has(host)) {
        seen.add(host);
        merged.push(r);
      }
    }
    const top = merged.slice(0, 10);

    if (top.length === 0) {
      res.json({ results: [], vehicle: vehicleStr || null, query: contextQuery });
      return;
    }

    // Claude writes a 1-line description per result using the Tavily snippet.
    // It never touches or invents URLs — those come verbatim from Tavily.
    const descPrompt = `For each search result below, write ONE short sentence (max 15 words) describing what the product page is about, focusing on the off-road/vehicle mod angle. Return a JSON array of objects with a single "d" field, in the same order as the input.

${top.map((r, i) => `${i + 1}. "${r.title}" — ${r.content.slice(0, 200)}`).join("\n")}

Return ONLY valid JSON, e.g. [{"d":"..."}, ...]`;

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      temperature: 0,
      messages: [{ role: "user", content: descPrompt }],
    });

    const text = message.content.find((b) => b.type === "text")?.text ?? "[]";
    const match = text.match(/\[[\s\S]*\]/);
    let descs: { d: string }[] = [];
    try { descs = JSON.parse(match?.[0] ?? "[]") as { d: string }[]; } catch { descs = []; }

    const results: ModLinkResult[] = top.map((r, i) => ({
      title: r.title,
      url: r.url,
      source: hostname(r.url),
      description: descs[i]?.d ?? r.content.slice(0, 120),
    }));

    res.json({ results, vehicle: vehicleStr || null, query: contextQuery });
  } catch (err) {
    logger.error({ err }, "mods/search failed");
    res.status(500).json({ error: "Search failed. Please try again." });
  }
});

export default router;
