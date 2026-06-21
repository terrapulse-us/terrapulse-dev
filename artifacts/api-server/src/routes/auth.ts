import { Router } from "express";
import { randomUUID } from "crypto";

const router = Router();

// In-memory store: stateToken → { uid, platform }
// Entries expire after 15 minutes
interface PendingEntry {
  uid: string;
  platform: string;
  expiresAt: number;
}
const pending = new Map<string, PendingEntry>();

function cleanupExpired() {
  const now = Date.now();
  for (const [key, entry] of pending) {
    if (entry.expiresAt < now) pending.delete(key);
  }
}

function getCallbackUri(): string {
  const domain =
    process.env.REPLIT_DOMAINS?.split(",")[0] ??
    process.env.REPLIT_DEV_DOMAIN ??
    "localhost";
  return `https://${domain}/api/auth/twitch/callback`;
}

// GET /api/auth/twitch?uid=<firebase_uid>&platform=<web|native>
router.get("/twitch", (req, res) => {
  const { uid, platform = "native" } = req.query;
  if (!uid || typeof uid !== "string") {
    res.status(400).send("Missing uid");
    return;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) {
    res.status(503).send("Twitch not configured");
    return;
  }

  cleanupExpired();

  // Store uid + platform server-side; pass only the token to Twitch
  const stateToken = randomUUID();
  pending.set(stateToken, {
    uid,
    platform: String(platform),
    expiresAt: Date.now() + 15 * 60 * 1000,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getCallbackUri(),
    response_type: "code",
    scope: "channel:manage:broadcast user:read:email",
    state: stateToken,
    force_verify: "true",
  });

  res.redirect(`https://id.twitch.tv/oauth2/authorize?${params.toString()}`);
});

// GET /api/auth/twitch/debug — shows pending Map contents (dev only)
router.get("/twitch/debug", (req, res) => {
  const entries = [...pending.entries()].map(([k, v]) => ({ key: k, platform: v.platform, uid: v.uid.slice(0, 6) + "..." }));
  res.json({ pendingCount: pending.size, entries });
});

// GET /api/auth/twitch/callback?code=<code>&state=<stateToken>
router.get("/twitch/callback", async (req, res) => {
  const { code, state: stateToken, error } = req.query;

  // Look up the platform from server-side state
  const entry = typeof stateToken === "string" ? pending.get(stateToken) : undefined;
  if (entry) pending.delete(stateToken as string);
  const platform = entry?.platform ?? "native";

  req.log.info({
    stateToken,
    stateType: typeof stateToken,
    entryFound: !!entry,
    platform,
    pendingKeys: [...pending.keys()].slice(0, 5),
  }, "twitch callback received");

  function sendWebResult(data: Record<string, string | null>) {
    const json = JSON.stringify(data);
    res.setHeader("Content-Type", "text/html");
    res.send(`<!DOCTYPE html>
<html>
<head><title>TerraPulse — Connected</title>
<style>
body{background:#0e0e10;color:#fff;font-family:system-ui;display:flex;align-items:center;
justify-content:center;height:100vh;margin:0;flex-direction:column;gap:16px;}
h2{color:#6441a5;margin:0;}p{color:#aaa;font-size:14px;margin:0;}
</style>
</head>
<body>
<h2>✓ Connected to Twitch</h2>
<p>You can close this window.</p>
<script>
(function(){
  var data = ${json};
  try { localStorage.setItem('tp_twitch_auth', JSON.stringify(data)); } catch(e){}
  try {
    if(window.opener && !window.opener.closed){
      window.opener.postMessage({type:'twitch-auth',payload:data},'*');
    }
  } catch(e){}
  setTimeout(function(){ window.close(); }, 1500);
})();
</script>
</body>
</html>`);
  }

  function redirectNative(params: URLSearchParams) {
    res.redirect(`mobile://twitch-callback?${params.toString()}`);
  }

  if (error || !code || typeof code !== "string") {
    const errVal = String(error ?? "no_code");
    if (platform === "web") sendWebResult({ error: errVal });
    else redirectNative(new URLSearchParams({ error: errVal }));
    return;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    if (platform === "web") sendWebResult({ error: "not_configured" });
    else redirectNative(new URLSearchParams({ error: "not_configured" }));
    return;
  }

  try {
    const tokenRes = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: getCallbackUri(),
      }).toString(),
    });

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
    };

    if (!tokenData.access_token) {
      const errVal = tokenData.error ?? "token_failed";
      if (platform === "web") sendWebResult({ error: errVal });
      else redirectNative(new URLSearchParams({ error: errVal }));
      return;
    }

    const accessToken = tokenData.access_token;

    const userRes = await fetch("https://api.twitch.tv/helix/users", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": clientId,
      },
    });

    const userData = (await userRes.json()) as {
      data?: { login: string; display_name: string; id: string }[];
    };

    const twitchUser = userData?.data?.[0];
    const channel = twitchUser?.login ?? "";
    const displayName = twitchUser?.display_name ?? "";

    if (platform === "web") {
      sendWebResult({ token: accessToken, channel, display_name: displayName });
    } else {
      redirectNative(new URLSearchParams({ token: accessToken, channel, display_name: displayName }));
    }
  } catch {
    if (platform === "web") sendWebResult({ error: "server_error" });
    else redirectNative(new URLSearchParams({ error: "server_error" }));
  }
});

// POST /api/auth/twitch/update-title
router.post("/twitch/update-title", async (req, res) => {
  const { token, title, channel } = req.body as {
    token?: string;
    title?: string;
    channel?: string;
  };

  if (!token || !title || !channel) {
    res.status(400).json({ ok: false, error: "Missing fields" });
    return;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ ok: false, error: "Twitch not configured" });
    return;
  }

  try {
    const userRes = await fetch(
      `https://api.twitch.tv/helix/users?login=${encodeURIComponent(channel)}`,
      {
        headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId },
      }
    );
    const userData = (await userRes.json()) as { data?: { id: string }[] };
    const broadcasterId = userData?.data?.[0]?.id;
    if (!broadcasterId) {
      res.status(404).json({ ok: false, error: "Broadcaster not found" });
      return;
    }

    const patchRes = await fetch(
      `https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Client-Id": clientId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title }),
      }
    );

    res.status(patchRes.ok ? 200 : 400).json({ ok: patchRes.ok });
  } catch {
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
