/* eslint-disable @typescript-eslint/no-unused-vars */
import { vi } from 'vitest';

export class EnhancedMockMediaStreamTrack implements MediaStreamTrack {
  contentHint: string = '';
  enabled: boolean = true;
  id: string = 'mock-track-id';
  kind: string;
  label: string = 'Mock Track';
  muted: boolean = false;
  readyState: MediaStreamTrackState = 'live';
  isolated: boolean = false;

  onended: ((this: MediaStreamTrack, ev: Event) => any) | null = null;
  onmute: ((this: MediaStreamTrack, ev: Event) => any) | null = null;
  onunmute: ((this: MediaStreamTrack, ev: Event) => any) | null = null;
  onisolationchange: ((this: MediaStreamTrack, ev: Event) => any) | null = null;

  private settings: MediaTrackSettings;
  private constraints: MediaTrackConstraints;
  private listeners: Map<string, Set<EventListenerOrEventListenerObject>> = new Map();

  constructor(kind: 'audio' | 'video' = 'audio', settings: Partial<MediaTrackSettings> = {}) {
    this.kind = kind;
    this.settings = {
      deviceId: 'default',
      groupId: 'default-group',
      ...settings,
    };
    this.constraints = {};
  }

  async applyConstraints(constraints?: MediaTrackConstraints): Promise<void> {
    this.constraints = { ...this.constraints, ...constraints };
    // Update settings based on constraints if needed
    return Promise.resolve();
  }

  clone(): MediaStreamTrack {
    const cloned = new EnhancedMockMediaStreamTrack(this.kind as 'audio' | 'video', this.settings);
    cloned.enabled = this.enabled;
    return cloned as MediaStreamTrack;
  }

  getCapabilities(): MediaTrackCapabilities {
    return {};
  }

  getConstraints(): MediaTrackConstraints {
    return { ...this.constraints };
  }

  getSettings(): MediaTrackSettings {
    return { ...this.settings };
  }

  stop(): void {
    this.readyState = 'ended';
    this.dispatchEvent(new Event('ended'));
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      listeners.forEach((listener) => {
        if (typeof listener === 'function') {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      });
    }
    return true;
  }

  // Helper methods for testing
  updateSettings(settings: Partial<MediaTrackSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  triggerMute(): void {
    this.muted = true;
    this.dispatchEvent(new Event('mute'));
  }

  triggerUnmute(): void {
    this.muted = false;
    this.dispatchEvent(new Event('unmute'));
  }

  triggerEnded(): void {
    this.readyState = 'ended';
    this.dispatchEvent(new Event('ended'));
  }
}

export class MockRTCRtpSender {
  track: MediaStreamTrack | null;
  transport: { state: RTCDtlsTransportState } | null = { state: 'connected' };
  private parameters: RTCRtpSendParameters;

  constructor(track: MediaStreamTrack | null = null, encodings: RTCRtpEncodingParameters[] = []) {
    this.track = track;
    this.parameters = {
      transactionId: '',
      encodings: encodings.length > 0 ? encodings : [{ active: true }],
      headerExtensions: [],
      rtcp: {},
      codecs: [],
    };
  }

  async replaceTrack(track: MediaStreamTrack | null): Promise<void> {
    this.track = track;
    return Promise.resolve();
  }

  async getStats(): Promise<RTCStatsReport> {
    const map = new Map();

    // Add stats for each encoding
    this.parameters.encodings.forEach((encoding, idx) => {
      const rid = encoding.rid || (idx === 0 ? 'f' : idx === 1 ? 'h' : 'q');
      map.set(`outbound-rtp-${rid}`, {
        type: 'outbound-rtp',
        id: `mock-outbound-rtp-${rid}`,
        rid,
        timestamp: Date.now(),
        bytesSent: 1000 * (idx + 1),
        packetsSent: 10 * (idx + 1),
        packetsLost: 0,
        framesSent: 100 * (idx + 1),
        frameWidth: 1280 / (2 ** idx),
        frameHeight: 720 / (2 ** idx),
        framesPerSecond: 30,
        firCount: 0,
        pliCount: 0,
        nackCount: 0,
        qualityLimitationReason: 'none',
        qualityLimitationDurations: {},
        qualityLimitationResolutionChanges: 0,
        targetBitrate: 1000000 / (2 ** idx),
      });
    });

    return map as RTCStatsReport;
  }

