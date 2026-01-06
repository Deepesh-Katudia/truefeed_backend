const genAI = require("@google/genai");
const { GEMINI_API_KEY, GEMINI_MODEL_NAME } = require("../config/envPath");

const ai = new genAI.GoogleGenAI({ apiKey: GEMINI_API_KEY });

const credibilitySchema = {
  type: "OBJECT",
  properties: {
    credibility_score: {
      type: "NUMBER",
      description:
        "Score 0-5. 5=Verified Current Fact. 4=Mostly True (minor details off). 3=Technically True but Misleading or Missing Context (e.g. correlation vs causation). 2=Outdated Fact or Historical Myth (was true, now false). 0-1=False/Debunked.",
    },
    fact_check_status: {
      type: "STRING",
      enum: ["verified", "misleading", "debunked", "unverified", "outdated"],
    },
    summary: {
      type: "STRING",
      description: "A short explanation of the facts found.",
    },
  },
  required: ["credibility_score", "fact_check_status", "summary"],
};

const groundingTool = {
  googleSearch: {},
};

const config = {
  tools: [groundingTool],
  responseMimeType: "application/json",
  responseSchema: credibilitySchema,
};

function buildContents(text) {
  return [
    {
      role: "user",
      parts: [{ text }],
    },
  ];
}

async function generate() {
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL_NAME,
    contents: buildContents("who is the president of the united states?"),
    config,
  });
  return response.text;
}

async function checkCredibility(text) {
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL_NAME,
      contents: buildContents(text),
      config,
    });
    const raw = response?.text || "{}";
    return JSON.parse(raw);
  } catch (err) {
    throw err;
  }
}

module.exports = { generate, checkCredibility };
