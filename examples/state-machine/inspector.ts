import { type StateGraph, buildStateGraph } from 'machina-inspect';
import mermaid from 'mermaid';

/**
 * The slice of machina's `Fsm` surface the inspector needs. Structural rather than machina's own
 * `Fsm` type so that any machine satisfies it regardless of its state and input unions.
 */
export interface InspectableFsm {
  readonly id: string;
  readonly initialState: string;
  readonly states: Record<string, Record<string, unknown>>;
  readonly context?: unknown;
  currentState(): string;
  canHandle(input: string): boolean;
  handle(input: string, ...args: unknown[]): void;
}

/**
 * A machina FSM registered with the inspector. Nothing here is specific to a particular machine:
 * states, inputs and edges are all derived from the machine itself.
 */
export interface MachineRegistration<TFsm extends InspectableFsm = InspectableFsm> {
  /** Shown in the picker. */
  name: string;
  /** Called for the initial mount and on every reset, so each run starts from a clean context. */
  create: () => TFsm;
  /**
   * Default payload per input, built at render time so it can address live state — the signal
   * machine's `connectComplete`, for instance, has to carry the current attempt id. The value is
   * passed to `handle(input, payload)` as the single extra argument. Inputs with no entry here are
   * fired without a payload.
   */
  payloads?: Record<string, (fsm: TFsm) => unknown>;
  /** Optional prose rendered above the diagram. */
  description?: string;
}

/**
 * Registers a machine, keeping the payload builders typed against its concrete context while
 * handing the inspector the erased form. One cast, in one place.
 */
export function defineMachine<TFsm extends InspectableFsm>(
  registration: MachineRegistration<TFsm>,
): MachineRegistration {
  return registration as unknown as MachineRegistration;
}

/** Keys in a machina state definition that are lifecycle hooks rather than inputs. */
const RESERVED = new Set(['_onEnter', '_onExit', '_child', '*']);

type Outcome = 'moved' | 'declined' | 'unhandled';

interface LogEntry {
  input: string;
  from: string;
  to: string;
  outcome: Outcome;
}

/** Every input the machine declares in any state, so illegal ones can be fired too. */
function allInputs(fsm: InspectableFsm): string[] {
  const names = new Set<string>();
  for (const definition of Object.values(fsm.states)) {
    for (const key of Object.keys(definition)) {
      if (!RESERVED.has(key)) {
        names.add(key);
      }
    }
  }
  return [...names];
}

/**
 * Inputs every state handles. In a machine where some input is legal everywhere — a connect that may
 * restart from any state, a cancel — those edges alone are O(states) and swamp the diagram, so they
 * can be folded away without losing the shape of the machine.
 */
function ubiquitousInputs(graph: StateGraph): string[] {
  const stateCount = Object.keys(graph.nodes).length;
  const sources = new Map<string, Set<string>>();
  for (const node of Object.values(graph.nodes)) {
    for (const edge of node.edges) {
      const seen = sources.get(edge.inputName) ?? new Set<string>();
      seen.add(edge.from);
      sources.set(edge.inputName, seen);
    }
  }
  return [...sources.entries()]
    .filter(([, froms]) => froms.size === stateCount)
    .map(([input]) => input);
}

function toMermaid(graph: StateGraph, current: string, hidden: string[]): string {
  const lines = ['stateDiagram-v2', `  [*] --> ${graph.initialState}`];
  for (const node of Object.values(graph.nodes)) {
    for (const edge of node.edges) {
      if (hidden.includes(edge.inputName)) {
        continue;
      }
      // a "possible" edge is one the handler only takes conditionally, so it is marked as such
      const label = edge.confidence === 'possible' ? `${edge.inputName} ?` : edge.inputName;
      lines.push(`  ${edge.from} --> ${edge.to} : ${label}`);
    }
  }
  lines.push('  classDef current fill:#2563eb,stroke:#1e40af,color:#fff,font-weight:bold');
  lines.push(`  class ${current} current`);
  return lines.join('\n');
}

