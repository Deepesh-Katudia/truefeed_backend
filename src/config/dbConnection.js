const { MongoClient, ServerApiVersion } = require("mongodb");
const {
  DATABASE_URL,
  ADMIN_URI,
  EDITOR_URI,
  READER_URI,
  DB_NAME,
} = require("./envPath");

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = (permission) => {
  // Preference: specific URIs for roles, otherwise fallback to common DATABASE_URL
  let URI = DATABASE_URL;
  if (permission === "super" && ADMIN_URI) {
    URI = ADMIN_URI;
  } else if (permission === "write" && EDITOR_URI) {
    URI = EDITOR_URI;
  } else if (permission === "read" && READER_URI) {
    URI = READER_URI;
  }
  return new MongoClient(URI, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
};

// Convenience connect function that returns a connected client and the db
async function connect(permission = "write") {
  const c = client(permission);
  try {
    await c.connect();
    const dbName = DB_NAME || "truefeed";

    const db = c.db(dbName);
    return { client: c, db };
  } catch (err) {
    const logger = require("../utils/logger");
    logger.error(
      "Error connecting to database (permission=%s): %o",
      permission,
      err
    );
    throw err;
  }
}

module.exports = { client, connect };
