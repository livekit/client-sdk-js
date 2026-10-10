import type { TestProject } from 'vitest/node';
import { createToken } from '../test/signalToken';

/**
 * vitest globalSetup for the telemetry e2e story (`telemetry.browser.test.ts`). It runs in Node,
 * where it can mint tokens and probe the two services the story needs — a `livekit-server --dev`
 * and an OTLP/HTTP collector — and provides the browser what it found. Without either, the story
 * skips with the reason printed.
 *
 *   LK_URL                 livekit-server (default ws://127.0.0.1:7880, keys devkey/secret)
 *   LK_TELEMETRY_ENDPOINT  OTLP/HTTP collector base URL (default http://127.0.0.1:4318)
 */
export default async function setup({ provide }: TestProject) {
  const url = process.env.LK_URL ?? 'ws://127.0.0.1:7880';
  const endpoint = (process.env.LK_TELEMETRY_ENDPOINT ?? 'http://127.0.0.1:4318').replace(
    /\/$/,
    '',
  );
  const room = `telemetry-${Date.now()}`;
  // On CI the services are declared, so a missing one is a failure, not a skip; give them a minute to come up.
  const deadline = Date.now() + (process.env.CI ? 60_000 : 0);
  const reachable = async (probe: string, init?: RequestInit): Promise<boolean> => {
    for (;;) {
      try {
        await fetch(probe, { ...init, signal: AbortSignal.timeout(2000) });
        return true;
      } catch {
        if (Date.now() >= deadline) return false;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  };
  let unavailable = '';
  if (!(await reachable(url.replace(/^ws/, 'http')))) {
    unavailable = `no livekit-server at ${url} (LK_URL)`;
  } else if (!(await reachable(`${endpoint}/v1/logs`, { method: 'POST', body: '' }))) {
    unavailable = `no OTLP collector at ${endpoint} (LK_TELEMETRY_ENDPOINT)`;
  }
  if (unavailable && process.env.CI)
    throw new Error(`telemetry story cannot run on CI: ${unavailable}`);
  if (unavailable) console.warn(`\n[e2e] telemetry story SKIPPED: ${unavailable}\n`);
  provide('telemetry', {
    url,
    endpoint,
    unavailable,
    publisherToken: await createToken({ room, identity: 'publisher', ttlSeconds: 3600 }),
    subscriberToken: await createToken({ room, identity: 'subscriber', ttlSeconds: 3600 }),
  });
}

declare module 'vitest' {
  interface ProvidedContext {
    telemetry: {
      url: string;
      endpoint: string;
      unavailable: string;
      publisherToken: string;
      subscriberToken: string;
    };
  }
}
