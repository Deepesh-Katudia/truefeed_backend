const { supabase } = require("../config/supabaseClient");

/**
 * createPost({ userId, content, mediaUrl, ai })
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

  // keep similar shape to Mongo insertOne result
  return { insertedId: data.id, acknowledged: true };
}

/**
 * listUserPosts(userId)
 * We'll return posts with likesCount/commentsCount computed.
 */
async function listUserPosts(userId) {
  const { data: posts, error } = await supabase
    .from("posts")
    .select(
      "id,user_id,content,media_url,ai_tag,ai_summary,ai_score,ai_raw,ai_updated_at,ai_error,created_at,updated_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!posts || posts.length === 0) return [];

  const postIds = posts.map((p) => p.id);

  // likes counts
  const { data: likesAgg, error: likesErr } = await supabase
    .from("post_likes")
    .select("post_id")
    .in("post_id", postIds);

  if (likesErr) throw likesErr;

  const likesCountMap = new Map();
  for (const row of likesAgg || []) {
    likesCountMap.set(row.post_id, (likesCountMap.get(row.post_id) || 0) + 1);
  }

  // comments counts
  const { data: commentsAgg, error: commentsErr } = await supabase
    .from("post_comments")
    .select("post_id")
    .in("post_id", postIds);

  if (commentsErr) throw commentsErr;

  const commentsCountMap = new Map();
  for (const row of commentsAgg || []) {
    commentsCountMap.set(row.post_id, (commentsCountMap.get(row.post_id) || 0) + 1);
  }

  // Return in a shape that mirrors your Mongo doc fields
  return posts.map((p) => ({
    _id: p.id, // compatibility with controllers expecting _id
    userId: p.user_id,
    content: p.content,
    mediaUrl: p.media_url,
    ai: {
      tag: p.ai_tag,
      summary: p.ai_summary,
      score: p.ai_score,
      raw: p.ai_raw,
      updatedAt: p.ai_updated_at,
      error: p.ai_error,
    },
    likedBy: [], // we don't return full arrays by default (same as before unless controllers depend on it)
    likesCount: likesCountMap.get(p.id) || 0,
    comments: [], // not returned here
    commentsCount: commentsCountMap.get(p.id) || 0,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));
}

/**
 * updatePostAI(postId, ai)
 */
async function updatePostAI(postId, ai) {
  const payload = {
    ai_tag: ai?.tag || "Pending",
    ai_summary: ai?.summary || "",
    ai_score: typeof ai?.score === "number" ? ai.score : null,
    ai_raw: ai?.raw ?? null,
    ai_updated_at: ai?.updatedAt || new Date().toISOString(),
    ai_error: ai?.error || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("posts").update(payload).eq("id", postId);
  if (error) throw error;
}

/**
 * likePost(postId, userId)succeeded, false if already liked.
 */
async function likePost(postId, userId) {
  const { error } = await supabase.from("post_likes").insert([
    { post_id: postId, user_id: userId },
  ]);

  if (!error) return true;

  // If already liked, Supabase/Postgres throws duplicate key error (23505)
  // We treat that as "false" (no change)
  if (error.code === "23505") return false;

  throw error;
}

/**
 * unlikePost(postId, userId)

 */
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

/**
 * addComment(postId, userId, text)
 
 */
async function addComment(postId, userId, text) {
  const { data, error } = await supabase
    .from("post_comments")
    .insert([{ post_id: postId, user_id: userId, text }])
    .select("id")
    .single();

  if (error) throw error;
  return data.id; // commentId
}

/**
 * deleteComment(postId, commentId, userId)
 
 */
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
  listUserPosts,
  updatePostAI,
  likePost,
  unlikePost,
  addComment,
  deleteComment,
};
