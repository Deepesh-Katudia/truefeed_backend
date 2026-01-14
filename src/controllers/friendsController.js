const userModel = require("../models/userModel");
const { supabase } = require("../config/supabaseClient");

async function sendRequest(req, res) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { targetUserId } = req.validatedBody || req.body || {};

  try {
    const result = await userModel.sendFriendRequest(req.session.userId, targetUserId);

    if (!result.ok) {
      if (result.code === "invalid_id") return res.status(400).json({ error: "invalid targetUserId" });
      if (result.code === "self_request") return res.status(400).json({ error: "cannot send request to yourself" });
      if (result.code === "target_not_found") return res.status(404).json({ error: "user not found" });
      if (result.code === "already_friends") return res.status(409).json({ error: "already friends" });
      if (result.code === "already_requested") return res.status(409).json({ error: "request already sent" });

      return res.status(409).json({ error: "request could not be created", reason: result.code });
    }

    return res.status(201).json({ message: "Friend request sent" });
  } catch (err) {
    req.logger?.error("Send friend request error for %s: %o", req.session.email, err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function acceptRequest(req, res) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { senderUserId } = req.validatedBody || req.body || {};

  try {
    const result = await userModel.acceptFriendRequest(req.session.userId, senderUserId);

    if (!result.ok) {
      if (result.code === "invalid_id") return res.status(400).json({ error: "invalid senderUserId" });
      if (result.code === "self_accept") return res.status(400).json({ error: "cannot accept yourself" });
      if (result.code === "sender_not_found") return res.status(404).json({ error: "sender not found" });
      if (result.code === "no_pending_request") return res.status(409).json({ error: "no pending request to accept" });
      if (result.code === "already_friends") return res.status(409).json({ error: "already friends" });

      return res.status(409).json({ error: "accept failed", reason: result.code });
    }

    return res.status(200).json({ message: "Friend request accepted" });
  } catch (err) {
    req.logger?.error("Accept friend request error: %o", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function declineRequest(req, res) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const { senderUserId } = req.validatedBody || req.body || {};

  try {
    const result = await userModel.declineFriendRequest(req.session.userId, senderUserId);

    if (!result.ok) {
      if (result.code === "invalid_id") return res.status(400).json({ error: "invalid senderUserId" });
      if (result.code === "self_decline") return res.status(400).json({ error: "cannot decline yourself" });
      if (result.code === "no_pending_request") return res.status(409).json({ error: "no pending request to decline" });
      return res.status(409).json({ error: "decline failed", reason: result.code });
    }

    return res.status(200).json({ message: "Friend request declined" });
  } catch (err) {
    req.logger?.error("Decline friend request error: %o", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function searchUsers(req, res) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const q = String(req.query.q || "").trim();
  const limit = req.query.limit;

  if (!q || q.length < 2) {
    return res.status(400).json({ error: "q must be at least 2 characters" });
  }

  try {
    // Compute relationship sets from Supabase tables
    const [friendsSet, pending] = await Promise.all([
      userModel.getFriendIds(req.session.userId),
      userModel.getPendingRequestSets(req.session.userId),
    ]);

    const users = await userModel.searchUsers(q, {
      excludeUserId: req.session.userId,
      limit,
    });

    const results = users.map((u) => ({
      _id: u.id || u._id,
      name: u.name || "",
      email: u.email,
      picture: u.picture_url || u.picture || null,
      description: u.description || "",
      isFriend: friendsSet.has(u.id),
      incomingPending: pending.incoming.has(u.id),
      outgoingPending: pending.outgoing.has(u.id),
    }));

    return res.status(200).json({ results });
  } catch (err) {
    req.logger?.error("Search users error: %o", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function incomingRequests(req, res) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    // pending incoming: receiver = me, status = pending
    const { data: reqRows, error } = await supabase
      .from("friend_requests")
      .select("sender_id")
      .eq("receiver_id", req.session.userId)
      .eq("status", "pending");

    if (error) throw error;

    const incomingIds = (reqRows || []).map((r) => r.sender_id);
    if (incomingIds.length === 0) return res.json({ results: [] });

    // fetch sender user docs
    const { data: users, error: usersErr } = await supabase
      .from("users")
      .select("id,name,email,picture_url,description")
      .in("id", incomingIds);

    if (usersErr) throw usersErr;

    const results = (users || []).map((u) => ({
      _id: u.id,
      name: u.name || "",
      email: u.email,
      picture: u.picture_url || null,
      description: u.description || "",
    }));

    return res.json({ results });
  } catch (err) {
    req.logger?.error("Incoming requests error: %o", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = { sendRequest, acceptRequest, declineRequest, searchUsers, incomingRequests };
