const cache = new Map();

function getCached(key, ttlMs, fetcher) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) return Promise.resolve(entry.data);
  return fetcher().then(data => {
    cache.set(key, { data, ts: Date.now() });
    return data;
  });
}

function invalidate(pattern) {
  for (const key of cache.keys()) {
    if (key.startsWith(pattern)) cache.delete(key);
  }
}

module.exports = { getCached, invalidate };
