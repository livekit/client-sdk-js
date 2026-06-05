import { exec } from 'child_process';
import dotenv from 'dotenv';
import express from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { promisify } from 'util';
import type { Express } from 'express';

dotenv.config({ path: '.env.local' });

const execAsync = promisify(exec);

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

/** Network Link Conditioner presets we allow the client to request. */
const ALLOWED_PRESETS = ['Edge', '3G', 'LTE', 'Wi-Fi', 'Very Bad Network'];

const app = express();
app.use(express.json());

app.post('/api/get-token', async (req, res) => {
  const { identity, roomName } = req.body;

  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    res.status(500).json({ error: 'Server misconfigured' });
    return;
  }

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });

  res.json({
    token: await token.toJwt(),
    url: LIVEKIT_URL,
  });
});

/**
 * Enables the macOS Network Link Conditioner at the given preset. The preset name is read from the
 * `mode` environment variable via `system attribute "mode"`.
 */
const ENABLE_SCRIPT = `osascript <<'EOF'
set mode to system attribute "mode"
do shell script "open '/Library/PreferencePanes/Network Link Conditioner.prefPane'"
delay 2
tell application "System Settings" to activate
tell application "System Events"
    tell process "System Settings"
        tell window "Network Link Conditioner"
            tell scroll area 1 of group 3 of splitter group 1 of group 1
                tell group 1
                    click pop up button 1
                    delay 0.3
                    click menu item mode of menu 1 of pop up button 1
                end tell
                delay 0.3
                click button "ON"
            end tell
        end tell
    end tell
end tell
EOF`;

/** Disables the macOS Network Link Conditioner, returning to the host network speed. */
const DISABLE_SCRIPT = `osascript <<'EOF'
do shell script "open '/Library/PreferencePanes/Network Link Conditioner.prefPane'"
delay 2
tell application "System Settings" to activate
tell application "System Events"
    tell process "System Settings"
        tell window "Network Link Conditioner"
            tell scroll area 1 of group 3 of splitter group 1 of group 1
                click button "OFF"
            end tell
        end tell
    end tell
end tell
EOF`;

app.post('/api/network-condition', async (req, res) => {
  const { preset } = req.body as { preset?: string };

  if (preset === 'off') {
    try {
      await execAsync(DISABLE_SCRIPT, { timeout: 30_000 });
      res.json({ ok: true, preset: 'off' });
    } catch (error) {
      res.status(500).json({ error: `Failed to disable network conditioner: ${String(error)}` });
    }
    return;
  }

  if (!preset || !ALLOWED_PRESETS.includes(preset)) {
    res
      .status(400)
      .json({ error: `Invalid preset "${preset}". Allowed: ${ALLOWED_PRESETS.join(', ')}, off` });
    return;
  }

  try {
    await execAsync(ENABLE_SCRIPT, {
      timeout: 30_000,
      env: { ...process.env, mode: preset },
    });
    res.json({ ok: true, preset });
  } catch (error) {
    res
      .status(500)
      .json({ error: `Failed to set network conditioner to ${preset}: ${String(error)}` });
  }
});

export const handler: Express = app;
