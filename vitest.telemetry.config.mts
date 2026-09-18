import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Telemetry PoC: a real browser posting OTLP at a real collector. No mock server, no globalSetup —
// the only prerequisite is `otelcol-contrib --config src/telemetry/otelcol-web.yaml`.
export default defineConfig({
  test: {
    include: ['src/telemetry/*.browser.test.ts'],
    testTimeout: 20_000,
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
      screenshotFailures: false,
    },
  },
});
