import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.SMOKE_PORT ?? 4317);
const HOST = '127.0.0.1';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `node ./node_modules/http-server/bin/http-server . -p ${PORT} -a ${HOST} -s -c-1 --cors`,
    url: `http://${HOST}:${PORT}/fixtures/static/esm-direct.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
