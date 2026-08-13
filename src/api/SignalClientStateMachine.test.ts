import { describe, expect, it } from 'vitest';
import {
  type SendRequestInput,
  type SignalLifecycleState,
  type SignalMachine,
  type SignalMachineInput,
  createSignalMachine,
  signalLifecycleStates,
} from './SignalClientStateMachine';

function send(machine: SignalMachine, input: SignalMachineInput) {
  machine.handle(input.type, input);
}

/** Drives a machine into `state` through legal inputs only. */
function machineIn(state: SignalLifecycleState): SignalMachine {
  const machine = createSignalMachine();
  switch (state) {
    case 'new':
      break;
    case 'connecting':
      send(machine, { type: 'connect' });
      break;
    case 'connected':
      send(machine, { type: 'connect' });
      send(machine, { type: 'connectComplete' });
      break;
    case 'offline':
      send(machine, { type: 'connect' });
      send(machine, { type: 'connectComplete' });
      send(machine, {
        type: 'transportFailed',
        attemptId: machine.context.attemptId,
        reason: 'ws closed',
      });
      break;
    case 'resuming':
      send(machine, { type: 'connect' });
      send(machine, { type: 'connectComplete' });
      send(machine, { type: 'resume' });
      break;
    case 'signalResumed':
      send(machine, { type: 'connect' });
      send(machine, { type: 'connectComplete' });
      send(machine, { type: 'resume' });
      send(machine, { type: 'resumeComplete' });
      break;
    case 'disconnecting':
      send(machine, { type: 'close', reason: 'test' });
      break;
    case 'closed':
      send(machine, { type: 'close', reason: 'test' });
      send(machine, { type: 'closeComplete' });
      break;
  }
  expect(machine.currentState()).toBe(state);
  return machine;
}

/** A request that records the `held` flag it was eventually written with. */
function trackedRequest(written: Array<string>, label: string): SendRequestInput {
  return {
    type: 'sendRequest',
    write: (held) => {
      written.push(`${label}:${held ? 'held' : 'direct'}`);
      return Promise.resolve();
    },
  };
}

