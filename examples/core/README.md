# Core Demo

Two rooms built from the light `livekit-client/core` entry with `CoreRoom.with(rpc)` call each
other over RPC.

## Running the Demo

1. Create `.env.local` with `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `LIVEKIT_URL`
1. Install dependencies: `pnpm install`
1. Start server: `pnpm dev`
1. Open browser to local URL (typically http://localhost:5173)
1. Press the button to watch the demo run

For the light build, refer to the [main README](../../README.md#light-build).
