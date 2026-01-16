const { supabase } = require("../config/supabaseClient");


function notMigrated(fn) {
  return async () => {
    throw new Error(`${fn} not migrated to Supabase yet`);
  };
}

async function findByEmail(email) {
  const { data, error } = await supabase
    .from("users")
    .select("id,email,name,password_hash,role,created_at")
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function createUser({ name, email, passwordHash, role = "user" }) {
  const { data, error } = await supabase
    .from("users")
    .insert([
      { name, email, password_hash: passwordHash, role },
    ])
    .select("id,email,name,role,created_at")
    .single();

  if (error) throw error;
  return data;
}


async function findById(id) {
  const { data, error } = await supabase
    .from("users")
    .select("id,email,name,role,created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function updateUserById(id, updates) {
  const allowed = ["name", "picture_url", "description", "phone"];
  // add more profile fields you support
  const safe = {};
  for (const k of allowed) {
    if (updates[k] !== undefined) safe[k] = updates[k];
  }
  safe.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("users")
    .update(safe)
    .eq("id", id)
    .select("id,email,name,role,created_at,updated_at,picture_url")
    .maybeSingle();

  if (error) throw error;
  return data;
}


/**
 * Sends a friend request: sender -> target
 * Adds:
 *  - sender.friendRequestsOutgoing += targetId
 *  - target.friendRequestsIncoming += senderId
 *
 * Returns an object describing what happened.
 */
async function sendFriendRequest(senderId, targetId) {
  if (!senderId || !targetId) return { ok: false, code: "invalid_id" };
  if (String(senderId) === String(targetId)) return { ok: false, code: "self_request" };

  // ensure target exists
  const target = await findById(targetId);
  if (!target) return { ok: false, code: "target_not_found" };

  // already friends?
  const { data: alreadyFriends, error: frErr } = await supabase
    .from("friendships")
    .select("user_id")
    .eq("user_id", senderId)
    .eq("friend_id", targetId)
    .maybeSingle();
  if (frErr) throw frErr;
  if (alreadyFriends) return { ok: false, code: "already_friends" };

  // already requested?
  const { data: pending, error: pendingErr } = await supabase
    .from("friend_requests")
    .select("id,status")
    .eq("sender_id", senderId)
    .eq("receiver_id", targetId)
    .eq("status", "pending")
    .maybeSingle();
  if (pendingErr) throw pendingErr;
  if (pending) return { ok: false, code: "already_requested" };

  const { error } = await supabase
    .from("friend_requests")
    .insert([{ sender_id: senderId, receiver_id: targetId, status: "pending" }]);

  if (error) throw error;
  return { ok: true };
}


// Accept Firend Request
async function acceptFriendRequest(receiverId, senderId) {
  if (!receiverId || !senderId) return { ok: false, code: "invalid_id" };
  if (String(receiverId) === String(senderId)) return { ok: false, code: "self_accept" };

  // must have a pending request
  const { data: reqRow, error: reqErr } = await supabase
    .from("friend_requests")
    .select("id,status")
    .eq("sender_id", senderId)
    .eq("receiver_id", receiverId)
    .eq("status", "pending")
    .maybeSingle();
  if (reqErr) throw reqErr;
  if (!reqRow) return { ok: false, code: "no_pending_request" };

  // mark accepted
  const { error: updErr } = await supabase
    .from("friend_requests")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", reqRow.id);
  if (updErr) throw updErr;

  // insert friendships both directions
  const { error: insErr } = await supabase
    .from("friendships")
    .insert([
      { user_id: receiverId, friend_id: senderId },
      { user_id: senderId, friend_id: receiverId },
    ]);
  if (insErr) throw insErr;

  return { ok: true };
}


async function declineFriendRequest(receiverId, senderId) {
  if (!receiverId || !senderId) return { ok: false, code: "invalid_id" };
  if (String(receiverId) === String(senderId)) return { ok: false, code: "self_decline" };

  const { data: reqRow, error: reqErr } = await supabase
    .from("friend_requests")
    .select("id,status")
    .eq("sender_id", senderId)
    .eq("receiver_id", receiverId)
    .eq("status", "pending")
    .maybeSingle();
  if (reqErr) throw reqErr;
  if (!reqRow) return { ok: false, code: "no_pending_request" };

  const { error } = await supabase
    .from("friend_requests")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("id", reqRow.id);

  if (error) throw error;
  return { ok: true };
}

// Returns Set of friend user IDs for userId
async function getFriendIds(userId) {
  const { data, error } = await supabase
    .from("friendships")
    .select("friend_id")
    .eq("user_id", userId);

  if (error) throw error;
  return new Set((data || []).map((r) => r.friend_id));
}

// Returns { incoming: Set, outgoing: Set } of pending request IDs
async function getPendingRequestSets(userId) {
  const [{ data: incoming, error: inErr }, { data: outgoing, error: outErr }] =
    await Promise.all([
      supabase
        .from("friend_requests")
        .select("sender_id")
        .eq("receiver_id", userId)
        .eq("status", "pending"),
      supabase
        .from("friend_requests")
        .select("receiver_id")
        .eq("sender_id", userId)
        .eq("status", "pending"),
    ]);

  if (inErr) throw inErr;
  if (outErr) throw outErr;

  return {
    incoming: new Set((incoming || []).map((r) => r.sender_id)),
    outgoing: new Set((outgoing || []).map((r) => r.receiver_id)),
  };
}



async function searchUsers(query, { excludeUserId, limit = 10 } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];

  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 20));

  let builder = supabase
    .from("users")
    .select("id,email,name,role,created_at,picture_url")
    .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
    .order("updated_at", { ascending: false })
    .limit(safeLimit);

  if (excludeUserId) builder = builder.neq("id", excludeUserId);

  const { data, error } = await builder;
  if (error) throw error;

  return data || [];
}




module.exports = {
  findByEmail,
  createUser,
  findById,
  updateUserById,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  searchUsers,
  getFriendIds,
  getPendingRequestSets,
};

