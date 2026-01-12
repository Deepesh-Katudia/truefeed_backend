require("dotenv").config();
const session = require("express-session");
const { app, initSessions, registerRoutes } = require("./routes/api");
const { PORT } = require("./config/envPath");

(async function start() {
  // Use default MemoryStore for now (dev-safe).
  // Later we can switch to Redis or a Postgres session store.
  const store = undefined;

  // Initialize session middleware on the app
  // If your initSessions expects a store, we call it with no store and let it default,
  // otherwise we patch initSessions next (see note below).
  initSessions(store);

  // Register routes after sessions are initialized
  registerRoutes();

  app.listen(PORT, () => {
    const logger = require("./utils/logger");
    logger.info("Server is running on port %s", PORT);
  });
})();

module.exports = app;
