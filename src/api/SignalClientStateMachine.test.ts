// eslint-disable-next-line import-x/no-duplicates
import 'machina-test';
// eslint-disable-next-line import-x/no-duplicates
import { walkAll } from 'machina-test';
import { describe, expect, it } from 'vitest';
import {
  type SignalLifecycleState,
  type SignalMachine,
  type SignalMachineContext,
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

type TransitionTarget = SignalLifecycleState | 'ignored';

/**
 * Every state/input pair and what it resolves to. Asserted exhaustively below, and used as the
 * oracle for the random walks, so adding a state or an input cannot silently leave a hole.
 */
const documentedTransitions: Record<string, Record<string, TransitionTarget>> = {
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
};

/**
 * The one cell whose target depends on the payload rather than the state alone. The walks vary
 * `recoverable`, so both outcomes are legal there; the matrix test pins the payload and asserts the
 * exact target. (`transportFailed` is payload-dependent too, but its stale-id outcome is no
 * transition at all, so it never reaches a walk invariant.)
 */
const payloadDependent: Record<string, Array<TransitionTarget>> = {
  'reconnecting.reconnectFailed': ['offline', 'closed'],
};

/**
 * Deterministic payload generators for the walks: handlers that read their payload would throw on
 * a bare `handle(input)`, and a counter rather than a random value keeps a seed reproducible.
 *
 * `transportFailed` cycles through attempt ids so walks exercise both the live transport and one
 * that has already been replaced.
 */
function walkPayloads() {
  let attemptId = 0;
  let recoverable = true;
  return {
    connectFailed: () => ({ type: 'connectFailed', error: new Error('walk') }),
    reconnectFailed: () => {
      recoverable = !recoverable;
      return { type: 'reconnectFailed', error: new Error('walk'), recoverable };
    },
    transportFailed: () => {
      attemptId = (attemptId + 1) % 4;
      return { type: 'transportFailed', attemptId, reason: 'walk' };
    },
    close: () => ({ type: 'close', reason: 'walk' }),
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

  // Topology: assertions about the wiring, independent of which handlers happen to fire.
  describe('graph', () => {
    it('has no unreachable states', () => {
      expect(createSignalMachine()).toHaveNoUnreachableStates();
    });

    it('can recover to connected from anywhere, so no state is a dead end', () => {
      for (const from of signalLifecycleStates) {
        expect(createSignalMachine()).toAlwaysReach('connected', { from });
      }
    });

    it('never returns to new once a session has been started', () => {
      for (const from of signalLifecycleStates.filter((state) => state !== 'new')) {
        expect(createSignalMachine()).toNeverReach('new', { from });
      }
    });
  });

  describe('initial connect', () => {
    it('treats failure as terminal, since there is no session to fall back on', () => {
      const machine = machineIn('connecting');
      send(machine, { type: 'connectFailed', error: new Error('nope') });
      expect(machine.currentState()).toBe('closed');
      expect(machine.context.lastError).toBeInstanceOf(Error);
    });
  });

  describe('transport loss', () => {
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

    it('reports unhandled inputs so they can be logged rather than thrown', () => {
      const machine = machineIn('closed');
      const unhandled: Array<string> = [];
      machine.on('nohandler', ({ inputName }) => unhandled.push(inputName));
      send(machine, { type: 'closeComplete' });
      expect(unhandled).toEqual(['closeComplete']);
    });
  });

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
      const matrix: Record<string, Record<string, TransitionTarget>> = {};
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

      expect(matrix).toEqual(documentedTransitions);
    });
  });

  // Random input sequences, checked against the properties the lifecycle is supposed to hold.
  // Seeded, so a failure replays exactly; the seed is reported in the failure either way.
  describe('random walks', () => {
    it('only ever takes transitions the table documents', () => {
      walkAll(createSignalMachine, {
        seed: 20260818,
        walks: 200,
        maxSteps: 25,
        inputs: walkPayloads(),
        invariant({ state, previousState, input }) {
          const actual = state === previousState ? 'ignored' : state;
          const allowed = payloadDependent[`${previousState}.${input}`] ?? [
            documentedTransitions[previousState]?.[input],
          ];
          if (!allowed.includes(actual)) {
            throw new Error(
              `${previousState} --${input}--> ${state}, but the table documents ${allowed.join(' or ')}`,
            );
          }
        },
      });
    });

    it('never starts a recovery attempt that was not requested', () => {
      walkAll(() => machineIn('connected'), {
        seed: 20260818,
        walks: 200,
        maxSteps: 25,
        // the two inputs that ask for recovery; everything else is an outcome or a close
        exclude: ['connect', 'reconnect'],
        inputs: walkPayloads(),
        invariant({ state, previousState, input }) {
          if (state === 'connecting' || state === 'reconnecting') {
            throw new Error(`entered ${state} from ${previousState} on ${input}, unrequested`);
          }
        },
      });
    });

    it('keeps the attempt id monotonic, so a replaced transport stays distinguishable', () => {
      // keyed on the context object: each walk gets a fresh machine, and the invariant only runs
      // on transitions, so `step` cannot be used to tell one walk from the next
      const highest = new WeakMap<SignalMachineContext, number>();
      walkAll(createSignalMachine, {
        seed: 20260818,
        walks: 200,
        maxSteps: 25,
        inputs: walkPayloads(),
        invariant({ ctx }) {
          const context = ctx as SignalMachineContext;
          const previous = highest.get(context) ?? 0;
          if (context.attemptId < previous) {
            throw new Error(`attempt id went backwards: ${previous} -> ${context.attemptId}`);
          }
          highest.set(context, context.attemptId);
        },
      });
    });

    it('always knows why it is closing', () => {
      walkAll(createSignalMachine, {
        seed: 20260818,
        walks: 200,
        maxSteps: 25,
        inputs: walkPayloads(),
        invariant({ state, ctx }) {
          const { closeReason } = ctx as SignalMachineContext;
          if (state === 'disconnecting' && closeReason === undefined) {
            throw new Error('reached disconnecting without a reason');
          }
        },
      });
    });
  });
});
