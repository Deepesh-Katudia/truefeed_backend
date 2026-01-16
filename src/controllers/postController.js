const postModel = require("../models/postModel");
const userModel = require("../models/userModel");
const { analyzePost } = require("../services/ai.service");

const map = {
  verified: "Verified",
  misleading: "Misleading",
  debunked: "False",
  outdated: "Outdated",
  unverified: "Unverified",
  "not applicable": "Not Applicable",
};

function normalizeAi(ai) {
  if (!ai) return { tag: "Pending", summary: "", score: null };
  const tag =
    map[String(ai.fact_check_status || "").toLowerCase()] || ai.tag || "Unverified";
  const summary = ai.summary || "";
  const score =
    typeof ai.credibility_score === "number"
      ? Math.round(ai.credibility_score)
      : typeof ai.score === "number"
      ? ai.score
      : null;
  return { tag, summary, score, raw: ai };
}

// POST /api/v1/posts
async function create(req, res) {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  const { content = "", mediaUrl = "" } = req.validatedBody || req.body || {};

  try {
    // create post with Pending AI immediately
    const insert = await postModel.createPost({
      userId: req.session.userId,
      content,
      mediaUrl,
      ai: { tag: "Pending", summary: "", score: null },
    });

    // schedule AI analysis (non-blocking)
    setImmediate(async () => {
      try {
        const ai = await analyzePost(content || "", mediaUrl || "");
        const normalized = normalizeAi(ai);
        await postModel.updatePostAI(insert.insertedId, normalized);
      } catch (e) {
        // swallow errors; post remains pending/unverified
      }
    });

    return res.status(201).json({ id: insert.insertedId, ai: { tag: "Pending" } });
  } catch (err) {
    req.logger?.error("create post error: %o", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// GET /api/v1/posts/mine
async function myPosts(req, res) {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  try {
    const posts = await postModel.listUserPosts(req.session.userId);
    return res.json({ posts });
  } catch (err) {
    req.logger?.error("myPosts error: %o", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// POST /api/v1/posts/:id/like
async function like(req, res) {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  try {
    const liked = await postModel.likePost(req.params.id, req.session.userId);
    return res.json({ liked });
  } catch (err) {
    req.logger?.error("like error: %o", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// POST /api/v1/posts/:id/unlike
async function unlike(req, res) {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  try {
    const unliked = await postModel.unlikePost(req.params.id, req.session.userId);
    return res.json({ unliked });
  } catch (err) {
    req.logger?.error("unlike error: %o", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// POST /api/v1/posts/:id/comment
async function comment(req, res) {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "text required" });

  try {
    const id = await postModel.addComment(req.params.id, req.session.userId, text);
    return res.status(201).json({ id });
  } catch (err) {
    req.logger?.error("comment error: %o", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// DELETE /api/v1/posts/:id/comment/:commentId
async function deleteComment(req, res) {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  try {
    const deleted = await postModel.deleteComment(
      req.params.id,
      req.params.commentId,
      req.session.userId
    );
    return res.json({ deleted });
  } catch (err) {
    req.logger?.error("deleteComment error: %o", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = { create, myPosts, like, unlike, comment, deleteComment };
