import { debounce } from 'ts-debounce';
import { TrackEvent } from '../events';
import { computeBitrate, monitorFrequency, VideoReceiverStats } from '../stats';
import {
  getIntersectionObserver, getResizeObserver, isMobile, ObservableMediaElement,
} from '../utils';
import RemoteTrack from './RemoteTrack';
import { attachToElement, detachTrack, Track } from './Track';
import { AdaptiveStreamSettings } from './types';

const REACTION_DELAY = 100;

export default class RemoteVideoTrack extends RemoteTrack {
  /** @internal */
  receiver?: RTCRtpReceiver;

  private prevStats?: VideoReceiverStats;

  private elementInfos: ElementInfo[] = [];

  private adaptiveStreamSettings?: AdaptiveStreamSettings;

  private lastVisible?: boolean;

  private lastDimensions?: Track.Dimensions;

  constructor(
    mediaTrack: MediaStreamTrack,
    sid: string,
    receiver?: RTCRtpReceiver,
    adaptiveStreamSettings?: AdaptiveStreamSettings,
  ) {
    super(mediaTrack, sid, Track.Kind.Video, receiver);
    this.adaptiveStreamSettings = adaptiveStreamSettings;
  }

  get isAdaptiveStream(): boolean {
    return this.adaptiveStreamSettings !== undefined;
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

    // It's possible attach is called multiple times on an element. When that's
    // the case, we'd want to avoid adding duplicate elementInfos
    if (this.adaptiveStreamSettings
      && this.elementInfos.find((info) => info.element === element) === undefined
    ) {
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

      // trigger the first resize update cycle
      // if the tab is backgrounded, the initial resize event does not fire until
      // the tab comes into focus for the first time.
      this.debouncedHandleResize();
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

    if (stats && this.prevStats && this.receiver) {
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

  protected async handleAppVisibilityChanged() {
    await super.handleAppVisibilityChanged();
    if (!this.isAdaptiveStream) return;
    // on desktop don't pause when tab is backgrounded
    if (!isMobile()) return;
    this.updateVisibility();
  }

  private readonly debouncedHandleResize = debounce(() => {
    this.updateDimensions();
  }, REACTION_DELAY);

  private updateVisibility() {
    const lastVisibilityChange = this.elementInfos.reduce(
      (prev, info) => Math.max(prev, info.visibilityChangedAt || 0),
      0,
    );
    const isVisible = this.elementInfos.some((info) => info.visible) && !this.isInBackground;

    if (this.lastVisible === isVisible) {
      return;
    }

    if (!isVisible && Date.now() - lastVisibilityChange < REACTION_DELAY) {
      // delay hidden events
      setTimeout(() => {
        this.updateVisibility();
      }, REACTION_DELAY);
      return;
    }

    this.lastVisible = isVisible;
    this.emit(TrackEvent.VisibilityChanged, isVisible, this);
  }

  private updateDimensions() {
    let maxWidth = 0;
    let maxHeight = 0;
    for (const info of this.elementInfos) {
      const pixelDensity = this.adaptiveStreamSettings?.pixelDensity ?? 1;
      const pixelDensityValue = pixelDensity === 'screen' ? window.devicePixelRatio : pixelDensity;
      const currentElementWidth = info.element.clientWidth * pixelDensityValue;
      const currentElementHeight = info.element.clientHeight * pixelDensityValue;
      if (currentElementWidth + currentElementHeight > maxWidth + maxHeight) {
        maxWidth = currentElementWidth;
        maxHeight = currentElementHeight;
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