describe('signal lifecycle machine', () => {
  it('starts in new', () => {
    expect(createSignalMachine().currentState()).toBe('new');
  });

  it('gives every client its own context', () => {
    const a = machineIn('connected');
    const b = createSignalMachine();
    expect(a.context.attemptId).toBe(1);
    expect(b.context.attemptId).toBe(0);
  });

  describe('initial connect', () => {
    it('reaches connected', () => {
      expect(machineIn('connected').currentState()).toBe('connected');
    });

    it('treats failure as terminal, since there is no session to fall back on', () => {
      const machine = machineIn('connecting');
      send(machine, { type: 'connectFailed', error: new Error('nope') });
      expect(machine.currentState()).toBe('closed');
      expect(machine.context.lastError).toBeInstanceOf(Error);
    });
  });

  describe('transport loss', () => {
    it('goes offline rather than starting a reconnect on its own', () => {
      expect(machineIn('offline').currentState()).toBe('offline');
    });

    it('ignores a transport that has already been replaced', () => {
      const machine = machineIn('connected');
      const staleAttemptId = machine.context.attemptId;

      // a newer attempt takes over, then the old socket reports its close
      send(machine, { type: 'resume' });
      send(machine, { type: 'transportFailed', attemptId: staleAttemptId, reason: 'late close' });

      expect(machine.currentState()).toBe('resuming');
    });

    it('is ignored while establishing, where the attempt itself reports the outcome', () => {
      const machine = machineIn('connecting');
      send(machine, {
        type: 'transportFailed',
        attemptId: machine.context.attemptId,
        reason: 'ws closed',
      });
      expect(machine.currentState()).toBe('connecting');
    });

    it('is still recognised while a resumed session is being declared live', () => {
      const machine = machineIn('signalResumed');
      send(machine, {
        type: 'transportFailed',
        attemptId: machine.context.attemptId,
        reason: 'ws closed again',
      });
      expect(machine.currentState()).toBe('offline');
    });
  });

  describe('resume', () => {
    it('waits for the engine to report the reconnect complete', () => {
      const machine = machineIn('resuming');
      send(machine, { type: 'resumeComplete' });
      expect(machine.currentState()).toBe('signalResumed');
      send(machine, { type: 'reconnected' });
      expect(machine.currentState()).toBe('connected');
    });

    it('can be retried after a recoverable failure', () => {
      const machine = machineIn('resuming');
      send(machine, { type: 'resumeFailed', recoverable: true });
      expect(machine.currentState()).toBe('offline');

      // the retry the engine drives after its backoff
      send(machine, { type: 'resume' });
      expect(machine.currentState()).toBe('resuming');
      send(machine, { type: 'resumeComplete' });
      send(machine, { type: 'reconnected' });
      expect(machine.currentState()).toBe('connected');
    });

    it('closes on a terminal failure', () => {
      const machine = machineIn('resuming');
      send(machine, { type: 'resumeFailed', recoverable: false });
      expect(machine.currentState()).toBe('closed');
    });

    it('can escalate to a full reconnect from offline', () => {
      const machine = machineIn('offline');
      send(machine, { type: 'connect' });
      expect(machine.currentState()).toBe('connecting');
    });

    it('resumes from connected, for when only the peer connection was severed', () => {
      const machine = machineIn('connected');
      send(machine, { type: 'resume' });
      expect(machine.currentState()).toBe('resuming');
    });

    it('bumps the attempt id per attempt, including a re-entrant one', () => {
      const machine = machineIn('resuming');
      const first = machine.context.attemptId;
      send(machine, { type: 'resume' });
      expect(machine.context.attemptId).toBe(first + 1);
    });
  });

  describe('outbound requests', () => {
    it('lets requests through while the session is connected', () => {
      const machine = machineIn('connected');
      const written: Array<string> = [];
      const request = trackedRequest(written, 'mute');

      send(machine, request);

      expect(written).toEqual(['mute:direct']);
      expect(request.sent).toBeInstanceOf(Promise);
      expect(request.held).toBeUndefined();
    });

    it('holds requests made while the transport is down', () => {
      const machine = machineIn('resuming');
      const written: Array<string> = [];
      const request = trackedRequest(written, 'mute');

      send(machine, request);

      expect(written).toEqual([]);
      expect(request.held).toBe(true);
      // the caller is not given a write promise, so it resolves without waiting
      expect(request.sent).toBeUndefined();
    });

    it('keeps holding them until the engine reports the reconnect complete', () => {
      const machine = machineIn('resuming');
      const written: Array<string> = [];

      send(machine, trackedRequest(written, 'first'));
      send(machine, trackedRequest(written, 'second'));

      // the transport alone coming back is not enough: a resume is only complete once the peer
      // connection is back, which only the engine knows
      send(machine, { type: 'resumeComplete' });
      expect(written).toEqual([]);

      send(machine, { type: 'reconnected' });
      expect(written).toEqual(['first:held', 'second:held']);
    });

    it('releases held requests when a full reconnect takes over instead', () => {
      const machine = machineIn('resuming');
      const written: Array<string> = [];
      send(machine, trackedRequest(written, 'mute'));

      send(machine, { type: 'connect' });
      expect(written).toEqual([]);
      send(machine, { type: 'connectComplete' });

      expect(written).toEqual(['mute:held']);
    });

    it('does not hold requests once the transport is back', () => {
      const machine = machineIn('signalResumed');
      const written: Array<string> = [];

      send(machine, trackedRequest(written, 'mute'));

      expect(written).toEqual(['mute:direct']);
    });
  });

  describe('close', () => {
    it('is legal from every state that owns a transport or an attempt', () => {
      for (const state of [
        'new',
        'connecting',
        'connected',
        'offline',
        'resuming',
        'signalResumed',
      ] as const) {
        const machine = machineIn(state);
        send(machine, { type: 'close', reason: 'bye' });
        expect(machine.currentState()).toBe('disconnecting');
        expect(machine.context.closeReason).toBe('bye');
      }
    });

    it('is a no-op once closing or closed', () => {
      for (const state of ['disconnecting', 'closed'] as const) {
        const machine = machineIn(state);
        send(machine, { type: 'close', reason: 'again' });
        expect(machine.currentState()).toBe(state);
      }
    });

    it('can be followed by a fresh session', () => {
      const machine = machineIn('closed');
      send(machine, { type: 'connect' });
      expect(machine.currentState()).toBe('connecting');
    });

    it('reports unhandled inputs so they can be logged rather than thrown', () => {
      const machine = machineIn('closed');
      const unhandled: Array<string> = [];
      machine.on('nohandler', ({ inputName }) => unhandled.push(inputName));
      send(machine, { type: 'closeComplete' });
      expect(unhandled).toEqual(['closeComplete']);
    });
  });

  // Guards the whole surface: every state/input pair resolves to a documented target, a deliberate
  // no-op ('handled'), a deferral, or an explicit ignore — so adding a state or an input cannot
  // silently leave a hole.
  describe('transition matrix', () => {
    const probes: Record<SignalMachineInput['type'], SignalMachineInput> = {
      connect: { type: 'connect' },
      connectComplete: { type: 'connectComplete' },
      connectFailed: { type: 'connectFailed' },
      resume: { type: 'resume' },
      resumeComplete: { type: 'resumeComplete' },
      resumeFailed: { type: 'resumeFailed', recoverable: true },
      transportFailed: { type: 'transportFailed', attemptId: 0, reason: 'probe' },
      reconnected: { type: 'reconnected' },
      sendRequest: { type: 'sendRequest', write: () => Promise.resolve() },
      close: { type: 'close', reason: 'probe' },
      closeComplete: { type: 'closeComplete' },
    };

    it('matches the documented table', () => {
      const matrix: Record<string, Record<string, string>> = {};
      for (const state of signalLifecycleStates) {
        matrix[state] = {};
        for (const [type, probe] of Object.entries(probes)) {
          const machine = machineIn(state);
          let outcome = '';
          machine.on('nohandler', () => {
            outcome = 'ignored';
          });
          machine.on('deferred', () => {
            outcome = 'deferred';
          });
          // the probe carries the live attempt id, so only the state gates the transition
          const input =
            probe.type === 'transportFailed'
              ? { ...probe, attemptId: machine.context.attemptId }
              : probe;
          const before = machine.currentState();
          send(machine, input);
          const after = machine.currentState();
          matrix[state][type] = outcome || (after === before ? 'handled' : after);
        }
      }

      expect(matrix).toEqual({
        new: {
          connect: 'connecting',
          resume: 'resuming',
          sendRequest: 'handled',
          close: 'disconnecting',
          connectComplete: 'ignored',
          connectFailed: 'ignored',
          resumeComplete: 'ignored',
          resumeFailed: 'ignored',
          transportFailed: 'ignored',
          reconnected: 'ignored',
          closeComplete: 'ignored',
        },
        connecting: {
          connect: 'handled', // re-enters connecting: same state, new attempt id
          resume: 'resuming',
          connectComplete: 'connected',
          connectFailed: 'closed',
          sendRequest: 'handled',
          close: 'disconnecting',
          resumeComplete: 'ignored',
          resumeFailed: 'ignored',
          transportFailed: 'ignored',
          reconnected: 'ignored',
          closeComplete: 'ignored',
        },
        connected: {
          connect: 'connecting',
          resume: 'resuming',
          transportFailed: 'offline',
          reconnected: 'handled', // already live: nothing left to declare
          sendRequest: 'handled',
          close: 'disconnecting',
          connectComplete: 'ignored',
          connectFailed: 'ignored',
          resumeComplete: 'ignored',
          resumeFailed: 'ignored',
          closeComplete: 'ignored',
        },
        offline: {
          connect: 'connecting',
          resume: 'resuming',
          sendRequest: 'handled',
          close: 'disconnecting',
          connectComplete: 'ignored',
          connectFailed: 'ignored',
          resumeComplete: 'ignored',
          resumeFailed: 'ignored',
          transportFailed: 'ignored',
          reconnected: 'ignored',
          closeComplete: 'ignored',
        },
        resuming: {
          connect: 'connecting',
          resume: 'handled', // re-enters resuming: same state, new attempt id
          resumeComplete: 'signalResumed',
          resumeFailed: 'offline', // probe is recoverable; terminal goes to closed
          sendRequest: 'deferred',
          close: 'disconnecting',
          connectComplete: 'ignored',
          connectFailed: 'ignored',
          transportFailed: 'ignored',
          reconnected: 'ignored',
          closeComplete: 'ignored',
        },
        signalResumed: {
          connect: 'connecting',
          resume: 'resuming',
          reconnected: 'connected',
          transportFailed: 'offline',
          sendRequest: 'handled',
          close: 'disconnecting',
          connectComplete: 'ignored',
          connectFailed: 'ignored',
          resumeComplete: 'ignored',
          resumeFailed: 'ignored',
          closeComplete: 'ignored',
        },
        disconnecting: {
          connect: 'connecting',
          resume: 'resuming',
          closeComplete: 'closed',
          sendRequest: 'handled',
          connectComplete: 'ignored',
          connectFailed: 'ignored',
          resumeComplete: 'ignored',
          resumeFailed: 'ignored',
          transportFailed: 'ignored',
          reconnected: 'ignored',
          close: 'ignored',
        },
        closed: {
          connect: 'connecting',
          resume: 'resuming',
          sendRequest: 'handled',
          connectComplete: 'ignored',
          connectFailed: 'ignored',
          resumeComplete: 'ignored',
          resumeFailed: 'ignored',
          transportFailed: 'ignored',
          reconnected: 'ignored',
          close: 'ignored',
          closeComplete: 'ignored',
        },
      });
    });
  });
});
