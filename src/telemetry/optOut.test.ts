import { expect, test, vi } from 'vitest';

/**
 * The documented opt-out order, on a module nobody has installed yet: `disableTelemetry()` before
 * the first Room, with a host cache from an earlier launch already configured.
 */
const b64 = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
const token = `${b64({ alg: 'HS256' })}.${b64({ exp: 4102444800, observability: { write: true } })}.sig`;

test('an opt-out before anything installs the pipeline purges the host cache and silences later Rooms', async () => {
  vi.resetModules();
  const { configureTelemetryHost, disableTelemetry, telemetry } = await import('.');
  const { MemoryStorage } = await import('./storage');
  const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const stale = new MemoryStorage(1 << 20, 10);
  stale.put('000000000000001_000001_3_l_proj-abc.livekit.cloud', new Uint8Array([1, 2, 3]));
  configureTelemetryHost({ storage: stale });

  disableTelemetry();

  expect(stale.pending()).toEqual([]);
  const room = telemetry.scope();
  room.setServer('wss://proj-abc.livekit.cloud', token);
  room.emit('custom.after');
  await telemetry.pipeline.flush(true);
  expect(telemetry.pipeline.enabled).toBe(false);
  expect(telemetry.pipeline.stats()).toMatchObject({ cached: 0, queued: 0 });
  expect(fetchMock).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
