import { debounce } from 'ts-debounce';
import { TrackEvent } from '../events';
import { computeBitrate, monitorFrequency, VideoReceiverStats } from '../stats';
import { getIntersectionObserver, getResizeObserver, ObservableMediaElement } from '../utils';
import RemoteTrack from './RemoteTrack';
import { attachToElement, detachTrack, Track } from './Track';

const REACTION_DELAY = 100;

export default class RemoteVideoTrack extends RemoteTrack {
  /** @internal */
  receiver?: RTCRtpReceiver;

  private prevStats?: VideoReceiverStats;

  private elementInfos: ElementInfo[] = [];

  private adaptiveStream?: boolean;

  private lastVisible?: boolean;

  private lastDimensions?: Track.Dimensions;

  constructor(
    mediaTrack: MediaStreamTrack,
    sid: string,
    receiver?: RTCRtpReceiver,
    adaptiveStream?: boolean,
  ) {
    super(mediaTrack, sid, Track.Kind.Video, receiver);
    this.adaptiveStream = adaptiveStream;
  }

  get isAdaptiveStream(): boolean {
    return this.adaptiveStream ?? false;
  }

  /** @internal */
  setMuted(muted: boolean) {
    super.setMuted(muted);

    this.attachedElements.forEach((element) => {
      // detach or attach
      if (muted) {
        detachTrack(this.mediaStreamTrack, element);
      } else {
        attachToElement(this.mediaStreamTrack, element);
      }
    });
  }

  attach(): HTMLMediaElement;
  attach(element: HTMLMediaElement): HTMLMediaElement;
  attach(element?: HTMLMediaElement): HTMLMediaElement {
    if (!element) {
      element = super.attach();
    } else {
      super.attach(element);
    }

    if (this.adaptiveStream) {
      this.elementInfos.push({
        element,
        visible: true, // default visible
      });

      (element as ObservableMediaElement)
        .handleResize = this.debouncedHandleResize;
      (element as ObservableMediaElement)
        .handleVisibilityChanged = this.handleVisibilityChanged;

      getIntersectionObserver().observe(element);
      getResizeObserver().observe(element);
    }
    return element;
  }

  detach(): HTMLMediaElement[];
  detach(element: HTMLMediaElement): HTMLMediaElement;
  detach(element?: HTMLMediaElement): HTMLMediaElement | HTMLMediaElement[] {
    let detachedElements: HTMLMediaElement[] = [];
    if (element) {
      this.stopObservingElement(element);
      return super.detach(element);
    }
    detachedElements = super.detach();

    for (const e of detachedElements) {
      this.stopObservingElement(e);
    }

    return detachedElements;
  }

  protected monitorReceiver = async () => {
    if (!this.receiver) {
      this._currentBitrate = 0;
      return;
    }
    const stats = await this.getReceiverStats();

    if (stats && this.prevStats) {
      this._currentBitrate = computeBitrate(stats, this.prevStats);
    }

    this.prevStats = stats;
    setTimeout(() => {
      this.monitorReceiver();
    }, monitorFrequency);
  };

  private async getReceiverStats(): Promise<VideoReceiverStats | undefined> {
    if (!this.receiver) {
      return;
    }

    const stats = await this.receiver.getStats();
    let receiverStats: VideoReceiverStats | undefined;
    stats.forEach((v) => {
      if (v.type === 'inbound-rtp') {
        receiverStats = {
          type: 'video',
          framesDecoded: v.framesDecoded,
          framesDropped: v.framesDropped,
          framesReceived: v.framesReceived,
          packetsReceived: v.packetsReceived,
          packetsLost: v.packetsLost,
          frameWidth: v.frameWidth,
          frameHeight: v.frameHeight,
          pliCount: v.pliCount,
          firCount: v.firCount,
          nackCount: v.nackCount,
          jitter: v.jitter,
          timestamp: v.timestamp,
          bytesReceived: v.bytesReceived,
        };
      }
    });
    return receiverStats;
  }

  private stopObservingElement(element: HTMLMediaElement) {
    getIntersectionObserver()?.unobserve(element);
    getResizeObserver()?.unobserve(element);
    this.elementInfos = this.elementInfos.filter((info) => info.element !== element);
  }

  private handleVisibilityChanged = (entry: IntersectionObserverEntry) => {
    const { target, isIntersecting } = entry;
    const elementInfo = this.elementInfos.find((info) => info.element === target);
    if (elementInfo) {
      elementInfo.visible = isIntersecting;
      elementInfo.visibilityChangedAt = Date.now();
    }
    this.updateVisibility();
  };

  private readonly debouncedHandleResize = debounce(() => {
    this.updateDimensions();
  }, REACTION_DELAY);

  private updateVisibility() {
    const lastVisibilityChange = this.elementInfos.reduce(
      (prev, info) => Math.max(prev, info.visibilityChangedAt || 0),
      0,
    );
    const isVisible = this.elementInfos.some((info) => info.visible);

    if (this.lastVisible === isVisible) {
      return;
    }

    if (!isVisible && Date.now() - lastVisibilityChange < REACTION_DELAY) {
      // delay hidden events
      setTimeout(() => {
        this.updateVisibility();
      }, Date.now() - lastVisibilityChange);
      return;
    }

    this.lastVisible = isVisible;
    this.emit(TrackEvent.VisibilityChanged, isVisible, this);
  }

  private updateDimensions() {
    let maxWidth = 0;
    let maxHeight = 0;
    for (const info of this.elementInfos) {
      if (info.visible) {
        if (info.element.clientWidth + info.element.clientHeight > maxWidth + maxHeight) {
          maxWidth = info.element.clientWidth;
          maxHeight = info.element.clientHeight;
        }
      }
    }

    if (this.lastDimensions?.width === maxWidth && this.lastDimensions?.height === maxHeight) {
      return;
    }

    this.lastDimensions = {
      width: maxWidth,
      height: maxHeight,
    };
    this.emit(TrackEvent.VideoDimensionsChanged, this.lastDimensions, this);
  }
}

interface ElementInfo {
  element: HTMLMediaElement;
  visible: boolean;
  visibilityChangedAt?: number;
}
