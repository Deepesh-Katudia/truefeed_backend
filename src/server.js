require("dotenv").config();

const { app, registerRoutes } = require("./routes/api");
const { PORT, NODE_ENV } = require("./config/envPath");

(function start() {
  if (NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  registerRoutes();

  if (process.env.VERCEL !== "1") {
    app.listen(PORT, () => {
      const logger = require("./utils/logger");
      logger.info("Server is running on port %s", PORT);
    });
  }
})();

module.exports = app;