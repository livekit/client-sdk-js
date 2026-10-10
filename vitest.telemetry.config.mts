import { defineConfig } from 'vitest/config';
import e2e from './vitest.e2e.config.mts';

// The telemetry story alone (same browser, same setup as `pnpm test:e2e`):
//   pnpm vitest run --config vitest.telemetry.config.mts
export default defineConfig({
  ...e2e,
  test: {
    ...e2e.test,
    include: ['src/telemetry/*.browser.test.ts'],
    globalSetup: ['./src/telemetry/telemetrySetup.ts'],
  },
});