export function mountInspector(root: HTMLElement, machines: MachineRegistration[]) {
  if (machines.length === 0) {
    throw new Error('mountInspector needs at least one machine');
  }

  mermaid.initialize({ startOnLoad: false, theme: 'neutral' });

  let registration = machines[0];
  let fsm = registration.create();
  let log: LogEntry[] = [];
  let diagramId = 0;
  let foldUbiquitous = true;

  root.innerHTML = `
    <header>
      <h1>machina inspector</h1>
      <div class="controls">
        <select id="machine"></select>
        <button id="reset" type="button">reset</button>
      </div>
    </header>
    <p id="description"></p>
    <main>
      <section class="diagram">
        <div id="diagram"></div>
        <p class="legend">
          <code>?</code> marks a transition the handler only takes conditionally.
          <label id="fold-label" hidden>
            <input type="checkbox" id="fold" checked />
            <span></span>
          </label>
        </p>
      </section>
      <aside>
        <h2>state <output id="state"></output></h2>
        <h3>inputs</h3>
        <div id="inputs" class="inputs"></div>
        <h3>payload</h3>
        <textarea id="payload" rows="5" spellcheck="false"></textarea>
        <p id="payload-error" class="error"></p>
        <h3>context</h3>
        <pre id="context"></pre>
        <h3>log</h3>
        <ol id="log" class="log"></ol>
      </aside>
    </main>
  `;

  const el = <T extends HTMLElement>(id: string) => root.querySelector(`#${id}`) as T;
  const picker = el<HTMLSelectElement>('machine');
  const payloadBox = el<HTMLTextAreaElement>('payload');
  const payloadError = el<HTMLParagraphElement>('payload-error');

  picker.innerHTML = machines
    .map((machine, index) => `<option value="${index}">${machine.name}</option>`)
    .join('');
  picker.hidden = machines.length < 2;

  /** The input whose payload the textarea is currently showing. */
  let selectedInput: string | undefined;

  function defaultPayload(input: string) {
    return registration.payloads?.[input]?.(fsm);
  }

  function showPayloadFor(input: string) {
    selectedInput = input;
    const payload = defaultPayload(input);
    payloadBox.value = payload === undefined ? '' : JSON.stringify(payload, null, 2);
    payloadBox.placeholder = payload === undefined ? `${input} takes no payload` : '';
    payloadError.textContent = '';
  }

  function fire(input: string) {
    let payload: unknown;
    if (selectedInput === input && payloadBox.value.trim() !== '') {
      try {
        payload = JSON.parse(payloadBox.value);
      } catch (e) {
        payloadError.textContent = `payload is not valid JSON: ${(e as Error).message}`;
        return;
      }
    } else {
      payload = defaultPayload(input);
    }

    // three outcomes worth telling apart: no handler at all, a handler that ran but declined to
    // return a state, and a real transition
    const unhandled = !fsm.canHandle(input);
    const from = fsm.currentState();
    if (payload === undefined) {
      fsm.handle(input);
    } else {
      fsm.handle(input, payload);
    }
    const to = fsm.currentState();

    log = [
      ...log,
      { input, from, to, outcome: unhandled ? 'unhandled' : from === to ? 'declined' : 'moved' },
    ];
    render();
  }

  async function render() {
    const current = fsm.currentState();
    el('state').textContent = current;
    el('description').textContent = registration.description ?? '';
    el('context').textContent = JSON.stringify(fsm.context ?? {}, null, 2);

    const graph = buildStateGraph(fsm);
    const outbound = graph.nodes[current]?.edges ?? [];

    /** Where an input leads from here, as the graph sees it. */
    function destination(input: string) {
      const targets = outbound.filter((edge) => edge.inputName === input);
      if (targets.length === 0) {
        // a handler exists but never returns a state the analysis can see
        return '?';
      }
      return targets
        .map((edge) => `${edge.to}${edge.confidence === 'possible' ? '?' : ''}`)
        .join(' | ');
    }

    // One row in a fixed order, so a button never moves as the state changes — only whether it is
    // lit. The label stays the input name alone for the same reason: a varying label would reflow
    // the row. Where a lit input leads is on its tooltip.
    const inputs = el('inputs');
    inputs.innerHTML = '';
    for (const input of allInputs(fsm)) {
      const handled = fsm.canHandle(input);
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = input;
      button.className = handled ? 'legal' : 'illegal';
      button.title = handled
        ? `${input} → ${destination(input)}`
        : `${input} is not handled in '${current}' — firing it will be dropped`;
      button.addEventListener('click', () => fire(input));
      button.addEventListener('pointerenter', () => showPayloadFor(input));
      inputs.append(button);
    }

    const logList = el('log');
    logList.innerHTML = log
      .slice(-12)
      .reverse()
      .map(
        (entry) =>
          `<li class="${entry.outcome}"><code>${entry.input}</code> ${
            entry.outcome === 'moved' ? `${entry.from} → ${entry.to}` : entry.outcome
          }</li>`,
      )
      .join('');

    const ubiquitous = ubiquitousInputs(graph);
    const foldLabel = el<HTMLLabelElement>('fold-label');
    foldLabel.hidden = ubiquitous.length === 0;
    (foldLabel.querySelector('span') as HTMLSpanElement).textContent =
      `fold away ${ubiquitous.join(', ')} (legal from every state)`;

    diagramId += 1;
    const { svg } = await mermaid.render(
      `diagram-${diagramId}`,
      toMermaid(graph, current, foldUbiquitous ? ubiquitous : []),
    );
    el('diagram').innerHTML = svg;
  }

  function reset() {
    fsm = registration.create();
    log = [];
    selectedInput = undefined;
    payloadBox.value = '';
    render();
  }

  picker.addEventListener('change', () => {
    registration = machines[Number(picker.value)];
    reset();
  });
  el('reset').addEventListener('click', reset);
  el<HTMLInputElement>('fold').addEventListener('change', (event) => {
    foldUbiquitous = (event.target as HTMLInputElement).checked;
    render();
  });

  render();
}
