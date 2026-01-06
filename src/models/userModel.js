const { connect } = require("../config/dbConnection");
const { ObjectId } = require("mongodb");

async function findByEmail(email, permission = "read") {
  const { client, db } = await connect(permission);
  try {
    const users = db.collection("users");
    const u = await users.findOne({ email });
    return u;
  } finally {
    await client.close();
  }
}

async function createUser(user) {
  const { client, db } = await connect("write");
  try {
    const users = db.collection("users");
    const result = await users.insertOne(user);
    return result;
  } finally {
    await client.close();
  }
}

async function findById(id, permission = "read") {
  const { client, db } = await connect(permission);
  try {
    const users = db.collection("users");
    const u = await users.findOne({ _id: new ObjectId(id) });
    return u;
  } finally {
    await client.close();
  }
}

async function updateUserById(id, updates) {
  const { client, db } = await connect("write");
  try {
    const users = db.collection("users");
    const result = await users.updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...updates, updatedAt: new Date() } }
    );
    return result;
  } finally {
    await client.close();
  }
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
  if (!ObjectId.isValid(senderId) || !ObjectId.isValid(targetId)) {
    return { ok: false, code: "invalid_id" };
  }
  if (String(senderId) === String(targetId)) {
    return { ok: false, code: "self_request" };
  }

  const senderObjId = new ObjectId(senderId);
  const targetObjId = new ObjectId(targetId);

  const { client, db } = await connect("write");
  try {
    const users = db.collection("users");

    // 1) Ensure target exists
    const target = await users.findOne({ _id: targetObjId }, { projection: { _id: 1 } });
    if (!target) return { ok: false, code: "target_not_found" };

    // 2) Block if already friends (either side)
    const alreadyFriends = await users.findOne({
      _id: senderObjId,
      friends: targetObjId,
    }, { projection: { _id: 1 } });

    if (alreadyFriends) return { ok: false, code: "already_friends" };

    // 3) Block if request already pending
    const alreadyOutgoing = await users.findOne({
      _id: senderObjId,
      friendRequestsOutgoing: targetObjId,
    }, { projection: { _id: 1 } });

    if (alreadyOutgoing) return { ok: false, code: "already_requested" };

    // 4) Update sender (outgoing)
    const senderUpdate = await users.updateOne(
      {
        _id: senderObjId,
        friends: { $ne: targetObjId },
        friendRequestsOutgoing: { $ne: targetObjId },
      },
      {
        $addToSet: { friendRequestsOutgoing: targetObjId },
        $set: { updatedAt: new Date() },
      }
    );

    if (senderUpdate.matchedCount === 0) {
      // could happen if user missing or conditions failed
      return { ok: false, code: "sender_update_blocked" };
    }

    // 5) Update target (incoming)
    const targetUpdate = await users.updateOne(
      {
        _id: targetObjId,
        friends: { $ne: senderObjId },
        friendRequestsIncoming: { $ne: senderObjId },
      },
      {
        $addToSet: { friendRequestsIncoming: senderObjId },
        $set: { updatedAt: new Date() },
      }
    );

    if (targetUpdate.matchedCount === 0) {
      // Rollback sender outgoing if target update was blocked
      await users.updateOne(
        { _id: senderObjId },
        { $pull: { friendRequestsOutgoing: targetObjId }, $set: { updatedAt: new Date() } }
      );
      return { ok: false, code: "target_update_blocked" };
    }

    return { ok: true };
  } finally {
    await client.close();
  }
}

// Accept Firend Request
async function acceptFriendRequest(receiverId, senderId) {
  if (!ObjectId.isValid(receiverId) || !ObjectId.isValid(senderId)) {
    return { ok: false, code: "invalid_id" };
  }
  if (String(receiverId) === String(senderId)) {
    return { ok: false, code: "self_accept" };
  }

  const receiverObjId = new ObjectId(receiverId);
  const senderObjId = new ObjectId(senderId);

  const { client, db } = await connect("write");
  try {
    const users = db.collection("users");

    const senderExists = await users.findOne({ _id: senderObjId }, { projection: { _id: 1 } });
    if (!senderExists) return { ok: false, code: "sender_not_found" };

    // If already friends, stop
    const alreadyFriends = await users.findOne(
      { _id: receiverObjId, friends: senderObjId },
      { projection: { _id: 1 } }
    );
    if (alreadyFriends) return { ok: false, code: "already_friends" };

    // Must have a pending request: receiver has incoming from sender
    const pending = await users.findOne(
      { _id: receiverObjId, friendRequestsIncoming: senderObjId },
      { projection: { _id: 1 } }
    );
    if (!pending) return { ok: false, code: "no_pending_request" };

    // Update receiver: remove incoming request + add friend
    await users.updateOne(
      { _id: receiverObjId },
      {
        $pull: { friendRequestsIncoming: senderObjId },
        $addToSet: { friends: senderObjId },
        $set: { updatedAt: new Date() },
      }
    );

    // Update sender: remove outgoing request + add friend
    await users.updateOne(
      { _id: senderObjId },
      {
        $pull: { friendRequestsOutgoing: receiverObjId },
        $addToSet: { friends: receiverObjId },
        $set: { updatedAt: new Date() },
      }
    );

    return { ok: true };
  } finally {
    await client.close();
  }
}

async function declineFriendRequest(receiverId, senderId) {
  if (!ObjectId.isValid(receiverId) || !ObjectId.isValid(senderId)) {
    return { ok: false, code: "invalid_id" };
  }
  if (String(receiverId) === String(senderId)) {
    return { ok: false, code: "self_decline" };
  }
  const receiverObjId = new ObjectId(receiverId);
  const senderObjId = new ObjectId(senderId);
  const { client, db } = await connect("write");
  try {
    const users = db.collection("users");
    const pending = await users.findOne(
      { _id: receiverObjId, friendRequestsIncoming: senderObjId },
      { projection: { _id: 1 } }
    );
    if (!pending) return { ok: false, code: "no_pending_request" };
    await users.updateOne(
      { _id: receiverObjId },
      { $pull: { friendRequestsIncoming: senderObjId }, $set: { updatedAt: new Date() } }
    );
    await users.updateOne(
      { _id: senderObjId },
      { $pull: { friendRequestsOutgoing: receiverObjId }, $set: { updatedAt: new Date() } }
    );
    return { ok: true };
  } finally {
    await client.close();
  }
}
async function searchUsers(query, { excludeUserId, limit = 10 } = {}) {
  const { client, db } = await connect("read");
  try {
    const users = db.collection("users");

    const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 20));
    const q = String(query || "").trim();
    if (!q) return [];

    const match = {
      $and: [
        { _id: { $ne: new ObjectId(excludeUserId) } },
        {
          $or: [
            { name: { $regex: q, $options: "i" } },
            { email: { $regex: q, $options: "i" } },
          ],
        },
      ],
    };

    const results = await users
      .find(match, {
        projection: { password: 0 }, // never return password hash
      })
      .sort({ updatedAt: -1 })
      .limit(safeLimit)
      .toArray();

    return results;
  } finally {
    await client.close();
  }
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
};
