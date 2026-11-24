// Run after `pnpm build` against a real SFU: LIVEKIT_URL=ws://localhost:7880 node scripts/benchmark-prepared-publication.mjs
// CHROMIUM_EXECUTABLE_PATH optionally selects an installed Chrome. Devices are browser test devices.
import { AccessToken } from 'livekit-server-sdk';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const url = process.env.LIVEKIT_URL ?? 'ws://127.0.0.1:7880';
// For a server restricted to H264, verify VP8 reservations fall back instead of blocking JOIN.
const expectCodecFallback = process.env.PREPARED_EXPECT_CODEC_FALLBACK === '1';
const apiKey = process.env.LIVEKIT_API_KEY ?? 'devkey';
const apiSecret = process.env.LIVEKIT_API_SECRET ?? 'secret';
const bundle = await readFile(new URL('../dist/livekit-client.esm.mjs', import.meta.url));
const server = createServer((request, response) => {
  response.setHeader('Content-Type', request.url === '/sdk.js' ? 'text/javascript' : 'text/html');
  response.end(request.url === '/sdk.js' ? bundle : '<!doctype html><body></body>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
    headless: true,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  });
  const rows = [];
  for (const singlePeerConnection of [true, false]) {
    for (const prepared of [false, true]) {
      for (const kind of ['audio', 'video', 'both']) {
        const roomName = `prepared-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const tokens = await Promise.all(
          ['publisher', 'subscriber'].map(async (identity) => {
            const token = new AccessToken(apiKey, apiSecret, { identity });
            token.addGrant({ room: roomName, roomJoin: true });
            return token.toJwt();
          }),
        );
        const page = await browser.newPage();
        try {
          await page.goto(`http://127.0.0.1:${server.address().port}`);
          const row = await page.evaluate(
            async ({ url, tokens, singlePeerConnection, prepared, kind }) => {
              const { Room, RoomEvent, Track, createLocalTracks } = await import('/sdk.js');
              const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              const waitFor = async (predicate) => {
                const deadline = performance.now() + 10000;
                while (!(await predicate())) {
                  if (performance.now() > deadline) throw new Error('real media did not arrive');
                  await delay(20);
                }
              };
              const subscriber = new Room({ singlePeerConnection });
              const publisher = new Room({ singlePeerConnection });
              const remotes = new Map();
              subscriber.on(RoomEvent.TrackSubscribed, (track) => {
                remotes.set(track.kind, track);
                const element = track.attach();
                element.muted = true;
                document.body.appendChild(element);
                void element.play();
              });
              const trace = [];
              // Inject 50 ms each direction in the SDK signal dispatch only (100 ms RTT).
              // RTP/ICE are undelayed; this isolates the publication signaling critical path.
              const client = publisher.engine.client;
              const send = client.sendRequest.bind(client);
              const receive = client.handleSignalResponse.bind(client);
              const pending = new Set();
              client.sendRequest = async (message, ...args) => {
                trace.push(message.case);
                await delay(50);
                return send(message, ...args);
              };
              client.handleSignalResponse = (message) => {
                const task = delay(50).then(() => receive(message));
                pending.add(task);
                void task.finally(() => pending.delete(task));
              };
              let tracks = [];
              try {
                await subscriber.connect(url, tokens[1]);
                const sources =
                  kind === 'both'
                    ? [Track.Source.Microphone, Track.Source.Camera]
                    : [kind === 'video' ? Track.Source.Camera : Track.Source.Microphone];
                const publicationOptions = (source) =>
                  source === Track.Source.Camera
                    ? { videoCodec: 'vp8', simulcast: true }
                    : { red: false };
                const reservations = new Map(
                  prepared
                    ? sources.map((source) => [
                        source,
                        publisher[Symbol.for('livekit.internal.sessionPublication.v1')].prepare({
                          source,
                          ...(source === Track.Source.Camera
                            ? { format: { width: 640, height: 480, frameRate: 30 } }
                            : {}),
                          publishOptions: publicationOptions(source),
                        }),
                      ])
                    : [],
                );
                const started = performance.now();
                // Permission/device initialization completes late, while JOIN runs independently.
                const capture = (async () => {
                  await delay(650);
                  return await createLocalTracks({
                    audio: kind !== 'video' && { channelCount: 1 },
                    video: kind !== 'audio' && {
                      resolution: { width: 640, height: 480, frameRate: 30 },
                    },
                  });
                })();
                const connecting = prepared
                  ? publisher[Symbol.for('livekit.internal.sessionPublication.v1')].connect(
                      url,
                      tokens[0],
                      undefined,
                      [...reservations.values()],
                    )
                  : publisher.connect(url, tokens[0]);
                await connecting;
                const connectedMs = performance.now() - started;
                const initialVideoStartBitrate = publisher.engine.pcManager.publisher
                  .getLocalDescription()
                  ?.sdp.includes('x-google-start-bitrate=');
                tracks = await capture;
                const captureReadyMs = performance.now() - started;
                const traceStart = trace.length;
                await Promise.all(
                  tracks.map((track) => {
                    const source =
                      track.kind === Track.Kind.Video
                        ? Track.Source.Camera
                        : Track.Source.Microphone;
                    const reservation = reservations.get(source);
                    return reservation
                      ? reservation.attachTrack(track)
                      : publisher.localParticipant.publishTrack(track, publicationOptions(source));
                  }),
                );
                const publishedMs = performance.now() - started;
                await waitFor(async () => {
                  if (remotes.size !== sources.length) return false;
                  const received = await Promise.all(
                    [...remotes.values()].map(async (remote) => {
                      if (!remote.receiver) return false;
                      const stats = await remote.receiver.getStats();
                      return [...stats.values()].some(
                        (stat) =>
                          stat.type === 'inbound-rtp' &&
                          (remote.kind === Track.Kind.Video
                            ? stat.framesDecoded > 0
                            : stat.totalSamplesReceived > 0),
                      );
                    }),
                  );
                  return received.every(Boolean);
                });
                const mediaMs = performance.now() - started;
                const publicationSignals = trace
                  .slice(traceStart)
                  .filter((type) => type === 'addTrack' || type === 'offer');
                return {
                  singlePeerConnection,
                  prepared,
                  kind,
                  connectedMs: Math.round(connectedMs),
                  captureReadyMs: Math.round(captureReadyMs),
                  publishAfterCaptureMs: Math.round(publishedMs - captureReadyMs),
                  mediaAfterCaptureMs: Math.round(mediaMs - captureReadyMs),
                  publicationSignals,
                  videoStartBitrate:
                    kind === 'audio' ||
                    initialVideoStartBitrate ||
                    publisher.engine.pcManager.publisher
                      .getLocalDescription()
                      ?.sdp.includes('x-google-start-bitrate='),
                };
              } finally {
                await publisher.disconnect();
                await subscriber.disconnect();
                tracks.forEach((track) => track.stop());
                await Promise.all(pending);
                await publisher.dispose();
                await subscriber.dispose();
              }
            },
            { url, tokens, singlePeerConnection, prepared, kind },
          );
          console.log(JSON.stringify(row));
          assert.ok(
            row.connectedMs < row.captureReadyMs,
            'JOIN must finish without device acquisition',
          );
          if (prepared && singlePeerConnection && !(expectCodecFallback && kind !== 'audio'))
            assert.deepEqual(
              row.publicationSignals,
              [],
              'late attachment must not register or renegotiate',
            );
          else
            assert.ok(
              row.publicationSignals.includes('addTrack') &&
                row.publicationSignals.includes('offer'),
            );
          assert.ok(row.videoStartBitrate, 'video must preserve its start-bitrate hint');
          rows.push(row);
        } finally {
          await page.close();
        }
      }
    }
  }
  for (const row of rows.filter(
    (row) =>
      row.prepared && row.singlePeerConnection && !(expectCodecFallback && row.kind !== 'audio'),
  )) {
    const baseline = rows.find(
      (other) =>
        !other.prepared &&
        other.kind === row.kind &&
        other.singlePeerConnection === row.singlePeerConnection,
    );
    assert.ok(
      row.publishAfterCaptureMs < baseline.publishAfterCaptureMs,
      'reservation must reduce publication latency',
    );
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
