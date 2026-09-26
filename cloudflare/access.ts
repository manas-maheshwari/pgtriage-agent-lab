import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { stableHash } from "../src/util/hash.js";

export interface AccessConfig {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ALLOWED_EMAIL?: string;
  STAGING_HOST?: string;
}
const resolvers = new Map<string, JWTVerifyGetKey>();

// The optional resolver is for signed-token tests, never selected by request/env data.
export async function verifiedOwner(request: Request, config: AccessConfig, testKey?: JWTVerifyGetKey): Promise<string> {
  const { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: audience, ALLOWED_EMAIL: email, STAGING_HOST: host } = config;
  if (!team || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team) || !audience || !email || !host) throw new Error("Access is not configured");
  const url = new URL(request.url);
  if (url.protocol !== "https:" || url.hostname !== host) throw new Error("Unexpected host");
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || token.length > 16_384) throw new Error("Access required");
  let key = testKey ?? resolvers.get(team);
  if (!key) {
    key = createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
    resolvers.set(team, key);
  }
  const { payload } = await jwtVerify(token, key, {
    issuer: `https://${team}`, audience, algorithms: ["RS256"], requiredClaims: ["exp", "iat", "sub", "email"],
  });
  if (payload.type !== "app" || typeof payload.sub !== "string" || !payload.sub || typeof payload.email !== "string" || payload.email.toLowerCase() !== email.toLowerCase()) throw new Error("Identity not allowed");
  return stableHash({ issuer: payload.iss, subject: payload.sub });
}

export function investigationName(owner: string, session: string): string {
  return owner === "local-review" ? session : stableHash({ owner, session });
}
