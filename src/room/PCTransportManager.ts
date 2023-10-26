import log from '../logger';
import PCTransport from './PCTransport';

export enum PCTransportState {
  IDLE,
  CONNECTING,
  CONNECTED,
  RECONNECTING,
  FAILED,
  CLOSED,
}

export class PCTransportManager {
  private isPublisherConnectionRequired: boolean;

  private isSubscriberConnectionRequired: boolean;

  public publisher: PCTransport;

  public subscriber: PCTransport;

  private state: PCTransportState;

  onStateChange?: (state: PCTransportState) => void;

  constructor(rtcConfig: RTCConfiguration) {
    this.isPublisherConnectionRequired = true;
    this.isSubscriberConnectionRequired = true;
    const googConstraints = { optional: [{ googDscp: true }] };
    this.publisher = new PCTransport(rtcConfig, googConstraints);
    this.subscriber = new PCTransport(rtcConfig);

    this.publisher.onConnectionStateChange = this.handleStateChanged;
    this.subscriber.onConnectionStateChange = this.handleStateChanged;
    this.publisher.onIceConnectionStateChange = this.handleStateChanged;
    this.subscriber.onIceConnectionStateChange = this.handleStateChanged;
    this.publisher.onSignalingStatechange = this.handleStateChanged;
    this.subscriber.onSignalingStatechange = this.handleStateChanged;

    this.state = PCTransportState.IDLE;
  }

  async ensurePCTransportConnection() {
    return Promise.all(this.requiredTransports?.map(this.ensureTransportConnected));
  }

  private get requiredTransports() {
    const transports: PCTransport[] = [];
    if (this.isPublisherConnectionRequired) {
      transports.push(this.publisher);
    }
    if (this.isSubscriberConnectionRequired) {
      transports.push(this.subscriber);
    }
    return transports;
  }

  private handleStateChanged = () => {
    const previousState = this.state;

    const connectionStates = this.requiredTransports.map((tr) => tr.getConnectionState());
    if (connectionStates.every((st) => st === 'connected')) {
      this.state = PCTransportState.CONNECTED;
    } else if (connectionStates.some((st) => st === 'failed')) {
      this.state = PCTransportState.FAILED;
    } else if (connectionStates.some((st) => st === 'connecting')) {
      this.state = PCTransportState.CONNECTING;
    } else if (connectionStates.some((st) => st === 'closed')) {
      this.state = PCTransportState.CLOSED;
    }

    if (previousState !== this.state) {
      this.onStateChange?.(this.state);
    }
    log.info('pc state', {
      overall: this.state,
      publisher: getPCState(this.publisher),
      subscriber: getPCState(this.subscriber),
    });
  };

  private async ensureTransportConnected(pcTransport: PCTransport) {
    if (pcTransport.getConnectionState() === 'connected') {
      return true;
    }
  }
}

function getPCState(pcTransport: PCTransport) {
  return {
    connectionState: pcTransport.getConnectionState(),
    iceState: pcTransport.getICEConnectionState(),
    signallingState: pcTransport.getSignallingState(),
  };
}
