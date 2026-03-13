# RPC Benchmark

Stress test for LiveKit RPC with configurable payload sizes. Exercises all three RPC transport paths:

| Path | Payload Size | Description |
|------|-------------|-------------|
| Legacy | < 1 KB | Uncompressed inline payload |
| Compressed | 1 KB – 15 KB | Gzip-compressed inline payload |
| Data Stream | >= 15 KB | Gzip-compressed via one-time data stream |

## Setup

1. Create a `.env.local` in this directory:
   ```
   LIVEKIT_API_KEY=your-api-key
   LIVEKIT_API_SECRET=your-api-secret
   LIVEKIT_URL=wss://your-livekit-server.example.com
   ```

2. Install and run:
   ```bash
   pnpm install
   pnpm dev
   ```

3. Open the URL shown by Vite (typically `http://localhost:5173`).

## Usage

1. Configure benchmark parameters in the UI:
   - **Payload Size**: use presets or enter a custom byte count
   - **Duration**: how long the benchmark runs (seconds)
   - **Concurrent Callers**: number of parallel async caller "threads"
   - **Delay Between Calls**: ms to wait between each call per thread

2. Click **Run Benchmark**. The page connects a caller and receiver to the same room, then the caller fires RPCs and verifies round-trip integrity via checksum.

3. Live stats update every 500ms. Click **Stop** to end early.

Everything runs in a single browser tab — no need for multiple tabs.
