# Data Stream Benchmark

Measures the end-to-end latency of LiveKit **v2 data streams** across a grid of network conditions
(X axis) and payload sizes (Y axis).

Two participants (`bench-sender` and `bench-receiver`) join a shared room in the same browser tab.
For each box in the grid the sender sends a fixed number of data streams (default 10) of random,
realistic JSON data to the receiver. Each stream header carries a `checksum` (XOR of the payload
bytes) and a `sendTs` timestamp; the receiver verifies the checksum and computes the end-to-end
latency. Each cell shows the average latency over the checksum-matching streams, or `N/A`.

## Running

1. Create `.env.local` with `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `LIVEKIT_URL`.
2. Install dependencies: `pnpm install`
3. Start the server: `pnpm dev`
4. Open the local URL (typically http://localhost:5173).
5. Click **Connect**, then **Run Benchmark**. Click **Disconnect** when done.

## Network conditioning (macOS only)

The **X axis** (Edge / 3G / LTE / Wi-Fi / None) is driven by the macOS **Network Link Conditioner**.
The server (`api.ts`) toggles it via `osascript` through `POST /api/network-condition`.

Prerequisites:

- The **Network Link Conditioner** preference pane must be installed
  (`/Library/PreferencePanes/Network Link Conditioner.prefPane`, from Apple's "Additional Tools for
  Xcode").
- The process running `vite`/node needs macOS **Accessibility** permission (System Settings →
  Privacy & Security → Accessibility) so it can drive System Settings.
- The preset names must match the conditioner's menu exactly: `Edge`, `3G`, `LTE`, `Wi-Fi`.

The benchmark always resets the conditioner to **off** when it finishes, errors, or you disconnect.

## Notes

- The v2 single-packet (inline) optimization only changes behavior for payloads under the ~15 KB
  header budget (10 B–10 KB); 100 KB and 1 MB are multi-packet regardless.
- `Edge`/`3G` × `1 MB` can be slow; each send has a 60 s timeout (`SEND_TIMEOUT_MS` in
  `benchmark.ts`) and slow boxes show `N/A`. Repeat count and timeout are constants at the top of
  `benchmark.ts`.
