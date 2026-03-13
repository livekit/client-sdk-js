/**
 * RPC Benchmark - stress tests LiveKit RPC with configurable payload sizes.
 *
 * Ported from client-sdk-cpp/src/tests/stress/test_rpc_stress.cpp
 *
 * Three RPC paths are exercised depending on payload size:
 *   1. Legacy (< COMPRESS_MIN_BYTES = 1KB):  uncompressed inline payload
 *   2. Compressed (1KB .. < DATA_STREAM_MIN_BYTES = 15KB): gzip-compressed inline
 *   3. Data stream (>= 15KB): gzip-compressed via a one-time data stream
 */
import {
  Room,
  type RoomConnectOptions,
  RoomEvent,
  RpcError,
  type RpcInvocationData,
} from '../../src/index';
import { generatePayload } from './test-data';

// ---------------------------------------------------------------------------
// Stats tracker (mirrors StressTestStats from the C++ test)
// ---------------------------------------------------------------------------

interface CallRecord {
  success: boolean;
  latencyMs: number;
  payloadBytes: number;
}

interface ErrorBucket {
  [key: string]: number;
}

class BenchmarkStats {
  private calls: CallRecord[] = [];
  private errors: ErrorBucket = {};

  recordCall(success: boolean, latencyMs: number, payloadBytes: number) {
    this.calls.push({ success, latencyMs, payloadBytes });
  }

  recordError(kind: string) {
    this.errors[kind] = (this.errors[kind] ?? 0) + 1;
  }

  get totalCalls() {
    return this.calls.length;
  }

  get successfulCalls() {
    return this.calls.filter((c) => c.success).length;
  }

  get failedCalls() {
    return this.calls.filter((c) => !c.success).length;
  }

  get successRate() {
    return this.totalCalls > 0 ? (100 * this.successfulCalls) / this.totalCalls : 0;
  }

  get checksumMismatches() {
    return this.errors['checksum_mismatch'] ?? 0;
  }

  /** Sorted latencies for successful calls */
  private sortedLatencies(): number[] {
    return this.calls
      .filter((c) => c.success)
      .map((c) => c.latencyMs)
      .sort((a, b) => a - b);
  }

  get avgLatency(): number {
    const s = this.sortedLatencies();
    if (s.length === 0) {
      return 0;
    }
    return s.reduce((a, b) => a + b, 0) / s.length;
  }

  percentile(p: number): number {
    const s = this.sortedLatencies();
    if (s.length === 0) {
      return 0;
    }
    const idx = Math.min(Math.floor((p / 100) * s.length), s.length - 1);
    return s[idx];
  }

  get errorSummary(): ErrorBucket {
    return { ...this.errors };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeChecksum(str: string): number {
  let sum = 0;
  for (let i = 0; i < str.length; i += 1) {
    sum += str.charCodeAt(i);
  }
  return sum;
}

const fetchToken = async (
  identity: string,
  roomName: string,
): Promise<{ token: string; url: string }> => {
  const response = await fetch('/api/get-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity, roomName }),
  });
  if (!response.ok) throw new Error('Failed to fetch token');
  const data = await response.json();
  return { token: data.token, url: data.url };
};

const connectParticipant = async (identity: string, roomName: string): Promise<Room> => {
  const room = new Room();
  const { token, url } = await fetchToken(identity, roomName);

  room.on(RoomEvent.Disconnected, () => {
    log(`[${identity}] Disconnected from room`);
  });

  await room.connect(url, token, { autoSubscribe: true } as RoomConnectOptions);

  await new Promise<void>((resolve) => {
    if (room.state === 'connected') {
      resolve();
    } else {
      room.once(RoomEvent.Connected, () => resolve());
    }
  });

  log(`${identity} connected.`);
  return room;
};

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

let startTime = Date.now();

function log(message: string) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(3);
  const formatted = `[+${elapsed}s] ${message}`;
  console.log(formatted);
  const logArea = document.getElementById('log') as HTMLTextAreaElement | null;
  if (logArea) {
    logArea.value += formatted + '\n';
    logArea.scrollTop = logArea.scrollHeight;
  }
}

function updateStat(id: string, value: string | number) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}

