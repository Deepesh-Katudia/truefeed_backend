const express = require("express");
const router = express.Router();
const authController = require("../../controllers/authController");
const profileController = require("../../controllers/profileController");
const { validateBody, sanitizeString } = require("../../middleware/validate");
const multer = require("multer");
const { connect } = require("../../config/dbConnection");
const { GridFSBucket } = require("mongodb");

// Multer memory storage for GridFS (profile pictures)
const uploadProfile = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ok = /^(image\/(png|jpeg|jpg|gif|webp))$/i.test(file.mimetype || "");
    cb(null, ok);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Current session user info
router.get("/", authController.me);

// Update current user profile fields (picture, description, phone) with validation
router.post(
  "/update",
  validateBody({
    picture: { type: "string", required: false, maxLen: 1024, format: "url" },
    description: { type: "string", required: false, maxLen: 1000 },
    phone: { type: "string", required: false, maxLen: 30 },
    name: { type: "string", required: false, maxLen: 100 },
  }),
  profileController.updateMe
);

// Upload a new profile picture (multipart/form-data, field name: picture)
router.post(
  "/upload-picture",
  uploadProfile.single("picture"),
  async (req, res) => {
    if (!req.session || !req.session.userId)
      return res.status(401).json({ error: "Not authenticated" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { client, db } = await connect("write");
    try {
      const bucket = new GridFSBucket(db, { bucketName: "uploads" });
      const filename = `${req.session.userId}-profile-${Date.now()}-${(
        req.file.originalname || "file"
      ).replace(/\s+/g, "_")}`;
      const uploadStream = bucket.openUploadStream(filename, {
        contentType: req.file.mimetype || "application/octet-stream",
        metadata: { userId: req.session.userId, kind: "profile" },
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
  }
);

module.exports = router;
// One-step multipart update: picture + fields
router.post(
  "/update-with-picture",
  uploadProfile.single("picture"),
  async (req, res) => {
    if (!req.session || !req.session.userId)
      return res.status(401).json({ error: "Not authenticated" });

    const updates = {};
    if (typeof req.body?.description === "string")
      updates.description = sanitizeString(req.body.description, {
        maxLen: 1000,
      });
    if (typeof req.body?.phone === "string")
      updates.phone = sanitizeString(req.body.phone, { maxLen: 30 });
    if (typeof req.body?.name === "string")
      updates.name = sanitizeString(req.body.name, { maxLen: 100 });

    // Optional picture
    if (req.file) {
      const { client, db } = await connect("write");
      try {
        const bucket = new GridFSBucket(db, { bucketName: "uploads" });
        const filename = `${req.session.userId}-profile-${Date.now()}-${(
          req.file.originalname || "file"
        ).replace(/\s+/g, "_")}`;
        const uploadStream = bucket.openUploadStream(filename, {
          contentType: req.file.mimetype || "application/octet-stream",
          metadata: { userId: req.session.userId, kind: "profile" },
        });
        uploadStream.end(req.file.buffer);
        await new Promise((resolve, reject) => {
          uploadStream.on("finish", resolve);
          uploadStream.on("error", reject);
        });
        const file = uploadStream.id ? { _id: uploadStream.id } : null;
        if (file?._id) {
          updates.picture = `/api/v1/files/${file._id.toString()}`;
        }
        await client.close();
      } catch (e) {
        return res.status(500).json({ error: "upload failed" });
      }
    }

    try {
      const profileController = require("../../controllers/profileController");
      // Reuse controller logic by faking validatedBody
      req.validatedBody = updates;
      return profileController.updateMe(req, res);
    } catch (e) {
      return res.status(500).json({ error: "update failed" });
    }
  }
);