  getParameters(): RTCRtpSendParameters {
    return JSON.parse(JSON.stringify(this.parameters));
  }

  setParameters(parameters: RTCRtpSendParameters): Promise<void> {
    this.parameters = JSON.parse(JSON.stringify(parameters));
    return Promise.resolve();
  }
}

export class MockRTCRtpReceiver {
  track: MediaStreamTrack;
  playoutDelayHint?: number;
  transport: { state: RTCDtlsTransportState } | null = { state: 'connected' };

  constructor(track: MediaStreamTrack) {
    this.track = track;
  }

  async getStats(): Promise<RTCStatsReport> {
    const map = new Map();

    if (this.track.kind === 'video') {
      map.set('inbound-rtp', {
        type: 'inbound-rtp',
        id: 'mock-inbound-rtp',
        codecId: 'codec-1',
        timestamp: Date.now(),
        bytesReceived: 1000,
        packetsReceived: 10,
        packetsLost: 0,
        jitter: 0.01,
        framesDecoded: 100,
        framesDropped: 0,
        framesReceived: 100,
        frameWidth: 1280,
        frameHeight: 720,
        pliCount: 0,
        firCount: 0,
        nackCount: 0,
        decoderImplementation: 'libvpx',
      });
      map.set('codec-1', {
        type: 'codec',
        id: 'codec-1',
        mimeType: 'video/VP8',
      });
    } else {
      map.set('inbound-rtp', {
        type: 'inbound-rtp',
        id: 'mock-inbound-rtp',
        timestamp: Date.now(),
        bytesReceived: 1000,
        packetsReceived: 10,
        jitter: 0.01,
        concealedSamples: 0,
        concealmentEvents: 0,
        silentConcealedSamples: 0,
        silentConcealmentEvents: 0,
        totalAudioEnergy: 0.5,
        totalSamplesDuration: 1.0,
      });
    }

    return map as RTCStatsReport;
  }

  getSynchronizationSources(): RTCRtpSynchronizationSource[] {
    return [
      {
        timestamp: Date.now(),
        rtpTimestamp: 123456,
        source: 0,
      },
    ];
  }

  getContributingSources(): RTCRtpContributingSource[] {
    return [];
  }
}

export class MockAudioContext {
  state: AudioContextState = 'running';
  destination: AudioNode = {} as AudioNode;
  private gainNodes: MockGainNode[] = [];
  private sourceNodes: MockMediaStreamAudioSourceNode[] = [];

  createMediaStreamSource(stream: MediaStream): MediaStreamAudioSourceNode {
    const node = new MockMediaStreamAudioSourceNode();
    this.sourceNodes.push(node);
    return node as MediaStreamAudioSourceNode;
  }

  createGain(): GainNode {
    const node = new MockGainNode();
    this.gainNodes.push(node);
    return node as GainNode;
  }

  async resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }

  async suspend(): Promise<void> {
    this.state = 'suspended';
    return Promise.resolve();
  }

  async close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }
}

export class MockGainNode {
  gain: { value: number; setTargetAtTime: (value: number, time: number, constant: number) => void } = {
    value: 1.0,
    setTargetAtTime: (value: number, time: number, constant: number) => {
      this.gain.value = value;
    },
  };

  private connections: AudioNode[] = [];

  connect(destination: AudioNode): AudioNode {
    this.connections.push(destination);
    return destination;
  }

  disconnect(): void {
    this.connections = [];
  }
}

export class MockMediaStreamAudioSourceNode {
  private connections: AudioNode[] = [];

  connect(destination: AudioNode): AudioNode {
    this.connections.push(destination);
    return destination;
  }

  disconnect(): void {
    this.connections = [];
  }
}

export class MockHTMLMediaElement {
  srcObject: MediaStream | null = null;
  volume: number = 1.0;
  muted: boolean = false;
  autoplay: boolean = false;
  paused: boolean = true;
  tagName: string = 'VIDEO';

  private playPromiseResolve?: () => void;
  private playPromiseReject?: (error: Error) => void;
  private playBehavior: 'success' | 'not-allowed' | 'abort' = 'success';
  private listeners: Map<string, Set<EventListenerOrEventListenerObject>> = new Map();

