const assert = require("node:assert/strict");
const test = require("node:test");

const modelPath = require.resolve("./userModel");
const supabaseClientPath = require.resolve("../config/supabaseClient");

function loadUserModelWithSupabase(supabase) {
  delete require.cache[modelPath];
  require.cache[supabaseClientPath] = {
    id: supabaseClientPath,
    filename: supabaseClientPath,
    loaded: true,
    exports: { supabase },
  };

  return require("./userModel");
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

test("findByEmail returns null when Supabase has no matching user", async (t) => {
  restoreSupabaseClient(t);

  const calls = [];
  const supabase = {
    from(table) {
      assert.equal(table, "users");
      return {
        select(columns) {
          assert.equal(columns, "*");
          return {
            eq(column, value) {
              assert.equal(column, "email");
              assert.equal(value, "missing@example.com");
              return {
                maybeSingle() {
                  calls.push("maybeSingle");
                  return Promise.resolve({ data: null, error: null });
                },
              };
            },
          };
        },
      };
    },
  };

  const userModel = loadUserModelWithSupabase(supabase);

  const user = await userModel.findByEmail("missing@example.com");

  assert.equal(user, null);
  assert.deepEqual(calls, ["maybeSingle"]);
});

test("searchUsers supports directory mode with an empty query", async (t) => {
  restoreSupabaseClient(t);

  const calls = [];
  const rows = [
    { id: "user-1", email: "a@example.com", name: "Asha" },
    { id: "user-2", email: "b@example.com", name: "Ben" },
  ];
  const builder = {
    data: rows,
    error: null,
    select(columns) {
      calls.push(["select", columns]);
      return this;
    },
    or(filter) {
      calls.push(["or", filter]);
      return this;
    },
    neq(column, value) {
      calls.push(["neq", column, value]);
      return this;
    },
    order(column, options) {
      calls.push(["order", column, options]);
      return this;
    },
    limit(value) {
      calls.push(["limit", value]);
      return this;
    },
  };
  const supabase = {
    from(table) {
      assert.equal(table, "users");
      return builder;
    },
  };

  const userModel = loadUserModelWithSupabase(supabase);

  const users = await userModel.searchUsers("", {
    excludeUserId: "current-user",
    limit: 30,
  });

  assert.deepEqual(users, rows);
  assert.deepEqual(
    calls.filter(([name]) => name === "or"),
    []
  );
  assert.deepEqual(calls.find(([name]) => name === "neq"), [
    "neq",
    "id",
    "current-user",
  ]);
  assert.deepEqual(calls.find(([name]) => name === "limit"), ["limit", 30]);
});

test("searchUsers filters by name, email, and description when query is provided", async (t) => {
  restoreSupabaseClient(t);

  const calls = [];
  const builder = {
    data: [],
    error: null,
    select(columns) {
      calls.push(["select", columns]);
      return this;
    },
    or(filter) {
      calls.push(["or", filter]);
      return this;
    },
    order(column, options) {
      calls.push(["order", column, options]);
      return this;
    },
    limit(value) {
      calls.push(["limit", value]);
      return this;
    },
  };
  const supabase = {
    from(table) {
      assert.equal(table, "users");
      return builder;
    },
  };

  const userModel = loadUserModelWithSupabase(supabase);

  await userModel.searchUsers("editor", { limit: 5 });

  const orCall = calls.find(([name]) => name === "or");
  assert.ok(orCall, "expected searchUsers to call Supabase .or()");
  assert.match(orCall[1], /name\.ilike\.%editor%/);
  assert.match(orCall[1], /email\.ilike\.%editor%/);
  assert.match(orCall[1], /description\.ilike\.%editor%/);
});
