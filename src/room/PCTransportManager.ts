import log from '../logger';
import PCTransport from './PCTransport';
import { roomConnectOptionDefaults } from './defaults';
import { ConnectionError, ConnectionErrorReason } from './errors';
import CriticalTimers from './timers';
import { Mutex, sleep } from './utils';

export enum PCTransportState {
  DISCONNECTED,
  CONNECTING,
  CONNECTED,
  FAILED,
}

export class PCTransportManager {
  public publisher: PCTransport;

  public subscriber: PCTransport;

  public peerConnectionTimeout: number = roomConnectOptionDefaults.peerConnectionTimeout;

  public get needsPublisher() {
    return this.isPublisherConnectionRequired;
  }

  public get needsSubscriber() {
    return this.isSubscriberConnectionRequired;
  }

  public get currentState() {
    return this.state;
  }

  public onStateChange?: (state: PCTransportState) => void;

  private isPublisherConnectionRequired: boolean;

  private isSubscriberConnectionRequired: boolean;

  private state: PCTransportState;

  private connectionLock: Mutex;

  constructor(rtcConfig: RTCConfiguration, subscriberPrimary: boolean) {
    this.isPublisherConnectionRequired = !subscriberPrimary;
    this.isSubscriberConnectionRequired = subscriberPrimary;
    const googConstraints = { optional: [{ googDscp: true }] };
    this.publisher = new PCTransport(rtcConfig, googConstraints);
    this.subscriber = new PCTransport(rtcConfig);

    this.publisher.onConnectionStateChange = this.updateState;
    this.subscriber.onConnectionStateChange = this.updateState;
    this.publisher.onIceConnectionStateChange = this.updateState;
    this.subscriber.onIceConnectionStateChange = this.updateState;
    this.publisher.onSignalingStatechange = this.updateState;
    this.subscriber.onSignalingStatechange = this.updateState;

    this.state = PCTransportState.DISCONNECTED;

    this.connectionLock = new Mutex();
  }

  requirePublisher(require = true) {
    this.isPublisherConnectionRequired = require;
    this.updateState();
  }

  requireSubscriber(require = true) {
    this.isSubscriberConnectionRequired = require;
    this.updateState();
  }

  createAndSendOffer(options?: RTCOfferOptions) {
    return this.publisher.createAndSendOffer(options);
  }

  async close() {
    if (this.publisher && this.publisher.getSignallingState() !== 'closed') {
      const publisher = this.publisher;
      for (const sender of publisher.getSenders()) {
        try {
          // TODO: react-native-webrtc doesn't have removeTrack yet.
          if (publisher.canRemoveTrack()) {
            publisher.removeTrack(sender);
          }
        } catch (e) {
          log.warn('could not removeTrack', { error: e });
        }
      }
    }
    await Promise.all([this.publisher.close(), this.subscriber.close()]);
    this.updateState();
  }

  async triggerIceRestart() {
    this.subscriber.restartingIce = true;
    // only restart publisher if it's needed
    if (this.needsPublisher) {
      await this.createAndSendOffer({ iceRestart: true });
    }
  }

  updateConfiguration(config: RTCConfiguration) {
    this.publisher.setConfiguration(config);
    this.subscriber.setConfiguration(config);
  }

  async ensurePCTransportConnection(abortController?: AbortController, timeout?: number) {
    const unlock = await this.connectionLock.lock();
    try {
      await Promise.all(
        this.requiredTransports?.map((transport) =>
          this.ensureTransportConnected(transport, abortController, timeout),
        ),
      );
    } finally {
      unlock();
    }
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

  private updateState = () => {
    const previousState = this.state;

    const connectionStates = this.requiredTransports.map((tr) => tr.getConnectionState());
    if (connectionStates.every((st) => st === 'connected')) {
      this.state = PCTransportState.CONNECTED;
    } else if (connectionStates.some((st) => st === 'failed')) {
      this.state = PCTransportState.FAILED;
    } else if (connectionStates.some((st) => st === 'connecting')) {
      this.state = PCTransportState.CONNECTING;
    } else if (connectionStates.every((st) => st === 'closed')) {
      this.state = PCTransportState.DISCONNECTED;
    } else if (connectionStates.every((st) => st === 'new')) {
      this.state = PCTransportState.DISCONNECTED;
    }

    if (previousState !== this.state) {
      this.onStateChange?.(this.state);
      log.info(`pc state: ${PCTransportState[this.state]}`);
    }
  };

  private async ensureTransportConnected(
    pcTransport: PCTransport,
    abortController?: AbortController,
    timeout: number = this.peerConnectionTimeout,
  ) {
    const connectionState = pcTransport.getConnectionState();
    if (connectionState === 'connected') {
      return;
    }
    // if (this.pcState !== PCState.New) {
    //   throw new UnexpectedConnectionState(
    //     'Expected peer connection to be new on initial connection',
    //   );
    // }
    return new Promise<void>(async (resolve, reject) => {
      const abortHandler = () => {
        log.warn('abort transport connection');
        CriticalTimers.clearTimeout(connectTimeout);

        reject(
          new ConnectionError(
            'room connection has been cancelled',
            ConnectionErrorReason.Cancelled,
          ),
        );
      };
      if (abortController?.signal.aborted) {
        abortHandler();
      }
      abortController?.signal.addEventListener('abort', abortHandler);

      const connectTimeout = CriticalTimers.setTimeout(() => {
        abortController?.signal.removeEventListener('abort', abortHandler);
        reject(new ConnectionError('could not establish pc connection'));
      }, timeout);

      while (this.state !== PCTransportState.CONNECTED) {
        await sleep(50); // FIXME we shouldn't rely on `sleep` in the connection paths, as it invokes `setTimeout` which can be drastically throttled by browser implementations
        if (abortController?.signal.aborted) {
          reject(
            new ConnectionError(
              'room connection has been cancelled',
              ConnectionErrorReason.Cancelled,
            ),
          );
          return;
        }
      }
      CriticalTimers.clearTimeout(connectTimeout);
      abortController?.signal.removeEventListener('abort', abortHandler);
      resolve();
    });
  }
}

function getPCState(pcTransport: PCTransport) {
  return {
    connectionState: pcTransport.getConnectionState(),
    iceState: pcTransport.getICEConnectionState(),
    signallingState: pcTransport.getSignallingState(),
  };
}
