const { connect } = require("../config/dbConnection");
const { ObjectId } = require("mongodb");

async function ensureIndexes(db) {
  const stories = db.collection("stories");
  await stories.createIndex({ userId: 1, createdAt: -1 });
  await stories.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

function deriveMediaType(url) {
  if (!url) return "none";
  const u = String(url).toLowerCase();
  if (u.endsWith(".mp4") || u.endsWith(".webm") || u.endsWith(".ogg")) return "video";
  return "image";
}

async function createStory({ userId, text, mediaUrl }) {
  const { client, db } = await connect("write");
  try {
    await ensureIndexes(db);
    const stories = db.collection("stories");
    const now = new Date();
    const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const res = await stories.insertOne({
      userId: new ObjectId(userId),
      text: text || "",
      mediaUrl: mediaUrl || "",
      mediaType: deriveMediaType(mediaUrl),
      createdAt: now,
      expiresAt: expires,
      viewsCount: 0,
      viewedBy: [],
    });
    return { insertedId: res.insertedId, expiresAt: expires };
  } finally {
    await client.close();
  }
}

async function markViewed({ storyId, viewerUserId }) {
  const { client, db } = await connect("write");
  try {
    const stories = db.collection("stories");
    await stories.updateOne(
      { _id: new ObjectId(storyId) },
      {
        $addToSet: { viewedBy: new ObjectId(viewerUserId) },
        $inc: { viewsCount: 1 },
      }
    );
  } finally {
    await client.close();
  }
}

async function feedActiveByUser() {
  const { client, db } = await connect("read");
  try {
    const stories = db.collection("stories");
    const users = db.collection("users");
    const now = new Date();
    const agg = await stories
      .aggregate([
        { $match: { expiresAt: { $gt: now } } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$userId",
            latestCreatedAt: { $first: "$createdAt" },
            items: {
              $push: {
                _id: "$_id",
                text: "$text",
                mediaUrl: "$mediaUrl",
                mediaType: "$mediaType",
                createdAt: "$createdAt",
                expiresAt: "$expiresAt",
              },
            },
          },
        },
        { $sort: { latestCreatedAt: -1 } },
      ])
      .toArray();
    const userIds = agg.map((g) => g._id);
    const userDocs = await users
      .find({ _id: { $in: userIds } }, { projection: { password: 0 } })
      .toArray();
    const map = new Map(userDocs.map((u) => [String(u._id), u]));
    const result = agg.map((g) => ({
      user: map.get(String(g._id)) || { _id: g._id },
      latestCreatedAt: g.latestCreatedAt,
      items: g.items,
    }));
    return result;
  } finally {
    await client.close();
  }
}

module.exports = { createStory, markViewed, feedActiveByUser };
