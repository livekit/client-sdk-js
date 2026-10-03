import { ConnectionState, type Room, RoomEvent } from '../../src/index';
import type { SimulationScenario } from '../../src/room/types';
import {
  type InspectableMachine,
  type MachineAnnouncement,
  onMachineAnnounced,
} from '../../src/utils/machineInspector';
import { type StateGraph, allInputs, destination, renderDiagram } from '../shared/machineGraph';
import { PANEL_STYLES } from './machinePanelStyles';

/**
 * Live view of the state machines driving a real session.
 *
 * It runs in a popup window but in the demo's JavaScript context, so it reads the machines directly
 * — no serialisation, no second copy of the machine to drift from the first. The window is only a
 * surface: everything it renders is the machine as it is right now.
 *
 * Deliberately read-only towards the machine. The fault buttons act on the transport and on the
 * server instead, so what the timeline shows is the machine reacting to something that really
 * happened. Injecting inputs straight into a live machine would produce a machine that disagrees
 * with its own socket, and any bug seen after that is an artefact of the injection.
 */

type EntryKind = 'machine' | 'declined' | 'room' | 'attach';

interface TimelineEntry {
  at: number;
  /**
   * Insertion order. `Date.now()` has millisecond resolution and these chains are finer than that —
   * a fault and the transition it causes routinely share a timestamp — so ordering within a
   * millisecond needs a counter. It cannot be the primary key: a replayed announcement carries the
   * time the machine was created, which is older than entries recorded before it was replayed.
   */
  n: number;
  kind: EntryKind;
  /** Which announced machine this concerns, or the room for SDK-level entries. */
  source: string;
  text: string;
}

/** Enough to cover a few reconnect cycles without letting a long session grow unbounded. */
const TIMELINE_LIMIT = 300;

/** How far from the bottom still counts as "following along", in px. */
const BOTTOM_SLACK = 24;

/** The scenarios worth one click from here: the ones that move the signal connection. */
const SIGNAL_SCENARIOS: Array<{ scenario: SimulationScenario; hint: string }> = [
  { scenario: 'signal-reconnect', hint: 'server drops signalling; the client should resume' },
  { scenario: 'resume-reconnect', hint: 'forces the resume path' },
  { scenario: 'full-reconnect', hint: 'forces a full reconnect, replacing the engine' },
  { scenario: 'leave-full-reconnect', hint: 'server asks for a full reconnect via Leave' },
  { scenario: 'server-leave', hint: 'server ends the session; the machine should reach closed' },
  { scenario: 'migration', hint: 'node migration — signalling closes without a resume Leave' },
  {
    scenario: 'disconnect-signal-on-resume',
    hint: 'signalling dies during a resume, so the resume itself has to fail',
  },
];

interface Watched extends MachineAnnouncement {
  /** Set once a newer machine with the same label was announced. */
  superseded: boolean;
  subscriptions: Array<{ off(): void }>;
}

let panel: MachinePanel | undefined;

/**
 * Tells an open panel about a `Room` the moment it is constructed. The demo only publishes a room
 * once its connect has succeeded, which is far too late to watch the connect itself.
 */
export function machinePanelSawRoom(room: Room) {
  panel?.watchRoom(room);
}

/**
 * Opens (or refocuses) the inspector window. Must be called from a user gesture, or the browser will
 * block the popup. `getRoom` is read on every render rather than captured, because the demo builds a
 * new `Room` per connection.
 */
export function openMachinePanel(getRoom: () => Room | undefined) {
  if (panel && !panel.closed) {
    panel.focus();
    return;
  }
  panel = new MachinePanel(getRoom);
}

class MachinePanel {
  private window: Window;

  private watched: Watched[] = [];

  private timeline: TimelineEntry[] = [];

  private recorded = 0;

  private foldUbiquitous = true;

  /**
   * Which machine the card shows. Follows the newest one by default, which is what you want while a
   * reconnect is replacing the engine underneath you; clicking an older tab pins it there instead,
   * so studying a superseded machine is not interrupted by the next one arriving.
   */
  private pinnedSeq?: number;

  /**
   * Inputs currently being handled, keyed by machine seq. A stack, because a handler may dispatch
   * again — a deferred input replaying on transition does exactly that.
   */
  private handling = new Map<number, Array<{ input: string; from: string; transitions: number }>>();

  /** Transitions seen per machine, so a handler's effect can be judged without assuming an event order. */
  private transitionCount = new Map<number, number>();

  private unsubscribeRegistry: () => void;

  private roomListeners?: { room: Room; off: () => void };