  play(): Promise<void> {
    this.paused = false;
    return new Promise((resolve, reject) => {
      if (this.playBehavior === 'success') {
        resolve();
      } else if (this.playBehavior === 'not-allowed') {
        const error = new Error('play() failed');
        (error as any).name = 'NotAllowedError';
        reject(error);
      } else if (this.playBehavior === 'abort') {
        const error = new Error('play() aborted');
        (error as any).name = 'AbortError';
        reject(error);
      }
    });
  }

  pause(): void {
    this.paused = true;
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      listeners.forEach((listener) => {
        if (typeof listener === 'function') {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      });
    }
    return true;
  }

  // Helper for testing
  setPlayBehavior(behavior: 'success' | 'not-allowed' | 'abort'): void {
    this.playBehavior = behavior;
  }
}

export class MockHTMLVideoElement extends MockHTMLMediaElement {
  playsInline: boolean;

  constructor() {
    super();
    this.playsInline = false;
  }
}

export class MockHTMLAudioElement extends MockHTMLMediaElement {
  setSinkId(deviceId: string): Promise<void> {
    return Promise.resolve();
  }
}

export class MockSignalClient {
  // Mock signal client for video track tests
  sendUpdateTrackSettings = vi.fn();
  sendUpdateVideoLayers = vi.fn();
  sendUpdateSubscription = vi.fn();
}

export class MockIntersectionObserver {
  private callback: IntersectionObserverCallback;
  private elements: Set<Element> = new Set();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe(element: Element): void {
    this.elements.add(element);
    // Trigger initial callback
    setTimeout(() => {
      this.triggerIntersection(element, true);
    }, 0);
  }

  unobserve(element: Element): void {
    this.elements.delete(element);
  }

  disconnect(): void {
    this.elements.clear();
  }

  triggerIntersection(element: Element, isIntersecting: boolean): void {
    const entry = {
      target: element,
      isIntersecting,
      intersectionRatio: isIntersecting ? 1 : 0,
      boundingClientRect: {} as DOMRectReadOnly,
      intersectionRect: {} as DOMRectReadOnly,
      rootBounds: null,
      time: Date.now(),
    } as IntersectionObserverEntry;

    this.callback([entry], this as any);
  }
}

export class MockResizeObserver {
  private callback: ResizeObserverCallback;
  private elements: Set<Element> = new Set();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(element: Element): void {
    this.elements.add(element);
    // Trigger initial callback
    setTimeout(() => {
      this.triggerResize(element);
    }, 0);
  }

  unobserve(element: Element): void {
    this.elements.delete(element);
  }

  disconnect(): void {
    this.elements.clear();
  }

  triggerResize(element: Element): void {
    const entry = {
      target: element,
      contentRect: {
        width: (element as any).clientWidth || 0,
        height: (element as any).clientHeight || 0,
      } as DOMRectReadOnly,
      borderBoxSize: [],
      contentBoxSize: [],
      devicePixelContentBoxSize: [],
    } as ResizeObserverEntry;

    this.callback([entry], this as any);
  }
}

export class MockMediaStream {
  id: string = 'mock-stream-id';
  active: boolean = true;
  private tracks: MediaStreamTrack[] = [];
  private listeners: Map<string, Set<EventListenerOrEventListenerObject>> = new Map();

  constructor(tracks: MediaStreamTrack[] = []) {
    this.tracks = [...tracks];
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this.tracks.filter((t) => t.kind === 'audio');
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.tracks.filter((t) => t.kind === 'video');
  }

  getTracks(): MediaStreamTrack[] {
    return [...this.tracks];
  }

  addTrack(track: MediaStreamTrack): void {
    if (!this.tracks.includes(track)) {
      this.tracks.push(track);
    }
  }

  removeTrack(track: MediaStreamTrack): void {
    const index = this.tracks.indexOf(track);
    if (index >= 0) {
      this.tracks.splice(index, 1);
      // Create a custom event since MediaStreamTrackEvent may not be available in test environment
      const event = new Event('removetrack') as any;
      event.track = track;
      this.dispatchEvent(event);
    }
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      listeners.forEach((listener) => {
        if (typeof listener === 'function') {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      });
    }
    return true;
  }

  clone(): MediaStream {
    return new MockMediaStream(this.tracks.map((t) => t.clone())) as unknown as MediaStream;
  }

  getTrackById(trackId: string): MediaStreamTrack | null {
    return this.tracks.find((t) => t.id === trackId) || null;
  }
}
