import { z } from "zod/v4";
import type { AssistantItinerary } from "@workspace/db";

const itineraryDaySchema = z.object({
  day: z.number(),
  driveTime: z.string().optional(),
  trailWindow: z.string().optional(),
  weatherNote: z.string().optional(),
  campground: z.string().optional(),
});

const itinerarySchema = z.object({
  title: z.string(),
  days: z.array(itineraryDaySchema).min(1),
});

export const itineraryToolDef = {
  name: "present_itinerary",
  description:
    "Present a structured, multi-day trip itinerary to the user as itinerary cards (not prose). " +
    "Call this LAST, only after you've already gathered the facts you need with get_trail_briefing " +
    "(for weather + trail requirements) and find_campgrounds_near_trail (for lodging suggestions). " +
    "Use this whenever the user asks you to 'plan a trip', 'plan a weekend', or build a day-by-day " +
    "itinerary. Do not also restate the full itinerary as prose in your final text reply — just add " +
    "a short one- or two-sentence intro before calling this tool.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: {
        type: "string",
        description: 'Short title for the trip, e.g. "Weekend at Rubicon Trail".',
      },
      days: {
        type: "array",
        description: "One entry per day of the trip, in order.",
        items: {
          type: "object",
          properties: {
            day: { type: "integer", description: "1-indexed day number." },
            driveTime: {
              type: "string",
              description: 'Estimated drive time/distance for this day, e.g. "2.5 hrs from Sacramento".',
            },
            trailWindow: {
              type: "string",
              description: "The trail segment or time window planned for this day.",
            },
            weatherNote: {
              type: "string",
              description: 'Weather-aware note for this day, e.g. "Clear skies, high of 78F".',
            },
            campground: {
              type: "string",
              description: "Suggested campground/lodging for the night of this day, if any.",
            },
          },
          required: ["day"],
        },
      },
    },
    required: ["title", "days"],
  },
};

export function runItinerary(args: unknown): { itinerary?: AssistantItinerary; error?: string } {
  const parsed = itinerarySchema.safeParse(args);
  if (!parsed.success) {
    return {
      error:
        "Invalid itinerary shape: " +
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  return { itinerary: parsed.data };
}
