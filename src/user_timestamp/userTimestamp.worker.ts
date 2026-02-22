/**
 * Lightweight worker for stripping LKTS user timestamp trailers from inbound
 * encoded video frames via RTCRtpScriptTransform.
 *
 * When a valid trailer is found, the timestamp is posted back to the main
 * thread so the SDK can store the RTP-to-user-timestamp mapping on the
 * corresponding RemoteVideoTrack.
 */
import { USER_TS_MAGIC, USER_TS_TRAILER_SIZE } from './UserTimestampTransformer';

function stripAndForward(
  readable: ReadableStream<RTCEncodedVideoFrame>,
  writable: WritableStream<RTCEncodedVideoFrame>,
) {
  const transformStream = new TransformStream<RTCEncodedVideoFrame, RTCEncodedVideoFrame>({
    transform(encodedFrame, controller) {
      try {
        const bytes = new Uint8Array(encodedFrame.data);
        if (bytes.byteLength >= USER_TS_TRAILER_SIZE) {
          const magicStart = bytes.byteLength - USER_TS_MAGIC.length;
          let match = true;
          for (let i = 0; i < USER_TS_MAGIC.length; i++) {
            if (bytes[magicStart + i] !== USER_TS_MAGIC[i]) {
              match = false;
              break;
            }
          }
          if (match) {
            const tsStart = bytes.byteLength - USER_TS_TRAILER_SIZE;
            const view = new DataView(encodedFrame.data);
            const high = view.getUint32(tsStart);
            const low = view.getUint32(tsStart + 4);
            const timestampUs = high * 0x100000000 + low;
            const meta = encodedFrame.getMetadata() as Record<string, unknown>;
            const rtpTimestamp = meta.rtpTimestamp as number | undefined;

            encodedFrame.data = encodedFrame.data.slice(0, tsStart);
            postMessage({ kind: 'userTimestamp', timestampUs, rtpTimestamp: rtpTimestamp ?? 0 });
          }
        }
      } catch {
        // Best-effort: never break the media pipeline.
      }
      controller.enqueue(encodedFrame);
    },
  });

  readable
    .pipeThrough(transformStream)
    .pipeTo(writable)
    .catch(() => {});
}

// RTCRtpScriptTransform path
// @ts-ignore
if (self.RTCTransformEvent) {
  // @ts-ignore
  self.onrtctransform = (event: RTCTransformEvent) => {
    // @ts-ignore
    const transformer = event.transformer;
    stripAndForward(transformer.readable, transformer.writable);
  };
}

// createEncodedStreams (legacy insertable streams) path
self.onmessage = (event: MessageEvent) => {
  const { kind, readable, writable } = event.data;
  if (kind === 'decode' && readable && writable) {
    stripAndForward(readable, writable);
  }
};
