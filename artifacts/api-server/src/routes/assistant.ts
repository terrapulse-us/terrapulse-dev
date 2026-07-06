import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, conversations, messages, type AssistantStructuredData } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  ListAssistantConversationsHeader,
  ListAssistantConversationsResponse,
  CreateAssistantConversationHeader,
  CreateAssistantConversationBody,
  GetAssistantConversationParams,
  GetAssistantConversationHeader,
  GetAssistantConversationResponse,
  DeleteAssistantConversationParams,
  DeleteAssistantConversationHeader,
  SendAssistantMessageParams,
  SendAssistantMessageHeader,
  SendAssistantMessageBody,
} from "@workspace/api-zod";
import { AGENT_TOOL_DEFS, runTool } from "../lib/tools";

// Anthropic SDK types are derived from the client instance rather than imported
// from internal subpaths (e.g. "@anthropic-ai/sdk/resources/messages"), which
// are not resolvable under this project's module resolution / package exports.
type CreateParams = Parameters<typeof anthropic.messages.create>[0];
type MessageParam = CreateParams["messages"][number];
type ContentBlockParam = MessageParam["content"] extends string | infer C
  ? C extends Array<infer Block>
    ? Block
    : never
  : never;
type Tool = NonNullable<CreateParams["tools"]>[number];
type AgentResponse = Extract<
  Awaited<ReturnType<typeof anthropic.messages.create>>,
  { content: unknown }
>;
type TextBlock = Extract<AgentResponse["content"][number], { type: "text" }>;

const router: IRouter = Router();

// Node/Express always lowercases incoming header names (e.g. "x-user-id"), but the
// OpenAPI-generated Zod header schemas use the spec's original casing ("X-User-Id").
// Normalize before validating so the schemas actually match at runtime.
function userIdHeader(req: import("express").Request): { "X-User-Id": unknown } {
  return { "X-User-Id": req.headers["x-user-id"] };
}

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 8192;
const MAX_TOOL_ITERATIONS = 8;

const SYSTEM_PROMPT = `You are TerraPulse's AI trip-planning assistant for off-road, overlanding, and \
4x4 trips across the United States. You have tools to look up real trail data, \
live weather forecasts, nearby campgrounds, a deterministic vehicle-fit check, a cell-coverage \
estimate, and a structured itinerary presenter.

Rules:
- Always use a tool instead of guessing when the user asks about a specific trail's conditions, \
weather, camping options, or whether their vehicle can handle a trail.
- The vehicle-fit tool automatically applies the user's saved vehicle profile — you only need to \
supply the trail name.
- REQUIRED: whenever a specific trail is named in the conversation, you MUST call \
check_cell_coverage for it before your final reply — this is mandatory, not optional, even if the \
user didn't explicitly ask about cell service. Never answer a cell-service/signal question using \
web_search or general knowledge — check_cell_coverage is the only source of truth for coverage on a \
named trail, since it queries live tower-density data (web search results about "cell coverage on \
the trail" are almost always stale/anecdotal forum posts, not authoritative). If the result comes \
back "patchy" or "poor", mention it plainly in your reply (e.g. "cell service is often spotty out \
here") using the tool's caveat — never state it as a guaranteed fact — the app will automatically \
offer a "Download offline map?" action alongside your reply, so you don't need to ask the user to do \
anything else about it yourself.
- REQUIRED: when the user asks you to plan a trip, a weekend outing, or a day-by-day itinerary, you \
MUST call present_itinerary as the final tool before replying — never describe the day-by-day plan \
in prose instead of calling it. First gather facts with get_trail_briefing, find_campgrounds_near_trail, \
and check_cell_coverage, then call present_itinerary with the structured plan built from those \
results. Keep your accompanying text reply brief (a sentence or two) since the itinerary itself is \
rendered as cards in the chat — do not restate the day-by-day plan as prose, and do not skip calling \
the tool just because you already have enough information to write the plan yourself.
- When you use web_search, always cite the returned links in your final answer.
- Be concise, practical, and friendly. Use plain text (no markdown headers).
- Always remind users to verify current trail and weather conditions locally before heading out, \
especially for anything safety-related.`;

const TOOLS = AGENT_TOOL_DEFS as Tool[];

router.get("/assistant/conversations", async (req, res): Promise<void> => {
  const header = ListAssistantConversationsHeader.safeParse(userIdHeader(req));
  if (!header.success) {
    res.status(400).json({ error: header.error.message });
    return;
  }

  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, header.data["X-User-Id"]))
    .orderBy(desc(conversations.createdAt));

  res.json(ListAssistantConversationsResponse.parse(rows));
});

