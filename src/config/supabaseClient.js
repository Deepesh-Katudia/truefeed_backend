const { createClient } = require("@supabase/supabase-js");

function getEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const supabase = createClient(
  getEnv("SUPABASE_URL"),
  getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: { persistSession: false },
  }
);

module.exports = { supabase };
