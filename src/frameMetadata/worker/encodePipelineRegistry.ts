import { appendPacketTrailerToEncodedFrame } from '../frameMetadata';
import type { FrameMetadataPublishOptions } from '../types';
import { hasFrameMetadataPublishOptions } from '../utils';

interface EncodePipelineState {
  /** User data to attach to the next non-empty frame, cleared once written. */
  pendingUserData?: Uint8Array;
}

/**
 * Tracks encode pipelines by trackId so per-frame user data posted from the
 * main thread can be routed to every encode pipeline of a track (a track can
 * have several pipelines when publishing backup codecs).
 */
export class EncodePipelineRegistry {
  private pipelines = new Map<string, Set<EncodePipelineState>>();

  /**
   * User data received before any pipeline registered under its trackId.
   * RTCRtpScriptTransform registration arrives via a channel separate from
   * postMessage, so a setFrameUserData message can race ahead of it; the
   * first pipeline registering under the key adopts the stashed value.
   */
  private pendingByKey = new Map<string, Uint8Array>();

  setupEncodeTransform(
    readable: ReadableStream,
    writable: WritableStream,
    packetTrailer?: FrameMetadataPublishOptions,
    trackId?: string,
  ) {
    if (!hasFrameMetadataPublishOptions(packetTrailer)) {
      readable.pipeTo(writable).catch(() => {});
      return;
    }

    const state: EncodePipelineState = {};
    if (trackId !== undefined) {
      let states = this.pipelines.get(trackId);
      if (!states) {
        states = new Set();
        this.pipelines.set(trackId, states);
      }
      states.add(state);

      const stashed = this.pendingByKey.get(trackId);
      if (stashed) {
        state.pendingUserData = stashed;
        this.pendingByKey.delete(trackId);
      }
    }

    let frameId = 0;
    const transform = new TransformStream({
      transform(
        frame: RTCEncodedVideoFrame,
        controller: TransformStreamDefaultController<RTCEncodedVideoFrame>,
      ) {
        try {
          if (packetTrailer?.frameId) {
            frameId = frameId === 0xffffffff ? 1 : frameId + 1;
          }
          let userData: Uint8Array | undefined;
          // Empty (DTX-like) frames never carry a trailer; don't let them
          // consume the one-shot user data.
          if (packetTrailer?.userData && frame.data.byteLength > 0) {
            userData = state.pendingUserData;
            state.pendingUserData = undefined;
          }
          appendPacketTrailerToEncodedFrame(frame, packetTrailer, frameId, userData);
        } catch {
          // Never drop frames on trailer-write failure.
        }
        controller.enqueue(frame);
      },
    });

    readable
      .pipeThrough(transform)
      .pipeTo(writable)
      .catch(() => {})
      .finally(() => {
        if (trackId !== undefined) {
          const states = this.pipelines.get(trackId);
          if (states) {
            states.delete(state);
            if (states.size === 0) {
              this.pipelines.delete(trackId);
            }
          }
        }
      });
  }

  /**
   * Sets the user data to attach to the next frame of each encode pipeline
   * registered under the trackId. An undefined or empty value clears any
   * pending user data instead.
   */
  setFrameUserData(trackId: string, userData?: Uint8Array) {
    const normalized = userData && userData.length > 0 ? userData : undefined;
    const states = this.pipelines.get(trackId);
    if (states && states.size > 0) {
      for (const state of states) {
        state.pendingUserData = normalized;
      }
      this.pendingByKey.delete(trackId);
      return;
    }

    if (normalized) {
      this.pendingByKey.set(trackId, normalized);
    } else {
      this.pendingByKey.delete(trackId);
    }
  }
}
