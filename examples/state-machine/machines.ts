import { createSignalMachine } from '../../src/api/SignalClientStateMachine';
import { type MachineRegistration, defineMachine } from './inspector';

/**
 * Machines available in the inspector. Add an entry to inspect another machina FSM: the inspector
 * derives states, inputs and edges from the machine itself, so only the payloads need describing.
 */
export const machines: MachineRegistration[] = [
  defineMachine({
    name: 'signal connection',
    description:
      'The lifecycle driving SignalClient. Transport-originated inputs carry the attempt they ' +
      'belong to — edit attemptId to something stale and watch the input get declined.',
    create: createSignalMachine,
    payloads: {
      connectComplete: (fsm) => ({
        type: 'connectComplete',
        attemptId: fsm.context.attemptId,
      }),
      reconnectComplete: (fsm) => ({
        type: 'reconnectComplete',
        attemptId: fsm.context.attemptId,
      }),
      connectFailed: () => ({ type: 'connectFailed', error: 'inspector' }),
      reconnectFailed: () => ({
        type: 'reconnectFailed',
        error: 'inspector',
        recoverable: true,
      }),
      transportFailed: (fsm) => ({
        type: 'transportFailed',
        attemptId: fsm.context.attemptId,
        reason: 'inspector',
      }),
      close: () => ({ type: 'close', reason: 'inspector' }),
    },
  }),
];
