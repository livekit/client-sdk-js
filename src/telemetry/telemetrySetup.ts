import type { TestProject } from 'vitest/node';
import { createToken } from '../test/signalToken';

/**
 * vitest globalSetup for the telemetry session test. It runs in Node (the browser cannot sign a
 * token) and hands the browser a room and two identities on a live `livekit-server --dev`, plus
 * the collector the session reports to — the same pair the mobile harness uses:
 *
 *   livekit-server --dev
 *   otelcol-contrib --config src/telemetry/otelcol-web.yaml
 */
export default async function setup({ provide }: TestProject) {
  const url = process.env.LK_URL ?? 'ws://127.0.0.1:7880';
  const endpoint = process.env.LK_TELEMETRY_ENDPOINT ?? 'http://127.0.0.1:4320/v1/logs';
  const room = `telemetry-${Date.now()}`;
  provide('telemetry', {
    url,
    endpoint,
    room,
    publisherToken: await createToken({ room, identity: 'publisher' }),
    subscriberToken: await createToken({ room, identity: 'subscriber' }),
  });
}

declare module 'vitest' {
  interface ProvidedContext {
    telemetry: {
      url: string;
      endpoint: string;
      room: string;
      publisherToken: string;
      subscriberToken: string;
    };
  }
}
