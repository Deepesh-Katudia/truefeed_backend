const express = require("express");
const router = express.Router();
const controller = require("../../controllers/postController");
const multer = require("multer");
const { uploadBufferToUploadsBucket } = require("../../services/storageService");

// Multer memory storage for post media
const uploadMedia = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ok = /^(image\/(png|jpeg|jpg|gif|webp)|video\/(mp4|webm|ogg))$/i.test(
      file.mimetype || ""
    );
    cb(null, ok);
  },
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Create a new post (JSON)
router.post("/", async (req, res, next) => {
  // Minimal validation (avoids validateBody crash)
  const content = typeof req.body?.content === "string" ? req.body.content : "";
  const mediaUrl = typeof req.body?.mediaUrl === "string" ? req.body.mediaUrl : "";

  // Put validatedBody in the shape your controller already uses
  req.validatedBody = {
    content: content.slice(0, 2000),
    mediaUrl: mediaUrl.slice(0, 1024),
  };

  return controller.create(req, res, next);
});

// List current user's posts
router.get("/mine", controller.myPosts);

// Upload media for a post (multipart/form-data, field name: media)
router.post("/upload-media", uploadMedia.single("media"), async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const safeName = (req.file.originalname || "file").replace(/\s+/g, "_");
    const path = `posts/${userId}/${Date.now()}-${safeName}`;

    const url = await uploadBufferToUploadsBucket({
      path,
      buffer: req.file.buffer,
      contentType: req.file.mimetype,
    });

    return res.status(201).json({ url });
  } catch (e) {
    req.logger?.error("post upload error: %o", e);
    return res.status(500).json({ error: "upload failed" });
  }
});

// Create a post and upload media in one step (multipart/form-data)
router.post("/create-with-media", uploadMedia.single("media"), async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const content =
    typeof req.body?.content === "string" ? req.body.content.slice(0, 2000) : "";

  const rawAi = req.body?.ai;
  let aiFromClient = null;
  try {
    if (rawAi && typeof rawAi === "object") aiFromClient = rawAi;
    else if (rawAi && typeof rawAi === "string") aiFromClient = JSON.parse(rawAi);
  } catch {}

  const map = {
    verified: "Verified",
    misleading: "Misleading",
    debunked: "False",
    outdated: "Outdated",
    unverified: "Unverified",
    "not applicable": "Not Applicable",
  };

  const aiPayload =
    aiFromClient && typeof aiFromClient === "object"
      ? {
          tag: map[String(aiFromClient.fact_check_status || "").toLowerCase()] || "Unverified",
          summary: aiFromClient.summary || "",
          score:
            typeof aiFromClient.credibility_score === "number"
              ? Math.round(aiFromClient.credibility_score)
              : null,
        }
      : { tag: "Pending", summary: "", score: null };

  let mediaUrl = "";

  try {
    if (req.file) {
      const safeName = (req.file.originalname || "file").replace(/\s+/g, "_");
      const path = `posts/${userId}/${Date.now()}-${safeName}`;

      mediaUrl = await uploadBufferToUploadsBucket({
        path,
        buffer: req.file.buffer,
        contentType: req.file.mimetype,
      });
    }

    const postModel = require("../../models/postModel");
    const insert = await postModel.createPost({
      userId,
      content,
      mediaUrl,
      ai: aiPayload,
    });

    if (!aiFromClient) {
      const { analyzePost } = require("../../services/ai.service");
      const logger = require("../../utils/logger");
      setImmediate(async () => {
        try {
          const ai = await analyzePost(content || "", mediaUrl || "");
          await postModel.updatePostAI(insert.insertedId, ai);
        } catch (e) {
          logger.error("AI analysis error for post %s: %o", String(insert.insertedId), e?.message || e);
        }
      });
    }

    return res.status(201).json({
      id: insert.insertedId,
      mediaUrl: mediaUrl || undefined,
      ai: { tag: aiPayload.tag },
    });
  } catch (e) {
    req.logger?.error("create-with-media error: %o", e);
    return res.status(500).json({ error: "upload or create failed" });
  }
});

// Likes
router.post("/:id/like", controller.like);
router.post("/:id/unlike", controller.unlike);

// Comments
router.post("/:id/comment", controller.comment);
router.delete("/:id/comment/:commentId", controller.deleteComment);

module.exports = router;
