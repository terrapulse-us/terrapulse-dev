import { z } from "zod/v4";
import type { AssistantItinerary } from "@workspace/db";

const itineraryDaySchema = z.object({
  day: z.number(),
  date: z.string().optional(),
  plan: z.string().optional(),
  driveTime: z.string().optional(),
  trailWindow: z.string().optional(),
  weatherNote: z.string().optional(),
  campground: z.string().optional(),
  reserveUrl: z.string().optional(),
});

const itinerarySchema = z.object({
  title: z.string(),
  dates: z.string().optional(),
  destinationName: z.string().optional(),
  destinationLat: z.number().optional(),
  destinationLng: z.number().optional(),
  cellNote: z.string().optional(),
  waterNote: z.string().optional(),
  shelterNote: z.string().optional(),
  packingNote: z.string().optional(),
  days: z.array(itineraryDaySchema).min(1),
});

export const itineraryToolDef = {
  name: "present_itinerary",
  description:
    "Present a structured, multi-day trip itinerary to the user as itinerary cards (not prose). " +
    "Call this LAST, only after you've already gathered the facts you need with get_trail_briefing " +
    "(for weather + trail requirements), find_campgrounds_near_trail (for lodging suggestions), and " +
    "check_cell_coverage (for the cellNote field). " +
    "Use this whenever the user asks you to 'plan a trip', 'plan a weekend', or build a day-by-day " +
    "itinerary. Fill in as many of the optional fields as your gathered data supports — destination " +
    "coordinates, dates, per-day plans, campground reservation links, and the cell/water/shelter/packing " +
    "notes make the card far more useful. Do not also restate the full itinerary as prose in your final " +
    "text reply — just add a short one- or two-sentence intro before calling this tool.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: {
        type: "string",
        description: 'Short title for the trip, e.g. "Weekend at Rubicon Trail".',
      },
      dates: {
        type: "string",
        description:
          'Human-readable date range for the trip, e.g. "May 15-18, 2026". Include when the user ' +
          "gave dates or you proposed specific ones.",
      },
      destinationName: {
        type: "string",
        description: "Primary destination (trail, area, or park) the trip centers on.",
      },
      destinationLat: {
        type: "number",
        description:
          "Latitude of the primary destination, taken from get_trail_briefing or " +
          "find_campgrounds_near_trail results — never guessed.",
      },
      destinationLng: {
        type: "number",
        description: "Longitude of the primary destination, from the same tool results as destinationLat.",
      },
      cellNote: {
        type: "string",
        description:
          "One-line cell-coverage summary for the trip area, based on the check_cell_coverage result " +
          '(e.g. "Patchy service on the trail - download offline maps before you go").',
      },
      waterNote: {
        type: "string",
        description:
          'Water availability note, e.g. "No potable water on the trail - bring 2 gal/person/day".',
      },
      shelterNote: {
        type: "string",
        description:
          'Shelter/lodging overview, e.g. "Developed campground night 1, dispersed camping night 2".',
      },
      packingNote: {
        type: "string",
        description:
          'Short packing/gear reminder tailored to the forecast and terrain, e.g. "Nights drop to 38F - pack a 20F bag".',
      },
      days: {
        type: "array",
        description: "One entry per day of the trip, in order.",
        items: {
          type: "object",
          properties: {
            day: { type: "integer", description: "1-indexed day number." },
            date: {
              type: "string",
              description: 'Calendar date for this day when known, e.g. "Fri, May 15".',
            },
            plan: {
              type: "string",
              description:
                "Main activity plan for this day - trails to run, hikes, sights, key milestones. " +
                "1-3 sentences.",
            },
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
            reserveUrl: {
              type: "string",
              description:
                "Reservation or info URL for this day's campground (e.g. the recreation.gov link " +
                "returned by find_campgrounds_near_trail or found via web_search). Only include real " +
                "URLs from tool results - never invent one.",
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
