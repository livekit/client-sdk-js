import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MockMediaStreamTrack from '../../test/MockMediaStreamTrack';
import { TrackEvent } from '../events';
import RemoteVideoTrack, { ElementInfo } from './RemoteVideoTrack';
import type { Track } from './Track';

vi.useFakeTimers();

describe('RemoteVideoTrack', () => {
  let track: RemoteVideoTrack;

  beforeEach(() => {
    track = new RemoteVideoTrack(new MockMediaStreamTrack(), 'sid', undefined, {});
  });
  describe('element visibility', () => {
    let events: boolean[] = [];

    beforeEach(() => {
      track.on(TrackEvent.VisibilityChanged, (visible) => {
        events.push(visible);
      });
    });
    afterEach(() => {
      events = [];
    });

    it('emits a visibility event upon observing visible element', () => {
      const elementInfo = new MockElementInfo();
      elementInfo.visible = true;

      track.observeElementInfo(elementInfo);

      expect(events).toHaveLength(1);
      expect(events[0]).toBeTruthy();
    });

    it('emits a visibility event upon element becoming visible', () => {
      const elementInfo = new MockElementInfo();
      track.observeElementInfo(elementInfo);

      elementInfo.setVisible(true);

      expect(events).toHaveLength(2);
      expect(events[1]).toBeTruthy();
    });

    it('emits a visibility event upon removing only visible element', () => {
      const elementInfo = new MockElementInfo();
      elementInfo.visible = true;

      track.observeElementInfo(elementInfo);
      track.stopObservingElementInfo(elementInfo);

      expect(events).toHaveLength(2);
      expect(events[1]).toBeFalsy();
    });
  });

  describe('element dimensions', () => {
    let events: Track.Dimensions[] = [];

    beforeEach(() => {
      track.on(TrackEvent.VideoDimensionsChanged, (dimensions) => {
        events.push(dimensions);
      });
    });

    afterEach(() => {
      events = [];
    });

    it('emits a dimensions event upon observing element', () => {
      const elementInfo = new MockElementInfo();
      elementInfo.setDimensions(100, 100);

      track.observeElementInfo(elementInfo);
      vi.runAllTimers();

      expect(events).toHaveLength(1);
      expect(events[0].width).toBe(100);
      expect(events[0].height).toBe(100);
    });

    it('emits a dimensions event upon element resize', () => {
      const elementInfo = new MockElementInfo();
      elementInfo.setDimensions(100, 100);

      track.observeElementInfo(elementInfo);
      vi.runAllTimers();

      elementInfo.setDimensions(200, 200);
      vi.runAllTimers();

      expect(events).toHaveLength(2);
      expect(events[1].width).toBe(200);
      expect(events[1].height).toBe(200);
    });
  });
});