router.post("/assistant/conversations", async (req, res): Promise<void> => {
  const header = CreateAssistantConversationHeader.safeParse(userIdHeader(req));
  if (!header.success) {
    res.status(400).json({ error: header.error.message });
    return;
  }

  const body = CreateAssistantConversationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [row] = await db
    .insert(conversations)
    .values({
      userId: header.data["X-User-Id"],
      title: body.data.title?.trim() || "New Trip Chat",
    })
    .returning();

  res.status(201).json(row);
});

router.get("/assistant/conversations/:id", async (req, res): Promise<void> => {
  const params = GetAssistantConversationParams.safeParse(req.params);
  const header = GetAssistantConversationHeader.safeParse(userIdHeader(req));
  if (!params.success || !header.success) {
    res.status(400).json({ error: (params.error ?? header.error)?.message });
    return;
  }

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, params.data.id),
        eq(conversations.userId, header.data["X-User-Id"]),
      ),
    );

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(asc(messages.createdAt));

  res.json(GetAssistantConversationResponse.parse({ ...conversation, messages: rows }));
});

router.delete("/assistant/conversations/:id", async (req, res): Promise<void> => {
  const params = DeleteAssistantConversationParams.safeParse(req.params);
  const header = DeleteAssistantConversationHeader.safeParse(userIdHeader(req));
  if (!params.success || !header.success) {
    res.status(400).json({ error: (params.error ?? header.error)?.message });
    return;
  }

  const [deleted] = await db
    .delete(conversations)
    .where(
      and(
        eq(conversations.id, params.data.id),
        eq(conversations.userId, header.data["X-User-Id"]),
      ),
    )
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.sendStatus(204);
});

function sseWrite(res: import("express").Response, event: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

router.post("/assistant/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = SendAssistantMessageParams.safeParse(req.params);
  const header = SendAssistantMessageHeader.safeParse(userIdHeader(req));
  if (!params.success || !header.success) {
    res.status(400).json({ error: (params.error ?? header.error)?.message });
    return;
  }

  const body = SendAssistantMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const userId = header.data["X-User-Id"];
  const conversationId = params.data.id;

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const priorMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));

  const [userMessage] = await db
    .insert(messages)
    .values({
      conversationId,
      role: "user",
      content: body.data.content,
    })
    .returning();

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const agentMessages: MessageParam[] = [
    ...priorMessages.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
    { role: "user", content: userMessage.content },
  ];

  const toolsUsedAll: string[] = [];
  let finalText = "";
  const structuredData: AssistantStructuredData = {};

  try {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: agentMessages,
      });

      if (response.stop_reason === "tool_use") {
        agentMessages.push({ role: "assistant", content: response.content });

        const toolResultBlocks: ContentBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== "tool_use") continue;

          sseWrite(res, { type: "tool_call", tool: block.name });
          toolsUsedAll.push(block.name);

          const {
            result,
            isError,
            structuredData: toolStructuredData,
          } = await runTool(
            block.name,
            (block.input as Record<string, unknown>) ?? {},
            body.data.vehicleProfile,
          );

          if (toolStructuredData?.coverageWarning) {
            structuredData.coverageWarning = toolStructuredData.coverageWarning;
            sseWrite(res, { type: "coverage_warning", coverageWarning: toolStructuredData.coverageWarning });
          }
          if (toolStructuredData?.itinerary) {
            structuredData.itinerary = toolStructuredData.itinerary;
            sseWrite(res, { type: "itinerary", itinerary: toolStructuredData.itinerary });
          }

          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
            is_error: isError,
          });
        }

        agentMessages.push({ role: "user", content: toolResultBlocks });
        continue;
      }

      finalText = response.content
        .filter((block): block is TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n\n");
      break;
    }

    if (!finalText) {
      finalText =
        "I wasn't able to finish that request after checking several data sources. " +
        "Could you try rephrasing, or ask about one thing at a time?";
    }

    const words = finalText.split(/(\s+)/);
    const chunkSize = 6;
    for (let i = 0; i < words.length; i += chunkSize) {
      sseWrite(res, { type: "text", content: words.slice(i, i + chunkSize).join("") });
      await sleep(15);
    }

    const hasStructuredData = Object.keys(structuredData).length > 0;

    await db.insert(messages).values({
      conversationId,
      role: "assistant",
      content: finalText,
      toolsUsed: toolsUsedAll.length > 0 ? toolsUsedAll : null,
      structuredData: hasStructuredData ? structuredData : null,
    });

    sseWrite(res, { type: "done", toolsUsed: toolsUsedAll });
  } catch (err) {
    req.log.error({ err }, "Assistant agent loop failed");
    sseWrite(res, {
      type: "error",
      message: "The assistant ran into a problem answering that. Please try again.",
    });
  } finally {
    res.end();
  }
});

export default router;