  /** Set by {@link machinePanelSawRoom}; preferred over the getter, which reports a room later. */
  private announcedRoom?: Room;

  private renderScheduled = false;

  constructor(private getRoom: () => Room | undefined) {
    const opened = window.open('', 'lk-machine-inspector', 'width=1180,height=860');
    if (!opened) {
      throw new Error('the inspector window was blocked — allow popups for this origin');
    }
    this.window = opened;
    this.window.document.title = 'LiveKit — connection state machines';
    this.window.document.body.innerHTML = `
      <style>${PANEL_STYLES}</style>
      <header>
        <h1>connection state machines</h1>
        <label><input type="checkbox" id="fold" checked /> <span id="fold-label"></span></label>
      </header>
      <p id="empty">
        No machine has announced itself yet. Connect the demo — the signal machine is created with
        the room.
      </p>
      <main id="main" hidden>
        <section class="machines">
          <nav class="tabs" id="tabs"></nav>
          <div id="machine"></div>
        </section>
        <aside>
          <h2>faults</h2>
          <p class="note">
            Real events, not injected inputs: the machine sees them the way it would in production.
          </p>
          <div class="faults" id="faults"></div>
          <h2>timeline</h2>
          <p class="note">
            <b>a &rarr; b</b> the input moved the machine &middot;
            <b>declined</b> a handler for it exists here, ran, and chose not to move &mdash; a
            superseded attempt reporting in, for instance &middot;
            <b>dropped</b> this state declares no handler for it at all
          </p>
          <ol class="timeline" id="timeline"></ol>
        </aside>
      </main>
    `;

    this.window.addEventListener('unload', () => this.dispose());
    this.window.document.querySelector('#fold')!.addEventListener('change', (event) => {
      this.foldUbiquitous = (event.target as HTMLInputElement).checked;
      this.scheduleRender();
    });

    this.unsubscribeRegistry = onMachineAnnounced((announcement) => this.watch(announcement));
    this.scheduleRender();
  }

  get closed() {
    return this.window.closed;
  }

  focus() {
    this.window.focus();
  }

  watchRoom(room: Room) {
    this.announcedRoom = room;
    this.scheduleRender();
  }

  private dispose() {
    this.unsubscribeRegistry();
    for (const entry of this.watched) {
      for (const subscription of entry.subscriptions) {
        subscription.off();
      }
    }
    this.watched = [];
    this.roomListeners?.off();
    this.roomListeners = undefined;
    panel = undefined;
  }

  /**
   * Subscribes to one announced machine. Earlier machines with the same label are kept, marked
   * superseded: a full reconnect discards the engine along with its `SignalClient`, and where that
   * handover happened is usually the question being asked.
   */
  private watch(announcement: MachineAnnouncement) {
    for (const existing of this.watched) {
      if (existing.label === announcement.label) {
        existing.superseded = true;
      }
    }
    const { machine, label, seq } = announcement;
    const entry: Watched = { ...announcement, superseded: false, subscriptions: [] };
    const source = `${label}#${seq}`;

    const stack = () => {
      const existing = this.handling.get(seq) ?? [];
      this.handling.set(seq, existing);
      return existing;
    };
    const transitions = () => this.transitionCount.get(seq) ?? 0;
    /** The input currently being handled, if any. */
    const innermost = () => {
      const frames = stack();
      return frames[frames.length - 1];
    };

    entry.subscriptions.push(
      machine.on('handling', ({ inputName }: { inputName: string }) => {
        stack().push({
          input: inputName,
          from: machine.currentState(),
          transitions: transitions(),
        });
      }),
      machine.on('transitioned', ({ fromState, toState }: Record<string, string>) => {
        this.transitionCount.set(seq, transitions() + 1);
        const pending = innermost();
        this.record(
          'machine',
          source,
          `${pending?.input ?? 'transition'}: ${fromState} → ${toState}`,
        );
      }),
      // Settled in a microtask rather than inline: machina emits `handled` before it applies the
      // state the handler returned, so the effect of a handler is only known once the call unwinds.
      // Comparing the transition count is what makes this independent of that emission order.
      machine.on('handled', () => {
        // left on the stack so the `transitioned` that follows can still name its input
        const pending = innermost();
        if (!pending) {
          return;
        }
        queueMicrotask(() => {
          const frames = stack();
          frames.splice(frames.indexOf(pending), 1);
          if (transitions() === pending.transitions) {
            this.record(
              'declined',
              source,
              `${pending.input}: declined in ${pending.from} (handler ran, no transition)`,
            );
          }
        });
      }),
      machine.on('nohandler', ({ inputName }: { inputName: string }) => {
        stack().pop();
        this.record(
          'declined',
          source,
          `${inputName}: dropped — ${machine.currentState()} has no handler for it`,
        );
      }),
      machine.on('deferred', ({ inputName }: { inputName: string }) => {
        this.record('machine', source, `${inputName}: deferred until the next transition`);
      }),
      machine.on('invalidstate', ({ stateName }: { stateName: string }) => {
        this.record('declined', source, `transition to unknown state ${stateName}`);
      }),
    );

    this.watched = [...this.watched, entry];
    this.record(
      'attach',
      source,
      `${label} machine created in ${machine.initialState}`,
      announcement.at,
    );
  }

