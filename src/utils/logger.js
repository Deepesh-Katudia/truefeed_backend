const path = require("path");
const fs = require("fs");
const { createLogger, format, transports } = require("winston");
require("winston-daily-rotate-file");

// Detect serverless (Vercel) or production where disk writes are not safe/persistent
const isVercel = !!process.env.VERCEL;
const isServerless = isVercel || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const isProd = process.env.NODE_ENV === "production";

// In serverless, prefer console only.
// In local dev, write to ./log folder.
function getFileLogDir() {
  // If you still want file logs on serverless, use /tmp (non-persistent).
  // But safest is to disable file logs entirely on serverless.
  if (isServerless) return null;

  return path.join(process.cwd(), "log");
}

const loggerTransports = [];

// Always log to console (Vercel collects console logs)
loggerTransports.push(
  new transports.Console({
    level: isProd ? "info" : "debug",
    format: format.combine(format.colorize(), format.simple()),
  })
);

// Add rotating file logs only when we have a writable directory (local dev)
const logDir = getFileLogDir();
if (logDir) {
  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    loggerTransports.push(
      new transports.DailyRotateFile({
        filename: path.join(logDir, "%DATE%.log"),
        datePattern: "YYYY-MM-DD",
        zippedArchive: false,
        maxSize: "20m",
        maxFiles: "14d",
        level: "info",
      })
    );
  } catch (e) {
    // If directory creation fails for any reason, fall back to console only
    // Do not crash the process
    console.warn("Logger file transport disabled:", e?.message || e);
  }
}

const logger = createLogger({
  level: isProd ? "info" : "debug",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  transports: loggerTransports,
  exitOnError: false,
});

// stream for morgan
logger.stream = {
  write: (message) => logger.info(message.trim()),
};

module.exports = logger;
