import { Router } from "express";

const router = Router();

function getCallbackUri(): string {
  const domain =
    process.env.REPLIT_DOMAINS?.split(",")[0] ??
    process.env.REPLIT_DEV_DOMAIN ??
    "localhost";
  return `https://${domain}/api/auth/twitch/callback`;
}

function encodeState(uid: string, platform: string): string {
  // Simple separator — no encoding that can be mangled by OAuth roundtrip
  return `${platform}:${uid}`;
}

function decodeState(raw: string): { uid: string; platform: string } {
  const idx = raw.indexOf(":");
  if (idx > 0) {
    const platform = raw.slice(0, idx);
    const uid = raw.slice(idx + 1);
    if (platform && uid) return { uid, platform };
  }
  // Legacy fallback: plain uid
  return { uid: raw, platform: "native" };
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

  const state = encodeState(uid, String(platform));

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getCallbackUri(),
    response_type: "code",
    scope: "channel:manage:broadcast user:read:email",
    state,
    force_verify: "true",
  });

  res.redirect(`https://id.twitch.tv/oauth2/authorize?${params.toString()}`);
});

// GET /api/auth/twitch/callback?code=<code>&state=<encoded>
router.get("/twitch/callback", async (req, res) => {
  const { code, state: rawState, error } = req.query;

  const stateObj = decodeState(typeof rawState === "string" ? rawState : "");
  const platform = stateObj?.platform ?? "native";

  function redirectResult(params: URLSearchParams, isError = false) {
    if (platform === "web") {
      // Render a page that postMessages the result back to the opener
      const data = isError
        ? JSON.stringify({ error: params.get("error") })
        : JSON.stringify({
            token: params.get("token"),
            channel: params.get("channel"),
            display_name: params.get("display_name"),
          });
      res.setHeader("Content-Type", "text/html");
      res.send(`<!DOCTYPE html>
<html>
<head><title>TerraPulse — Twitch Auth</title>
<style>body{background:#0e0e10;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:16px;}
h2{color:#6441a5;margin:0;}p{color:#aaa;font-size:14px;margin:0;}</style>
</head>
<body>
<h2>✓ Connected</h2><p>You can close this window.</p>
<script>
var data = ${data};
try { localStorage.setItem('tp_twitch_auth', JSON.stringify(data)); } catch(e) {}
try { if(window.opener && !window.opener.closed){ window.opener.postMessage({type:'twitch-auth',payload:data},'*'); } } catch(e) {}
setTimeout(function(){window.close();},1500);
</script>
</body></html>`);
    } else {
      res.redirect(`mobile://twitch-callback?${params.toString()}`);
    }
  }

  if (error || !code || typeof code !== "string") {
    const p = new URLSearchParams({ error: String(error ?? "no_code") });
    redirectResult(p, true);
    return;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    const p = new URLSearchParams({ error: "not_configured" });
    redirectResult(p, true);
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
      const p = new URLSearchParams({ error: tokenData.error ?? "token_failed" });
      redirectResult(p, true);
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

    const p = new URLSearchParams({ token: accessToken, channel, display_name: displayName });
    redirectResult(p);
  } catch {
    const p = new URLSearchParams({ error: "server_error" });
    redirectResult(p, true);
  }
});

// POST /api/auth/twitch/update-title
// Body: { token: string, title: string, channel: string }
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
        headers: {
          Authorization: `Bearer ${token}`,
          "Client-Id": clientId,
        },
      }
    );
    const userData = (await userRes.json()) as {
      data?: { id: string }[];
    };
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
