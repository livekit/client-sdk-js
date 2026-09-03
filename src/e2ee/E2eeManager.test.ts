import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogLevel, _getWorkerLogLevelListenerCount, setLogLevel, workerLogger } from '../logger';
import Room from '../room/Room';
import { E2EEManager } from './E2eeManager';
import { BaseKeyProvider } from './KeyProvider';

/**
 * Install just enough of the DOM to let isE2EESupported() return true so
 * setup() doesn't throw.
 */
function installE2EEShims() {
  const w = window as unknown as Record<string, any>;
  if (typeof w.RTCRtpSender === 'undefined') {
    w.RTCRtpSender = class {};
  }
  w.RTCRtpSender.prototype.createEncodedStreams = () => {};
}

class FakeWorker {
  postMessage = vi.fn();

  onmessage: unknown = null;

  onerror: unknown = null;

  levelMessages(): LogLevel[] {
    return this.postMessage.mock.calls
      .map(([m]) => m)
      .filter((m: any) => m?.kind === 'setLogLevel')
      .map((m: any) => m.data.level);
  }
}

function makeManager() {
  installE2EEShims();
  const room = new Room();
  const worker = new FakeWorker();
  const manager = new E2EEManager(
    { keyProvider: new BaseKeyProvider({ sharedKey: true }), worker: worker as unknown as Worker },
    false,
  );
  return { room, worker, manager };
}

describe('E2EEManager log-level listener lifecycle', () => {
  const startingLevel = workerLogger.getLevel();
  const startingCount = _getWorkerLogLevelListenerCount();

  afterEach(() => {
    setLogLevel(startingLevel);
  });

  it('forwards level changes to the worker while subscribed', () => {
    const { room, worker, manager } = makeManager();
    manager.setup(room);
    worker.postMessage.mockClear();

    setLogLevel(LogLevel.debug);

    expect(worker.levelMessages()).toEqual([LogLevel.debug]);
    manager.dispose();
  });

  it('dispose() removes the listener and stops forwarding', () => {
    const { room, worker, manager } = makeManager();
    manager.setup(room);
    manager.dispose();
    worker.postMessage.mockClear();

    setLogLevel(LogLevel.warn);

    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(_getWorkerLogLevelListenerCount()).toBe(startingCount);
  });

  it('re-setup with a new room does not stack listeners', () => {
    const { worker, manager } = makeManager();
    const roomA = new Room();
    const roomB = new Room();
    manager.setup(roomA);
    const countAfterFirst = _getWorkerLogLevelListenerCount();
    manager.setup(roomB);
    expect(_getWorkerLogLevelListenerCount()).toBe(countAfterFirst);

    worker.postMessage.mockClear();
    setLogLevel(LogLevel.debug);
    expect(worker.levelMessages()).toEqual([LogLevel.debug]); // exactly one delivery

    manager.dispose();
  });

  it('dispose() is idempotent', () => {
    const { room, manager } = makeManager();
    manager.setup(room);
    manager.dispose();
    manager.dispose();
    expect(_getWorkerLogLevelListenerCount()).toBe(startingCount);
  });

  it('dispose() rejects pending encrypt/decrypt futures and clears both maps', async () => {
    const { room, manager } = makeManager();
    manager.setup(room);

    const encrypting = manager.encryptData(new Uint8Array([1, 2, 3]) as any);
    const decrypting = manager.handleEncryptedData(
      new Uint8Array([4, 5, 6]) as any,
      new Uint8Array([7, 8, 9]) as any,
      'peer',
      0,
    );

    const priv = manager as unknown as {
      encryptDataRequests: Map<string, unknown>;
      decryptDataRequests: Map<string, unknown>;
    };
    expect(priv.encryptDataRequests.size).toBe(1);
    expect(priv.decryptDataRequests.size).toBe(1);

    manager.dispose();

    await expect(encrypting).rejects.toThrow(/disposed/);
    await expect(decrypting).rejects.toThrow(/disposed/);
    expect(priv.encryptDataRequests.size).toBe(0);
    expect(priv.decryptDataRequests.size).toBe(0);

    // Second dispose while maps are empty must not throw.
    expect(() => manager.dispose()).not.toThrow();
  });
});

/**
 * GC-path test. Flaky by construction — FinalizationRegistry callbacks are
 * best-effort. Skipped unless vitest is run with `--expose-gc`:
 *
 *   NODE_OPTIONS="--expose-gc" pnpm exec vitest run src/e2ee/E2eeManager.test.ts
 *
 * Deliberately bypasses `manager.setup(room)`. `new Room()` on its own is not
 * collectable in this test environment (device-change listeners, timers), and
 * that leak is not what this test is about — it would only mask what we
 * actually want to verify: that the log-level listener wiring holds nothing
 * strongly.
 */
describe('E2EEManager GC cleanup', () => {
  const startingLevel = workerLogger.getLevel();

  beforeEach(() => {
    installE2EEShims();
  });

  afterEach(() => {
    setLogLevel(startingLevel);
  });

  it.skipIf(!(globalThis as any).gc)(
    'releases the log-level listener when the manager is garbage collected',
    async () => {
      const before = _getWorkerLogLevelListenerCount();

      // Construct + subscribe in an IIFE so nothing lives on the test's stack.
      // Direct call to the private subscription — no Room, no leaky graph.
      const managerRef = ((): WeakRef<E2EEManager> => {
        const worker = new FakeWorker();
        const manager = new E2EEManager(
          {
            keyProvider: new BaseKeyProvider({ sharedKey: true }),
            worker: worker as unknown as Worker,
          },
          false,
        );
        (manager as unknown as { subscribeToLogLevelChanges(): void }).subscribeToLogLevelChanges();
        expect(_getWorkerLogLevelListenerCount()).toBe(before + 1);
        return new WeakRef(manager);
      })();

      // Full major GC + macrotask yield in a loop, with allocation pressure to
      // force the major sweep FinalizationRegistry needs.
      //
      // Crucial: do NOT call `managerRef.deref()` inside the loop. Per spec,
      // `WeakRef.prototype.deref` keeps the referent alive until the end of the
      // current job — calling it in the check would pin the manager forever.
      // Read the listener count (which does not touch the referent) instead.
      const gc = (globalThis as any).gc as (opts?: { type?: 'major'; execution?: 'sync' }) => void;
      for (let i = 0; i < 50; i++) {
        // eslint-disable-next-line no-void
        void new Array(100_000).fill({ i });
        gc({ type: 'major', execution: 'sync' });
        await new Promise((r) => setImmediate(r));
        if (_getWorkerLogLevelListenerCount() === before) break;
      }

      // Diagnostic: separate "manager wasn't collected" from "FR didn't fire".
      expect(managerRef.deref(), 'manager was not collected — strong ref leaked').toBeUndefined();
      expect(_getWorkerLogLevelListenerCount()).toBe(before);
    },
  );
});
