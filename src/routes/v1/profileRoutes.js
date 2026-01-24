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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ok = /^(image\/(png|jpeg|jpg|gif|webp))$/i.test(file.mimetype || "");
    if (!ok) return cb(new Error("Only PNG, JPEG/JPG, GIF, or WebP images are allowed"));
    cb(null, true);
  },
});

// Auth middleware (run BEFORE multer)
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

// Wrap multer so upload errors return JSON cleanly
function uploadSingle(fieldName) {
  return (req, res, next) => {
    uploadProfile.single(fieldName)(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || "Invalid upload" });
      }
      next();
    });
  };
}

function safeUploadPath(userId, originalname) {
  const safeName = String(originalname || "file")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");
  return `profiles/${userId}/${Date.now()}-${safeName}`;
}

// Better error message extractor (works for Supabase, thrown objects, etc.)
function extractErrorMessage(e) {
  if (!e) return "upload failed";
  if (typeof e === "string") return e;
  if (e instanceof Error && e.message) return e.message;

  // Supabase style: { error: { message } } or { error: "..." }
  if (e.error) {
    if (typeof e.error === "string") return e.error;
    if (e.error.message) return e.error.message;
  }

  if (e.message) return e.message;
  if (e.details) return e.details;
  if (e.hint) return e.hint;

  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

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
router.post(
  "/upload-picture",
  requireAuth,
  uploadSingle("picture"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      const path = safeUploadPath(req.session.userId, req.file.originalname);

      const publicUrl = await uploadBufferToUploadsBucket({
        path,
        buffer: req.file.buffer,
        contentType: req.file.mimetype,
      });

      return res.status(201).json({ url: publicUrl });
    } catch (e) {
      const msg = extractErrorMessage(e);
      console.error("profile upload error:", e);
      req.logger?.error("profile upload error: %o", e);
      return res.status(500).json({ error: msg });
    }
  }
);

// One-step multipart update: picture + fields
router.post(
  "/update-with-picture",
  requireAuth,
  uploadSingle("picture"),
  async (req, res) => {
    const updates = {};

    if (typeof req.body?.description === "string") {
      updates.description = sanitizeString(req.body.description, { maxLen: 1000 });
    }
    if (typeof req.body?.phone === "string") {
      updates.phone = sanitizeString(req.body.phone, { maxLen: 30 });
    }
    if (typeof req.body?.name === "string") {
      updates.name = sanitizeString(req.body.name, { maxLen: 100 });
    }

    // Optional picture upload
    if (req.file) {
      try {
        const path = safeUploadPath(req.session.userId, req.file.originalname);

        const publicUrl = await uploadBufferToUploadsBucket({
          path,
          buffer: req.file.buffer,
          contentType: req.file.mimetype,
        });

        updates.picture_url = publicUrl;
      } catch (e) {
        const msg = extractErrorMessage(e);
        console.error("profile upload error:", e);
        req.logger?.error("profile upload error: %o", e);
        return res.status(500).json({ error: msg });
      }
    }

    // Reuse controller logic
    req.validatedBody = updates;
    return profileController.updateMe(req, res);
  }
);

module.exports = router;
