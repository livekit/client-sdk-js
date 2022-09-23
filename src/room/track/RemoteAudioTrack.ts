import { AudioReceiverStats, computeBitrate } from '../stats';
import RemoteTrack from './RemoteTrack';
import { Track } from './Track';

export default class RemoteAudioTrack extends RemoteTrack {
  private prevStats?: AudioReceiverStats;

  private elementVolume: number | undefined;

  private audioContext?: AudioContext;

  private gainNode?: GainNode;

  private sourceNode?: MediaStreamAudioSourceNode;

  constructor(
    mediaTrack: MediaStreamTrack,
    sid: string,
    receiver?: RTCRtpReceiver,
    audioContext?: AudioContext,
  ) {
    super(mediaTrack, sid, Track.Kind.Audio, receiver);
    this.audioContext = audioContext;
  }

  /**
   * sets the volume for all attached audio elements
   */
  setVolume(volume: number) {
    for (const el of this.attachedElements) {
      if (this.audioContext) {
        this.gainNode?.gain.setTargetAtTime(volume, 0, 0.1);
      } else {
        el.volume = volume;
      }
    }
    this.elementVolume = volume;
  }

  /**
   * gets the volume of attached audio elements (loudest)
   */
  getVolume(): number {
    if (this.elementVolume) {
      return this.elementVolume;
    }
    let highestVolume = 0;
    this.attachedElements.forEach((element) => {
      if (element.volume > highestVolume) {
        highestVolume = element.volume;
      }
    });
    return highestVolume;
  }

  attach(): HTMLMediaElement;
  attach(element: HTMLMediaElement): HTMLMediaElement;
  attach(element?: HTMLMediaElement): HTMLMediaElement {
    if (!element) {
      element = super.attach();
    } else {
      super.attach(element);
    }
    if (this.elementVolume) {
      element.volume = this.elementVolume;
    }
    this.gainNode?.disconnect();
    this.sourceNode?.disconnect();
    if (this.audioContext) {
      console.log('using audio context mapping');
      this.setupWebAudio(this.audioContext, element);
      element.volume = 0;
      element.muted = true;
    }
    return element;
  }

  /**
   * @internal
   */
  setAudioContext(audioContext: AudioContext) {
    this.audioContext = audioContext;
    if (this.attachedElements.length > 0) {
      this.setupWebAudio(audioContext, this.attachedElements[0]);
    }
  }

  private setupWebAudio(context: AudioContext, element: HTMLMediaElement) {
    this.gainNode?.disconnect();
    this.sourceNode?.disconnect();
    // @ts-ignore our attached elements always have a srcObject set
    this.sourceNode = context.createMediaStreamSource(element.srcObject);
    this.gainNode = context.createGain();
    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(context.destination);

    if (this.elementVolume) {
      this.gainNode.gain.setTargetAtTime(this.elementVolume, 0, 0.1);
    }
  }

  protected monitorReceiver = async () => {
    if (!this.receiver) {
      this._currentBitrate = 0;
      return;
    }
    const stats = await this.getReceiverStats();

    if (stats && this.prevStats && this.receiver) {
      this._currentBitrate = computeBitrate(stats, this.prevStats);
    }

    this.prevStats = stats;
  };

  protected async getReceiverStats(): Promise<AudioReceiverStats | undefined> {
    if (!this.receiver) {
      return;
    }

    const stats = await this.receiver.getStats();
    let receiverStats: AudioReceiverStats | undefined;
    stats.forEach((v) => {
      if (v.type === 'inbound-rtp') {
        receiverStats = {
          type: 'audio',
          timestamp: v.timestamp,
          jitter: v.jitter,
          bytesReceived: v.bytesReceived,
          concealedSamples: v.concealedSamples,
          concealmentEvents: v.concealmentEvents,
          silentConcealedSamples: v.silentConcealedSamples,
          silentConcealmentEvents: v.silentConcealmentEvents,
          totalAudioEnergy: v.totalAudioEnergy,
          totalSamplesDuration: v.totalSamplesDuration,
        };
      }
    });
    return receiverStats;
  }
}
