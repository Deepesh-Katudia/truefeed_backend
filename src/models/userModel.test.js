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

test("findByEmail returns null when Supabase has no matching user", async (t) => {
  const originalSupabaseClient = require.cache[supabaseClientPath];
  t.after(() => {
    delete require.cache[modelPath];
    if (originalSupabaseClient) {
      require.cache[supabaseClientPath] = originalSupabaseClient;
    } else {
      delete require.cache[supabaseClientPath];
    }
  });

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
