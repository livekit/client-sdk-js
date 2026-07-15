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

      expect(reason).toBe('Unexpected WS error');
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

    it('queues a queueable request during reconnect and delivers it after resume', async () => {
      // Guards the FSM swap's buffer contract: a queueable request sent while
      // RECONNECTING must be buffered (not sent on the dying socket, not
      // dropped) and delivered on the new socket once the orchestrator drains.
      // The mock acks updateMetadata with a RequestResponse echoing requestId,
      // so delivery is observable end-to-end.
      await join('happy');
      const responded = new Promise<number>((resolve) => {
        client.onRequestResponse = (res) => resolve(res.requestId);
      });
      const token = await createToken({ signal: 'happy' });
      const reconnectPromise = client.reconnect(serverUrl, token, 'RM_session');
      // reconnect() enters RECONNECTING synchronously, so this is a stable window
      expect(client.currentState).toBe(SignalConnectionState.RECONNECTING);
      const requestId = await client.sendUpdateLocalMetadata('meta', 'name');
      await reconnectPromise;
      // the orchestrator (RTCEngine) drains the queue once resumed
      client.setReconnected();
      const respondedId = await withTimeout(responded, 5_000, 'RequestResponse for queued request');
      expect(respondedId).toBe(requestId);
    });

    it('close() during a reconnect attempt aborts it without firing onClose', async () => {
      // Guards the close-aborts-reconnecting transition: a user-initiated
      // close while RECONNECTING must settle the in-flight attempt (no hang)
      // and stay silent — onClose is reserved for unexpected closures.
      const onClose = vi.fn();
      await join('happy');
      client.onClose = onClose;
      const token = await createToken({ signal: 'no_first_message' });
      const settled = client.reconnect(serverUrl, token, 'RM_session').then(
        () => undefined,
        (e) => e as Error,
      );
      await sleep(300); // let the reconnect socket open and sit waiting
      await client.close();
      expect(client.isDisconnected).toBe(true);
      // Today the attempt settles via the 5s first-message timeout rather than
      // the socket close (the reader is not unblocked by close()); the
      // invariant guarded here is only that it settles instead of hanging.
      const err = await withTimeout(settled, 8_000, 'reconnect to settle after close()');
      expect(err).toBeInstanceOf(Error);
      await sleep(300);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('a timed-out reconnect attempt rejects and leaves the client able to retry', async () => {
      // Guards the reconnect_timed_out → suspended → reconnecting loop: a
      // failed attempt must not wedge the client; the next attempt succeeds.
      await join('happy');
      const silent = await createToken({ signal: 'no_first_message' });
      const err = await withTimeout(
        client.reconnect(serverUrl, silent, 'RM_session').then(
          () => undefined,
          (e) => e as { reason?: ConnectionErrorReason },
        ),
        10_000,
        'reconnect to time out',
      );
      expect(err?.reason).toBe(ConnectionErrorReason.Timeout);
      // Mirror RTCEngine's retry delay: the failed attempt's internal close()
      // finishes asynchronously (~250ms) after the rejection and would clobber
      // a retry's RECONNECTING state if the retry starts immediately.
      await sleep(500);
      const happy = await createToken({ signal: 'happy' });
      await client.reconnect(serverUrl, happy, 'RM_session');
      expect(client.currentState).toBe(SignalConnectionState.CONNECTED);
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

    it('resolves close() even when the server drops the socket mid-handshake', async () => {
      // Guards the transport_closed-while-disconnecting transition: the mock
      // hard-drops the TCP connection on the client's close frame instead of
      // replying, so the clean close handshake never completes. close() must
      // still resolve promptly and the abnormal closure must not fire onClose.
      const onClose = vi.fn();
      const token = await createToken({ signal: 'drop_on_close' });
      await client.join(serverUrl, token, defaultOpts(), undefined, true);
      client.onClose = onClose;
      const start = performance.now();
      await client.close();
      expect(performance.now() - start).toBeLessThan(2_000);
      expect(client.isDisconnected).toBe(true);
      await sleep(400); // grace period for a late close event to (wrongly) fire onClose
      expect(onClose).not.toHaveBeenCalled();
    });

    it('times out when the socket opens but no first message arrives', async () => {
      // wsTimeout only guards the WebSocket upgrade and is cleared once ws.opened
      // resolves. If the server accepts the socket then stays silent, the wait for
      // the first message is guarded by its own JOIN_RESPONSE_TIMEOUT (5s), so
      // join() rejects with Timeout instead of hanging.
      const token = await createToken({ signal: 'no_first_message' });
      const joinPromise = client.join(serverUrl, token, defaultOpts(), undefined, true);

      const err = await withTimeout(
        joinPromise.then(
          () => undefined,
          (e) => e,
        ),
        8_000,
        'join to time out',
      );
      expect(err.reason).toBe(ConnectionErrorReason.Timeout);
    });
  });
});
