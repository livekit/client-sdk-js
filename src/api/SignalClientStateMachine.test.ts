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
  const machine = createSignalMachine(state);
  expect(machine.currentState()).toBe(state);
  return machine;
}

type TransitionTarget = SignalLifecycleState | 'ignored';

/**
 * Every state/input pair and what it resolves to. Asserted exhaustively below, and used as the
 * oracle for the random walks, so adding a state or an input cannot silently leave a hole.
 */
const documentedTransitions: Record<string, Record<string, TransitionTarget>> = {
  // Establishing a session is legal exactly where no transport and no attempt are in play: `new`,
  // `offline`, `closed`. Elsewhere it is a caller error, and `SignalClient` refuses rather than
  // opening a transport the lifecycle would not own — except from `disconnecting`, which it waits out.
  new: {
    connect: 'connecting',
    close: 'disconnecting',
    reconnect: 'ignored', // nothing to resume yet
    connectComplete: 'ignored',
    connectFailed: 'ignored',
    reconnectComplete: 'ignored',
    reconnectFailed: 'ignored',
    transportFailed: 'ignored',
    closeComplete: 'ignored',
  },
  connecting: {
    connectComplete: 'connected',
    connectFailed: 'closed',
    close: 'disconnecting',
    connect: 'ignored', // an attempt is in flight; starting another abandons it
    reconnect: 'ignored',
    reconnectComplete: 'ignored',
    reconnectFailed: 'ignored',
    transportFailed: 'ignored',
    closeComplete: 'ignored',
  },
  connected: {
    reconnect: 'reconnecting', // the peer connection was severed while signalling stayed up
    transportFailed: 'offline',
    close: 'disconnecting',
    connect: 'ignored', // close this session before starting another
    connectComplete: 'ignored',
    connectFailed: 'ignored',
    reconnectComplete: 'ignored',
    reconnectFailed: 'ignored',
    closeComplete: 'ignored',
  },
  offline: {
    connect: 'connecting', // escalation: give up on the session and join a new one
    reconnect: 'reconnecting', // the retry the engine drives after its backoff
    close: 'disconnecting',
    connectComplete: 'ignored',
    connectFailed: 'ignored',
    reconnectComplete: 'ignored',
    reconnectFailed: 'ignored',
    transportFailed: 'ignored',
    closeComplete: 'ignored',
  },
  reconnecting: {
    reconnectComplete: 'connected',
    reconnectFailed: 'offline', // probe is recoverable; terminal goes to closed
    close: 'disconnecting',
    connect: 'ignored', // an attempt is in flight
    reconnect: 'ignored',
    connectComplete: 'ignored',
    connectFailed: 'ignored',
    transportFailed: 'ignored',
    closeComplete: 'ignored',
  },
  // Establishing here would race the teardown for the transport, so callers wait for the close to
  // settle and establish from `closed` instead.
  disconnecting: {
    closeComplete: 'closed',
    connect: 'ignored',
    reconnect: 'ignored',
    connectComplete: 'ignored',
    connectFailed: 'ignored',
    reconnectComplete: 'ignored',
    reconnectFailed: 'ignored',
    transportFailed: 'ignored',
    close: 'ignored',
  },
  closed: {
    connect: 'connecting',
    reconnect: 'reconnecting', // a closed transport does not end the session; the engine resumes
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
 * A machine factory paired with deterministic payload generators. Handlers that read their payload
 * would throw on a bare `handle(input)`, and alternating rather than random values keep a seed
 * reproducible.
 *
 * The generators read the machine the factory last produced, so attempt-scoped inputs can address
 * the live attempt. `transportFailed` alternates between the live attempt and a stale one, so walks
 * exercise the identity guard from both sides.
 */
function walkSetup(create: () => SignalMachine = createSignalMachine) {
  let machine: SignalMachine | undefined;
  let recoverable = true;
  let stale = false;
  const liveAttemptId = () => machine?.context.attemptId ?? 0;
  return {
    factory: () => {
      machine = create();
      return machine;
    },
    inputs: {
      connectComplete: () => ({ type: 'connectComplete', attemptId: liveAttemptId() }),
      reconnectComplete: () => ({ type: 'reconnectComplete', attemptId: liveAttemptId() }),
      connectFailed: () => ({ type: 'connectFailed', error: new Error('walk') }),
      reconnectFailed: () => {
        recoverable = !recoverable;
        return { type: 'reconnectFailed', error: new Error('walk'), recoverable };
      },
      transportFailed: () => {
        stale = !stale;
        return {
          type: 'transportFailed',
          attemptId: stale ? liveAttemptId() - 1 : liveAttemptId(),
          reason: 'walk',
        };
      },
      close: () => ({ type: 'close', reason: 'walk' }),
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

    it('ignores a completion from an attempt that has been superseded', () => {
      // the abort-then-retry sequence: an attempt is abandoned, a new one starts, and the first
      // one's transport reports success afterwards
      const machine = machineIn('connecting');
      const abandonedAttemptId = machine.context.attemptId;
      send(machine, { type: 'connectFailed', error: new Error('aborted') });
      send(machine, { type: 'connect' });

      send(machine, { type: 'connectComplete', attemptId: abandonedAttemptId });

      // still establishing: the abandoned attempt cannot declare the session live
      expect(machine.currentState()).toBe('connecting');
      send(machine, { type: 'connectComplete', attemptId: machine.context.attemptId });
      expect(machine.currentState()).toBe('connected');
    });

    it('ignores a resume completion from an attempt that has been superseded', () => {
      // a resume starts while the transport of the previous attempt is still reporting in
      const machine = machineIn('offline');
      const supersededAttemptId = machine.context.attemptId;
      send(machine, { type: 'reconnect' });

      send(machine, { type: 'reconnectComplete', attemptId: supersededAttemptId });

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
      send(machine, { type: 'reconnectComplete', attemptId: machine.context.attemptId });
      expect(machine.currentState()).toBe('connected');
    });

    it('closes on a terminal failure', () => {
      const machine = machineIn('reconnecting');
      send(machine, { type: 'reconnectFailed', recoverable: false });
      expect(machine.currentState()).toBe('closed');
    });

    it('is legal after a close, because a closed transport does not end the session', () => {
      // the engine's recovery path after an unexpected close: close() takes the client to `closed`,
      // then onClose has the engine resume the session it still holds
      const machine = machineIn('connected');
      send(machine, { type: 'close', reason: 'transport lost' });
      send(machine, { type: 'closeComplete' });
      expect(machine.currentState()).toBe('closed');

      send(machine, { type: 'reconnect' });
      expect(machine.currentState()).toBe('reconnecting');
      send(machine, { type: 'reconnectComplete', attemptId: machine.context.attemptId });
      expect(machine.currentState()).toBe('connected');
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

    it('bumps the attempt id for every attempt, so transports stay distinguishable', () => {
      const machine = machineIn('offline');
      const first = machine.context.attemptId;

      send(machine, { type: 'reconnect' });
      expect(machine.context.attemptId).toBe(first + 1);

      send(machine, { type: 'reconnectFailed', recoverable: true });
      send(machine, { type: 'connect' });
      expect(machine.context.attemptId).toBe(first + 2);
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
      connectComplete: { type: 'connectComplete', attemptId: 0 },
      connectFailed: { type: 'connectFailed' },
      reconnect: { type: 'reconnect' },
      reconnectComplete: { type: 'reconnectComplete', attemptId: 0 },
      reconnectFailed: { type: 'reconnectFailed', recoverable: true },
      transportFailed: { type: 'transportFailed', attemptId: 0, reason: 'probe' },
      close: { type: 'close', reason: 'probe' },
      closeComplete: { type: 'closeComplete' },
    };

    it('agrees with canHandle, which is what tooling highlights as available', () => {
      // The inspector example lights up an input when `canHandle` is true. That highlight is only
      // trustworthy if it matches the table, so pin the two together: an input is handled exactly
      // where the table gives it a target. (Holds because no current handler declines under the
      // matrix probes — one that did would belong in `payloadDependent`.)
      for (const state of signalLifecycleStates) {
        const machine = machineIn(state);
        const handled = Object.keys(probes).filter((input) => machine.canHandle(input));
        const documented = Object.entries(documentedTransitions[state])
          .filter(([, target]) => target !== 'ignored')
          .map(([input]) => input);
        expect(handled.sort()).toEqual(documented.sort());
      }
    });

    it('matches the documented table', () => {
      const matrix: Record<string, Record<string, TransitionTarget>> = {};
      for (const state of signalLifecycleStates) {
        matrix[state] = {};
        for (const [type, probe] of Object.entries(probes)) {
          const machine = machineIn(state);
          // attempt-scoped probes address the live attempt, so only the state gates the transition
          const input =
            'attemptId' in probe ? { ...probe, attemptId: machine.context.attemptId } : probe;
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
      const { factory, inputs } = walkSetup();
      walkAll(factory, {
        seed: 20260818,
        walks: 200,
        maxSteps: 25,
        inputs,
        invariant({ state, previousState, input }) {
          const actual: TransitionTarget =
            state === previousState ? 'ignored' : (state as TransitionTarget);
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
      const { factory, inputs } = walkSetup(() => machineIn('connected'));
      walkAll(factory, {
        seed: 20260818,
        walks: 200,
        maxSteps: 25,
        // the two inputs that ask for recovery; everything else is an outcome or a close
        exclude: ['connect', 'reconnect'],
        inputs,
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
      const { factory, inputs } = walkSetup();
      walkAll(factory, {
        seed: 20260818,
        walks: 200,
        maxSteps: 25,
        inputs,
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
      const { factory, inputs } = walkSetup();
      walkAll(factory, {
        seed: 20260818,
        walks: 200,
        maxSteps: 25,
        inputs,
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
