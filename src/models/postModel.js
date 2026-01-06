const { connect } = require("../config/dbConnection");
const { ObjectId } = require("mongodb");

async function createPost({ userId, content, mediaUrl, ai }) {
  const { client, db } = await connect("write");
  try {
    const posts = db.collection("posts");
    const result = await posts.insertOne({
      userId: new ObjectId(userId),
      content: content || "",
      mediaUrl: mediaUrl || "",
      ai: ai
        ? {
          tag: ai.tag || "Pending",
          summary: ai.summary || "",
          score: typeof ai.score === "number" ? ai.score : null,
          raw: ai.raw || null,
          updatedAt: ai.updatedAt || null,
          error: ai.error || null,
        }
        : {
          tag: "Pending",
          summary: "",
          score: null,
          raw: null,
          updatedAt: null,
          error: null,
        },
      likedBy: [],
      likesCount: 0,
      comments: [],
      commentsCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return result;
  } finally {
    await client.close();
  }
}

async function listUserPosts(userId) {
  const { client, db } = await connect("read");
  try {
    const posts = db.collection("posts");
    const cursor = posts
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 });
    return await cursor.toArray();
  } finally {
    await client.close();
  }
}

async function updatePostAI(postId, ai) {
  const { client, db } = await connect("write");
  try {
    const posts = db.collection("posts");
    await posts.updateOne(
      { _id: new ObjectId(postId) },
      {
        $set: {
          "ai.tag": ai?.tag || "Pending",
          "ai.summary": ai?.summary || "",
          "ai.score": typeof ai?.score === "number" ? ai.score : null,
          "ai.raw": ai?.raw || null,
          "ai.updatedAt": ai?.updatedAt || new Date(),
          "ai.error": ai?.error || null,
          updatedAt: new Date(),
        },
      }
    );
  } finally {
    await client.close();
  }
}

async function likePost(postId, userId) {
  const { client, db } = await connect("write");
  try {
    const posts = db.collection("posts");
    const res = await posts.updateOne(
      { _id: new ObjectId(postId), likedBy: { $ne: new ObjectId(userId) } },
      { $addToSet: { likedBy: new ObjectId(userId) }, $inc: { likesCount: 1 }, $set: { updatedAt: new Date() } }
    );
    return res.modifiedCount > 0;
  } finally {
    await client.close();
  }
}

async function unlikePost(postId, userId) {
  const { client, db } = await connect("write");
  try {
    const posts = db.collection("posts");
    // Pull userId and decrement likesCount only if userId existed
    const post = await posts.findOne({ _id: new ObjectId(postId) }, { projection: { likedBy: 1, likesCount: 1 } });
    if (!post) return false;
    const hadLike = (post.likedBy || []).some((u) => String(u) === String(userId));
    await posts.updateOne(
      { _id: new ObjectId(postId) },
      {
        $pull: { likedBy: new ObjectId(userId) },
        $inc: { likesCount: hadLike && post.likesCount > 0 ? -1 : 0 },
        $set: { updatedAt: new Date() },
      }
    );
    return hadLike;
  } finally {
    await client.close();
  }
}

async function addComment(postId, userId, text) {
  const { client, db } = await connect("write");
  try {
    const posts = db.collection("posts");
    const commentId = new ObjectId();
    await posts.updateOne(
      { _id: new ObjectId(postId) },
      {
        $push: {
          comments: {
            _id: commentId,
            userId: new ObjectId(userId),
            text,
            createdAt: new Date(),
          },
        },
        $inc: { commentsCount: 1 },
        $set: { updatedAt: new Date() },
      }
    );
    return commentId;
  } finally {
    await client.close();
  }
}

async function deleteComment(postId, commentId, userId) {
  const { client, db } = await connect("write");
  try {
    const posts = db.collection("posts");
    const post = await posts.findOne(
      { _id: new ObjectId(postId) },
      { projection: { comments: 1, commentsCount: 1 } }
    );
    if (!post) return false;
    const exists = (post.comments || []).some(
      (c) => String(c._id) === String(commentId) && String(c.userId) === String(userId)
    );
    if (!exists) return false;
    await posts.updateOne(
      { _id: new ObjectId(postId) },
      {
        $pull: { comments: { _id: new ObjectId(commentId) } },
        $inc: { commentsCount: post.commentsCount > 0 ? -1 : 0 },
        $set: { updatedAt: new Date() },
      }
    );
    return true;
  } finally {
    await client.close();
  }
}

module.exports = { createPost, listUserPosts, updatePostAI, likePost, unlikePost, addComment, deleteComment };
