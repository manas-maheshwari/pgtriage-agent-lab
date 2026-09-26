import type { AiBinding } from "./model.js";
import type { Investigation } from "./investigation.js";
import { verifiedOwner, investigationName, type AccessConfig } from "./access.js";
import { SHARED_QUOTA, liveWindowOpen, type InferenceQuota } from "./quota.js";
export { Investigation } from "./investigation.js";
export { InferenceQuota } from "./quota.js";

export interface Env extends AccessConfig {
  INVESTIGATIONS: DurableObjectNamespace<Investigation>;
  ASSETS: Fetcher;
  MODEL_MODE: string;
  LOCAL_ONLY: string;
  AI?: AiBinding;
  QUOTA?: DurableObjectNamespace<InferenceQuota>;
  INFERENCE_ENABLED?: string;
  LIVE_UNTIL?: string;
  ADVICE_REVIEW_RESUME?: string;
}

const COOKIE = "pgtriage_session";
const SECURITY = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    let owner = "local-review";
    if (env.LOCAL_ONLY === "true") {
      if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return jsonError("Local review build", 403);
    } else if (env.LOCAL_ONLY === "false") {
      try { owner = await verifiedOwner(request, env); }
      catch { return jsonError("Access denied", 403); }
    } else {
      return jsonError("Access denied", 403);
    }
    if (!url.pathname.startsWith("/api/")) {
      const asset = await env.ASSETS.fetch(request);
      return secure(asset);
    }
    if (url.pathname === "/api/inference" && env.LOCAL_ONLY === "false" && env.QUOTA) {
      const quota = env.QUOTA.get(env.QUOTA.idFromName(SHARED_QUOTA));
      if (request.method === "GET") return secure(Response.json(await quota.status()));
      if (request.method === "DELETE" && request.headers.get("Origin") === url.origin) return secure(Response.json(await quota.disable()));
      return jsonError("Method not allowed", 405);
    }
    if (!["/api/investigation", "/api/session"].includes(url.pathname)) return jsonError("Not found", 404);
    const isReset = url.pathname === "/api/session";
    if ((isReset && request.method !== "POST") || (!isReset && !["GET", "POST"].includes(request.method))) return jsonError("Method not allowed", 405);
    if (request.method === "POST" && request.headers.get("Origin") !== url.origin) return jsonError("Same-origin requests required", 403);
    if (!isReset && request.method === "POST" && env.LOCAL_ONLY === "false" && !liveWindowOpen(env)) return jsonError("Live inference is disabled. Saved investigations remain available.", 503);
    let sessionId = request.headers.get("Cookie")?.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    const fresh = isReset || !sessionId || !/^[a-f0-9]{64}$/.test(sessionId);
    if (fresh) sessionId = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const stub = env.INVESTIGATIONS.get(env.INVESTIGATIONS.idFromName(investigationName(owner, sessionId!)));
    let response: Response;
    if (request.method === "GET" || isReset) {
      response = await stub.fetch("http://investigation/", { headers: { "X-Investigation-Owner": owner } });
    } else {
      if (!request.headers.get("Content-Type")?.startsWith("application/json")) return jsonError("JSON required", 415);
      const reader = request.body?.getReader();
      if (!reader) return jsonError("Question required", 400);
      let size = 0;
      const parts: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8192) { await reader.cancel(); return jsonError("Question too large", 413); }
        parts.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
      response = await stub.fetch("http://investigation/", { method: "POST", body: bytes, headers: { "Content-Type": "application/json", "X-Investigation-Owner": owner } });
    }
    const result = secure(response);
    if (fresh) result.headers.set("Set-Cookie", `${COOKIE}=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${url.protocol === "https:" ? "; Secure" : ""}`);
    return result;
  },
} satisfies ExportedHandler<Env>;

function secure(response: Response) {
  const copy = new Response(response.body, response);
  for (const [key, value] of Object.entries(SECURITY)) copy.headers.set(key, value);
  return copy;
}
function jsonError(error: string, status: number) { return Response.json({ error }, { status, headers: SECURITY }); }
