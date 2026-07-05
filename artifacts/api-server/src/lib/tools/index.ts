import type { AssistantVehicleProfile } from "@workspace/api-zod";
import type { AssistantStructuredData } from "@workspace/db";
import { trailBriefingToolDef, runTrailBriefing } from "./trail-briefing";
import { campingToolDef, runCamping } from "./camping";
import { fitCheckToolDef, runFitCheck } from "./fit-check";
import { webSearchToolDef, runWebSearch } from "./web-search";
import { cellCoverageToolDef, runCellCoverage } from "./cell-coverage";
import { itineraryToolDef, runItinerary } from "./itinerary";

export const AGENT_TOOL_DEFS = [
  trailBriefingToolDef,
  campingToolDef,
  fitCheckToolDef,
  webSearchToolDef,
  cellCoverageToolDef,
  itineraryToolDef,
];

/**
 * Dispatches a tool call by name. Vehicle profile context is bound here
 * (not supplied by the model) so the LLM can never fabricate vehicle specs —
 * it only ever sees the deterministic result of the comparison.
 *
 * Never throws: tool failures are caught and returned as a JSON-serializable
 * error payload so the agent loop can report `is_error: true` without crashing.
 */
export async function runTool(
  name: string,
  input: Record<string, unknown>,
  vehicleProfile: AssistantVehicleProfile | undefined,
): Promise<{ result: unknown; isError: boolean; structuredData?: AssistantStructuredData }> {
  try {
    switch (name) {
      case "get_trail_briefing":
        return { result: await runTrailBriefing(input), isError: false };
      case "find_campgrounds_near_trail":
        return { result: await runCamping(input), isError: false };
      case "check_vehicle_fit":
        return { result: runFitCheck(input, vehicleProfile), isError: false };
      case "web_search":
        return { result: await runWebSearch(input), isError: false };
      case "check_cell_coverage": {
        const coverage = await runCellCoverage(input);
        // Deterministic decision (not left to the model): only surface a
        // download offer when the heuristic actually indicates a problem.
        if (
          "level" in coverage &&
          (coverage.level === "patchy" || coverage.level === "poor") &&
          typeof coverage.trail === "object" &&
          coverage.trail
        ) {
          const trail = coverage.trail as { id: string; title: string; lat: number; lng: number };
          return {
            result: coverage,
            isError: false,
            structuredData: {
              coverageWarning: {
                trailId: trail.id,
                trailTitle: trail.title,
                lat: trail.lat,
                lng: trail.lng,
                level: coverage.level,
                note:
                  coverage.level === "poor"
                    ? "Cell service is likely nonexistent out here — this is an estimate based on nearby tower density, not a guarantee."
                    : "Cell service is often spotty out here — this is an estimate based on nearby tower density, not a guarantee.",
              },
            },
          };
        }
        return { result: coverage, isError: false };
      }
      case "present_itinerary": {
        const parsed = runItinerary(input);
        if (parsed.error) {
          return { result: { error: parsed.error }, isError: true };
        }
        return {
          result: {
            ok: true,
            message:
              "Itinerary presented to the user as cards. Do not restate the full day-by-day plan " +
              "as prose in your reply — just add a brief closing note.",
          },
          isError: false,
          structuredData: { itinerary: parsed.itinerary },
        };
      }
      default:
        return { result: { error: `Unknown tool: ${name}` }, isError: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: { error: `Tool "${name}" failed: ${message}` }, isError: true };
  }
}
