import { SignalTarget } from '@livekit/protocol';
import log, { LoggerNames, getLogger } from '../logger';
import PCTransport, { PCEvents } from './PCTransport';
import { roomConnectOptionDefaults } from './defaults';
import { ConnectionError, ConnectionErrorReason } from './errors';
import CriticalTimers from './timers';
import type { LoggerOptions } from './types';
import { Mutex, sleep } from './utils';

export enum PCTransportState {
  NEW,
  CONNECTING,
  CONNECTED,
  FAILED,
  CLOSING,
  CLOSED,
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

  public onStateChange?: (
    state: PCTransportState,
    pubState: RTCPeerConnectionState,
    subState: RTCPeerConnectionState,
  ) => void;

  public onIceCandidate?: (ev: RTCIceCandidate, target: SignalTarget) => void;

  public onDataChannel?: (ev: RTCDataChannelEvent) => void;

  public onTrack?: (ev: RTCTrackEvent) => void;

  public onPublisherOffer?: (offer: RTCSessionDescriptionInit) => void;

  private isPublisherConnectionRequired: boolean;

  private isSubscriberConnectionRequired: boolean;

  private state: PCTransportState;

  private connectionLock: Mutex;

  private log = log;

  private loggerOptions: LoggerOptions;

  constructor(
    rtcConfig: RTCConfiguration,
    subscriberPrimary: boolean,
    loggerOptions: LoggerOptions,
  ) {
    this.log = getLogger(loggerOptions.loggerName ?? LoggerNames.PCManager);
    this.loggerOptions = loggerOptions;

    this.isPublisherConnectionRequired = !subscriberPrimary;
    this.isSubscriberConnectionRequired = subscriberPrimary;
    this.publisher = new PCTransport(rtcConfig, loggerOptions);
    this.subscriber = new PCTransport(rtcConfig, loggerOptions);

    this.publisher.onConnectionStateChange = this.updateState;
    this.subscriber.onConnectionStateChange = this.updateState;
    this.publisher.onIceConnectionStateChange = this.updateState;
    this.subscriber.onIceConnectionStateChange = this.updateState;
    this.publisher.onSignalingStatechange = this.updateState;
    this.subscriber.onSignalingStatechange = this.updateState;
    this.publisher.onIceCandidate = (candidate) => {
      this.onIceCandidate?.(candidate, SignalTarget.PUBLISHER);
    };
    this.subscriber.onIceCandidate = (candidate) => {
      this.onIceCandidate?.(candidate, SignalTarget.SUBSCRIBER);
    };
    // in subscriber primary mode, server side opens sub data channels.
    this.subscriber.onDataChannel = (ev) => {
      this.onDataChannel?.(ev);
    };
    this.subscriber.onTrack = (ev) => {
      this.onTrack?.(ev);
    };
    this.publisher.onOffer = (offer) => {
      this.onPublisherOffer?.(offer);
    };

    this.state = PCTransportState.NEW;

    this.connectionLock = new Mutex();
  }

  private get logContext() {
    return {
      ...this.loggerOptions.loggerContextCb?.(),
    };
  }

  requirePublisher(require = true) {
    this.isPublisherConnectionRequired = require;
    this.updateState();
  }

  requireSubscriber(require = true) {
    this.isSubscriberConnectionRequired = require;
    this.updateState();
  }

  createAndSendPublisherOffer(options?: RTCOfferOptions) {
    return this.publisher.createAndSendOffer(options);
  }

  setPublisherAnswer(sd: RTCSessionDescriptionInit) {
    return this.publisher.setRemoteDescription(sd);
  }

