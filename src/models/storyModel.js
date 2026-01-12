const { supabase } = require("../config/supabaseClient");



function deriveMediaType(url) {
  if (!url) return "none";
  const u = String(url).toLowerCase();
  if (u.endsWith(".mp4") || u.endsWith(".webm") || u.endsWith(".ogg")) return "video";
  return "image";
}

async function createStory({ userId, text, mediaUrl }) {
  const now = new Date();
  const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const payload = {
    user_id: userId,
    text: text || "",
    media_url: mediaUrl || "",
    media_type: deriveMediaType(mediaUrl),
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
  };

  const { data, error } = await supabase
    .from("stories")
    .insert([payload])
    .select("id,expires_at")
    .single();

  if (error) throw error;

  // keep compatibility with old return
  return { insertedId: data.id, expiresAt: data.expires_at };
}

async function markViewed({ storyId, viewerUserId }) {
  // Insert view; ignore duplicate views (primary key prevents duplicates)
  const { error } = await supabase
    .from("story_views")
    .insert([{ story_id: storyId, user_id: viewerUserId }]);

  if (!error) return;

  // If already viewed, ignore (duplicate key 23505)
  if (error.code === "23505") return;

  throw error;
}

/**
 * feedActiveByUser()
 * Mongo grouped stories by userId and joined user docs.
 * We replicate: return [{ user, latestCreatedAt, items: [...] }]
 */
async function feedActiveByUser() {
  const nowIso = new Date().toISOString();

  // 1) Get active stories sorted latest first
  const { data: stories, error } = await supabase
    .from("stories")
    .select("id,user_id,text,media_url,media_type,created_at,expires_at")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!stories || stories.length === 0) return [];

  // 2) Group in JS (because PostgREST group-by is limited)
  const grouped = new Map();
  for (const s of stories) {
    if (!grouped.has(s.user_id)) {
      grouped.set(s.user_id, {
        userId: s.user_id,
        latestCreatedAt: s.created_at,
        items: [],
      });
    }
    grouped.get(s.user_id).items.push({
      _id: s.id,
      text: s.text,
      mediaUrl: s.media_url,
      mediaType: s.media_type,
      createdAt: s.created_at,
      expiresAt: s.expires_at,
    });
  }

  const userIds = Array.from(grouped.keys());

  // 3) Fetch users (exclude password_hash)
  const { data: users, error: usersErr } = await supabase
    .from("users")
    .select("id,email,name,role,created_at,picture_url")
    .in("id", userIds);

  if (usersErr) throw usersErr;

  const userMap = new Map((users || []).map((u) => [u.id, u]));

  // 4) Build final result in same shape as Mongo model returned
  const result = Array.from(grouped.values())
    .sort((a, b) => new Date(b.latestCreatedAt) - new Date(a.latestCreatedAt))
    .map((g) => ({
      user: userMap.get(g.userId) || { _id: g.userId },
      latestCreatedAt: g.latestCreatedAt,
      items: g.items,
    }));

  // Optional: match Mongo user shape where id was _id
  // If your controllers expect user._id, you can map it:
  for (const group of result) {
    if (group.user && group.user.id) {
      group.user._id = group.user.id;
    }
  }

  return result;
}

module.exports = { createStory, markViewed, feedActiveByUser };
