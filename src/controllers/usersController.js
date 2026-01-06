const { ObjectId } = require("mongodb");
const userModel = require("../models/userModel");
const postModel = require("../models/postModel");

async function getUser(req, res) {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: "Not authenticated" });
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" });
  try {
    const me = await userModel.findById(req.session.userId, "read");
    if (!me) return res.status(404).json({ error: "me not found" });
    const u = await userModel.findById(id, "read");
    if (!u) return res.status(404).json({ error: "user not found" });
    const friendsSet = new Set((me.friends || []).map(String));
    const incomingSet = new Set((me.friendRequestsIncoming || []).map(String));
    const outgoingSet = new Set((me.friendRequestsOutgoing || []).map(String));
    const isFriend = friendsSet.has(String(u._id));
    const incomingPending = incomingSet.has(String(u._id));
    const outgoingPending = outgoingSet.has(String(u._id));
    return res.json({
      user: {
        _id: u._id,
        name: u.name || "",
        email: u.email,
        picture: u.picture || null,
        description: u.description || "",
        createdAt: u.createdAt || null,
      },
      relation: { isFriend, incomingPending, outgoingPending },
    });
  } catch (err) {
    req.logger?.error("getUser error: %o", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function getUserPosts(req, res) {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: "Not authenticated" });
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: "invalid id" });
  try {
    const posts = await postModel.listUserPosts(id);
    return res.json({ posts });
  } catch (err) {
    req.logger?.error("getUserPosts error: %o", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = { getUser, getUserPosts };
