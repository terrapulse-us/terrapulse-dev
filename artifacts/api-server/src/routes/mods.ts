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
  why: string;
}

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
    const searchQuery = `best ${categoryLabel} upgrades for ${vehicleStr} off-road overlanding buy`;
    const searchResult = await runWebSearch({ query: searchQuery });

    const prompt = `You are an expert off-road and overlanding vehicle modifier. A rider has a ${vehicleStr} and wants the best "${categoryLabel}" options for off-roading.

Based on the search results below, return a JSON array of 4-6 specific product recommendations.

Search results:
${JSON.stringify((searchResult as { results?: unknown[] }).results?.slice(0, 5) ?? [], null, 2)}

Return ONLY a valid JSON array. Each object must have exactly these fields:
- "name": specific product name (e.g. "Bilstein 5100 Series Monotube Shock Absorber")
- "brand": brand/manufacturer name (e.g. "Bilstein")
- "priceRange": realistic price string (e.g. "$280–$420 per pair" or "~$1,200 kit")
- "description": 1-2 sentences describing the product and its off-road benefits
- "url": a real retailer URL — prefer URLs from the search results; if none available use known retailers like 4wheelparts.com, extremeterrain.com, or amazon.com with a plausible path
- "why": 1 sentence specifically explaining why this is a great choice for the ${vehicleStr}

If search results are limited, draw on your expert knowledge of reputable off-road brands.
Return only the JSON array, no markdown, no other text.`;

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

    res.json({ mods, vehicle: vehicleStr, category: categoryLabel });
  } catch (err) {
    logger.error({ err }, "mods/search failed");
    res.status(500).json({ error: "Mod search failed. Please try again." });
  }
});

export default router;
