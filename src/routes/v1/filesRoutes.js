const express = require("express");
const { connect } = require("../../config/dbConnection");
const { ObjectId, GridFSBucket } = require("mongodb");
const router = express.Router();

// GET /api/v1/files/:id - stream file by ObjectId
router.get("/:id", async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: "missing id" });
  let _id;
  try {
    _id = new ObjectId(id);
  } catch (e) {
    return res.status(400).json({ error: "invalid id" });
  }
  const { client, db } = await connect("read");
  try {
    const bucket = new GridFSBucket(db, { bucketName: "uploads" });
    const download = bucket.openDownloadStream(_id);

    download.on("file", (file) => {
      if (file?.contentType) res.setHeader("Content-Type", file.contentType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    });
    download.on("error", () => res.status(404).end());
    download.on("end", () => client.close());
    download.pipe(res);
  } catch (e) {
    await client.close();
    res.status(500).json({ error: "stream error" });
  }
});

module.exports = router;
