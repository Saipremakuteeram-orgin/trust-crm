const supabaseAdmin = require('@/config/supabaseAdmin');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Missing auth token' });

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ success: false, message: 'Invalid token' });

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', data.user.id)
    .single();

  req.user = data.user;
  req.profile = profile;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.profile || !roles.includes(req.profile.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