describe('Document Picture-in-Picture detection', () => {
  /**
   * happy-dom's MediaStream implements everything except getTracks(), which Track.attach()
   * reads. Subclassing keeps it assignable to the element's srcObject, which type checks the
   * value against happy-dom's own MediaStream.
   */
  class TestMediaStream extends MediaStream {
    getTracks() {
      return [...this.getAudioTracks(), ...this.getVideoTracks()];
    }
  }

  /** Stands in for window.documentPictureInPicture, which happy-dom does not implement. */
  class FakeDocumentPictureInPicture extends EventTarget {
    window?: Window;
  }

  let documentPiP: FakeDocumentPictureInPicture;

  /** Gives an element the layout box that isElementInViewport reads. */
  function placeElement(
    el: HTMLElement,
    { top, left, width, height }: { top: number; left: number; width: number; height: number },
  ) {
    Object.defineProperties(el, {
      offsetTop: { value: top, configurable: true },
      offsetLeft: { value: left, configurable: true },
      offsetWidth: { value: width, configurable: true },
      offsetHeight: { value: height, configurable: true },
      offsetParent: { value: null, configurable: true },
    });
  }

  function createVideo(
    ownerDocument: Document,
    box = { top: 40, left: 40, width: 320, height: 180 },
  ) {
    const video = ownerDocument.createElement('video');
    ownerDocument.body.appendChild(video);
    placeElement(video, box);
    return video;
  }

  /**
   * Creates a frame in the given document and returns its document. happy-dom implements
   * neither frameElement nor a correct top on a frame's window, so both are wired up here.
   */
  function createFrame(parentDocument: Document, topWindow: Window) {
    const frame = parentDocument.createElement('iframe');
    parentDocument.body.appendChild(frame);
    const frameDocument = frame.contentDocument!;
    Object.defineProperties(frameDocument.defaultView!, {
      frameElement: { value: frame, configurable: true },
      top: { value: topWindow, configurable: true },
    });
    return frameDocument;
  }

  /**
   * Makes a frame document look like one reached through a cross-origin frame: the containing
   * frame belongs to another origin, so frameElement reads null while top stays readable.
   */
  function hideContainingFrame(frameDocument: Document) {
    Object.defineProperty(frameDocument.defaultView!, 'frameElement', {
      value: null,
      configurable: true,
    });
    return frameDocument;
  }

  /** Opens a Document PiP window and fires the 'enter' event the SDK listens for. */
  function openPiPWindow({ width, height } = { width: 1280, height: 820 }) {
    const pipDocument = document.implementation.createHTMLDocument('pip');
    documentPiP.window = Object.assign(new EventTarget(), {
      document: pipDocument,
      innerWidth: width,
      innerHeight: height,
      pageXOffset: 0,
      pageYOffset: 0,
    }) as unknown as Window;
    documentPiP.dispatchEvent(new Event('enter'));
    return pipDocument;
  }

  /** Attaches a fresh track to the element and records every VisibilityChanged emission. */
  function attachTrack(video: HTMLElement) {
    const track = new RemoteVideoTrack(new MockMediaStreamTrack(), 'sid', undefined!, {});
    const events: boolean[] = [];
    track.on(TrackEvent.VisibilityChanged, (visible) => events.push(visible));
    track.attach(video as HTMLMediaElement);
    return events;
  }

  /** Flushes the microtask + animation frame that onEnterPiP defers its re-check behind. */
  async function flushDeferredPiPCheck() {
    await vi.advanceTimersByTimeAsync(50);
  }

  function setOpenerHidden() {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  }

  beforeEach(() => {
    vi.stubGlobal('MediaStream', TestMediaStream);
    documentPiP = new FakeDocumentPictureInPicture();
    (window as any).documentPictureInPicture = documentPiP;
    // The opener tab is backgrounded in every case, so pauseVideoInBackground (on by default)
    // reports the element hidden unless it is genuinely in PiP.
    setOpenerHidden();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as any).documentPictureInPicture;
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.body.innerHTML = '';
  });

  it('does not report an opener-document element as being in PiP', () => {
    openPiPWindow();
    const video = createVideo(document);

    // The top-window check must not open a hole here: the opener's top is the opener itself.
    expect(window.top).toBe(window);
    expect(window.top).not.toBe(documentPiP.window);
    // The element sits at (40, 40) of the OPENER page, which falls inside the PiP window's
    // 1280x820 box. It is not in PiP, so the background pause applies.
    expect(attachTrack(video)).toEqual([false]);
  });

  it('does not report an element in an opener frame as being in PiP', () => {
    openPiPWindow();
    const openerFrame = createFrame(document, window);
    const video = createVideo(openerFrame);

    // An opener frame tops out at the opener, so neither the top check nor the walk matches.
    expect(openerFrame.defaultView!.top).toBe(window);
    expect(attachTrack(video)).toEqual([false]);
  });

  it('reports an element moved into the PiP document after the enter event', async () => {
    const video = createVideo(document);
    const events = attachTrack(video);
    expect(events).toEqual([false]);

    const pipDocument = openPiPWindow();
    // The SDK defers its re-check behind a microtask and an animation frame precisely so the
    // embedder can move its subtree across after the enter event fires.
    pipDocument.body.appendChild(video);
    expect(video.ownerDocument).toBe(pipDocument);
    await flushDeferredPiPCheck();

    expect(events).toEqual([false, true]);
  });

  it('leaves an unrelated opener element hidden when another element enters PiP', async () => {
    const openerVideo = createVideo(document);
    const movedVideo = createVideo(document);
    const openerEvents = attachTrack(openerVideo);
    const movedEvents = attachTrack(movedVideo);

    const pipDocument = openPiPWindow();
    pipDocument.body.appendChild(movedVideo);
    await flushDeferredPiPCheck();

    expect(movedEvents).toEqual([false, true]);
    expect(openerEvents).toEqual([false]);
  });

  it('reports an element inside a frame nested in the PiP document', () => {
    const pipDocument = openPiPWindow();
    const video = createVideo(createFrame(pipDocument, documentPiP.window!), {
      top: 10,
      left: 10,
      width: 320,
      height: 180,
    });

    expect(attachTrack(video)).toEqual([true]);
  });

  it('reports an element behind a cross-origin frame nested in the PiP window', () => {
    const pipDocument = openPiPWindow();
    const pipWindow = documentPiP.window!;
    // PiP document (origin A) -> frame (origin B) -> frame (origin A). The opener can reach
    // the innermost document, but its containing frame belongs to B, so frameElement is null
    // there and the same-origin walk cannot get back to the PiP document.
    const crossOriginFrame = createFrame(pipDocument, pipWindow);
    const innerFrame = hideContainingFrame(createFrame(crossOriginFrame, pipWindow));
    const video = createVideo(innerFrame, { top: 10, left: 10, width: 320, height: 180 });

    expect(innerFrame.defaultView!.frameElement).toBeNull();
    expect(innerFrame.defaultView!.top).toBe(pipWindow);
    expect(attachTrack(video)).toEqual([true]);
  });

  it('does not report an element scrolled out of the PiP window viewport', () => {
    const pipDocument = openPiPWindow();
    const video = createVideo(pipDocument, { top: 2000, left: 40, width: 320, height: 180 });

    expect(attachTrack(video)).toEqual([false]);
  });

  it('does not report an element as being in PiP when no PiP window is open', () => {
    const video = createVideo(document);

    expect(attachTrack(video)).toEqual([false]);
  });
});

class MockElementInfo implements ElementInfo {
  element: object = {};

  private _width = 0;

  private _height = 0;

  setDimensions(width: number, height: number) {
    let shouldEmit = false;
    if (this._width !== width) {
      this._width = width;
      shouldEmit = true;
    }
    if (this._height !== height) {
      this._height = height;
      shouldEmit = true;
    }

    if (shouldEmit) {
      this.handleResize?.();
    }
  }

  width(): number {
    return this._width;
  }

  height(): number {
    return this._height;
  }

  visible = false;

  pictureInPicture = false;

  setVisible = (visible: boolean) => {
    if (this.visible !== visible) {
      this.visible = visible;
      this.handleVisibilityChanged?.();
    }
  };

  visibilityChangedAt = 0;

  handleResize?: () => void;

  handleVisibilityChanged?: () => void;

  observe(): void {}

  stopObserving(): void {}
}
