import { type StateGraph, buildStateGraph } from 'machina-inspect';
import mermaid from 'mermaid';

/**
 * The slice of machina's `Fsm` surface needed to draw a machine and say what it would accept.
 * Structural rather than machina's own `Fsm` type so that any machine satisfies it regardless of its
 * state and input unions — and deliberately read-only, so a live machine can be rendered without
 * handing the renderer a way to drive it.
 */
export interface MachineShape {
  readonly id: string;
  readonly initialState: string;
  readonly states: Record<string, Record<string, unknown>>;
  readonly context?: unknown;
  currentState(): string;
  canHandle(input: string): boolean;
}

/** A machine the caller may also drive, as the playground does. */
export interface InspectableFsm extends MachineShape {
  handle(input: string, ...args: unknown[]): void;
}

/** Keys in a machina state definition that are lifecycle hooks rather than inputs. */
const RESERVED = new Set(['_onEnter', '_onExit', '_child', '*']);

/** Every input the machine declares in any state, so illegal ones can be shown too. */
export function allInputs(fsm: MachineShape): string[] {
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
export function ubiquitousInputs(graph: StateGraph): string[] {
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

/** Where an input leads from `state`, as the graph sees it. */
export function destination(graph: StateGraph, state: string, input: string): string {
  const targets = (graph.nodes[state]?.edges ?? []).filter((edge) => edge.inputName === input);
  if (targets.length === 0) {
    // a handler exists but never returns a state the analysis can see
    return '?';
  }
  return targets
    .map((edge) => `${edge.to}${edge.confidence === 'possible' ? '?' : ''}`)
    .join(' | ');
}

export function toMermaid(graph: StateGraph, current: string, hidden: string[]): string {
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

let initialized = false;
let diagramId = 0;

/**
 * Renders the machine's graph with `current` lit, returning the SVG markup rather than mounting it:
 * that is what lets the same diagram be shown in another window's document.
 *
 * `foldUbiquitous` hides the inputs that are legal from every state, which would otherwise add
 * O(states) edges each and swamp the shape of the machine. They come back in the return value so a
 * caller can say which ones it hid.
 */
export async function renderDiagram(
  fsm: MachineShape,
  current: string,
  { foldUbiquitous = true }: { foldUbiquitous?: boolean } = {},
): Promise<{ svg: string; graph: StateGraph; ubiquitous: string[] }> {
  if (!initialized) {
    mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
    initialized = true;
  }
  const graph = buildStateGraph(fsm);
  const ubiquitous = ubiquitousInputs(graph);
  diagramId += 1;
  const { svg } = await mermaid.render(
    `machine-diagram-${diagramId}`,
    toMermaid(graph, current, foldUbiquitous ? ubiquitous : []),
  );
  return { svg, graph, ubiquitous };
}

export type { StateGraph };
