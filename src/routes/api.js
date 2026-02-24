// src/routes/api.js
const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const morgan = require("morgan");
const cors = require("cors");

const logger = require("../utils/logger");
const { FRONTEND_ORIGIN, JWT_SECRET, NODE_ENV } = require("../config/envPath");

const app = express();

app.use(express.json());

// HTTP request logging with morgan -> winston
app.use(morgan("combined", { stream: logger.stream }));

/**
 * CORS (JWT-friendly)
 * - No cookies needed, so credentials: false
 * - MUST allow Authorization header + OPTIONS preflight
 */
const allowedOrigins = new Set(
  String(FRONTEND_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

// Local dev convenience
allowedOrigins.add("http://localhost:3000");
allowedOrigins.add("http://127.0.0.1:3000");
const LOCALHOST_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function isAllowedOrigin(origin) {
  if (!origin) return true; // curl/postman/same-origin cases
  if (LOCALHOST_REGEX.test(origin)) return true;
  if (allowedOrigins.size === 0) return true;
  if (allowedOrigins.has(origin)) return true;

  // Allow Vercel preview URLs for this project
  return /^https:\/\/truefeed-frontend-[a-z0-9-]+-codewithdeepesh29s-projects\.vercel\.app$/i.test(
    origin
  );
}

const corsOptions = {
  origin: (origin, cb) => {
    return isAllowedOrigin(origin)
      ? cb(null, true)
      : cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: false, // JWT in Authorization header (no cookies)
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
// Handle preflight for every route (regex avoids Express 5 path syntax issues)
app.options(/.*/, cors(corsOptions)); // IMPORTANT: preflight for JWT requests

// If running behind a proxy/load balancer in production
if (NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// attach logger to requests for downstream handlers
app.use((req, res, next) => {
  req.logger = logger;
  next();
});

let routesRegistered = false;

function registerRoutes() {
  if (routesRegistered) return;

  // Health check at root
  app.get("/", (req, res) => {
    return res.status(200).json({ ok: true, service: "truefeed-backend" });
  });

  // Serve docs only in non-production
  if (NODE_ENV !== "production") {
    const docsDir = path.join(__dirname, "..", "..", "docs");

    function setDocsSecurityHeaders(req, res, next) {
      res.setHeader(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "script-src 'self' https://cdn.jsdelivr.net",
          "style-src 'self'",
          "img-src 'self' data:",
          "connect-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "frame-ancestors 'none'",
        ].join("; ")
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      next();
    }

    app.use("/docs", setDocsSecurityHeaders, express.static(docsDir));
  }

  // Dynamic Markdown fetch endpoint (whitelisted)
  const repoRoot = path.join(__dirname, "..", "..");
  const mdWhitelist = new Set(["README.md", "ENDPOINTS.md", "ARCHITECTURE.md"]);

  app.get("/md/:name", (req, res) => {
    const name = req.params?.name || "";
    if (!mdWhitelist.has(name)) {
      logger.warn("Docs MD request for disallowed file: %s", name);
      return res.status(404).json({ error: "not found" });
    }

    const filePath = path.join(repoRoot, name);
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.sendFile(filePath, (err) => {
      if (err) {
        logger.error("Error sending MD file %s: %o", filePath, err);
        if (!res.headersSent) {
          return res
            .status(err?.code === "ENOENT" ? 404 : 500)
            .json({ error: "failed to load markdown" });
        }
      }
    });
  });

  // Auth routes (public)
  const v1Auth = require("./v1/authRoutes");
  app.use("/api/v1/auth", v1Auth);

  // JWT auth middleware (protected)
  function requireAuth(req, res, next) {
    const h = req.headers.authorization || "";
    if (!h.startsWith("Bearer ")) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const token = h.slice("Bearer ".length).trim();

    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      // attach user info for controllers
      req.user = {
        userId: String(decoded.userId),
        email: decoded.email,
        role: decoded.role || "user",
      };

      return next();
    } catch (e) {
      return res.status(401).json({ error: "unauthorized" });
    }
  }

  // Protected routes
  const v1Logs = require("./v1/logsRoutes");
  app.use("/api/v1/logs", requireAuth, v1Logs);

  const v1Profile = require("./v1/profileRoutes");
  app.use("/api/v1/profile", requireAuth, v1Profile);

  const v1Posts = require("./v1/postRoutes");
  app.use("/api/v1/posts", requireAuth, v1Posts);

  const v1Friends = require("./v1/friendsRoutes");
  app.use("/api/v1/friends", requireAuth, v1Friends);

  const v1Users = require("./v1/usersRoutes");
  app.use("/api/v1/users", requireAuth, v1Users);

  const v1Stories = require("./v1/storyRoutes");
  app.use("/api/v1/stories", requireAuth, v1Stories);

  // AI routes (public)
  const v1AI = require("./v1/aiRoutes");
  app.use("/api/v1/gemini", v1AI);

  // Error handler (last)
  app.use((err, req, res, next) => {
    logger.error("Unhandled error: %o", err);
    res.status(500).json({ error: "internal server error" });
  });

  routesRegistered = true;
}

module.exports = { app, registerRoutes };
