const ai = require("../services/geminiService");
const logger = require("../utils/logger");

async function generateAIContent(req, res) {
  try {
    const response = await ai.generate();
    return res.status(200).json({ response });
  } catch (error) {
    console.error("Error generating AI content:", error);
    return res.status(500).json({ error: "Failed to generate AI content" });
  }
}

async function checkAICredibility(req, res) {
  logger.info("Received credibility check request: %o", req.body);

  try {
    const { checkFor } = req.body;

    if (!checkFor) {
      return res.status(400).json({ error: "Missing text to check" });
    }

    // IMPORTANT: pass raw statement, let service do the formatting + JSON schema
    const result = await ai.checkCredibility(checkFor);

    // Keep same response shape frontend expects
    return res.status(200).json({ response: result });
  } catch (error) {
    console.error("Error checking AI credibility:", error);
    return res.status(500).json({ error: "Failed to check AI credibility" });
  }
}

module.exports = { generateAIContent, checkAICredibility };
