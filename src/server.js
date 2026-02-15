require("dotenv").config();

const { createClient } = require("redis");
const { RedisStore } = require("connect-redis"); // ✅ IMPORTANT
const { app, initSessions, registerRoutes } = require("./routes/api");
const { PORT, NODE_ENV } = require("./config/envPath");

// Reuse Redis connection across serverless invocations
let redisClient;

(async function start() {
  let store;

  if (process.env.REDIS_URL) {
    if (!redisClient) {
      redisClient = createClient({
        url: process.env.REDIS_URL,
        socket: {
          tls: true,
          reconnectStrategy: (retries) => Math.min(retries * 50, 500),
        },
      });

      redisClient.on("error", (err) => {
        console.error("Redis Client Error:", err);
      });

      await redisClient.connect();
      console.log("✅ Redis connected");
    }

    store = new RedisStore({
      client: redisClient,
      prefix: "truefeed:sess:",
    });

    console.log("✅ Redis session store enabled");
  } else {
    console.log("⚠️ REDIS_URL not set, using MemoryStore (breaks on Vercel)");
  }

  if (NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  initSessions(store);
registerRoutes();

if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    const logger = require("./utils/logger");
    logger.info("Server is running on port %s", PORT);
  });
}
})();
module.exports = app;