import { processPacketTrailer } from '../frameMetadata';
import type { PTMetadataMessage, PTScriptTransformOptions, PTWorkerMessage } from '../types';
import { EncodePipelineRegistry } from './encodePipelineRegistry';

/**
 * Holds the trackId currently associated with a pipeline. A mutable
 * wrapper is used so the transform closure always reads the latest
 * trackId after a receiver gets re-bound to a new track.
 */
interface PipelineState {
  trackId: string;
  hasPacketTrailer: boolean;
}

const pipelines = new Map<string, PipelineState>();

const encodePipelines = new EncodePipelineRegistry();

onmessage = (ev: MessageEvent<PTWorkerMessage>) => {
  const msg = ev.data;

  switch (msg.kind) {
    case 'init':
      postMessage({ kind: 'initAck' });
      break;

    case 'decode':
      setupDecodeTransform(
        msg.data.readableStream,
        msg.data.writableStream,
        msg.data.trackId,
        msg.data.hasPacketTrailer,
      );
      break;

    case 'encode':
      encodePipelines.setupEncodeTransform(
        msg.data.readableStream,
        msg.data.writableStream,
        msg.data.packetTrailer,
        msg.data.trackId,
      );
      break;

    case 'setFrameUserData':
      encodePipelines.setFrameUserData(msg.data.trackId, msg.data.userData);
      break;

    case 'updateTrackId':
      updateTrackId(msg.data.oldTrackId, msg.data.newTrackId, msg.data.hasPacketTrailer);
      break;

    default:
      break;
  }
};

function setupDecodeTransform(
  readable: ReadableStream,
  writable: WritableStream,
  trackId: string,
  hasPacketTrailer: boolean,
) {
  const state: PipelineState = { trackId, hasPacketTrailer };
  pipelines.set(trackId, state);

  const transform = new TransformStream({
    transform(
      frame: RTCEncodedVideoFrame,
      controller: TransformStreamDefaultController<RTCEncodedVideoFrame>,
    ) {
      try {
        if (state.hasPacketTrailer) {
          const result = processPacketTrailer(frame, state.trackId);
          if (result.data) {
            frame.data = result.data;
          }
          if (result.payload) {
            const msg: PTMetadataMessage = { kind: 'metadata', data: result.payload };
            postMessage(msg);
          }
        }
      } catch {
        // Never drop frames on trailer-extraction failure — pass through so
        // video keeps decoding even if metadata is lost for this frame.
      }
      controller.enqueue(frame);
    },
  });

  readable
    .pipeThrough(transform)
    .pipeTo(writable)
    .catch(() => {
      pipelines.delete(state.trackId);
    });
}

function updateTrackId(oldTrackId: string, newTrackId: string, hasPacketTrailer: boolean) {
  const state = pipelines.get(oldTrackId);
  if (state) {
    state.trackId = newTrackId;
    state.hasPacketTrailer = hasPacketTrailer;
    pipelines.delete(oldTrackId);
    pipelines.set(newTrackId, state);
  }
}

// Operations using RTCRtpScriptTransform.
// @ts-ignore
if (self.RTCTransformEvent) {
  // @ts-ignore
  self.onrtctransform = (event: RTCTransformEvent) => {
    // @ts-ignore
    const transformer = event.transformer;
    const options = transformer.options as PTScriptTransformOptions;
    if (options.kind === 'encode') {
      encodePipelines.setupEncodeTransform(
        transformer.readable,
        transformer.writable,
        options.packetTrailer,
        options.trackId,
      );
    } else {
      setupDecodeTransform(transformer.readable, transformer.writable, options.trackId, true);
    }
  };
}
