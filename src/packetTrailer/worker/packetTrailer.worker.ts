import {
  extractPacketTrailer,
  getFrameRtpTimestamp,
  getFrameSsrc,
} from '../../e2ee/packetTrailer';
import type { PTMetadataMessage, PTWorkerMessage } from '../types';

const activeTransforms = new Map<string, AbortController>();

onmessage = (ev: MessageEvent<PTWorkerMessage>) => {
  const msg = ev.data;

  switch (msg.kind) {
    case 'init':
      postMessage({ kind: 'initAck' });
      break;

    case 'decode':
      setupDecodeTransform(msg.data.readableStream, msg.data.writableStream, msg.data.trackId);
      break;

    case 'removeTransform':
      teardownTransform(msg.data.trackId);
      break;

    default:
      break;
  }
};

function setupDecodeTransform(
  readable: ReadableStream,
  writable: WritableStream,
  trackId: string,
) {
  teardownTransform(trackId);

  const abortController = new AbortController();
  activeTransforms.set(trackId, abortController);

  const transform = new TransformStream({
    transform(
      frame: RTCEncodedVideoFrame,
      controller: TransformStreamDefaultController<RTCEncodedVideoFrame>,
    ) {
      const result = extractPacketTrailer(frame.data);
      if (result.metadata) {
        const rtpTimestamp = getFrameRtpTimestamp(frame);
        const ssrc = getFrameSsrc(frame);
        if (rtpTimestamp !== undefined) {
          const msg: PTMetadataMessage = {
            kind: 'metadata',
            data: {
              trackId,
              rtpTimestamp,
              ssrc,
              metadata: result.metadata,
            },
          };
          postMessage(msg);
        }
        frame.data = result.data.buffer.slice(
          result.data.byteOffset,
          result.data.byteOffset + result.data.byteLength,
        );
      }
      controller.enqueue(frame);
    },
  });

  readable
    .pipeThrough(transform)
    .pipeTo(writable, { signal: abortController.signal })
    .catch(() => {
      // pipe aborted via teardown -- expected
    });
}

function teardownTransform(trackId: string) {
  const existing = activeTransforms.get(trackId);
  if (existing) {
    existing.abort();
    activeTransforms.delete(trackId);
  }
}
