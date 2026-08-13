import { describe, expect, it } from 'vitest';
import {
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
    case 'reconnecting':
      send(machine, { type: 'connect' });
      send(machine, { type: 'connectComplete' });
      send(machine, { type: 'reconnect' });
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
      send(machine, { type: 'reconnect' });
      send(machine, { type: 'transportFailed', attemptId: staleAttemptId, reason: 'late close' });

      expect(machine.currentState()).toBe('reconnecting');
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
  });

  describe('resume', () => {
    it('can be retried after a recoverable failure', () => {
      const machine = machineIn('reconnecting');
      send(machine, { type: 'reconnectFailed', recoverable: true });
      expect(machine.currentState()).toBe('offline');

      // the retry the engine drives after its backoff
      send(machine, { type: 'reconnect' });
      expect(machine.currentState()).toBe('reconnecting');
      send(machine, { type: 'reconnectComplete' });
      expect(machine.currentState()).toBe('connected');
    });

    it('closes on a terminal failure', () => {
      const machine = machineIn('reconnecting');
      send(machine, { type: 'reconnectFailed', recoverable: false });
      expect(machine.currentState()).toBe('closed');
    });

    it('can escalate to a full reconnect from offline', () => {
      const machine = machineIn('offline');
      send(machine, { type: 'connect' });
      expect(machine.currentState()).toBe('connecting');
    });

    it('resumes from connected, for when only the peer connection was severed', () => {
      const machine = machineIn('connected');
      send(machine, { type: 'reconnect' });
      expect(machine.currentState()).toBe('reconnecting');
    });

    it('bumps the attempt id per attempt, including a re-entrant one', () => {
      const machine = machineIn('reconnecting');
      const first = machine.context.attemptId;
      send(machine, { type: 'reconnect' });
      expect(machine.context.attemptId).toBe(first + 1);
    });
  });

  describe('close', () => {
    it('is legal from every state that owns a transport or an attempt', () => {
      for (const state of ['new', 'connecting', 'connected', 'offline', 'reconnecting'] as const) {
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

  // Guards the whole surface: every state/input pair resolves to either a documented target or an
  // explicit ignore, so adding a state or an input cannot silently leave a hole.
  describe('transition matrix', () => {
    const probes: Record<SignalMachineInput['type'], SignalMachineInput> = {
      connect: { type: 'connect' },
      connectComplete: { type: 'connectComplete' },
      connectFailed: { type: 'connectFailed' },
      reconnect: { type: 'reconnect' },
      reconnectComplete: { type: 'reconnectComplete' },
      reconnectFailed: { type: 'reconnectFailed', recoverable: true },
      transportFailed: { type: 'transportFailed', attemptId: 0, reason: 'probe' },
      close: { type: 'close', reason: 'probe' },
      closeComplete: { type: 'closeComplete' },
    };

    it('matches the documented table', () => {
      const matrix: Record<string, Record<string, SignalLifecycleState | 'ignored'>> = {};
      for (const state of signalLifecycleStates) {
        matrix[state] = {};
        for (const [type, probe] of Object.entries(probes)) {
          const machine = machineIn(state);
          // the probe carries the live attempt id, so only the state gates the transition
          const input =
            probe.type === 'transportFailed'
              ? { ...probe, attemptId: machine.context.attemptId }
              : probe;
          const before = machine.currentState();
          send(machine, input);
          const after = machine.currentState();
          matrix[state][type] = after === before ? 'ignored' : after;
        }
      }

      expect(matrix).toEqual({
        new: {
          connect: 'connecting',
          reconnect: 'reconnecting',
          close: 'disconnecting',
          connectComplete: 'ignored',
          connectFailed: 'ignored',
          reconnectComplete: 'ignored',
          reconnectFailed: 'ignored',
          transportFailed: 'ignored',
          closeComplete: 'ignored',
        },
        connecting: {
          connect: 'ignored', // re-enters connecting: same state, new attempt id
          reconnect: 'reconnecting',
          connectComplete: 'connected',
          connectFailed: 'closed',
          close: 'disconnecting',
          reconnectComplete: 'ignored',
          reconnectFailed: 'ignored',
          transportFailed: 'ignored',
          closeComplete: 'ignored',
        },
        connected: {
          connect: 'connecting',
          reconnect: 'reconnecting',
          transportFailed: 'offline',
          close: 'disconnecting',
          connectComplete: 'ignored',
          connectFailed: 'ignored',
          reconnectComplete: 'ignored',
          reconnectFailed: 'ignored',
          closeComplete: 'ignored',
        },
        offline: {
          connect: 'connecting',
          reconnect: 'reconnecting',
          close: 'disconnecting',
          connectComplete: 'ignored',
          connectFailed: 'ignored',
          reconnectComplete: 'ignored',
          reconnectFailed: 'ignored',
          transportFailed: 'ignored',
          closeComplete: 'ignored',
        },
        reconnecting: {
          connect: 'connecting',
          reconnect: 'ignored', // re-enters reconnecting: same state, new attempt id
          reconnectComplete: 'connected',
          reconnectFailed: 'offline', // probe is recoverable; terminal goes to closed
          close: 'disconnecting',
          connectComplete: 'ignored',
          connectFailed: 'ignored',
          transportFailed: 'ignored',
          closeComplete: 'ignored',
        },
        disconnecting: {
          connect: 'connecting',
          reconnect: 'reconnecting',
          closeComplete: 'closed',
          connectComplete: 'ignored',
          connectFailed: 'ignored',
          reconnectComplete: 'ignored',
          reconnectFailed: 'ignored',
          transportFailed: 'ignored',
          close: 'ignored',
        },
        closed: {
          connect: 'connecting',
          reconnect: 'reconnecting',
          connectComplete: 'ignored',
          connectFailed: 'ignored',
          reconnectComplete: 'ignored',
          reconnectFailed: 'ignored',
          transportFailed: 'ignored',
          close: 'ignored',
          closeComplete: 'ignored',
        },
      });
    });
  });
});
