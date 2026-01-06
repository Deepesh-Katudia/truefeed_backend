const express = require("express");
const router = express.Router();

const controller = require("../../controllers/aiController");

// GET /api/v1/gemini/generate
router.get("/generate", controller.generateAIContent);

// POST /api/v1/gemini/check
router.post("/check", controller.checkAICredibility);

module.exports = router;