  removeTrack(sender: RTCRtpSender) {
    return this.publisher.removeTrack(sender);
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
          this.log.warn('could not removeTrack', { ...this.logContext, error: e });
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
      await this.createAndSendPublisherOffer({ iceRestart: true });
    }
  }

  async addIceCandidate(candidate: RTCIceCandidateInit, target: SignalTarget) {
    if (target === SignalTarget.PUBLISHER) {
      await this.publisher.addIceCandidate(candidate);
    } else {
      await this.subscriber.addIceCandidate(candidate);
    }
  }

  async createSubscriberAnswerFromOffer(sd: RTCSessionDescriptionInit) {
    this.log.debug('received server offer', {
      ...this.logContext,
      RTCSdpType: sd.type,
      sdp: sd.sdp,
      signalingState: this.subscriber.getSignallingState().toString(),
    });
    await this.subscriber.setRemoteDescription(sd);

    // answer the offer
    const answer = await this.subscriber.createAndSetAnswer();
    return answer;
  }

  updateConfiguration(config: RTCConfiguration, iceRestart?: boolean) {
    this.publisher.setConfiguration(config);
    this.subscriber.setConfiguration(config);
    if (iceRestart) {
      this.triggerIceRestart();
    }
  }

  async ensurePCTransportConnection(abortController?: AbortController, timeout?: number) {
    const unlock = await this.connectionLock.lock();
    try {
      if (
        this.isPublisherConnectionRequired &&
        this.publisher.getConnectionState() !== 'connected' &&
        this.publisher.getConnectionState() !== 'connecting'
      ) {
        this.log.debug('negotiation required, start negotiating', this.logContext);
        this.publisher.negotiate();
      }
      await Promise.all(
        this.requiredTransports?.map((transport) =>
          this.ensureTransportConnected(transport, abortController, timeout),
        ),
      );
    } finally {
      unlock();
    }
  }

  async negotiate(abortController: AbortController) {
    return new Promise<void>(async (resolve, reject) => {
      const negotiationTimeout = setTimeout(() => {
        reject('negotiation timed out');
      }, this.peerConnectionTimeout);

      const abortHandler = () => {
        clearTimeout(negotiationTimeout);
        reject('negotiation aborted');
      };

      abortController.signal.addEventListener('abort', abortHandler);
      this.publisher.once(PCEvents.NegotiationStarted, () => {
        if (abortController.signal.aborted) {
          return;
        }
        this.publisher.once(PCEvents.NegotiationComplete, () => {
          clearTimeout(negotiationTimeout);
          resolve();
        });
      });

      await this.publisher.negotiate((e) => {
        clearTimeout(negotiationTimeout);
        reject(e);
      });
    });
  }

  addPublisherTransceiver(track: MediaStreamTrack, transceiverInit: RTCRtpTransceiverInit) {
    return this.publisher.addTransceiver(track, transceiverInit);
  }

  addPublisherTrack(track: MediaStreamTrack) {
    return this.publisher.addTrack(track);
  }

  createPublisherDataChannel(label: string, dataChannelDict: RTCDataChannelInit) {
    return this.publisher.createDataChannel(label, dataChannelDict);
  }

  /**
   * Returns the first required transport's address if no explicit target is specified
   */
  getConnectedAddress(target?: SignalTarget) {
    if (target === SignalTarget.PUBLISHER) {
      return this.publisher.getConnectedAddress();
    } else if (target === SignalTarget.SUBSCRIBER) {
      return this.publisher.getConnectedAddress();
    }
    return this.requiredTransports[0].getConnectedAddress();
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
      this.state = PCTransportState.CLOSED;
    } else if (connectionStates.some((st) => st === 'closed')) {
      this.state = PCTransportState.CLOSING;
    } else if (connectionStates.every((st) => st === 'new')) {
      this.state = PCTransportState.NEW;
    }

    if (previousState !== this.state) {
      this.log.debug(
        `pc state change: from ${PCTransportState[previousState]} to ${
          PCTransportState[this.state]
        }`,
        this.logContext,
      );
      this.onStateChange?.(
        this.state,
        this.publisher.getConnectionState(),
        this.subscriber.getConnectionState(),
      );
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

    return new Promise<void>(async (resolve, reject) => {
      const abortHandler = () => {
        this.log.warn('abort transport connection', this.logContext);
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
