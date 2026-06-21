import { Router } from "express";

const router = Router();

function getCallbackUri(): string {
  const domain =
    process.env.REPLIT_DOMAINS?.split(",")[0] ??
    process.env.REPLIT_DEV_DOMAIN ??
    "localhost";
  return `https://${domain}/api/auth/twitch/callback`;
}

// GET /api/auth/twitch?uid=<firebase_uid>
router.get("/twitch", (req, res) => {
  const { uid } = req.query;
  if (!uid || typeof uid !== "string") {
    res.status(400).send("Missing uid");
    return;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) {
    res.status(503).send("Twitch not configured");
    return;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getCallbackUri(),
    response_type: "code",
    scope: "channel:manage:broadcast user:read:email",
    state: uid,
    force_verify: "true",
  });

  res.redirect(`https://id.twitch.tv/oauth2/authorize?${params.toString()}`);
});

// GET /api/auth/twitch/callback?code=<code>&state=<uid>
router.get("/twitch/callback", async (req, res) => {
  const { code, state: uid, error } = req.query;

  if (error || !code || typeof code !== "string") {
    res.redirect(`mobile://twitch-callback?error=${error ?? "no_code"}`);
    return;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.redirect("mobile://twitch-callback?error=not_configured");
    return;
  }

  try {
    // Exchange code for access token
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
      res.redirect(
        `mobile://twitch-callback?error=${tokenData.error ?? "token_failed"}`
      );
      return;
    }

    const accessToken = tokenData.access_token;

    // Fetch Twitch user info
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

    const params = new URLSearchParams({ token: accessToken, channel, display_name: displayName });
    res.redirect(`mobile://twitch-callback?${params.toString()}`);
  } catch {
    res.redirect("mobile://twitch-callback?error=server_error");
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
    // Get broadcaster ID
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

    // Update title
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
  } catch (err) {
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
