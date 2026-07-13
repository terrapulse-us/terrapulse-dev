import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../lib/logger";
import { runWebSearch } from "../lib/tools/web-search";

const router: IRouter = Router();

interface ModResult {
  name: string;
  brand: string;
  priceRange: string;
  description: string;
  url: string;
  retailer: string;
  why: string;
}

// Well-known off-road / overlanding retailers to encourage diversity.
// Intentionally broad so Claude doesn't anchor on any single one.
const DIVERSE_RETAILERS = [
  "amazon.com",
  "extremeterrain.com",
  "quadratec.com",
  "summitracing.com",
  "rockauto.com",
  "carid.com",
  "autozone.com",
  "jegs.com",
  "overlandbound.com",
  "trail4runner.com",
  "revzilla.com",
  "bestop.com",
  "arb4x4.com",
  "warn.com",
  "rancho.com",
  "bilstein.com",
  "fox.com",
  "iconvehicledynamics.com",
  "readylift.com",
  "superlift.com",
];

router.post("/mods/search", async (req, res): Promise<void> => {
  const { vehicleYear, vehicleMake, vehicleModel, vehicleType, category } = req.body as {
    vehicleYear?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleType?: string;
    category?: string;
  };

  if (!vehicleMake || !vehicleModel || !category) {
    res.status(400).json({ error: "vehicleMake, vehicleModel, and category are required." });
    return;
  }

  const vehicleStr = [vehicleYear, vehicleMake, vehicleModel].filter(Boolean).join(" ");
  const categoryLabel = category.replace(/_/g, " ");

  try {
    // Run two parallel searches: one for editorial reviews, one for shopping diversity.
    const [reviewSearch, shopSearch] = await Promise.all([
      runWebSearch({ query: `best ${categoryLabel} for ${vehicleStr} off-road review recommendation` }),
      runWebSearch({ query: `buy ${vehicleStr} ${categoryLabel} site:amazon.com OR site:extremeterrain.com OR site:quadratec.com OR site:summitracing.com OR site:carid.com` }),
    ]);

    type SearchResult = { title?: string; url?: string; snippet?: string };
    const reviewResults = ((reviewSearch as { results?: SearchResult[] }).results ?? []).slice(0, 4);
    const shopResults = ((shopSearch as { results?: SearchResult[] }).results ?? []).slice(0, 4);

    const prompt = `You are an expert off-road and overlanding vehicle modifier. A rider has a ${vehicleStr} (type: ${vehicleType ?? "unknown"}) and wants the best "${categoryLabel}" options for off-roading and overlanding.

SEARCH RESULTS — editorial reviews:
${JSON.stringify(reviewResults, null, 2)}

SEARCH RESULTS — shopping/retailers:
${JSON.stringify(shopResults, null, 2)}

Return a JSON array of exactly 5 product recommendations. Follow these rules strictly:

DIVERSITY RULES (critical — do not violate):
- Each recommendation must come from a DIFFERENT retailer/brand
- Do NOT use the same retailer more than once across the 5 results
- Mix price points: include at least 1 budget option, 2-3 mid-range, and 1 premium option
- Source URLs from the search results above whenever possible; if a result URL is unavailable for a specific product, use a direct brand website (e.g. bilstein.com, warn.com, arb4x4.com, fox.com, iconvehicledynamics.com) — never fabricate a product page path
- Draw from retailers like: amazon.com, extremeterrain.com, quadratec.com, summitracing.com, carid.com, jegs.com, revzilla.com and brand-direct sites

REQUIRED JSON fields per item:
- "name": full specific product name (e.g. "Bilstein 5100 Series Monotube Shock Absorber")
- "brand": manufacturer name (e.g. "Bilstein")
- "priceRange": realistic price string (e.g. "$280–$420 per pair" or "~$1,200 kit")
- "description": 1-2 sentences on the product and why it excels off-road
- "url": a URL from the search results above, or a brand/retailer homepage — no made-up deep paths
- "retailer": the retailer or brand domain this links to (e.g. "amazon.com")
- "why": 1 sentence on why this specifically suits the ${vehicleStr}

Return ONLY the JSON array. No markdown fences, no explanations, no other text.`;

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content.find((b) => b.type === "text")?.text ?? "[]";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    let mods: ModResult[] = [];
    if (jsonMatch) {
      try {
        mods = JSON.parse(jsonMatch[0]) as ModResult[];
      } catch {
        mods = [];
      }
    }

    // Deduplicate by retailer as a safety net in case the model ignored the rule.
    const seen = new Set<string>();
    const diverseMods = mods.filter((m) => {
      const key = (m.retailer ?? "").toLowerCase().replace(/^www\./, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json({ mods: diverseMods, vehicle: vehicleStr, category: categoryLabel });
  } catch (err) {
    logger.error({ err }, "mods/search failed");
    res.status(500).json({ error: "Mod search failed. Please try again." });
  }
});

export default router;
