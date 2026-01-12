const { supabase } = require("../config/supabaseClient");

/**
 * Create a post and return { insertedId } to match Mongo insertOne result usage.
 */
async function createPost({ userId, content, mediaUrl, ai }) {
  const payload = {
    user_id: userId,
    content: content || "",
    media_url: mediaUrl || "",
    ai_tag: ai?.tag || "Pending",
    ai_summary: ai?.summary || "",
    ai_score: typeof ai?.score === "number" ? ai.score : null,
    ai_raw: ai?.raw ?? null,
    ai_updated_at: ai?.updatedAt || null,
    ai_error: ai?.error || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("posts")
    .insert([payload])
    .select("id")
    .single();

  if (error) throw error;

  return { insertedId: data.id, acknowledged: true };
}

async function updatePostAI(postId, ai) {
  const payload = {
    ai_tag: ai?.tag || "Unverified",
    ai_summary: ai?.summary || "",
    ai_score: typeof ai?.score === "number" ? ai.score : null,
    ai_raw: ai?.raw ?? null,
    ai_updated_at: new Date().toISOString(),
    ai_error: ai?.error || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("posts").update(payload).eq("id", postId);
  if (error) throw error;
}

/**
 * Return posts in the shape your controller expects:
 * {_id, content, mediaUrl, ai:{tag,summary,score}, ...}
 */
async function listUserPosts(userId) {
  const { data: posts, error } = await supabase
    .from("posts")
    .select("id,user_id,content,media_url,ai_tag,ai_summary,ai_score,created_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!posts || posts.length === 0) return [];

  const postIds = posts.map((p) => p.id);

  // likes count
  const { data: likesRows, error: likesErr } = await supabase
    .from("post_likes")
    .select("post_id")
    .in("post_id", postIds);
  if (likesErr) throw likesErr;

  const likesCountMap = new Map();
  for (const r of likesRows || []) {
    likesCountMap.set(r.post_id, (likesCountMap.get(r.post_id) || 0) + 1);
  }

  // comments count
  const { data: commentRows, error: commentsErr } = await supabase
    .from("post_comments")
    .select("post_id")
    .in("post_id", postIds);
  if (commentsErr) throw commentsErr;

  const commentsCountMap = new Map();
  for (const r of commentRows || []) {
    commentsCountMap.set(r.post_id, (commentsCountMap.get(r.post_id) || 0) + 1);
  }

  return posts.map((p) => ({
    _id: p.id,
    userId: p.user_id,
    content: p.content,
    mediaUrl: p.media_url,
    ai: {
      tag: p.ai_tag || "Pending",
      summary: p.ai_summary || "",
      score: p.ai_score ?? null,
    },
    likesCount: likesCountMap.get(p.id) || 0,
    commentsCount: commentsCountMap.get(p.id) || 0,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));
}

async function likePost(postId, userId) {
  const { error } = await supabase
    .from("post_likes")
    .insert([{ post_id: postId, user_id: userId }]);

  if (!error) return true;
  if (error.code === "23505") return false; // already liked
  throw error;
}

async function unlikePost(postId, userId) {
  const { data, error } = await supabase
    .from("post_likes")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", userId)
    .select("post_id");

  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

async function addComment(postId, userId, text) {
  const { data, error } = await supabase
    .from("post_comments")
    .insert([{ post_id: postId, user_id: userId, text }])
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function deleteComment(postId, commentId, userId) {
  const { data, error } = await supabase
    .from("post_comments")
    .delete()
    .eq("id", commentId)
    .eq("post_id", postId)
    .eq("user_id", userId)
    .select("id");

  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

module.exports = {
  createPost,
  updatePostAI,
  listUserPosts,
  likePost,
  unlikePost,
  addComment,
  deleteComment,
};
