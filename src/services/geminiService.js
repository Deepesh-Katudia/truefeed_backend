const OpenAI = require("openai");
const { OPENAI_API_KEY, OPENAI_MODEL_NAME } = require("../config/envPath");

const client = new OpenAI({ apiKey: OPENAI_API_KEY });
const MODEL = OPENAI_MODEL_NAME || "gpt-4o-mini";

/**
 * This schema is ONLY for the model's structured output.
 * Sources will be extracted from the web_search tool output (real citations),
 * and then appended to the final object.
 */
const credibilitySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    credibility_score: { type: "number" },
    fact_check_status: {
      type: "string",
      enum: ["verified", "misleading", "debunked", "unverified", "outdated"],
    },
    summary: { type: "string" },
  },
  required: ["credibility_score", "fact_check_status", "summary"],
};

function extractSourcesFromResponse(resp) {
  // The Responses API returns tool outputs inside resp.output
  // We try to find the web search output and extract sources/urls.
  const sources = [];

  const output = resp?.output || [];
  for (const item of output) {
    // Web search tool outputs usually appear as items with type like "web_search_call"
    // and include "action" results/sources.
    if (item?.type === "web_search_call") {
      const toolSources = item?.action?.sources || item?.sources || [];
      for (const s of toolSources) {
        const url = s?.url || s?.source?.url || s?.link;
        const title = s?.title || s?.source?.title;
        if (url) sources.push(title ? `${title} - ${url}` : url);
      }
    }
  }

  // De-dup + limit
  return Array.from(new Set(sources)).slice(0, 5);
}

async function checkCredibility(text) {
  const instructions = `
You are a strict fact-checker for a social app. You MUST use web search results.

Return ONLY JSON that matches the schema.

SCORING RULES (mandatory):
- verified    => credibility_score MUST be 5
- misleading  => credibility_score MUST be 3
- outdated    => credibility_score MUST be 2
- unverified  => credibility_score MUST be 1
- debunked    => credibility_score MUST be 0

STATUS RULES:
- "verified" only if multiple reliable sources clearly support the claim (or one authoritative primary source).
- "debunked" if reliable sources clearly contradict the claim.
- "outdated" if it used to be true but is no longer true.
- "misleading" if partly true but missing key context, cherry-picked, or phrased to imply something false.
- "unverified" if sources are insufficient, conflicting, or not reputable.

SOURCES RULE:
- Put 1–5 sources in the "sources" array (URLs). Prefer authoritative sources.
`;

  try {
    const resp = await client.responses.create({
      model: MODEL,

      // ✅ Use the preview web search tool (most reliable for grounding)
      tools: [{ type: "web_search_preview" }],
      tool_choice: "auto",

      instructions,
      input: `Claim: ${text}`,

      // ✅ Force strict JSON for the credibility object
      text: {
        format: {
          type: "json_schema",
          name: "credibility_result",
          schema: credibilitySchema,
          strict: true,
        },
      },

      // ✅ Ask the API to include tool sources in the response payload
      include: ["web_search_call.action.sources"],
    });

    const raw = resp.output_text || "{}";
    const result = JSON.parse(raw);

    // ✅ Attach real sources (from tool output)
    const sources = extractSourcesFromResponse(resp);

    return { ...result, sources };
  } catch (e) {
    console.error("OPENAI /check failed:", {
      status: e?.status,
      message: e?.message,
      error: e?.error,
    });
    throw e;
  }
}

module.exports = { checkCredibility };
