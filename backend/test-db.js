require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function test() {
  const { data, error } = await supabase.from('categories').select('*');
  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Success! Retrieved categories:', data.length);
  }
}
test();