function refreshStatsUI(stats: BenchmarkStats, elapsedSec: number) {
  updateStat('stat-total', stats.totalCalls);
  updateStat('stat-success', stats.successfulCalls);
  updateStat('stat-failed', stats.failedCalls);
  updateStat('stat-rate', stats.totalCalls > 0 ? stats.successRate.toFixed(1) + '%' : '-');
  updateStat(
    'stat-avg-latency',
    stats.successfulCalls > 0 ? stats.avgLatency.toFixed(1) + 'ms' : '-',
  );
  updateStat('stat-p50', stats.successfulCalls > 0 ? stats.percentile(50).toFixed(1) + 'ms' : '-');
  updateStat('stat-p95', stats.successfulCalls > 0 ? stats.percentile(95).toFixed(1) + 'ms' : '-');
  updateStat('stat-p99', stats.successfulCalls > 0 ? stats.percentile(99).toFixed(1) + 'ms' : '-');
  updateStat(
    'stat-throughput',
    elapsedSec > 0 ? (stats.successfulCalls / elapsedSec).toFixed(2) : '-',
  );
  updateStat('stat-checksum', stats.checksumMismatches);
  updateStat('stat-elapsed', Math.floor(elapsedSec) + 's');
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

let running = false;

async function runBenchmark() {
  const payloadBytes = parseInt(
    (document.getElementById('payload-size') as HTMLInputElement).value,
    10,
  );
  const durationSec = parseInt((document.getElementById('duration') as HTMLInputElement).value, 10);
  const concurrency = parseInt(
    (document.getElementById('concurrency') as HTMLInputElement).value,
    10,
  );
  const delayMs = parseInt((document.getElementById('delay') as HTMLInputElement).value, 10);

  running = true;
  startTime = Date.now();

  const logArea = document.getElementById('log') as HTMLTextAreaElement;
  if (logArea) logArea.value = '';

  document.getElementById('stats-area')!.style.display = '';
  (document.getElementById('run-benchmark') as HTMLButtonElement).style.display = 'none';
  (document.getElementById('stop-benchmark') as HTMLButtonElement).style.display = '';

  log(`=== RPC Benchmark ===`);
  log(`Payload size: ${payloadBytes} bytes`);
  log(`Duration: ${durationSec}s | Concurrency: ${concurrency} | Delay: ${delayMs}ms`);

  const roomName = `rpc-bench-${Math.random().toString(36).substring(2, 8)}`;
  log(`Connecting participants to room: ${roomName}`);

  let callerRoom: Room | undefined;
  let receiverRoom: Room | undefined;

  try {
    [callerRoom, receiverRoom] = await Promise.all([
      connectParticipant('bench-caller', roomName),
      connectParticipant('bench-receiver', roomName),
    ]);

    // Register echo handler on receiver
    let totalReceived = 0;
    receiverRoom.registerRpcMethod('benchmark-echo', async (data: RpcInvocationData) => {
      totalReceived += 1;
      // Echo back the payload for round-trip verification
      return data.payload;
    });

    // Wait for participants to see each other
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Timed out waiting for receiver to be visible')),
        10_000,
      );
      const check = () => {
        const participants = callerRoom!.remoteParticipants;
        for (const [, p] of participants) {
          if (p.identity === 'bench-receiver') {
            clearTimeout(timeout);
            resolve();
            return;
          }
        }
      };
      check();
      callerRoom!.on(RoomEvent.ParticipantConnected, () => check());
    });

    log(`Both participants connected. Starting benchmark...`);
    log(`Pre-generating payload (${payloadBytes} bytes)...`);
    const payload = generatePayload(payloadBytes);
    const expectedChecksum = computeChecksum(payload);
    log(`Payload generated. Checksum: ${expectedChecksum}`);

    const stats = new BenchmarkStats();
    const benchStartMs = performance.now();
    const benchEndTimeMs = benchStartMs + durationSec * 1000;

    // Stats refresh interval
    const statsInterval = setInterval(() => {
      const elapsedMs = (performance.now() - benchStartMs) / 1000;
      refreshStatsUI(stats, elapsedMs);
    }, 500);

    // Caller loop for one "thread" (concurrent async worker)
    const callerLoop = async (threadId: number) => {
      while (running && performance.now() < benchEndTimeMs) {
        const callStartMs = performance.now();

        try {
          const response = await callerRoom!.localParticipant.performRpc({
            destinationIdentity: 'bench-receiver',
            method: 'benchmark-echo',
            payload,
            responseTimeout: 60_000,
          });

          const latencyMs = performance.now() - callStartMs;
          const responseChecksum = computeChecksum(response);

          if (response.length === payload.length && responseChecksum === expectedChecksum) {
            stats.recordCall(true, latencyMs, payloadBytes);
          } else {
            stats.recordCall(false, latencyMs, payloadBytes);
            stats.recordError('checksum_mismatch');
            log(
              `[Thread ${threadId}] CHECKSUM MISMATCH sent=${payload.length}/${expectedChecksum} recv=${response.length}/${responseChecksum}`,
            );
          }
        } catch (error) {
          const latency = performance.now() - callStartMs;
          stats.recordCall(false, latency, payloadBytes);

          if (error instanceof RpcError) {
            const code = error.code;
            if (code === RpcError.ErrorCode.RESPONSE_TIMEOUT) {
              stats.recordError('timeout');
            } else if (code === RpcError.ErrorCode.CONNECTION_TIMEOUT) {
              stats.recordError('connection_timeout');
            } else if (code === RpcError.ErrorCode.RECIPIENT_DISCONNECTED) {
              stats.recordError('recipient_disconnected');
            } else {
              stats.recordError(`rpc_error_${code}`);
            }
            log(
              `[Thread ${threadId}] RPC Error code=${code} msg="${error.message}" latency=${latency.toFixed(1)}ms`,
            );
          } else {
            stats.recordError('exception');
            log(`[Thread ${threadId}] Exception: ${error}`);
          }
        }

        // Delay between calls
        if (delayMs > 0 && running) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    };

    // Launch concurrent caller "threads"
    const threads = Array.from({ length: concurrency }, (_, i) => callerLoop(i));
    await Promise.all(threads);

    clearInterval(statsInterval);

    // Final stats update
    const totalElapsed = (performance.now() - benchStartMs) / 1000;
    refreshStatsUI(stats, totalElapsed);

    log(`\n=== Benchmark Complete ===`);
    log(`Total calls: ${stats.totalCalls}`);
    log(`Successful: ${stats.successfulCalls} | Failed: ${stats.failedCalls}`);
    log(`Success rate: ${stats.successRate.toFixed(1)}%`);
    log(`Avg latency: ${stats.avgLatency.toFixed(1)}ms`);
    log(
      `P50: ${stats.percentile(50).toFixed(1)}ms | P95: ${stats.percentile(95).toFixed(1)}ms | P99: ${stats.percentile(99).toFixed(1)}ms`,
    );
    log(`Throughput: ${(stats.successfulCalls / totalElapsed).toFixed(2)} calls/sec`);
    log(`Receiver total processed: ${totalReceived}`);

    const errors = stats.errorSummary;
    if (Object.keys(errors).length > 0) {
      log(`Errors: ${JSON.stringify(errors)}`);
    }

    receiverRoom.localParticipant.unregisterRpcMethod('benchmark-echo');
  } catch (error) {
    log(`Fatal error: ${error}`);
  } finally {
    running = false;
    if (callerRoom) await callerRoom.disconnect();
    if (receiverRoom) await receiverRoom.disconnect();
    (document.getElementById('run-benchmark') as HTMLButtonElement).style.display = '';
    (document.getElementById('run-benchmark') as HTMLButtonElement).disabled = false;
    (document.getElementById('stop-benchmark') as HTMLButtonElement).style.display = 'none';
    log('Disconnected.');
  }
}

