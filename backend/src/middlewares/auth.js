const supabaseAdmin = require('@/config/supabaseAdmin');

const profileCache = new Map();
const PROFILE_TTL = 60 * 1000;

function getProfileCacheKey(userId) { return `profile:${userId}`; }

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Missing auth token' });

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ success: false, message: 'Invalid token' });

    const userId = data.user.id;
    const cacheKey = getProfileCacheKey(userId);
    const cached = profileCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < PROFILE_TTL) {
      req.user = data.user;
      req.profile = cached.data;
      return next();
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', userId)
      .single();

    if (profile) {
      profileCache.set(cacheKey, { data: profile, ts: Date.now() });
    }

    req.user = data.user;
    req.profile = profile;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
}

function invalidateProfileCache(userId) {
  if (userId) profileCache.delete(getProfileCacheKey(userId));
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.profile || !roles.includes(req.profile.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, invalidateProfileCache };
