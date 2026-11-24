// Traces when a Session-style client subscribes to an agent's audio, with and without
// prepared publications. Run after `pnpm build` against `livekit-server --dev`:
//   node scripts/trace-agent-subscription.mjs
// MIC_DELAY_MS simulates a pending permission prompt (default 2000). SIGNAL_DELAY_MS is the
// one-way delay injected at the user's SDK signal dispatch (default 75, 150 ms RTT).
// MODES sets the run order, e.g. MODES=reserved,current. SUMMARY=1 prints one metrics
// row per run and the medians per mode instead of the full trace.
// The "agent" is a second browser room with kind=agent that publishes an audio track once the
// user joins and reports when the user subscribes to it, the gate the Python agent waits on
// before it plays the greeting (`_ParticipantAudioOutput` waits for subscription).
// REAL_AGENT=<agent name> skips the stand-in and dispatches that agent through the user's token
// (LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET select the project). The greeting is
// then the first audio energy the user receives from the agent.
import {
  AccessToken,
  AgentDispatchClient,
  RoomAgentDispatch,
  RoomConfiguration,
  RoomServiceClient,
} from 'livekit-server-sdk';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const url = process.env.LIVEKIT_URL ?? 'ws://127.0.0.1:7880';
const realAgent = process.env.REAL_AGENT;
// DISPATCH=before: dispatch the agent explicitly and wait until it is in the room before the user
// joins. Otherwise the user's token dispatches it, so it joins after the user.
const dispatchBefore = process.env.DISPATCH === 'before';
const httpUrl = url.replace(/^ws/, 'http');
const credentials = [process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET];
const micDelay = Number(process.env.MIC_DELAY_MS ?? 2000);
const signalDelay = Number(process.env.SIGNAL_DELAY_MS ?? 75);
const micStart = Number(process.env.MIC_START_MS ?? 0);
// MIC_API=publishTrack: capture first, then Promise.all([connect(), publishTrack()]).
const micApi = process.env.MIC_API ?? 'setMicrophoneEnabled';
const bundle = await readFile(new URL('../dist/livekit-client.esm.mjs', import.meta.url));
const server = createServer((request, response) => {
  response.setHeader('Content-Type', request.url === '/sdk.js' ? 'text/javascript' : 'text/html');
  response.end(request.url === '/sdk.js' ? bundle : '<!doctype html><body></body>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

const token = async (roomName, identity, kind) => {
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY ?? 'devkey',
    process.env.LIVEKIT_API_SECRET ?? 'secret',
    { identity },
  );
  if (kind) at.kind = kind;
  at.addGrant({ room: roomName, roomJoin: true, canUpdateOwnMetadata: true });
  if (realAgent && !dispatchBefore && identity === 'user')
    at.roomConfig = new RoomConfiguration({
      agents: [new RoomAgentDispatch({ agentName: realAgent })],
    });
  return at.toJwt();
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
});
const summary = {};
try {
  for (const mode of (process.env.MODES ?? 'current,reserved').split(',')) {
    const roomName = `trace-${mode}-${Date.now()}`;
    const tokens = {
      user: await token(roomName, 'user'),
      agent: await token(roomName, 'agent', 'agent'),
    };
    if (realAgent && dispatchBefore) {
      await new AgentDispatchClient(httpUrl, ...credentials).createDispatch(roomName, realAgent);
      const rooms = new RoomServiceClient(httpUrl, ...credentials);
      const deadline = Date.now() + 10000;
      while (!(await rooms.listParticipants(roomName)).some((p) => p.kind === 4 /* AGENT */)) {
        if (Date.now() > deadline) throw new Error('agent did not join within 10 s');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const trace = await page.evaluate(
      async ({
        url,
        tokens,
        mode,
        micDelay,
        signalDelay,
        agentJoinAfter,
        realAgent,
        micStart,
        micApi,
      }) => {
        const { Room, RoomEvent, Track, LocalAudioTrack, createLocalTracks } =
          await import('/sdk.js');
        const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const t0 = performance.now();
        const trace = [{ t: 0, event: 'start', wall: new Date().toISOString() }];
        const log = (event, data) =>
          trace.push({ t: Math.round(performance.now() - t0), event, ...data });

        // Permission prompt: getUserMedia resolves only after micDelay.
        const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          await delay(micDelay);
          log('user: capture ready');
          return gum(constraints);
        };

        const user = new Room();
        const client = user.engine.client;
        const send = client.sendRequest.bind(client);
        const receive = client.handleSignalResponse.bind(client);
        // The JOIN pays the same RTT as every other request, whatever it carries.
        const join = client.join.bind(client);
        client.join = async (...args) => {
          await delay(signalDelay);
          const response = await join(...args);
          await delay(signalDelay);
          return response;
        };
        client.sendRequest = async (message, ...args) => {
          log(
            `user → ${message.case}`,
            message.case === 'offer'
              ? { id: message.value.id }
              : message.case === 'mute'
                ? { muted: message.value.muted }
                : message.case === 'addTrack'
                  ? { muted: message.value.muted }
                  : {},
          );
          await delay(signalDelay);
          return send(message, ...args);
        };
        client.handleSignalResponse = (response) => {
          void delay(signalDelay).then(() => {
            const { case: kind, value } = response.message;
            const data =
              kind === 'answer'
                ? { id: value.id, midToTrackId: value.midToTrackId }
                : kind === 'mediaSectionsRequirement'
                  ? { audios: value.numAudios, videos: value.numVideos }
                  : kind === 'trackPublished'
                    ? { sid: value.track?.sid }
                    : {};
            if (kind !== 'pong' && kind !== 'pongResp') log(`user ← ${kind}`, data);
            receive(response);
          });
        };
        user.on(RoomEvent.SignalConnected, () => log('user: signal connected'));
        user.on(RoomEvent.Connected, () => log('user: connected'));
        user.on(RoomEvent.TrackPublished, (pub, p) =>
          log('user: remote track published', { from: p.identity, sid: pub.trackSid }),
        );
        let greetingHeard;
        const greeting = new Promise((resolve) => (greetingHeard = resolve));
        user.on(RoomEvent.TrackSubscribed, (track, pub, p) => {
          log('user: TrackSubscribed', { from: p.identity, sid: pub.trackSid });
          if (track.kind !== Track.Kind.Audio) return;
          const element = track.attach();
          element.muted = true;
          document.body.appendChild(element);
          void element.play();
          const poll = setInterval(async () => {
            const stats = await track.receiver?.getStats();
            const inbound = [...(stats?.values() ?? [])].find((s) => s.type === 'inbound-rtp');
            if (!inbound || !(inbound.totalAudioEnergy > 0)) return;
            clearInterval(poll);
            log('user: greeting audio heard', { from: p.identity });
            greetingHeard();
          }, 10);
        });
        user.on(RoomEvent.ParticipantConnected, (p) =>
          log('user: participant connected', { identity: p.identity }),
        );
        user.on(RoomEvent.ParticipantAttributesChanged, (changed, p) => {
          if (!changed['lk.agent.state']) return;
          log(`user: agent state ${changed['lk.agent.state']}`, { identity: p.identity });
          if (changed['lk.agent.state'] === 'speaking') greetingHeard();
        });
        user.on(RoomEvent.LocalTrackPublished, (pub) =>
          log('user: mic published', { sid: pub.trackSid }),
        );

        // Agent: joins, waits for the user, publishes audio, waits until the user subscribes.
        const agent = new Room();
        const agentDone = realAgent
          ? Promise.race([greeting, delay(20000).then(() => log('user: no greeting in 20 s'))])
          : (async () => {
              // AGENT_JOIN=after: join once the user is in the room, as a dispatched agent does.
              if (agentJoinAfter)
                await new Promise((resolve) => user.once(RoomEvent.SignalConnected, resolve));
              await agent.connect(url, tokens.agent);
              log('agent: connected');
              if (!agent.remoteParticipants.has('user'))
                await new Promise((resolve) => agent.once(RoomEvent.ParticipantConnected, resolve));
              log('agent: user present');
              await agent.localParticipant.setAttributes({ 'lk.agent.state': 'listening' });
              const context = new AudioContext();
              const oscillator = context.createOscillator();
              const destination = context.createMediaStreamDestination();
              oscillator.connect(destination);
              oscillator.start();
              const subscribed = new Promise((resolve) =>
                agent.once(RoomEvent.LocalTrackSubscribed, resolve),
              );
              const publication = await agent.localParticipant.publishTrack(
                new LocalAudioTrack(destination.stream.getAudioTracks()[0]),
              );
              log('agent: audio published', { sid: publication.trackSid });
              await subscribed;
              log('agent: user subscribed → greeting can play');
            })();

        // Session-style startup in every mode. current: no reservation, publish after capture.
        // Any other mode: the microphone is announced muted as soon as the publisher is negotiated.
        if (mode === 'current') user.localParticipant.reservePublication = undefined;
        // MIC_START_MS: start the microphone that long after connect() instead of with it.
        let micDone;
        if (micApi === 'publishTrack') {
          // A microphone captured beforehand, then Promise.all([connect(), publishTrack()]).
          const [track] = await createLocalTracks({ audio: true });
          log('user: publishTrack', { state: user.state });
          micDone = Promise.all([
            user.connect(url, tokens.user),
            user.localParticipant.publishTrack(track, { preConnectBuffer: true }),
          ]);
        } else {
          const connecting = user.connect(url, tokens.user);
          if (micStart > 0) await delay(micStart);
          log('user: setMicrophoneEnabled', { state: user.state });
          micDone = Promise.all([
            connecting,
            user.localParticipant.setMicrophoneEnabled(true, undefined, { preConnectBuffer: true }),
          ]);
        }
        await Promise.all([micDone, agentDone]);
        await delay(300);
        await agent.disconnect();
        await user.disconnect();
        return trace;
      },
      {
        url,
        tokens,
        mode,
        micDelay,
        signalDelay,
        agentJoinAfter: process.env.AGENT_JOIN === 'after',
        realAgent,
        micStart,
        micApi,
      },
    );
    trace.sort((a, b) => a.t - b.t);
    await page.close();
    if (process.env.SUMMARY) {
      const at = (event) => trace.find((e) => e.event === event)?.t;
      const capture = at('user: capture ready');
      const row = {
        mode,
        start: trace[0].wall,
        room: roomName,
        connected: at('user: connected'),
        greeting: at(
          realAgent ? 'user: agent state speaking' : 'agent: user subscribed → greeting can play',
        ),
        agentJoined: at('user: participant connected'),
        micReady: at('user: mic published'),
        micAfterCapture: at('user: mic published') - capture,
        signalsAfterCapture: trace
          .filter((e) => e.t >= capture && /^user → (addTrack|offer)$/.test(e.event))
          .map((e) => e.event.slice(7)),
      };
      console.log(JSON.stringify(row));
      (summary[mode] ??= []).push(row);
      continue;
    }
    console.log(`\n=== ${mode} (mic delay ${micDelay} ms, RTT ${2 * signalDelay} ms) ===`);
    for (const { t, event, ...data } of trace)
      console.log(
        `${String(t).padStart(5)} ms  ${event}${Object.keys(data).length ? ` ${JSON.stringify(data)}` : ''}`,
      );
  }
  const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  for (const [mode, rows] of Object.entries(summary))
    console.log(
      `median ${mode} (mic delay ${micDelay} ms, n=${rows.length}):`,
      ['connected', 'greeting', 'micReady', 'micAfterCapture']
        .map((key) => `${key}=${median(rows.map((row) => row[key]))}`)
        .join(' '),
    );
} finally {
  await browser.close();
  server.close();
}
