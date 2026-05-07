# Data Tracks Demo

A working multi-participant live demo of the LiveKit Data Tracks feature. Two participants (a publisher and a subscriber) join the same room. The publisher sends ASCII-encoded integers (0–512) via a slider, and the subscriber displays incoming values on a real-time chart.

## Running the Demo

1. Create `.env.local` with `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `LIVEKIT_URL`
2. Install dependencies: `pnpm install`
3. Start server: `pnpm dev`
4. Open browser to local URL (typically http://localhost:5173)
5. Connect both participants, publish a data track, and drag the slider to send data
