const express = require("express");
const path = require("path");
const app = express();
// const PORT = process.env.PORT || 5000;

const session = require("express-session");
// const MongoStore = require("connect-mongo");
const morgan = require("morgan");
const cors = require("cors");
const logger = require("../utils/logger");
const {
  FRONTEND_ORIGIN,
  SESSION_SECRET,
  NODE_ENV,
} = require("../config/envPath");

app.use(express.json());

// HTTP request logging with morgan -> winston
app.use(morgan("combined", { stream: logger.stream }));

// CORS - allow frontend to send cookies for authentication
const allowedOrigins = new Set(
  String(FRONTEND_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.size === 0 || allowedOrigins.has(origin)) {
        return cb(null, true);
      }
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
// Files route will stream DB-backed uploads

// If running behind a proxy/load balancer in production, trust proxy to allow secure cookies
if (NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// attach logger to requests for downstream handlers
app.use((req, res, next) => {
  req.logger = logger;
  next();
});

// Session configuration is deferred to server startup to avoid creating DB
// connections during module import. Call `initSessions(sessionStore)` from
// the server entrypoint (server.js) before listening.
const sessionSecret = SESSION_SECRET;

function initSessions(store) {
  if (!store) {
    throw new Error(
      "initSessions requires a session store (e.g. connect-mongo)"
    );
  }
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      store,
      cookie: {
        httpOnly: true,
        secure: NODE_ENV === "production",
        sameSite: NODE_ENV === "production" ? "none" : "lax",
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      },
    })
  );
}

let routesRegistered = false;

function registerRoutes() {
  if (routesRegistered) return;

  // Public static docs under /docs
  const docsDir = path.join(__dirname, "..", "..", "docs");
  // Basic security headers for docs pages/assets
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
  app.get("/", setDocsSecurityHeaders, (req, res) => {
    res.sendFile(path.join(docsDir, "index.html"));
  });
  app.use("/", setDocsSecurityHeaders, express.static(docsDir));

  // Dynamic Markdown fetch endpoint (whitelisted files in backend root)
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

  // Mount auth routes (register, login) - only use versioned v1 routes
  const v1Auth = require("./v1/authRoutes");
  app.use("/api/v1/auth", v1Auth);

  // simple auth middleware using session
  function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
      return next();
    }
    logger.warn(
      "Unauthorized access attempt to %s from %s",
      req.originalUrl,
      req.ip
    );
    return res.status(401).json({ error: "unauthorized" });
  }

  // Mount versioned logs routes
  const v1Logs = require("./v1/logsRoutes");
  app.use("/api/v1/logs", requireAuth, v1Logs);

  // Mount profile routes (current user)
  const v1Profile = require("./v1/profileRoutes");
  app.use("/api/v1/profile", requireAuth, v1Profile);

  // Mount post routes (create/list)
  const v1Posts = require("./v1/postRoutes");
  app.use("/api/v1/posts", requireAuth, v1Posts);

  // const v1AI = require("./v1/aiRoutes");
  // app.use("/api/v1/ai", requireAuth, v1AI);

  // Public files streaming (GridFS) by id
  const v1Files = require("./v1/filesRoutes");
  app.use("/api/v1/files", v1Files);

    // Mount friends routes
  const v1Friends = require("./v1/friendsRoutes");
  app.use("/api/v1/friends", requireAuth, v1Friends);
  const v1Users = require("./v1/usersRoutes");
  app.use("/api/v1/users", requireAuth, v1Users);
  const v1Stories = require("./v1/storyRoutes");
  app.use("/api/v1/stories", requireAuth, v1Stories);

  // Express error handler to log errors
  app.use((err, req, res, next) => {
    logger.error("Unhandled error: %o", err);
    res.status(500).json({ error: "internal server error" });
  });

  const v1AI = require("./v1/aiRoutes");
  app.use("/api/v1/gemini", v1AI);

  routesRegistered = true;
}

module.exports = { app, initSessions, registerRoutes };
