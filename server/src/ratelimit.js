// Fixed window, in memory. One VM, one process: enough for this deployment.
export function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  return {
    hit(key) {
      const now = Date.now();
      const h = hits.get(key);
      if (!h || now - h.start >= windowMs) {
        hits.set(key, { start: now, count: 1 });
        if (hits.size > 10000) for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k);
        return true;
      }
      h.count++;
      return h.count <= max;
    },
  };
}
