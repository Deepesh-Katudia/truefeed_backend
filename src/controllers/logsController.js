const fs = require("fs");
const logger = require("../utils/logger");
const { getLogPath, logExists, listLogs } = require("../services/logService");

function downloadLog(req, res) {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "date must be in YYYY-MM-DD format" });
  }
  const logPath = getLogPath(date);
  if (!logExists(date)) {
    logger.info(
      "Requested log %s not found by user %s",
      date,
      req.session?.email || "unknown"
    );
    return res.status(404).json({ error: "log not found" });
  }
  logger.info(
    "User %s downloading log %s",
    req.session?.email || "unknown",
    date
  );
  res.download(logPath, `${date}.log`, (err) => {
    if (err) {
      logger.error("Error sending log file %s: %o", logPath, err);
      if (!res.headersSent) res.status(500).end();
    }
  });
}

function streamLog(req, res) {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "date must be in YYYY-MM-DD format" });
  }
  const logPath = getLogPath(date);
  if (!logExists(date)) {
    logger.info(
      "Requested stream log %s not found by user %s",
      date,
      req.user?.email || "unknown"
    );
    return res.status(404).json({ error: "log not found" });
  }

  const follow = req.query.follow === "1" || req.query.follow === "true";

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");

  if (!follow) {
    const stream = fs.createReadStream(logPath, { encoding: "utf8" });
    stream.on("error", (err) => {
      logger.error("Error streaming log file %s: %o", logPath, err);
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
    return;
  }

  // follow mode
  let lastSize = 0;
  try {
    const stat = fs.statSync(logPath);
    lastSize = stat.size;
  } catch (err) {
    logger.error("Error stat-ing log file %s: %o", logPath, err);
    return res.status(500).json({ error: "could not read log" });
  }

  const initialStream = fs.createReadStream(logPath, { encoding: "utf8" });
  initialStream.pipe(res, { end: false });

  let watcher;
  try {
    watcher = fs.watch(logPath, (eventType) => {
      if (eventType !== "change") return;
      try {
        const stats = fs.statSync(logPath);
        if (stats.size > lastSize) {
          const appendStream = fs.createReadStream(logPath, {
            start: lastSize,
            end: stats.size - 1,
            encoding: "utf8",
          });
          appendStream.on("data", (chunk) => {
            if (!res.writableEnded) res.write(chunk);
          });
          appendStream.on("end", () => {
            lastSize = stats.size;
          });
          appendStream.on("error", (err) => {
            logger.error(
              "Error streaming appended log data for %s: %o",
              logPath,
              err
            );
          });
        }
      } catch (err) {
        logger.error("Error during follow read for %s: %o", logPath, err);
      }
    });
  } catch (err) {
    logger.error("Error watching log file %s: %o", logPath, err);
    if (!res.headersSent) res.status(500).end();
    return;
  }

  req.on("close", () => {
    try {
      if (watcher) watcher.close();
    } catch (e) {}
    if (!res.writableEnded) res.end();
  });
}

function listAvailableLogs(req, res) {
  const items = listLogs();
  res.json({ logs: items });
}

module.exports = { downloadLog, streamLog, listAvailableLogs };
