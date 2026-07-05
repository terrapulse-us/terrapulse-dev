const FETCH_TIMEOUT_MS = 15_000;

export const webSearchToolDef = {
  name: "web_search",
  description:
    "Search the web for information not covered by the app's built-in trail, weather, " +
    "or camping data (e.g. vehicle mod recommendations, trip reports, gear advice). " +
    "Always cite the returned links in your final answer when you use this tool.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "The search query.",
      },
    },
    required: ["query"],
  },
};

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

interface TavilyResponse {
  results?: TavilyResult[];
}

export async function runWebSearch(args: { query?: unknown }) {
  const query = typeof args.query === "string" ? args.query : "";
  if (!query) {
    return { error: "No search query provided.", results: [] };
  }

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return {
      error: "Web search is not configured on the server (missing Tavily API key).",
      results: [],
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: 5,
        search_depth: "basic",
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      return { error: `Web search API returned an error (${resp.status}).`, results: [] };
    }

    const json = (await resp.json()) as TavilyResponse;
    const results = (json.results ?? []).slice(0, 5).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content?.slice(0, 400),
    }));

    return { results };
  } catch {
    return { error: "Web search timed out or failed.", results: [] };
  }
}
