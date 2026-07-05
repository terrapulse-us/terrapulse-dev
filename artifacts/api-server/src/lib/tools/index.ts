import type { AssistantVehicleProfile } from "@workspace/api-zod";
import { trailBriefingToolDef, runTrailBriefing } from "./trail-briefing";
import { campingToolDef, runCamping } from "./camping";
import { fitCheckToolDef, runFitCheck } from "./fit-check";
import { webSearchToolDef, runWebSearch } from "./web-search";

export const AGENT_TOOL_DEFS = [
  trailBriefingToolDef,
  campingToolDef,
  fitCheckToolDef,
  webSearchToolDef,
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
): Promise<{ result: unknown; isError: boolean }> {
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
      default:
        return { result: { error: `Unknown tool: ${name}` }, isError: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: { error: `Tool "${name}" failed: ${message}` }, isError: true };
  }
}
