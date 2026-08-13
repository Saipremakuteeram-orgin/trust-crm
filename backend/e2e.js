require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3Z3Vuam1hY2JmcXFwanBncmp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NzY2MDksImV4cCI6MjA5OTA1MjYwOX0.9RJoqUxNhFAiCiiW-cSyBOgkwLdusJFcvxw_rBu-vYI';

const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

const TEST_EMAIL = 'qrtest_' + Date.now() + '@example.com';
const TEST_PASS = 'QrTest12345!';

(async () => {
  try {
    // 1. Create user via admin
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASS,
      email_confirm: true,
    });
    if (createErr) { console.error('Create user error:', createErr.message); process.exit(1); }
    const userId = created.user.id;
    console.log('Created user:', userId);

    // 2. Set role = admin in profiles
    const { error: profErr } = await admin.from('profiles').upsert({ id: userId, full_name: 'QR Test', role: 'admin' });
    if (profErr) console.error('Profile upsert error:', profErr.message);

    // 3. Sign in with anon to get JWT
    const { data: signIn, error: signErr } = await anon.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASS });
    if (signErr) { console.error('Sign in error:', signErr.message); process.exit(1); }
    const token = signIn.session.access_token;
    console.log('Got JWT token, length:', token.length);

    // 4. Hit the running server
    const base = 'http://localhost:8888/api';
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    console.log('\n--- POST /whatsapp/connect ---');
    const connectRes = await fetch(base + '/whatsapp/connect', { method: 'POST', headers });
    console.log('Status:', connectRes.status, await connectRes.text());

    // 5. Poll /whatsapp/qr
    console.log('\n--- Polling /whatsapp/qr ---');
    for (let i = 1; i <= 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const qrRes = await fetch(base + '/whatsapp/qr', { headers });
      const body = await qrRes.text();
      let parsed;
      try { parsed = JSON.parse(body); } catch { parsed = body; }
      const qr = parsed?.result?.qr;
      const dataUrl = parsed?.result?.dataUrl;
      console.log(`[${i * 2}s] status=${qrRes.status} qr=${qr ? 'PRESENT(' + qr.length + ')' : 'null'} dataUrl=${dataUrl ? 'PRESENT' : 'null'}`);
      if (qr && dataUrl) { console.log('SUCCESS: QR delivered to authenticated client'); break; }
    }

    // cleanup
    await admin.auth.admin.deleteUser(userId);
    process.exit(0);
  } catch (e) {
    console.error('Fatal:', e.message);
    process.exit(1);
  }
})();
