# machina inspector

Renders a [machina](https://machina-js.org) FSM and lets you drive it by hand: fire inputs, watch
the state move, and see what the machine does with an input it does not want.

```bash
pnpm examples:machine
```

## What it shows

- **The graph**, derived from the machine itself via `machina-inspect`'s `buildStateGraph`, with the
  current state highlighted. `?` marks an edge the handler only takes conditionally. Inputs that are
  legal from _every_ state are folded away by default — in a machine where some input can fire from
  anywhere, those edges alone swamp the diagram.
- **Every declared input** as a button, whether or not the current state handles it. Handled ones are
  solid, the rest dashed: firing one you cannot fire is the interesting case.
- **The payload**, prefilled from the machine's registration and editable before firing. This is how
  you exercise payload-dependent behaviour — send a stale id to an identity-guarded input and watch
  it get declined.
- **The context**, live.
- **A log** that distinguishes the three outcomes: a real transition, `declined` (a handler ran but
  returned no state — usually a guard), and `unhandled` (no handler in this state at all). A dropped
  input is silent in the machine itself; here it is visible.

## Adding a machine

The inspector derives states, inputs and edges from the machine, so a registration only has to say
how to build it and what its inputs expect as a payload. Add an entry to `machines.ts`:

```ts
defineMachine({
  name: 'my machine',
  create: createMyMachine,
  payloads: {
    // built at render time, so it can address live context
    someInput: (fsm) => ({ type: 'someInput', id: fsm.context.currentId }),
  },
});
```

`defineMachine` keeps the payload builders typed against that machine's own context. Inputs with no
entry are fired without a payload. With more than one machine registered, a picker appears.
