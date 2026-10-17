export function isNetworkAuthError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return error?.name === 'TypeError'
    || error?.name === 'AuthRetryableFetchError'
    || message.includes('networkerror')
    || message.includes('failed to fetch')
    || message.includes('fetch failed')
    || message.includes('cors');
}

export function formatAuthError(error, health) {
  const message = String(error?.message || error || '').trim();
  const normalized = message.toLowerCase();

  if (normalized.includes('invalid login credentials')) {
    return 'Email or password is incorrect.';
  }
  if (normalized.includes('email not confirmed')) {
    return 'Confirm your email address before signing in.';
  }
  if (health?.code === 'missing-config') {
    return 'This deployment is missing its Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the hosting environment, then redeploy.';
  }
  if (health?.code === 'network' || health?.status >= 500) {
    return 'Supabase cannot be reached right now. The project may be paused or waking up. Restore it in the Supabase Dashboard and try again.';
  }
  if (health?.status === 401 || health?.status === 403) {
    return 'Supabase rejected the app configuration. Verify the deployed VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then redeploy.';
  }
  if (isNetworkAuthError(error) && health?.ok) {
    return 'Supabase is reachable, but the browser blocked the login request. Disable extensions/VPN filtering for this site and verify the deployed Supabase URL, then try again.';
  }
  if (isNetworkAuthError(error)) {
    return 'Cannot connect to Supabase. Check your internet connection and verify that the Supabase project is active.';
  }

  return message || 'Unable to sign in. Please try again.';
}
