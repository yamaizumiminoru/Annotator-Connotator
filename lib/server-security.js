const LOOPBACK_HOST = "127.0.0.1";

function resolveNetworkConfig(env = process.env, port = 4174) {
  const allowNetwork = parseBoolean(env.ALLOW_NETWORK);
  const requestedHost = String(env.HOST || "").trim();
  if (requestedHost && !isLoopbackHost(requestedHost) && !allowNetwork) {
    throw new Error("Non-loopback HOST requires ALLOW_NETWORK=1.");
  }

  const host = requestedHost || (allowNetwork ? "0.0.0.0" : LOOPBACK_HOST);
  const allowedOrigins = new Set([
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    `http://[::1]:${port}`,
    ...parseOrigins(env.CORS_ORIGINS),
  ]);

  return { host, port, allowNetwork, allowedOrigins };
}

function isAllowedOrigin(origin, requestHost, config) {
  if (!origin) return true;
  if (config.allowedOrigins.has(origin)) return true;
  if (!config.allowNetwork || !requestHost) return false;

  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" && parsed.host === requestHost;
  } catch {
    return false;
  }
}

function isCostIncurringRequest(method, requestUrl) {
  if (method !== "POST") return false;
  const pathname = String(requestUrl || "").split("?", 1)[0];
  return new Set([
    "/api/annotate",
    "/api/youtube-transcript",
    "/api/ui-translations",
  ]).has(pathname);
}

function corsHeaders(origin, requestHost, config) {
  if (!origin || !isAllowedOrigin(origin, requestHost, config)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  };
}

function parseOrigins(value) {
  return String(value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .filter((origin) => {
      try {
        const parsed = new URL(origin);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    });
}

function parseBoolean(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function isLoopbackHost(host) {
  return ["127.0.0.1", "localhost", "::1"].includes(String(host || "").toLowerCase());
}

module.exports = {
  LOOPBACK_HOST,
  corsHeaders,
  isAllowedOrigin,
  isCostIncurringRequest,
  isLoopbackHost,
  resolveNetworkConfig,
};
