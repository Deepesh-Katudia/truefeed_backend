const express = require("express");
const path = require("path");
const app = express();

const session = require("express-session");
const morgan = require("morgan");
const cors = require("cors");
const logger = require("../utils/logger");
const { FRONTEND_ORIGIN, SESSION_SECRET, NODE_ENV } = require("../config/envPath");

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

function isAllowedOrigin(origin) {
  if (allowedOrigins.size === 0) return true;
  if (allowedOrigins.has(origin)) return true;

  // ✅ allow Vercel preview URLs for this project
  return /^https:\/\/truefeed-frontend-[a-z0-9-]+-codewithdeepesh29s-projects\.vercel\.app$/i.test(origin);
}

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      return isAllowedOrigin(origin) ? cb(null, true) : cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
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

// If running behind a proxy/load balancer in production, trust proxy to allow secure cookies
if (NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// attach logger to requests for downstream handlers
app.use((req, res, next) => {
  req.logger = logger;
  next();
});

const sessionSecret = SESSION_SECRET;

function initSessions(store) {
  const sessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: NODE_ENV === "production",
      sameSite: NODE_ENV === "production" ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  };

  if (store) {
    sessionOptions.store = store;
  } else {
    logger.warn("No session store provided. Using MemoryStore (dev only).");
  }

  app.use(session(sessionOptions));
}

let routesRegistered = false;

function registerRoutes() {
  if (routesRegistered) return;

  // ✅ Health check at root (Vercel-safe)
  app.get("/", (req, res) => {
    return res.status(200).json({ ok: true, service: "truefeed-backend" });
  });

  // ✅ Serve docs only in non-production to avoid ENOENT crashes on Vercel
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

    // docs now under /docs
    app.use("/docs", setDocsSecurityHeaders, express.static(docsDir));
  }

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

  // Mount auth routes (register, login)
  const v1Auth = require("./v1/authRoutes");
  app.use("/api/v1/auth", v1Auth);

function requireAuth(req, res, next) {
  logger.info(
    "AUTH DEBUG url=%s sid=%s hasSession=%s userId=%s origin=%s",
    req.originalUrl,
    req.sessionID,
    Boolean(req.session),
    req.session?.userId,
    req.headers.origin
  );

  const sid =
    req.session?.userId ||
    req.session?.user?.id ||
    req.session?.user?._id;

  if (sid) {
    req.session.userId = String(sid);
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

  // Mount profile routes
  const v1Profile = require("./v1/profileRoutes");
  app.use("/api/v1/profile", requireAuth, v1Profile);

  // Mount post routes
  const v1Posts = require("./v1/postRoutes");
  app.use("/api/v1/posts", requireAuth, v1Posts);

  // Mount friends routes
  const v1Friends = require("./v1/friendsRoutes");
  app.use("/api/v1/friends", requireAuth, v1Friends);

  const v1Users = require("./v1/usersRoutes");
  app.use("/api/v1/users", requireAuth, v1Users);

  const v1Stories = require("./v1/storyRoutes");
  app.use("/api/v1/stories", requireAuth, v1Stories);

  // ✅ AI routes (keep path same so frontend doesn't change)
  const v1AI = require("./v1/aiRoutes");
  app.use("/api/v1/gemini", v1AI);

  // Express error handler to log errors (keep last)
  app.use((err, req, res, next) => {
    logger.error("Unhandled error: %o", err);
    res.status(500).json({ error: "internal server error" });
  });

  routesRegistered = true;
}

module.exports = { app, initSessions, registerRoutes };
