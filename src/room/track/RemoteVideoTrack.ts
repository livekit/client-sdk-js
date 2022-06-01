import { debounce } from 'ts-debounce';
import { TrackEvent } from '../events';
import { computeBitrate, monitorFrequency, VideoReceiverStats } from '../stats';
import { getIntersectionObserver, getResizeObserver, ObservableMediaElement } from '../utils';
import RemoteTrack from './RemoteTrack';
import { attachToElement, detachTrack, Track } from './Track';
import { AdaptiveStreamSettings } from './types';
import log from '../../logger';

const REACTION_DELAY = 100;

export default class RemoteVideoTrack extends RemoteTrack {
  /** @internal */
  receiver?: RTCRtpReceiver;

  private prevStats?: VideoReceiverStats;

  private elementInfos: ElementInfo[] = [];

  private adaptiveStreamSettings?: AdaptiveStreamSettings;

  private lastVisible?: boolean;

  private lastDimensions?: Track.Dimensions;

  private hasUsedAttach: boolean = false;

  constructor(
    mediaTrack: MediaStreamTrack,
    sid: string,
    receiver?: RTCRtpReceiver,
    adaptiveStreamSettings?: AdaptiveStreamSettings,
  ) {
    super(mediaTrack, sid, Track.Kind.Video, receiver);
    this.adaptiveStreamSettings = adaptiveStreamSettings;
    if (this.isAdaptiveStream) {
      this.streamState = Track.StreamState.Paused;
    }
  }

  get isAdaptiveStream(): boolean {
    return this.adaptiveStreamSettings !== undefined;
  }

  get mediaStreamTrack() {
    if (this.isAdaptiveStream && !this.hasUsedAttach) {
      log.warn(
        'When using adaptiveStream, you need to use remoteVideoTrack.attach() to add the track to a HTMLVideoElement, otherwise your video tracks might never start',
      );
    }
    return this._mediaStreamTrack;
  }

  /** @internal */
  setMuted(muted: boolean) {
    super.setMuted(muted);

    this.attachedElements.forEach((element) => {
      // detach or attach
      if (muted) {
        detachTrack(this._mediaStreamTrack, element);
      } else {
        attachToElement(this._mediaStreamTrack, element);
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
    if (
      this.adaptiveStreamSettings &&
      this.elementInfos.find((info) => info.element === element) === undefined
    ) {
      const elementInfo = new HTMLElementInfo(element);
      this.observeElementInfo(elementInfo);
    }
    this.hasUsedAttach = true;
    return element;
  }

  /**
   * Observe an ElementInfo for changes when adaptive streaming.
   * @param elementInfo
   * @internal
   */
  observeElementInfo(elementInfo: ElementInfo) {
    if (
      this.adaptiveStreamSettings &&
      this.elementInfos.find((info) => info === elementInfo) === undefined
    ) {
      elementInfo.handleResize = () => {
        this.debouncedHandleResize();
      };
      elementInfo.handleVisibilityChanged = () => {
        this.updateVisibility();
      };
      this.elementInfos.push(elementInfo);
      elementInfo.observe();
      // trigger the first resize update cycle
      // if the tab is backgrounded, the initial resize event does not fire until
      // the tab comes into focus for the first time.
      this.debouncedHandleResize();
      this.updateVisibility();
    }
  }

  /**
   * Stop observing an ElementInfo for changes.
   * @param elementInfo
   * @internal
   */
  stopObservingElementInfo(elementInfo: ElementInfo) {
    const stopElementInfos = this.elementInfos.filter((info) => info === elementInfo);
    for (const info of stopElementInfos) {
      info.stopObserving();
    }
    this.elementInfos = this.elementInfos.filter((info) => info !== elementInfo);
    this.updateVisibility();
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

  /** @internal */
  getDecoderImplementation(): string | undefined {
    return this.prevStats?.decoderImplementation;
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
          decoderImplementation: v.decoderImplementation,
        };
      }
    });
    return receiverStats;
  }

  private stopObservingElement(element: HTMLMediaElement) {
    const stopElementInfos = this.elementInfos.filter((info) => info.element === element);
    for (const info of stopElementInfos) {
      info.stopObserving();
    }
    this.elementInfos = this.elementInfos.filter((info) => info.element !== element);
  }

  protected async handleAppVisibilityChanged() {
    await super.handleAppVisibilityChanged();
    if (!this.isAdaptiveStream) return;
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

    const backgroundPause =
      this.adaptiveStreamSettings?.pauseVideoInBackground ?? true // default to true
        ? this.isInBackground
        : false;
    const isVisible = this.elementInfos.some((info) => info.visible) && !backgroundPause;

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
      const currentElementWidth = info.width() * pixelDensityValue;
      const currentElementHeight = info.height() * pixelDensityValue;
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

export interface ElementInfo {
  element: object;
  width(): number;
  height(): number;
  visible: boolean;
  visibilityChangedAt: number | undefined;

  handleResize?: () => void;
  handleVisibilityChanged?: () => void;
  observe(): void;
  stopObserving(): void;
}

class HTMLElementInfo implements ElementInfo {
  element: HTMLMediaElement;

  visible: boolean;

  visibilityChangedAt: number | undefined;

  handleResize?: () => void;

  handleVisibilityChanged?: () => void;

  constructor(element: HTMLMediaElement, visible: boolean = false) {
    this.element = element;
    this.visible = visible;
    this.visibilityChangedAt = 0;
  }

  width(): number {
    return this.element.clientWidth;
  }

  height(): number {
    return this.element.clientWidth;
  }

  observe() {
    (this.element as ObservableMediaElement).handleResize = () => {
      this.handleResize?.();
    };
    (this.element as ObservableMediaElement).handleVisibilityChanged = this.onVisibilityChanged;

    getIntersectionObserver().observe(this.element);
    getResizeObserver().observe(this.element);
  }

  private onVisibilityChanged = (entry: IntersectionObserverEntry) => {
    const { target, isIntersecting } = entry;
    if (target === this.element) {
      this.visible = isIntersecting;
      this.visibilityChangedAt = Date.now();
      this.handleVisibilityChanged?.();
    }
  };

  stopObserving() {
    getIntersectionObserver()?.unobserve(this.element);
    getResizeObserver()?.unobserve(this.element);
  }
}
