const { createClient } = require('@supabase/supabase-js');

// Service role client — full access, backend-only, never expose this key to frontend
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

module.exports = supabaseAdmin;
