import { debounce } from 'ts-debounce';
import { TrackEvent } from '../events';
import { VideoReceiverStats } from '../stats';
import { getIntersectionObserver, getResizeObserver, ObservableMediaElement } from '../utils';
import { attachToElement, detachTrack, Track } from './Track';

const REACTION_DELAY = 1000;

export default class RemoteVideoTrack extends Track {
  /** @internal */
  receiver?: RTCRtpReceiver;

  // @ts-ignore noUnusedLocals
  private prevStats?: VideoReceiverStats;

  private elementInfos: ElementInfo[] = [];

  private autoManaged?: boolean;

  private lastVisible?: boolean;

  private lastDimensions?: Track.Dimensions;

  constructor(
    mediaTrack: MediaStreamTrack,
    sid: string,
    receiver?: RTCRtpReceiver,
    autoManaged?: boolean,
  ) {
    super(mediaTrack, Track.Kind.Video);
    // override id to parsed ID
    this.sid = sid;
    this.receiver = receiver;
    this.autoManaged = autoManaged;
  }

  get isAutoManaged(): boolean {
    return this.autoManaged ?? false;
  }

  /** @internal */
  setMuted(muted: boolean) {
    if (this.isMuted !== muted) {
      this.isMuted = muted;
      this.emit(muted ? TrackEvent.Muted : TrackEvent.Unmuted, this);
    }

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
    }
    super.attach(element);

    if (this.autoManaged) {
      this.elementInfos.push({
        element,
        visible: true, // default visible
        width: element.clientWidth,
        height: element.clientHeight,
      });

      (element as ObservableMediaElement)
        .handleResize = this.debouncedHandleResize;
      (element as ObservableMediaElement)
        .handleVisibilityChanged = this.debouncedHandleVisibilityChanged;

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
      detachedElements.push(element);
      return super.detach(element);
    }
    detachedElements = super.detach();

    for (const e of detachedElements) {
      this.stopObservingElement(e);
    }

    return detachedElements;
  }

  start() {
    // use `enabled` of track to enable re-use of transceiver
    super.enable();
  }

  stop() {
    // use `enabled` of track to enable re-use of transceiver
    super.disable();
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

  private readonly debouncedHandleVisibilityChanged = debounce(
    this.handleVisibilityChanged, REACTION_DELAY,
  );

  private handleResize = (entry: ResizeObserverEntry) => {
    const { target, contentRect } = entry;
    const elementInfo = this.elementInfos.find((info) => info.element === target);
    if (elementInfo) {
      elementInfo.width = contentRect.width;
      elementInfo.height = contentRect.height;
    }
    this.updateDimensions();
  };

  private readonly debouncedHandleResize = debounce(this.handleResize, REACTION_DELAY);

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
        if (info.width + info.height > maxWidth + maxHeight) {
          maxWidth = info.width;
          maxHeight = info.height;
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
  width: number;
  height: number;
  visible: boolean;
  visibilityChangedAt?: number;
}
