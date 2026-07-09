import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Socket, createServer } from 'node:net';
import { join } from 'node:path';
import { createToken } from './signalToken';

/**
 * vitest globalSetup for the browser signal e2e suite. It provides the tests a
 * ws:// base URL for the LiveKit mock test-server, via one of two paths:
 *
 *   - LK_TEST_SERVER_URL — connect to an already-running server (CI runs the
 *     published test-server Docker image as a service; see .github/workflows/e2e.yaml).
 *   - LK_SERVER_DIR — a local livekit-server checkout: build cmd/test-server
 *     and spawn it on an ephemeral port (dev convenience).
 *
 * If neither is set (or the toolchain is unavailable) the suite is skipped.
 */

const HOST = '127.0.0.1';

let child: ChildProcess | undefined;

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, HOST, () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

// Poll the validate endpoint (from Node — no CORS here) until it answers 200.
async function waitReady(serverUrl: string): Promise<boolean> {
  const token = await createToken({ signal: 'happy' });
  const httpBase = serverUrl.replace(/^ws/, 'http');
  const validateUrl = `${httpBase}/rtc/validate?access_token=${encodeURIComponent(token)}`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(validateUrl)).status === 200) {
        return true;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

export default async function setup(project: { provide: (name: string, value: unknown) => void }) {
  const provide = (serverUrl: string) => {
    project.provide('serverUrl', serverUrl);
    project.provide('e2eUnavailable', '');
  };
  const skip = (reason: string) => {
    // eslint-disable-next-line no-console
    console.warn(`\n[e2e] signal-connection e2e suite SKIPPED: ${reason}\n`);
    project.provide('serverUrl', '');
    project.provide('e2eUnavailable', reason);
    return () => {};
  };

  // CI / Docker: connect to an externally-managed server.
  const externalUrl = process.env.LK_TEST_SERVER_URL;
  if (externalUrl) {
    if (!(await waitReady(externalUrl))) {
      return skip(`test-server at ${externalUrl} did not become ready`);
    }
    provide(externalUrl);
    return () => {}; // container lifecycle is owned by CI
  }

  // Local dev: build + spawn cmd/test-server from a livekit-server checkout.
  const serverDir = process.env.LK_SERVER_DIR;
  if (!serverDir || !existsSync(serverDir)) {
    return skip(
      'set LK_TEST_SERVER_URL (a running server) or LK_SERVER_DIR (a livekit-server checkout)',
    );
  }

  const binary = join(serverDir, 'bin', 'test-server');
  if (!process.env.LK_E2E_SKIP_BUILD) {
    try {
      execFileSync('go', ['build', '-o', 'bin/test-server', './cmd/test-server'], {
        cwd: serverDir,
        stdio: 'pipe',
      });
    } catch (e) {
      return skip(`failed to build test-server: ${(e as Error).message}`);
    }
  }
  if (!existsSync(binary)) {
    return skip(`test-server binary missing at ${binary}`);
  }

  // Fresh ephemeral port each run so a leftover server from a crashed run can
  // never be mistaken for ours (vitest browser-mode teardown is unreliable, so
  // a spawned server may outlive the run; the ephemeral port makes that
  // harmless, at the cost of leaving at most one idle process per run).
  const port = Number(process.env.LK_TEST_SERVER_PORT) || (await getFreePort());
  const serverUrl = `ws://${HOST}:${port}`;

  child = spawn(binary, ['--ports', String(port), '--bind', HOST], {
    cwd: serverDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  child.stdout?.on('data', (d: unknown) => {
    serverLog += String(d);
  });
  child.stderr?.on('data', (d: unknown) => {
    serverLog += String(d);
  });
  // With stdio: 'pipe' these are net.Sockets (typed as Readable, which lacks unref);
  // unref the pipe handles so their 'data' listeners don't keep the parent alive.
  if (child.stdout instanceof Socket) child.stdout.unref();
  if (child.stderr instanceof Socket) child.stderr.unref();
  child.unref();

  const kill = () => {
    try {
      child?.kill('SIGKILL');
    } catch {
      // already gone
    }
  };
  process.once('exit', kill);
  process.once('SIGINT', () => {
    kill();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    kill();
    process.exit(143);
  });

  if (!(await waitReady(serverUrl))) {
    kill();
    return skip(
      `test-server did not become ready on ${serverUrl}\n--- server output ---\n${serverLog}`,
    );
  }

  provide(serverUrl);
  return kill;
}
