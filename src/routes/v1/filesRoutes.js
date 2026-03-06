const express = require("express");
const router = express.Router();
const { supabase } = require("../../config/supabaseClient");

// GET /api/v1/files/* - stream file from Supabase Storage bucket "uploads"
// Example: /api/v1/files/profiles/<userId>/123-avatar.png
router.get("/*", async (req, res) => {
  const path = req.params[0];

  if (!path) return res.status(400).json({ error: "missing path" });

  try {
    const { data, error } = await supabase.storage.from("uploads").download(path);
    if (error) return res.status(404).json({ error: "not found" });

    // data is a Blob in node; convert to buffer
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    return res.status(200).send(buffer);
  } catch (e) {
    req.logger?.error("supabase file stream error: %o", e);
    return res.status(500).json({ error: "stream error" });
  }
});

module.exports = router;
