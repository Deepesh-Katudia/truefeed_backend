// Vercel Serverless entrypoint
const { app, registerRoutes } = require("../src/routes/api");

let initialized = false;

module.exports = (req, res) => {
  if (!initialized) {
    registerRoutes();
    initialized = true;
  }
  return app(req, res);
};
