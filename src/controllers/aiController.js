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
    let { checkFor } = req.body;

    if (!checkFor) {
      return res.status(400).json({ error: "Missing text to check" });
    }
    const prompt = `
    You are a strict fact-checker. 
    Analyze the credibility of the following statement using Google Search.
    
    STATEMENT: "${checkFor}"
    
    Verify if this is:
    1. Currently True
    2. Historically True but Outdated (Context required)
    3. False/Misleading
    `;

    const response = await ai.checkCredibility(prompt);
    return res.status(200).json({ response });
  } catch (error) {
    console.error("Error checking AI credibility:", error);
    return res.status(500).json({ error: "Failed to check AI credibility" });
  }
}

module.exports = { generateAIContent, checkAICredibility };
