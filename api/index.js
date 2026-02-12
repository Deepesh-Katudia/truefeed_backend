// Vercel Serverless entrypoint
const { app, initSessions, registerRoutes } = require("../src/routes/api");

// Ensure we register middleware/routes only once per warm lambda
let initialized = false;

module.exports = (req, res) => {
  if (!initialized) {
    initSessions(undefined); // MemoryStore (OK for now)
    registerRoutes();
    initialized = true;
  }
  return app(req, res);
};
