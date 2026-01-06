const express = require("express");
const router = express.Router();
const controller = require("../../controllers/storyController");
const multer = require("multer");
const { validateBody } = require("../../middleware/validate");

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ok = /^(image\/(png|jpeg|jpg|gif|webp)|video\/(mp4|webm|ogg))$/i.test(file.mimetype || "");
    cb(null, ok);
  },
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.post(
  "/",
  validateBody({
    text: { type: "string", required: false, maxLen: 300 },
    mediaUrl: { type: "string", required: false, maxLen: 1024 },
  }),
  controller.create
);

router.post("/upload-media", upload.single("media"), controller.uploadMedia);
router.get("/feed", controller.feed);
router.post("/:id/view", controller.markView);

module.exports = router;
