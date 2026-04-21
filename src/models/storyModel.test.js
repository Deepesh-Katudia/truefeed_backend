const assert = require("node:assert/strict");
const test = require("node:test");

const modelPath = require.resolve("./storyModel");
const supabaseClientPath = require.resolve("../config/supabaseClient");

function loadStoryModelWithSupabase(supabase) {
  delete require.cache[modelPath];
  require.cache[supabaseClientPath] = {
    id: supabaseClientPath,
    filename: supabaseClientPath,
    loaded: true,
    exports: { supabase },
  };

  return require("./storyModel");
}

function restoreSupabaseClient(t) {
  const originalSupabaseClient = require.cache[supabaseClientPath];
  t.after(() => {
    delete require.cache[modelPath];
    if (originalSupabaseClient) {
      require.cache[supabaseClientPath] = originalSupabaseClient;
    } else {
      delete require.cache[supabaseClientPath];
    }
  });
}

test("feedActiveByUser only returns active stories for the viewer and friends", async (t) => {
  restoreSupabaseClient(t);

  const calls = [];
  const storyRows = [
    {
      id: "story-self",
      user_id: "viewer-1",
      text: "Own update",
      media_url: "",
      media_type: "none",
      created_at: "2026-04-20T14:00:00.000Z",
      expires_at: "2026-04-21T14:00:00.000Z",
    },
    {
      id: "story-friend",
      user_id: "friend-1",
      text: "Friend update",
      media_url: "",
      media_type: "none",
      created_at: "2026-04-20T13:00:00.000Z",
      expires_at: "2026-04-21T13:00:00.000Z",
    },
  ];
  const users = [
    {
      id: "viewer-1",
      email: "viewer@example.com",
      name: "Viewer",
      picture_url: "https://cdn.example.com/viewer.jpg",
    },
    {
      id: "friend-1",
      email: "friend@example.com",
      name: "Friend",
      picture_url: "https://cdn.example.com/friend.jpg",
    },
  ];

  const storiesBuilder = {
    data: storyRows,
    error: null,
    select(columns) {
      calls.push(["stories.select", columns]);
      return this;
    },
    gt(column) {
      calls.push(["stories.gt", column]);
      return this;
    },
    in(column, ids) {
      calls.push(["stories.in", column, ids]);
      return this;
    },
    order(column, options) {
      calls.push(["stories.order", column, options]);
      return this;
    },
  };

  const supabase = {
    from(table) {
      if (table === "friendships") {
        return {
          select(columns) {
            calls.push(["friendships.select", columns]);
            return this;
          },
          eq(column, value) {
            calls.push(["friendships.eq", column, value]);
            return Promise.resolve({
              data: [{ friend_id: "friend-1" }],
              error: null,
            });
          },
        };
      }

      if (table === "stories") {
        return storiesBuilder;
      }

      if (table === "users") {
        return {
          data: users,
          error: null,
          select(columns) {
            calls.push(["users.select", columns]);
            return this;
          },
          in(column, ids) {
            calls.push(["users.in", column, ids]);
            this.data = users.filter((user) => ids.includes(user.id));
            return this;
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  const storyModel = loadStoryModelWithSupabase(supabase);

  const groups = await storyModel.feedActiveByUser({ viewerUserId: "viewer-1" });

  assert.deepEqual(
    calls.find(([name]) => name === "stories.in"),
    ["stories.in", "user_id", ["viewer-1", "friend-1"]]
  );
  assert.deepEqual(
    groups.map((group) => group.user._id),
    ["viewer-1", "friend-1"]
  );
  assert.deepEqual(
    groups.map((group) => group.user.picture),
    ["https://cdn.example.com/viewer.jpg", "https://cdn.example.com/friend.jpg"]
  );
});