  /**
   * Attaches to the room the demo currently holds, so the machine's view and the SDK's own can be
   * compared on one timeline. The demo creates a room per connection, hence the identity check.
   */
  private get room() {
    return this.announcedRoom ?? this.getRoom();
  }

  private syncRoom() {
    const room = this.room;
    if (this.roomListeners?.room === room) {
      return;
    }
    this.roomListeners?.off();
    this.roomListeners = undefined;
    if (!room) {
      return;
    }

    const onStateChanged = (state: ConnectionState) =>
      this.record('room', 'room', `state ${state}`);
    const onReconnecting = () => this.record('room', 'room', 'reconnecting');
    const onReconnected = () => this.record('room', 'room', 'reconnected');
    const onSignalConnected = () => this.record('room', 'room', 'signal connected');
    const onDisconnected = (reason?: unknown) =>
      this.record('room', 'room', `disconnected (${reason ?? 'no reason'})`);

    room
      .on(RoomEvent.ConnectionStateChanged, onStateChanged)
      .on(RoomEvent.Reconnecting, onReconnecting)
      .on(RoomEvent.Reconnected, onReconnected)
      .on(RoomEvent.SignalConnected, onSignalConnected)
      .on(RoomEvent.Disconnected, onDisconnected);

    this.roomListeners = {
      room,
      off: () => {
        room
          .off(RoomEvent.ConnectionStateChanged, onStateChanged)
          .off(RoomEvent.Reconnecting, onReconnecting)
          .off(RoomEvent.Reconnected, onReconnected)
          .off(RoomEvent.SignalConnected, onSignalConnected)
          .off(RoomEvent.Disconnected, onDisconnected);
      },
    };
    this.record('attach', 'room', 'watching a new Room instance');
  }

  private record(kind: EntryKind, source: string, text: string, at = Date.now()) {
    this.recorded += 1;
    this.timeline = [
      ...this.timeline.slice(-(TIMELINE_LIMIT - 1)),
      { at, n: this.recorded, kind, source, text },
    ];
    this.scheduleRender();
  }

  /** Machine events can arrive several to a tick; one render per tick is enough. */
  private scheduleRender() {
    if (this.renderScheduled || this.closed) {
      return;
    }
    this.renderScheduled = true;
    queueMicrotask(() => {
      this.renderScheduled = false;
      this.render().catch((e) => console.error('inspector render failed', e));
    });
  }

  private async render() {
    if (this.closed) {
      return;
    }
    this.syncRoom();
    const doc = this.window.document;
    const el = <T extends HTMLElement>(id: string) => doc.querySelector(`#${id}`) as T;

    el('empty').hidden = this.watched.length > 0;
    el('main').hidden = this.watched.length === 0;

    const selected =
      this.watched.find((entry) => entry.seq === this.pinnedSeq) ??
      this.watched[this.watched.length - 1];
    this.renderTabs(el('tabs'), selected);

    const folded = new Set<string>();
    if (selected) {
      const current = selected.machine.currentState();
      // only the visible machine is drawn: the others are one click away and rendering them all on
      // every event was the bulk of the work per tick
      const { svg, graph, ubiquitous } = await renderDiagram(selected.machine, current, {
        foldUbiquitous: this.foldUbiquitous,
      });
      ubiquitous.forEach((input) => folded.add(input));
      el('machine').innerHTML = `
        <article class="machine${selected.superseded ? ' superseded' : ''}">
          <div class="diagram">${svg}</div>
          <div class="inputs">${this.renderInputs(selected.machine, graph, current)}</div>
          <pre>${escapeHtml(JSON.stringify(selected.machine.context ?? {}, null, 2))}</pre>
        </article>`;
    }

    el('fold-label').textContent =
      folded.size > 0
        ? `fold away ${[...folded].join(', ')} (legal from every state)`
        : 'fold inputs legal from every state';

    this.renderFaults(el('faults'));

    // Oldest first, so a chain reads downwards in the order it happened — within one millisecond
    // that is the order the entries were recorded. The list follows new entries only when it is
    // already at the bottom, so scrolling up to read history is not undone by the next event.
    const timeline = el('timeline');
    const wasAtBottom =
      timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < BOTTOM_SLACK;
    timeline.innerHTML = this.timeline
      .slice()
      .sort((a, b) => a.at - b.at || a.n - b.n)
      .map(
        (entry) =>
          `<li class="${entry.kind}"><time>${formatTime(entry.at)}</time><code>${
            entry.source
          }</code> ${escapeHtml(entry.text)}</li>`,
      )
      .join('');
    if (wasAtBottom) {
      timeline.scrollTop = timeline.scrollHeight;
    }
  }

