const express = require("express");
const router = express.Router();
const authController = require("../../controllers/authController");
const profileController = require("../../controllers/profileController");
const { validateBody, sanitizeString } = require("../../middleware/validate");
const multer = require("multer");
const { uploadBufferToUploadsBucket } = require("../../services/storageService");

// Multer memory storage for profile pictures
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

// Update current user profile fields with validation
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
router.post("/upload-picture", uploadProfile.single("picture"), async (req, res) => {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const safeName = (req.file.originalname || "file").replace(/\s+/g, "_");
    const path = `profiles/${req.session.userId}/${Date.now()}-${safeName}`;

    const publicUrl = await uploadBufferToUploadsBucket({
      path,
      buffer: req.file.buffer,
      contentType: req.file.mimetype,
    });

    return res.status(201).json({ url: publicUrl });
  } catch (e) {
    req.logger?.error("profile upload error: %o", e);
    return res.status(500).json({ error: "upload failed" });
  }
});

// One-step multipart update: picture + fields
router.post(
  "/update-with-picture",
  uploadProfile.single("picture"),
  async (req, res) => {
    if (!req.session || !req.session.userId)
      return res.status(401).json({ error: "Not authenticated" });

    const updates = {};
    if (typeof req.body?.description === "string")
      updates.description = sanitizeString(req.body.description, { maxLen: 1000 });
    if (typeof req.body?.phone === "string")
      updates.phone = sanitizeString(req.body.phone, { maxLen: 30 });
    if (typeof req.body?.name === "string")
      updates.name = sanitizeString(req.body.name, { maxLen: 100 });

    // Optional picture
    if (req.file) {
      try {
        const safeName = (req.file.originalname || "file").replace(/\s+/g, "_");
        const path = `profiles/${req.session.userId}/${Date.now()}-${safeName}`;

        const publicUrl = await uploadBufferToUploadsBucket({
          path,
          buffer: req.file.buffer,
          contentType: req.file.mimetype,
        });

        updates.picture_url = publicUrl;
      } catch (e) {
        req.logger?.error("profile upload error: %o", e);
        return res.status(500).json({ error: "upload failed" });
      }
    }

    // Reuse controller logic
    req.validatedBody = updates;
    return profileController.updateMe(req, res);
  }
);

module.exports = router;
