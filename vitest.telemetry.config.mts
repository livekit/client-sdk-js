import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// The telemetry session test: a real browser, a real livekit-server --dev, a real collector.
// Prerequisites are checked by the globalSetup, which also mints the tokens (the browser cannot).
export default defineConfig({
  test: {
    include: ['src/telemetry/*.browser.test.ts'],
    globalSetup: ['./src/telemetry/telemetrySetup.ts'],
    testTimeout: 90_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      }),
      headless: true,
      instances: [{ browser: 'chromium' }],
      screenshotFailures: false,
    },
  },
});
