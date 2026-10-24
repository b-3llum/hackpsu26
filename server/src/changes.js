// Terms change tracker on Tiger Data (TimescaleDB). Anonymous events: which policy changed and how,
// never who saw it. Accounts stay in SQLite; this store is optional.
import pg from "pg";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS policy_changes (
  ts TIMESTAMPTZ NOT NULL,
  host TEXT NOT NULL,
  url TEXT NOT NULL,
  hash_after TEXT NOT NULL,
  risk_before TEXT,
  risk_after TEXT,
  added INTEGER NOT NULL DEFAULT 0,
  removed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS policy_changes_url_ts ON policy_changes (url, ts DESC);
CREATE INDEX IF NOT EXISTS policy_changes_host_ts ON policy_changes (host, ts DESC);
`;

export async function openChangeStore(connectionString) {
  if (!connectionString) return null;
  // Always verify the server certificate (Tiger Cloud certificates are publicly trusted), whatever sslmode the URL says.
  const url = new URL(connectionString);
  url.searchParams.set("sslmode", "verify-full");
  const pool = new pg.Pool({ connectionString: url.toString(), max: 4, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
  await pool.query(SCHEMA);
  // Hypertable partitioned by time (TimescaleDB 2.13+). Plain Postgres still works without it.
  await pool.query("SELECT create_hypertable('policy_changes', by_range('ts'), if_not_exists => TRUE)")
    .catch((e) => console.warn("create_hypertable skipped:", e.message));
  return changeStore(pool);
}

const RISKS = new Set(["low", "medium", "high"]);
const risk = (r) => (RISKS.has(String(r).toLowerCase()) ? String(r).toLowerCase() : null);

export function changeStore(pool) {
  return {
    /** Record one change. The same new version of a policy is counted once per day. Returns its 90 day count. */
    async record({ url, hashAfter, riskBefore, riskAfter, added = 0, removed = 0 }) {
      const u = new URL(url);
      const clean = `${u.origin}${u.pathname}`;
      await pool.query(
        `INSERT INTO policy_changes (ts, host, url, hash_after, risk_before, risk_after, added, removed)
         SELECT now(), $1, $2, $3, $4, $5, $6, $7
         WHERE NOT EXISTS (SELECT 1 FROM policy_changes WHERE url = $2 AND hash_after = $3 AND ts > now() - interval '1 day')`,
        [u.hostname, clean, String(hashAfter).slice(0, 128), risk(riskBefore), risk(riskAfter),
          Math.max(0, Math.min(10000, added | 0)), Math.max(0, Math.min(10000, removed | 0))],
      );
      return this.countForUrl(clean);
    },

    async countForUrl(url) {
      const u = new URL(url);
      const { rows } = await pool.query(
        "SELECT count(*)::int AS n FROM policy_changes WHERE url = $1 AND ts > now() - interval '90 days'",
        [`${u.origin}${u.pathname}`],
      );
      return rows[0].n;
    },

    async recent() {
      const events = (await pool.query(
        `SELECT host, url, ts, risk_before AS "riskBefore", risk_after AS "riskAfter", added, removed
         FROM policy_changes WHERE ts > now() - interval '30 days' ORDER BY ts DESC LIMIT 100`,
      )).rows;
      const byHost = (await pool.query(
        `SELECT host, count(*)::int AS "changes90d", max(ts) AS "lastChange"
         FROM policy_changes WHERE ts > now() - interval '90 days'
         GROUP BY host ORDER BY "changes90d" DESC, "lastChange" DESC LIMIT 50`,
      )).rows;
      const perDay = (await pool.query(
        `SELECT time_bucket('1 day', ts) AS day, count(*)::int AS changes
         FROM policy_changes WHERE ts > now() - interval '30 days' GROUP BY day ORDER BY day`,
      ).catch(() => ({ rows: [] }))).rows;
      return { events, byHost, perDay };
    },

    close: () => pool.end(),
  };
}
