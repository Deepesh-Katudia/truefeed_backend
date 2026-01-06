const express = require("express");
const router = express.Router();
const controller = require("../../controllers/logsController");
const requireAdmin = require("../../middleware/requireAdmin");

// apply admin guard to all routes in this router
router.use(requireAdmin);

// list available logs
router.get("/", controller.listAvailableLogs);

// download a log by date (YYYY-MM-DD)
router.get("/:date", controller.downloadLog);

// stream a log by date (supports ?follow=1)
router.get("/:date/stream", controller.streamLog);

module.exports = router;
