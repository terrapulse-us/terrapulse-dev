import { fetch as expoFetch } from "expo/fetch";
import type {
  AssistantVehicleProfile,
  AssistantCoverageWarning,
  AssistantItinerary,
} from "@workspace/api-client-react";
import { apiServerUrl } from "@/lib/api-client";

export type AssistantStreamEvent =
  | { type: "tool_call"; tool: string }
  | { type: "text"; content: string }
  | { type: "coverage_warning"; coverageWarning: AssistantCoverageWarning }
  | { type: "itinerary"; itinerary: AssistantItinerary }
  | { type: "done"; toolsUsed: string[] }
  | { type: "error"; message: string };

export type AssistantMode = "offroad" | "camping" | "hiking";

/**
 * Streams a single agent turn over SSE. Resolves once the stream ends
 * (after a "done" or "error" event, or the connection closing).
 */
export async function streamAssistantMessage(
  conversationId: number,
  userId: string,
  content: string,
  vehicleProfile: AssistantVehicleProfile | undefined,
  onEvent: (event: AssistantStreamEvent) => void,
  mode: AssistantMode = "offroad",
): Promise<void> {
  if (!apiServerUrl) {
    onEvent({ type: "error", message: "API server is not configured." });
    return;
  }

  const url = `${apiServerUrl.replace(/\/+$/, "")}/api/assistant/conversations/${conversationId}/messages`;

  let res: Response;
  try {
    res = await expoFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": userId,
      },
      body: JSON.stringify({ content, vehicleProfile, mode }),
    });
  } catch (err) {
    onEvent({
      type: "error",
      message: err instanceof Error ? err.message : "Network request failed.",
    });
    return;
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    onEvent({ type: "error", message: text || `Request failed (${res.status})` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIndex: number;
    while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) continue;

      const jsonStr = dataLine.slice(5).trim();
      if (!jsonStr) continue;

      try {
        onEvent(JSON.parse(jsonStr) as AssistantStreamEvent);
      } catch {
        // Ignore malformed SSE frames rather than crashing the stream loop.
      }
    }
  }
}
