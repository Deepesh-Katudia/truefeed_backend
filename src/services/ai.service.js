const logger = require("../utils/logger");
const gemini = require("./geminiService");

function isNotApplicable(content = "", mediaUrl = "") {
  const text = String(content || "").toLowerCase();
  const hasSource = /http|source|study|report|news|paper|journal/.test(text);
  const hasClaimWords = /claims?|breaking|cures?|proves?|reveals?|alleg(ed|es)|evidence|research/.test(text);
  const hasNumber = /\d/.test(text);
  const isShortPersonal = text.length < 40 && !hasSource && !hasClaimWords && !hasNumber;
  const isOnlyMedia = !text.trim() && !!mediaUrl;
  return isShortPersonal || isOnlyMedia || (!hasSource && !hasClaimWords && !hasNumber && text.length < 100);
}

async function analyzePost(content, mediaUrl) {
  const now = new Date();
  if (isNotApplicable(content, mediaUrl)) {
    return {
      tag: "Not Applicable",
      summary: "Personal update or non-factual content.",
      score: null,
      raw: null,
      updatedAt: now,
      error: null,
    };
  }
  try {
    const prompt = `
    You are a strict fact-checker. Analyze credibility of:
    "${content}"
    Return structured fields: credibility_score(0-5), fact_check_status(verified|misleading|debunked|outdated|unverified), summary(<=200 chars).
    `;
    const res = await gemini.checkCredibility(prompt);
    const status = String(res?.fact_check_status || "").toLowerCase();
    const tag =
      status === "verified"
        ? "Verified"
        : status === "misleading" || status === "debunked" || status === "outdated"
        ? "Misleading"
        : "Unverified";
    const scoreFive = typeof res?.credibility_score === "number" ? res.credibility_score : null;
    const score = scoreFive == null ? null : Math.max(0, Math.min(100, Math.round(scoreFive * 20)));
    const summary = String(res?.summary || "").slice(0, 200);
    return {
      tag,
      summary,
      score,
      raw: res || null,
      updatedAt: now,
      error: null,
    };
  } catch (e) {
    logger.warn("AI analyzePost failed: %o", e?.message || e);
    return {
      tag: "Pending",
      summary: "",
      score: null,
      raw: null,
      updatedAt: now,
      error: e?.message || "AI_ERROR",
    };
  }
}

module.exports = { analyzePost };
