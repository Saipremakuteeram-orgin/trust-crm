const supabaseAdmin = require('@/config/supabaseAdmin');

async function logActivity({ userId, userEmail, action, entity, entityId, details, before, after, ipAddress }) {
  try {
    const merged = { ...(details || {}) };
    if (before !== undefined) merged.before = before;
    if (after !== undefined) merged.after = after;
    const { error } = await supabaseAdmin.from('activity_logs').insert({
      user_id: userId || null,
      user_email: userEmail || null,
      action,
      entity,
      entity_id: entityId || null,
      details: merged,
      ip_address: ipAddress || null,
    });
    if (error) {
      console.error('[logActivity] insert failed:', error.message, error.code);
    }
  } catch (err) {
    console.error('[logActivity] exception:', err.message);
  }
}

module.exports = { logActivity };
