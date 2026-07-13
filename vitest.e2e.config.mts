import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// End-to-end signal-connection tests. Unlike the unit suite (happy-dom, mocked
// transport), these run in a REAL browser (Chromium via Playwright) so they
// exercise the actual browser WebSocket + fetch the SDK ships against, driving
// a live mock server (../livekit-server/cmd/test-server) spawned by globalSetup.
export default defineConfig({
  test: {
    include: ['src/**/*.e2e.test.ts'],
    // globalSetup runs in Node (spawns the Go mock); tests run in the browser.
    globalSetup: ['./src/test/signalServerSetup.ts'],
    testTimeout: 20_000,
    hookTimeout: 120_000,
    // One browser context; scenarios isolate via unique-per-mode room names.
    fileParallelism: false,
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
});