  /**
   * The tab strip. Rebuilt only when the machines or the selection change, so a tab the user is
   * keyboard-focused on survives the renders that every machine event triggers.
   */
  private renderTabs(container: HTMLElement, selected: Watched | undefined) {
    const signature = this.watched
      .map((entry) => `${entry.seq}:${entry.machine.currentState()}:${entry.superseded}`)
      .join('|');
    const key = `${signature}#${selected?.seq ?? ''}`;
    if (container.dataset.key === key) {
      return;
    }
    container.dataset.key = key;
    container.innerHTML = '';

    for (const entry of this.watched) {
      const tab = this.window.document.createElement('button');
      tab.type = 'button';
      tab.className = `tab${entry === selected ? ' selected' : ''}${
        entry.superseded ? ' superseded' : ''
      }`;
      tab.title = entry.superseded
        ? `${entry.label}#${entry.seq} was replaced by a later one`
        : `${entry.label}#${entry.seq} is the machine currently in charge`;
      // fixed-width state slot, so a state change never reflows the strip
      tab.innerHTML = `${entry.label}<span class="seq">#${entry.seq}</span><span class="state">${entry.machine.currentState()}</span>`;
      tab.addEventListener('click', () => {
        // picking the newest tab means "follow along again"
        this.pinnedSeq = entry === this.watched[this.watched.length - 1] ? undefined : entry.seq;
        this.scheduleRender();
      });
      container.append(tab);
    }
  }

  /**
   * The inputs the machine would accept right now, in a fixed order so a button never moves — only
   * whether it is lit. These are indicators, not controls: nothing here can be clicked.
   */
  private renderInputs(machine: InspectableMachine, graph: StateGraph, current: string) {
    return allInputs(machine)
      .map((input) => {
        const handled = machine.canHandle(input);
        const title = handled
          ? `${input} → ${destination(graph, current, input)}`
          : `${input} is not handled in '${current}' — it would be dropped`;
        return `<span class="${handled ? 'legal' : 'illegal'}" title="${title}">${input}</span>`;
      })
      .join('');
  }

  private renderFaults(container: HTMLElement) {
    const room = this.room;
    const client = room?.engine?.client;
    const connected = room?.state === ConnectionState.Connected;
    container.innerHTML = '';

    const add = (label: string, hint: string, enabled: boolean, run: () => unknown) => {
      const button = this.window.document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.title = hint;
      button.disabled = !enabled;
      button.addEventListener('click', () => {
        this.record('room', 'fault', label);
        const failed = (e: unknown) =>
          this.record('declined', 'fault', `${label} failed: ${(e as Error).message}`);
        try {
          // the scenarios are async, so a rejection has to be caught separately
          Promise.resolve(run()).catch(failed);
        } catch (e) {
          failed(e);
        }
      });
      container.append(button);
    };

    // 1006 is not available to page script; 4000 is the closest honest thing and takes the same
    // path — an abnormal close of a live transport that the client did not ask for.
    add(
      'close socket (4000)',
      'closes the signal websocket abnormally, as a dropped connection would',
      !!client?.ws,
      () => client!.ws!.close({ closeCode: 4000, reason: 'inspector: injected abnormal close' }),
    );
    add(
      'close socket (1000)',
      'a clean server-side close with no Leave — the case a migration produces',
      !!client?.ws,
      () => client!.ws!.close({ closeCode: 1000, reason: 'inspector: injected clean close' }),
    );
    for (const { scenario, hint } of SIGNAL_SCENARIOS) {
      add(scenario, hint, connected, () => room!.simulateScenario(scenario));
    }
  }
}

function formatTime(at: number) {
  return new Date(at).toISOString().slice(11, 23);
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!,
  );
}
