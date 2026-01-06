const postModel = require("../models/postModel");
const { analyzePost } = require("../services/ai.service");
const logger = require("../utils/logger");

// Create a new post for the current user
async function create(req, res) {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });

  const { content, mediaUrl } = req.validatedBody || req.body || {};
  const rawAi = req.body?.ai;
  let aiFromClient = null;
  try {
    if (rawAi && typeof rawAi === "object") aiFromClient = rawAi;
    else if (rawAi && typeof rawAi === "string") aiFromClient = JSON.parse(rawAi);
  } catch {}
  let aiPayload = { tag: "Pending", summary: "", score: null };
  if (aiFromClient) {
    const status = String(aiFromClient.fact_check_status || "").toLowerCase();
    const map = {
      verified: "Verified",
      misleading: "Misleading",
      debunked: "False",
      outdated: "Outdated",
      unverified: "Unverified",
      "not applicable": "Not Applicable",
    };
    aiPayload = {
      tag: map[status] || "Unverified",
      summary: aiFromClient.summary || "",
      score:
        typeof aiFromClient.credibility_score === "number"
          ? Math.round(aiFromClient.credibility_score)
          : null,
    };
  }
  try {
    const result = await postModel.createPost({
      userId: req.session.userId,
      content,
      mediaUrl,
      ai: aiPayload,
    });
    const postId = result.insertedId;
    if (!aiFromClient) {
      req.logger?.info("AI analysis scheduled for post %s", String(postId));
      setImmediate(async () => {
        try {
          logger.info("AI analysis started for post %s", String(postId));
          const ai = await analyzePost(content || "", mediaUrl || "");
          await postModel.updatePostAI(postId, ai);
          logger.info("AI analysis finished for post %s", String(postId));
        } catch (e) {
          logger.error("AI analysis error for post %s: %o", String(postId), e?.message || e);
        }
      });
    }
    return res.status(201).json({ id: postId, ai: { tag: aiPayload.tag } });
  } catch (err) {
    req.logger?.error("Create post error for %s: %o", req.session.email, err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// List posts for current user (simple helper)
async function myPosts(req, res) {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });
  try {
    const posts = await postModel.listUserPosts(req.session.userId);
    const toAnalyze = posts.filter(
      (p) => !p.ai || !p.ai.tag || p.ai.tag === "Pending"
    );
    if (toAnalyze.length > 0) {
      try {
        await Promise.all(
          toAnalyze.map(async (p) => {
            const ai = await analyzePost(p.content || "", p.mediaUrl || "");
            await postModel.updatePostAI(p._id, ai);
            p.ai = {
              tag: ai?.tag || "Unverified",
              summary: ai?.summary || "",
              score: typeof ai?.score === "number" ? ai.score : null,
            };
          })
        );
      } catch (e) {
        req.logger?.error("Backfill AI failed: %o", e?.message || e);
      }
    }
    return res.json({ posts });
  } catch (err) {
    req.logger?.error("List posts error for %s: %o", req.session.email, err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function like(req, res) {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });
  const id = req.params.id;
  try {
    const ok = await postModel.likePost(id, req.session.userId);
    return res.json({ liked: ok });
  } catch (err) {
    req.logger?.error("Like post error %s: %o", id, err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function unlike(req, res) {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });
  const id = req.params.id;
  try {
    const ok = await postModel.unlikePost(id, req.session.userId);
    return res.json({ unliked: ok });
  } catch (err) {
    req.logger?.error("Unlike post error %s: %o", id, err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function comment(req, res) {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });
  const id = req.params.id;
  const text = typeof (req.body?.text || req.validatedBody?.text) === "string" ? req.body.text || req.validatedBody.text : "";
  if (!text.trim()) return res.status(400).json({ error: "text required" });
  if (text.length > 1000) return res.status(400).json({ error: "text too long" });
  try {
    const commentId = await postModel.addComment(id, req.session.userId, text.trim());
    return res.status(201).json({ id: commentId });
  } catch (err) {
    req.logger?.error("Comment post error %s: %o", id, err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function deleteComment(req, res) {
  if (!req.session || !req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });
  const id = req.params.id;
  const commentId = req.params.commentId;
  try {
    const ok = await postModel.deleteComment(id, commentId, req.session.userId);
    if (!ok) return res.status(404).json({ error: "comment not found" });
    return res.json({ deleted: true });
  } catch (err) {
    req.logger?.error("Delete comment error %s/%s: %o", id, commentId, err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = { create, myPosts, like, unlike, comment, deleteComment };
