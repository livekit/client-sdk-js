import { expect, test } from 'vitest';
import { ping } from './index';

// A real Chromium, a real collector: `otelcol-contrib --config src/telemetry/otelcol-web.yaml`
// (port 4320, CORS on, fanning out to the same Grafana LGTM stack the mobile harness uses).
// Run: pnpm vitest run --config vitest.telemetry.config.mts
const endpoint = 'http://127.0.0.1:4320/v1/logs';
const resource = {
  'service.name': 'livekit-client-js',
  'service.version': '2.22.3-poc',
  'os.name': 'browser',
};

test('a protobuf ping reaches the collector', async () => {
  const delivery = await ping({ endpoint, resource }, 1);
  expect(delivery.status).toBe(200);
  expect(delivery.bytes).toBeGreaterThan(0);
  console.log('protobuf ping:', JSON.stringify(delivery));
});

test('a json ping reaches the collector', async () => {
  const delivery = await ping({ endpoint, resource, encoding: 'json' }, 2);
  expect(delivery.status).toBe(200);
  console.log('json ping:', JSON.stringify(delivery));
});