// ---------------------------------------------------------------------------
// Query string persistence
// ---------------------------------------------------------------------------

const PARAM_DEFAULTS: Record<string, string> = {
  'payload-size': '15360',
  duration: '30',
  concurrency: '3',
  delay: '10',
};

// All element IDs managed in the URL (network has no default — omitted when empty)
const ALL_PARAM_IDS = ['network', ...Object.keys(PARAM_DEFAULTS)];

function loadParamsFromURL() {
  const params = new URLSearchParams(window.location.search);
  let needsReplace = false;

  // Network: only set if present in URL, otherwise leave empty
  const networkEl = document.getElementById('network') as HTMLSelectElement;
  if (params.has('network')) {
    networkEl.value = params.get('network')!;
  }

  for (const [id, defaultValue] of Object.entries(PARAM_DEFAULTS)) {
    const input = document.getElementById(id) as HTMLInputElement;
    if (!input) continue;

    if (params.has(id)) {
      input.value = params.get(id)!;
    } else {
      params.set(id, defaultValue);
      needsReplace = true;
    }
  }

  if (needsReplace) {
    window.history.replaceState(null, '', '?' + params.toString());
  }
}

function syncParamsToURL() {
  const params = new URLSearchParams(window.location.search);

  // Network: include only when non-empty
  const networkEl = document.getElementById('network') as HTMLSelectElement;
  if (networkEl.value) {
    params.set('network', networkEl.value);
  } else {
    params.delete('network');
  }

  for (const id of Object.keys(PARAM_DEFAULTS)) {
    const input = document.getElementById(id) as HTMLInputElement;
    if (input) {
      params.set(id, input.value);
    }
  }
  window.history.replaceState(null, '', '?' + params.toString());
}

// ---------------------------------------------------------------------------
// DOM wiring
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  loadParamsFromURL();

  // Sync to URL on any input change
  for (const id of ALL_PARAM_IDS) {
    const el = document.getElementById(id);
    if (el) {
      const event = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(event, () => syncParamsToURL());
    }
  }

  const runBtn = document.getElementById('run-benchmark') as HTMLButtonElement;
  const stopBtn = document.getElementById('stop-benchmark') as HTMLButtonElement;

  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    await runBenchmark();
  });

  stopBtn.addEventListener('click', () => {
    log('Stopping benchmark...');
    running = false;
  });

  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const size = (btn as HTMLButtonElement).dataset.size;
      if (size) {
        const input = document.getElementById('payload-size') as HTMLInputElement;
        input.value = size;
        syncParamsToURL();
      }
    });
  });
});
