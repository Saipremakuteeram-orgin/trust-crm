const supabaseAdmin = require('@/config/supabaseAdmin');

async function logActivity({ userId, userEmail, action, entity, entityId, details, ipAddress }) {
  try {
    await supabaseAdmin.from('activity_logs').insert({
      user_id: userId || null,
      user_email: userEmail || null,
      action,
      entity,
      entity_id: entityId || null,
      details: details || {},
      ip_address: ipAddress || null,
    });
  } catch (err) {
    console.error('Logging error:', err.message);
  }
}

module.exports = { logActivity };
