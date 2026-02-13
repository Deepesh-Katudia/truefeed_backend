require("dotenv").config();

const { createClient } = require("redis");
const { RedisStore } = require("connect-redis");

const { app, initSessions, registerRoutes } = require("./routes/api");
const { PORT, NODE_ENV } = require("./config/envPath");

(async function start() {
  let store;

  if (process.env.REDIS_URL) {
    const redisClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 500),
      },
    });

    redisClient.on("error", (err) => {
      console.error("Redis Client Error:", err);
    });

    await redisClient.connect();

    store = new RedisStore({
      client: redisClient,
      prefix: "truefeed:sess:",
    });

    console.log("✅ Redis session store enabled");
  } else {
    console.log("⚠️ REDIS_URL not set, using MemoryStore (not safe on Vercel)");
  }

  if (NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  initSessions(store);
  registerRoutes();

  app.listen(PORT, () => {
    const logger = require("./utils/logger");
    logger.info("Server is running on port %s", PORT);
  });
})();

module.exports = app;
