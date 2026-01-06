const { connect } = require("./dbConnection");

async function ensureIndexes() {
  const { client, db } = await connect("super");
  try {
    const users = db.collection("users");
    const posts = db.collection("posts");

    // Ensure unique index on users.email
    await users.createIndex(
      { email: 1 },
      { unique: true, name: "email_unique" }
    );

    // Ensure index on posts.userId for faster queries
    await posts.createIndex(
      { userId: 1, createdAt: -1 },
      { name: "userId_createdAt" }
    );
  } finally {
    await client.close();
  }
}

module.exports = { ensureIndexes };
