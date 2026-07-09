import { type LeaveRequest, LeaveRequest_Action } from '@livekit/protocol';
import { afterEach, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { ConnectionErrorReason } from '../room/errors';
import { createInvalidToken, createToken } from '../test/signalToken';
import { SignalClient, SignalConnectionState, type SignalOptions } from './SignalClient';

// Provided by src/test/signalServerSetup.ts (spawns the livekit-server test-server).
const serverUrl = inject('serverUrl');
const unavailable = inject('e2eUnavailable');

const defaultOpts = (): SignalOptions => ({
  autoSubscribe: true,
  maxRetries: 0,
  e2eeEnabled: false,
  websocketTimeout: 5_000,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), ms),
    ),
  ]);
}

/** Resolves with the reason passed to onClose (register before the event can fire). */
function captureClose(client: SignalClient): Promise<string> {
  return new Promise((resolve) => {
    client.onClose = (reason) => resolve(reason);
  });
}

/** Resolves with the LeaveRequest passed to onLeave. */
function captureLeave(client: SignalClient): Promise<LeaveRequest> {
  return new Promise((resolve) => {
    client.onLeave = (leave) => resolve(leave);
  });
}

describe.skipIf(!!unavailable)('SignalClient e2e', () => {
  // Behaviors that depend on the signal path (v0 legacy vs v1).
  describe.each([
    { label: 'v0', useV0: true },
    { label: 'v1', useV0: false },
  ])('$label path', ({ useV0 }) => {
    let client: SignalClient;

    beforeEach(() => {
      client = new SignalClient(false);
    });

    afterEach(async () => {
      await client.close().catch(() => {});
    });

    /** Mint a token whose metadata selects the server behavior mode, then join. */
    const join = (mode: string, opts: SignalOptions = defaultOpts(), abortSignal?: AbortSignal) =>
      createToken({ signal: mode }).then((token) =>
        client.join(serverUrl, token, opts, abortSignal, useV0),
      );

    it('connects and reports CONNECTED with a join response', async () => {
      const res = await join('happy');
      expect(res).toBeTruthy();
      expect(res.pingInterval).toBeGreaterThan(0);
      expect(client.currentState).toBe(SignalConnectionState.CONNECTED);
    });

    it('stays connected past the ping timeout while the server pongs', async () => {
      const onClose = vi.fn();
      await join('happy');
      client.onClose = onClose;
      // Server ping timeout is 3s; a healthy pong loop must keep us alive.
      await sleep(4_000);
      expect(onClose).not.toHaveBeenCalled();
      expect(client.currentState).toBe(SignalConnectionState.CONNECTED);
    });

    it('closes with a ping timeout when the server stops ponging', async () => {
      const closed = captureClose(client);
      await join('no_pong');
      expect(client.currentState).toBe(SignalConnectionState.CONNECTED);
      const reason = await withTimeout(closed, 8_000, 'onClose (ping timeout)');
      expect(reason).toContain('ping timeout');
      expect(client.currentState).toBe(SignalConnectionState.DISCONNECTED);
    });

    it('surfaces an unexpected transport close while connected', async () => {
      const closed = captureClose(client);
      await join('close_when_connected');
      const reason = await withTimeout(closed, 5_000, 'onClose (transport closed)');
      expect(reason).toBeTruthy();
      expect(client.currentState).toBe(SignalConnectionState.DISCONNECTED);
    });

    it('surfaces an abnormal socket drop (1006) while connected', async () => {
      // Server sends the join, then drops the TCP connection with no close
      // handshake -> the browser reports an abnormal 1006 closure, exercising
      // WebSocketStream's error->close path (distinct from the clean 1011 above).
      const closed = captureClose(client);
      await join('drop_when_connected');
      expect(client.currentState).toBe(SignalConnectionState.CONNECTED);
      const reason = await withTimeout(closed, 5_000, 'onClose (abnormal drop)');

      // KNOWN BUG (documented, not desired): an abnormal 1006 close carries no
      // reason, and handleOnClose's `closeInfo.reason ?? 'Unexpected WS error'`
      // fallback only fires for null/undefined — not the empty string a 1006
      // yields. So onClose gets '' instead of a descriptive reason. It SHOULD
      // report 'Unexpected WS error'. When the client is fixed, flip this to
      //   expect(reason).toBe('Unexpected WS error');
      expect(reason).toBe(''); // <-- buggy current behavior; see above
      expect(client.currentState).toBe(SignalConnectionState.DISCONNECTED);
    });

    it('rejects the join when the socket closes before the first message', async () => {
      // Upgrade succeeds, then the server closes the WS before sending a join.
      // The client is still establishing, so it rejects rather than hanging.
      const err = await join('close_before_join').then(
        () => undefined,
        (e) => e as Error,
      );
      expect(err).toBeInstanceOf(Error);
      expect((err as { reason?: ConnectionErrorReason }).reason).toBe(
        ConnectionErrorReason.InternalError,
      );
    });

    it('delivers a server-initiated leave while connected', async () => {
      const left = captureLeave(client);
      await join('leave_when_connected');
      const leave = await withTimeout(left, 5_000, 'onLeave');
      expect(leave).toBeTruthy();
      expect(leave.action).toBe(LeaveRequest_Action.DISCONNECT);
    });

    it('forwards a non-DISCONNECT leave action verbatim', async () => {
      // SignalClient does not branch on the leave action (RTCEngine does); it
      // must pass it through unchanged. Guards the FSM swap's leave_received
      // effect, which carries leaveAction. Uses RECONNECT to prove it's not
      // defaulted to DISCONNECT.
      const left = captureLeave(client);
      const token = await createToken({
        signal: 'leave_when_connected',
        leaveAction: LeaveRequest_Action.RECONNECT,
      });
      await client.join(serverUrl, token, defaultOpts(), undefined, useV0);
      const leave = await withTimeout(left, 5_000, 'onLeave');
      expect(leave.action).toBe(LeaveRequest_Action.RECONNECT);
    });

    it('rejects the join when a leave arrives as the first message', async () => {
      const err = await join('leave_first_message').then(
        () => undefined,
        (e) => e as Error,
      );
      expect(err).toBeInstanceOf(Error);
    });

    it('closes gracefully via close() without firing onClose', async () => {
      const onClose = vi.fn();
      await join('happy');
      client.onClose = onClose;
      await client.close();
      expect(client.isDisconnected).toBe(true);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('reconnects (resume) back to CONNECTED', async () => {
      await join('happy');
      const token = await createToken({ signal: 'happy' });
      await client.reconnect(serverUrl, token, 'RM_session');
      expect(client.currentState).toBe(SignalConnectionState.CONNECTED);
    });

    it('rejects a reconnect when a leave arrives as the first message', async () => {
      // Reconnecting into a room that sends leave-first exercises the client's
      // first-message validation while in RECONNECTING (path-independent: it
      // doesn't rely on the mock detecting reconnect, which v1 hides inside the
      // gzipped join_request the mock ignores).
      await join('happy');
      const token = await createToken({ signal: 'leave_first_message' });
      const err = await client.reconnect(serverUrl, token, 'RM_session').then(
        () => undefined,
        (e) => e as Error,
      );
      expect(err).toBeInstanceOf(Error);
    });

    // --- validate-endpoint classification -------------------------------
    it('classifies an invalid token as NotAllowed', async () => {
      const token = await createInvalidToken();
      const err = await client
        .join(serverUrl, token, defaultOpts(), undefined, useV0)
        .catch((e) => e);
      expect(err.reason).toBe(ConnectionErrorReason.NotAllowed);
    });

    it('classifies room-not-found as NotAllowed', async () => {
      const err = await join('room_not_found').catch((e) => e);
      expect(err.reason).toBe(ConnectionErrorReason.NotAllowed);
    });

    it('classifies a wrong-path 404 as ServiceNotFound', async () => {
      const err = await join('validate_service_not_found').catch((e) => e);
      expect(err.reason).toBe(ConnectionErrorReason.ServiceNotFound);
    });

    it('surfaces a 5xx validate as a WebSocket error (ws error shadows 5xx→internal)', async () => {
      // Current behavior: handleConnectionError only maps a 5xx to InternalError
      // when the ws rejection is NOT a ConnectionError. WebSocketStream always
      // rejects with one, so for a refused upgrade the WS error wins. Only
      // 401/403/404 (handled before that check) override it.
      const err = await join('validate_500').catch((e) => e);
      expect(err.reason).toBe(ConnectionErrorReason.WebSocket);
    });
  });

  // Path-independent transport-level failures (run once, via v0).
  describe('transport failures', () => {
    let client: SignalClient;

    beforeEach(() => {
      client = new SignalClient(false);
    });

    afterEach(async () => {
      await client.close().catch(() => {});
    });

    it('classifies an unreachable server as ServerUnreachable', async () => {
      const token = await createToken({ signal: 'happy' });
      // Nothing listening on this port -> ws fails, validate fetch fails.
      const err = await client
        .join('ws://127.0.0.1:59999', token, defaultOpts(), undefined, true)
        .catch((e) => e);
      expect(err.reason).toBe(ConnectionErrorReason.ServerUnreachable);
    });

    it('cancels the connect when the AbortSignal fires mid-connection', async () => {
      const controller = new AbortController();
      const token = await createToken({ signal: 'no_first_message' });
      const p = client.join(serverUrl, token, defaultOpts(), controller.signal, true);
      setTimeout(() => controller.abort('user requested abort'), 300);
      const err = await p.catch((e) => e);
      expect(err.reason).toBe(ConnectionErrorReason.Cancelled);
    });

    it('hangs with no read-timeout when the socket opens but no first message arrives', async () => {
      // FIXME KNOWN GAP (documented, not desired): wsTimeout guards only the upgrade
      // and is cleared as soon as ws.opened resolves. If the server accepts the
      // socket then stays silent, `await signalReader.read()` blocks forever —
      // join() never settles and websocketTimeout does NOT apply post-upgrade.
      const controller = new AbortController();
      const token = await createToken({ signal: 'no_first_message' });
      const joinPromise = client.join(
        serverUrl,
        token,
        { ...defaultOpts(), websocketTimeout: 1_000 },
        controller.signal,
        true,
      );

      const STILL_PENDING = Symbol('still-pending');
      const outcome = await Promise.race([
        joinPromise.then(
          () => 'resolved',
          () => 'rejected',
        ),
        // Well past websocketTimeout (1s): a real read-timeout would have fired.
        new Promise<typeof STILL_PENDING>((resolve) =>
          setTimeout(() => resolve(STILL_PENDING), 3_000),
        ),
      ]);
      expect(outcome).toBe(STILL_PENDING);

      // Cleanup: abort so the dangling join settles instead of leaking.
      controller.abort('test cleanup');
      await joinPromise.catch(() => {});
    });
  });
});
