import { type Page, expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const livekitPackageJsonPath = resolve(
  here,
  '..',
  'node_modules',
  'livekit-client',
  'package.json',
);
const livekitPackageJson = JSON.parse(readFileSync(livekitPackageJsonPath, 'utf8')) as {
  version: string;
  name: string;
};
const EXPECTED_VERSION = livekitPackageJson.version;

type SmokeResult = {
  ok: boolean;
  errors: string[];
  version: string;
  exportCount: number;
};

const fixtures: Array<{ name: string; url: string }> = [
  { name: 'native ESM (script type=module)', url: '/fixtures/static/esm-direct.html' },
  { name: 'UMD global (CDN-style script tag)', url: '/fixtures/static/umd-global.html' },
  { name: 'bundler ESM (Vite)', url: '/fixtures/bundler-esm/dist/index.html' },
  { name: 'bundler CJS (webpack require)', url: '/fixtures/bundler-cjs/index.html' },
];

async function loadAndCollect(page: Page, url: string): Promise<SmokeResult> {
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
  });

  await page.addInitScript((version) => {
    (window as unknown as { __expectedVersion: string }).__expectedVersion = version;
  }, EXPECTED_VERSION);

  await page.goto(url, { waitUntil: 'load' });

  const result = await page.waitForFunction(
    () => (window as unknown as { __smoke?: SmokeResult }).__smoke,
    undefined,
    { timeout: 15_000 },
  );
  const smoke = (await result.jsonValue()) as SmokeResult;

  if (consoleErrors.length > 0) {
    smoke.errors = [...(smoke.errors ?? []), ...consoleErrors];
    smoke.ok = false;
  }
  return smoke;
}

test.describe('livekit-client published-package smoke', () => {
  test(`built artifact version is ${EXPECTED_VERSION}`, () => {
    expect(EXPECTED_VERSION).toMatch(/^\d+\.\d+\.\d+(?:-.+)?$/);
  });

  for (const fixture of fixtures) {
    test(fixture.name, async ({ page }) => {
      const result = await loadAndCollect(page, fixture.url);
      expect(
        result.ok,
        `smoke failed for ${fixture.name}:\n${(result.errors ?? []).join('\n')}`,
      ).toBe(true);
      expect(result.version).toBe(EXPECTED_VERSION);
      expect(result.exportCount).toBeGreaterThan(20);
    });
  }
});
