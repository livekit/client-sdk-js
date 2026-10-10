import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// End-to-end tests. Unlike the unit suite (happy-dom, mocked transport), these run in a REAL
// browser (Chromium via Playwright) so they exercise the actual browser WebSocket + fetch the SDK
// ships against:
//   - the signal-connection suite drives a live mock server (../livekit-server/cmd/test-server)
//     spawned by its globalSetup;
//   - the telemetry story runs a whole call on a `livekit-server --dev` and reports it to an OTLP
//     collector, both probed by its globalSetup (skipped when unreachable).
const collector = (process.env.LK_TELEMETRY_ENDPOINT ?? 'http://127.0.0.1:4318').replace(/\/$/, '');

export default defineConfig({
  server: {
    // The telemetry story reaches its collector through the test page's own origin, so the
    // collector needs no CORS configuration.
    proxy: { '/__otlp': { target: collector, rewrite: (path) => path.replace(/^\/__otlp/, '') } },
  },
  test: {
    include: ['src/**/*.e2e.test.ts', 'src/telemetry/*.browser.test.ts'],
    // globalSetup runs in Node (spawns the Go mock, mints tokens); tests run in the browser.
    globalSetup: ['./src/test/signalServerSetup.ts', './src/telemetry/telemetrySetup.ts'],
    testTimeout: 20_000,
    hookTimeout: 120_000,
    // One browser context; scenarios isolate via unique-per-mode room names.
    fileParallelism: false,
    browser: {
      enabled: true,
      provider: playwright({
        // The telemetry story's mock media is an oscillator: let the AudioContext run without a gesture.
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
      }),
      headless: true,
      instances: [{ browser: 'chromium' }],
      screenshotFailures: false,
    },
  },
});
