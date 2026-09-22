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
- **Every declared input** as a button, in one fixed row that never reorders — only whether a button
  is lit changes as you move. Lit means the current state handles it, straight from `canHandle`;
  hovering shows where it leads. Unlit ones stay clickable, because firing an input the state does
  not handle and watching it get dropped is the interesting case. Read legality from the buttons
  rather than off the diagram: mermaid routes long edges through shared corridors, so an edge label
  can render nowhere near its source node, which makes "can I do X from here?" easy to misread off
  the picture.
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

## Watching a real session instead

The playground drives a machine you construct. To watch the machines a _live_ session is driving,
run the demo (`pnpm examples:demo`) and press **State machines** — the panel there subscribes to
`src/utils/machineInspector`, which every machine announces itself to, and renders the same diagram
this page does via `examples/shared/machineGraph.ts`.

The two views are deliberately different in one respect: the playground fires inputs into the
machine, the panel never does. Its fault buttons close the real socket or ask the server for a
scenario, so the machine is always reacting to something that actually happened.
