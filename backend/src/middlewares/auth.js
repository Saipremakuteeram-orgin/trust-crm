const supabaseAdmin = require('@/config/supabaseAdmin');  const profileCache = new Map();
const PROFILE_TTL = 60 * 1000;

const mfaCache = new Map();
const MFA_TTL = 60 * 1000;

function getProfileCacheKey(userId) { return `profile:${userId}`; }

function decodeJwtPayload(token) {
  try {
    const part = String(token).split('.')[1];
    if (!part) return null;
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

async function userHasVerifiedMfa(userId) {
  const cached = mfaCache.get(userId);
  if (cached && Date.now() - cached.ts < MFA_TTL) return cached.required;

  try {
    const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId });
    if (error) return false;
    const factors = data?.factors || data?.totp || [];
    const required = factors.some((factor) => factor.status === 'verified');
    mfaCache.set(userId, { required, ts: Date.now() });
    return required;
  } catch {
    // Never turn an identity-provider hiccup into a global API outage.
    return false;
  }
}

// A password-only (aal1) token must not be accepted once the user has enrolled
// a verified second factor. The frontend also gates on AAL2; this is the
// authoritative check because the API can be called directly.
async function enforceSecondFactor(res, token, userId) {
  const payload = decodeJwtPayload(token);
  if (!payload || payload.aal === 'aal2') return true;
  if (!(await userHasVerifiedMfa(userId))) return true;

  res.status(403).json({
    success: false,
    code: 'mfa_required',
    message: 'Two-factor verification required',
  });
  return false;
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Missing auth token' });

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ success: false, message: 'Invalid token' });

    const userId = data.user.id;
    if (!(await enforceSecondFactor(res, token, userId))) return;

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
