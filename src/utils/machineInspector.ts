/**
 * Opt-in registry that lets a development tool observe the state machines driving the connection
 * layer.
 *
 * The machines are private to the objects that own them and, more importantly, do not outlive them:
 * a full reconnect replaces the whole engine along with its `SignalClient`, so anything watching a
 * single machine reference goes blind exactly when the interesting part starts. Machines therefore
 * announce themselves here as they are constructed, and a subscriber sees the whole succession.
 *
 * Nothing is recorded until {@link enableMachineInspector} is called, which no shipping code does —
 * with the registry off, announcing is a comparison and a return.
 */

/**
 * The slice of machina's `Fsm` surface an inspector needs. Structural rather than machina's own
 * type so that any machine satisfies it regardless of its state and input unions.
 */
export interface InspectableMachine {
  readonly id: string;
  readonly initialState: string;
  readonly states: Record<string, Record<string, unknown>>;
  readonly context?: unknown;
  currentState(): string;
  canHandle(input: string): boolean;
  on(eventName: string, callback: (data: any) => void): { off(): void };
}

export interface MachineAnnouncement {
  /** What the machine drives, e.g. `signal`. Not unique: each new `SignalClient` announces one. */
  label: string;
  /** How many machines have been announced before this one, so successive instances are tellable apart. */
  seq: number;
  /**
   * When the machine was constructed. Carried on the announcement because subscribers receive the
   * recorded ones on subscribe, and stamping those at replay time would date them all to whenever
   * the tool happened to open.
   */
  at: number;
  machine: InspectableMachine;
}

/** Kept small: enough for a panel opened mid-session to see how the connection got where it is. */
const HISTORY_LIMIT = 16;

let enabled = false;
let announced: MachineAnnouncement[] = [];
let subscribers: Array<(announcement: MachineAnnouncement) => void> = [];

/**
 * Starts recording machine announcements. Call before the machines of interest are constructed —
 * for the signal machine that means before the `Room` is created.
 */
export function enableMachineInspector() {
  enabled = true;
}

export function isMachineInspectorEnabled() {
  return enabled;
}

/** Announces a machine to whatever is watching. A no-op unless the inspector was enabled. */
export function announceMachine(label: string, machine: InspectableMachine) {
  if (!enabled) {
    return;
  }
  const announcement: MachineAnnouncement = {
    label,
    seq: announced.length,
    at: Date.now(),
    machine,
  };
  announced = [...announced.slice(-(HISTORY_LIMIT - 1)), announcement];
  for (const subscriber of subscribers) {
    subscriber(announcement);
  }
}

/**
 * Subscribes to machine announcements, replaying the ones already recorded so that a panel opened
 * after connecting still sees the machine currently in charge. Returns an unsubscribe function.
 */
export function onMachineAnnounced(callback: (announcement: MachineAnnouncement) => void) {
  subscribers = [...subscribers, callback];
  for (const announcement of announced) {
    callback(announcement);
  }
  return () => {
    subscribers = subscribers.filter((subscriber) => subscriber !== callback);
  };
}
