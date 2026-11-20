# Prepared publications (experimental)

Declare publication intent before requesting device access. The SDK snapshots publication defaults and options, chooses a codec and encoding envelope, and can register trackless senders in the initial JOIN offer. Opening a device never blocks JOIN.

```ts
const microphone = room.preparePublication({
  source: Track.Source.Microphone,
  format: { channelCount: 1 },
  publishOptions: { audioPreset: { maxBitrate: 32000 }, preConnectBuffer: true },
});
const camera = room.preparePublication({
  source: Track.Source.Camera,
  format: { width: 1280, height: 720, frameRate: 30 },
  publishOptions: {
    videoCodec: 'h264',
    simulcast: false,
    videoEncoding: { maxBitrate: 1_500_000 },
  },
});

const connecting = room.connect(url, token, {
  initialPublications: [microphone, camera],
});
const capturing = room.localParticipant.createTracks({
  audio: { channelCount: 1 },
  video: { resolution: { width: 1280, height: 720, frameRate: 30 } },
});

const publishing = capturing.then(async (tracks) => {
  try {
    // attachTrack waits for connection independently and starts the requested
    // microphone preconnect buffer as soon as the track is supplied.
    return await Promise.all(
      tracks.map((track) =>
        (track.kind === Track.Kind.Audio ? microphone : camera).attachTrack(track),
      ),
    );
  } catch (error) {
    // This also handles capture resolving after connection failed or was cancelled.
    tracks.forEach((track) => track.stop());
    throw error;
  }
});
try {
  await Promise.all([connecting, publishing]);
} catch (error) {
  await room.disconnect();
  throw error;
} finally {
  await Promise.all([microphone.cancel(), camera.cancel()]);
}
```

The handle belongs to its room and must appear once in that room's next `connect()` call. Preparation is synchronous and only allowed while disconnected. A handle accepts one track; it never opens devices or stops caller-owned tracks. Cancel an unused handle when capture fails or startup is abandoned. Disconnect and disposal cancel outstanding handles. Cancelling after successful attachment does nothing; ordinary publication and unpublication APIs own the track from then on.

For compatible capture, attachment reuses the negotiated sender with `replaceTrack` and returns a normal `LocalTrackPublication`. No new AddTrack request or offer is required. The JOIN carries codec/layer/encoding intent; mute status and capture-dependent audio processing features are reconciled when media attaches. No placeholder audio/video frames are generated.

The optimized path currently requires the SDK's V1 offer-with-JOIN path (single PC on supported non-Firefox browsers). Legacy dual PC, Firefox, React Native, unavailable codec capabilities, SVC/additional-codec configurations, E2EE, and frame-metadata configurations use normal publication after connection. A different actual capture format or server-selected codec also reconciles the reservation and falls back. This preserves join-first behavior, but those fallback cases do not save the publication exchanges. Screen sharing remains on its existing user-gesture capture path.

The exchange reduction and elapsed-time improvement are separate: bundling avoids the standalone registration/negotiation exchanges, while current ordinary fast publication already overlaps those exchanges. Do not assume every session improves by exactly two RTTs. Capture, ICE/DTLS, server support, media pacing, and the first decoded frame still affect perceived latency.

Run `pnpm build`, start `livekit-server --dev`, then run:

```sh
LIVEKIT_URL=ws://127.0.0.1:7880 node scripts/benchmark-prepared-publication.mjs
```

The real-browser harness injects 50 ms each direction at SDK signal dispatch, delays capture until after JOIN, verifies subscriber audio samples/video decoding, and asserts no AddTrack/offer on compatible attachment. It covers prepared and ordinary publication with both PC modes, including concurrent audio/video publication. Set `CHROMIUM_EXECUTABLE_PATH` to use an installed Chrome. Keys default to the local dev server's `devkey`/`secret`; other servers require `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.

For codec substitution coverage, point the same harness at a server whose `room.enabled_codecs` contains only `audio/opus` and `video/h264`, and set `PREPARED_EXPECT_CODEC_FALLBACK=1`. Its VP8 reservations must join successfully, reconcile, and publish H264 to the subscriber through the ordinary path.
