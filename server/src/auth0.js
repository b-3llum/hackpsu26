// "Continue with Google" through Auth0: authorization code flow with state and PKCE.
import { randomBytes, createHash } from "node:crypto";

const b64url = (buf) => Buffer.from(buf).toString("base64url");

export function auth0Client({ domain, clientId, clientSecret, redirectUri, fetchImpl = fetch }) {
  if (!domain || !clientId || !clientSecret) return null;
  const base = `https://${domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  return {
    /** Returns the Auth0 URL to send the browser to, plus what to remember for the callback. */
    start() {
      const state = b64url(randomBytes(24));
      const verifier = b64url(randomBytes(32));
      const challenge = b64url(createHash("sha256").update(verifier).digest());
      const url = new URL(`${base}/authorize`);
      url.search = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: "openid profile email",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        connection: "google-oauth2",
      }).toString();
      return { url: url.toString(), state, verifier };
    },

    /** Exchanges the code and returns the user's verified profile. */
    async finish(code, verifier) {
      const tokenRes = await fetchImpl(`${base}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: clientSecret,
          code,
          code_verifier: verifier,
          redirect_uri: redirectUri,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!tokenRes.ok) throw new Error(`Auth0 token ${tokenRes.status}`);
      const { access_token: accessToken } = await tokenRes.json();
      const infoRes = await fetchImpl(`${base}/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!infoRes.ok) throw new Error(`Auth0 userinfo ${infoRes.status}`);
      const info = await infoRes.json();
      return { sub: String(info.sub), email: String(info.email || "").toLowerCase(), emailVerified: info.email_verified === true, name: info.name || info.nickname || "" };
    },

    logoutUrl(returnTo) {
      return `${base}/v2/logout?${new URLSearchParams({ client_id: clientId, returnTo })}`;
    },
  };
}
