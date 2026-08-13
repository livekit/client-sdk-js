import { type Callback, StateMachine, t } from 'typescript-fsm';

const enum States {
  disconnected = 0,
  disconnecting,
  connecting,
  reconnecting,
  connected,
}

const enum Events {
  connect,
  connectingComplete,
  connectingFailed,
  close,
  closeComplete,
  reconnect,
  reconnectComplete,
  reconnectFailed,
  transportFailed,
}

/** The argument tuple each event carries — single source of truth. */
type EventArgs = {
  [Events.connect]: [];
  [Events.connectingComplete]: [];
  [Events.connectingFailed]: [];
  [Events.close]: [];
  [Events.closeComplete]: [];
  [Events.reconnect]: [];
  [Events.reconnectComplete]: [];
  [Events.reconnectFailed]: [];
  [Events.transportFailed]: [];
};

type Handler<E extends Events> = (...args: EventArgs[E]) => void | Promise<void>;

/** Typed replacement for `t()`: the callback's params follow from `event`. */
function transition<E extends Events>(
  fromState: States,
  event: E,
  toState: States,
  cb?: Handler<E>,
) {
  return t<States, Events, Callback>(fromState, event, toState, cb as Callback);
}

class Door extends StateMachine<States, Events> {
  constructor() {
    super(States.disconnected);

    // prettier-ignore
    this.addTransitions([
      transition(States.disconnected,  Events.connect,            States.connecting,    this.handleConnecting),
      transition(States.connecting,    Events.connectingComplete, States.connected,     this.handleConnected),
      transition(States.connecting,    Events.connectingFailed,   States.disconnecting, this.handleInitialConnectingFailed),
      transition(States.connected,     Events.transportFailed,    States.reconnecting,  this.handleReconnecting),
      transition(States.connected,     Events.reconnect,          States.reconnecting,  this.handleReconnecting),
      transition(States.reconnecting,  Events.reconnectComplete,  States.connected,     this.handleReconnected),
      transition(States.reconnecting,  Events.reconnectFailed,    States.disconnecting, this.handleDisconnecting),
      transition(States.connected,     Events.close,              States.disconnecting, this.handleDisconnecting),
      transition(States.disconnecting, Events.closeComplete,      States.disconnected,  this.handleDisconnected)

    ]);
  }

  override dispatch<E extends Events>(event: E, ...args: EventArgs[E]): Promise<void> {
    return super.dispatch(event, ...args);
  }
}
