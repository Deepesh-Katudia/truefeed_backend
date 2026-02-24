const userModel = require("../models/userModel");
const postModel = require("../models/postModel");

function looksLikeUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

function getMeId(req) {
  return req.user?.userId ? String(req.user.userId) : "";
}

async function getUser(req, res) {
  const meId = getMeId(req);
  if (!meId) return res.status(401).json({ error: "Not authenticated" });

  const id = req.params.id;
  if (!looksLikeUuid(id)) return res.status(400).json({ error: "invalid id" });

  try {
    const u = await userModel.findById(id);
    if (!u) return res.status(404).json({ error: "user not found" });

    const [friendsSet, pendingSets] = await Promise.all([
      userModel.getFriendIds(meId),
      userModel.getPendingRequestSets(meId),
    ]);

    const isFriend = friendsSet.has(id);
    const incomingPending = pendingSets.incoming.has(id);
    const outgoingPending = pendingSets.outgoing.has(id);

    return res.json({
      user: {
        _id: u.id,
        name: u.name || "",
        email: u.email,
        picture: u.picture_url || null,
        description: u.description || "",
        createdAt: u.created_at || null,
      },
      relation: { isFriend, incomingPending, outgoingPending },
    });
  } catch (err) {
    req.logger?.error("getUser error: %o", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function getUserPosts(req, res) {
  const meId = getMeId(req);
  if (!meId) return res.status(401).json({ error: "Not authenticated" });

  const id = req.params.id;
  if (!looksLikeUuid(id)) return res.status(400).json({ error: "invalid id" });

  try {
    const posts = await postModel.listUserPosts(id);
    return res.json({ posts });
  } catch (err) {
    req.logger?.error("getUserPosts error: %o", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = { getUser, getUserPosts };