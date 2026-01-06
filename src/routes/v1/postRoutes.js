const express = require("express");
const router = express.Router();
const controller = require("../../controllers/postController");
const { validateBody, sanitizeString } = require("../../middleware/validate");
const multer = require("multer");
const { connect } = require("../../config/dbConnection");
const { GridFSBucket } = require("mongodb");

// Multer memory storage for GridFS (post media)
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

// Create a new post (validated)
router.post(
  "/",
  validateBody({
    content: { type: "string", required: false, maxLen: 2000 },
    mediaUrl: { type: "string", required: false, maxLen: 1024, format: "url" },
  }),
  controller.create
);

// List current user's posts
router.get("/mine", controller.myPosts);

// Upload media for a post (multipart/form-data, field name: media)
router.post("/upload-media", uploadMedia.single("media"), async (req, res) => {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const { client, db } = await connect("write");
  try {
    const bucket = new GridFSBucket(db, { bucketName: "uploads" });
    const filename = `${req.session.userId}-post-${Date.now()}-${(
      req.file.originalname || "file"
    ).replace(/\s+/g, "_")}`;
    const uploadStream = bucket.openUploadStream(filename, {
      contentType: req.file.mimetype || "application/octet-stream",
      metadata: { userId: req.session.userId, kind: "post" },
    });
    uploadStream.end(req.file.buffer);
    uploadStream.on("finish", async (file) => {
      await client.close();
      return res
        .status(201)
        .json({ url: `/api/v1/files/${file._id.toString()}` });
    });
    uploadStream.on("error", async () => {
      await client.close();
      return res.status(500).json({ error: "upload failed" });
    });
  } catch (e) {
    await client.close();
    return res.status(500).json({ error: "upload failed" });
  }
});

// Create a post and upload media in one step (multipart/form-data)
router.post(
  "/create-with-media",
  uploadMedia.single("media"),
  async (req, res) => {
    if (!req.session || !req.session.userId)
      return res.status(401).json({ error: "Not authenticated" });

    const content =
      typeof req.body?.content === "string"
        ? sanitizeString(req.body.content, { maxLen: 2000 })
        : "";

    // Optional AI from client (stringified JSON)
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
    let fileId = null;

    if (req.file) {
      const { client, db } = await connect("write");
      try {
        const bucket = new GridFSBucket(db, { bucketName: "uploads" });
        const filename = `${req.session.userId}-post-${Date.now()}-${(
          req.file.originalname || "file"
        ).replace(/\s+/g, "_")}`;
        const uploadStream = bucket.openUploadStream(filename, {
          contentType: req.file.mimetype || "application/octet-stream",
          metadata: { userId: req.session.userId, kind: "post" },
        });
        uploadStream.end(req.file.buffer);
        const file = await new Promise((resolve, reject) => {
          uploadStream.on("finish", resolve);
          uploadStream.on("error", reject);
        });
        fileId = file?._id || null;
        if (fileId) mediaUrl = `/api/v1/files/${fileId.toString()}`;

        // Create post with mediaUrl and AI (client-provided or pending)
        const postModel = require("../../models/postModel");
        const insert = await postModel.createPost({
          userId: req.session.userId,
          content,
          mediaUrl,
          ai: aiPayload,
        });
        if (!aiFromClient) {
          const { analyzePost } = require("../../services/ai.service");
          const logger = require("../../utils/logger");
          req.logger?.info("AI analysis scheduled for post %s", String(insert.insertedId));
          setImmediate(async () => {
            try {
              logger.info("AI analysis started for post %s", String(insert.insertedId));
              const ai = await analyzePost(content || "", mediaUrl || "");
              await postModel.updatePostAI(insert.insertedId, ai);
              logger.info("AI analysis finished for post %s", String(insert.insertedId));
            } catch (e) {
              logger.error("AI analysis error for post %s: %o", String(insert.insertedId), e?.message || e);
            }
          });
        }

        // Backfill file metadata with postId (optional)
        if (fileId) {
          await db
            .collection("uploads.files")
            .updateOne(
              { _id: fileId },
              { $set: { "metadata.postId": insert.insertedId } }
            );
        }

        await client.close();
        return res.status(201).json({ id: insert.insertedId, mediaUrl, ai: { tag: aiPayload.tag } });
      } catch (e) {
        return res.status(500).json({ error: "upload or create failed" });
      }
    } else {
      // No media: just create post with content
      try {
        const postModel = require("../../models/postModel");
        const insert = await postModel.createPost({
          userId: req.session.userId,
          content,
          mediaUrl: "",
          ai: aiPayload,
        });
        if (!aiFromClient) {
          const { analyzePost } = require("../../services/ai.service");
          const logger = require("../../utils/logger");
          req.logger?.info("AI analysis scheduled for post %s", String(insert.insertedId));
          setImmediate(async () => {
            try {
              logger.info("AI analysis started for post %s", String(insert.insertedId));
              const ai = await analyzePost(content || "", "");
              await postModel.updatePostAI(insert.insertedId, ai);
              logger.info("AI analysis finished for post %s", String(insert.insertedId));
            } catch (e) {
              logger.error("AI analysis error for post %s: %o", String(insert.insertedId), e?.message || e);
            }
          });
        }
        return res.status(201).json({ id: insert.insertedId, ai: { tag: aiPayload.tag } });
      } catch (e) {
        return res.status(500).json({ error: "create failed" });
      }
    }
  }
);

// Likes
router.post("/:id/like", controller.like);
router.post("/:id/unlike", controller.unlike);

// Comments
router.post("/:id/comment", controller.comment);
router.delete("/:id/comment/:commentId", controller.deleteComment);

module.exports = router;
