const path = require("path");
const fs = require("fs");

const LOG_DIR = path.join(__dirname, "..", "..", "log");

function getLogPath(date) {
  return path.join(LOG_DIR, `${date}.log`);
}

function logExists(date) {
  return fs.existsSync(getLogPath(date));
}

function listLogs() {
  if (!fs.existsSync(LOG_DIR)) return [];
  return fs
    .readdirSync(LOG_DIR)
    .filter((f) => f.endsWith(".log"))
    .map((f) => f.replace(/\.log$/, ""))
    .sort()
    .reverse();
}

module.exports = { getLogPath, logExists, listLogs };
