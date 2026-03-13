/**
 * Lightweight worker for stripping LKTS packet trailers from inbound
 * encoded video frames via RTCRtpScriptTransform.
 *
 * When a valid trailer is found, the metadata is posted back to the main
 * thread so the SDK can store the RTP-to-frame-metadata mapping on the
 * corresponding RemoteVideoTrack.
 */
import {
  TAG_FRAME_ID,
  TAG_TIMESTAMP_US,
  PACKET_TRAILER_ENVELOPE_SIZE,
  PACKET_TRAILER_MAGIC,
} from './PacketTrailerTransformer';

function stripAndForward(
  readable: ReadableStream<RTCEncodedVideoFrame>,
  writable: WritableStream<RTCEncodedVideoFrame>,
) {
  const transformStream = new TransformStream<RTCEncodedVideoFrame, RTCEncodedVideoFrame>({
    transform(encodedFrame, controller) {
      try {
        const bytes = new Uint8Array(encodedFrame.data);
        if (bytes.byteLength >= PACKET_TRAILER_ENVELOPE_SIZE) {
          const magicStart = bytes.byteLength - PACKET_TRAILER_MAGIC.length;
          let match = true;
          for (let i = 0; i < PACKET_TRAILER_MAGIC.length; i++) {
            if (bytes[magicStart + i] !== PACKET_TRAILER_MAGIC[i]) {
              match = false;
              break;
            }
          }
          if (match) {
            const trailerLen = (bytes[bytes.byteLength - 5] ?? 0) ^ 0xff;

            if (trailerLen >= PACKET_TRAILER_ENVELOPE_SIZE && trailerLen <= bytes.byteLength) {
              const trailerStart = bytes.byteLength - trailerLen;
              const tlvEnd = bytes.byteLength - PACKET_TRAILER_ENVELOPE_SIZE;
              const view = new DataView(encodedFrame.data);

              let timestampUs: number | undefined;
              let frameId: number | undefined;
              let pos = trailerStart;

              while (pos + 2 <= tlvEnd) {
                const tag = (bytes[pos] ?? 0) ^ 0xff;
                const len = (bytes[pos + 1] ?? 0) ^ 0xff;
                pos += 2;
                if (pos + len > tlvEnd) break;

                if (tag === TAG_TIMESTAMP_US && len === 8) {
                  const high = view.getUint32(pos) ^ 0xffffffff;
                  const low = view.getUint32(pos + 4) ^ 0xffffffff;
                  timestampUs = high * 0x100000000 + low;
                } else if (tag === TAG_FRAME_ID && len === 4) {
                  frameId = view.getUint32(pos) ^ 0xffffffff;
                }
                pos += len;
              }

              if (timestampUs !== undefined) {
                const meta = encodedFrame.getMetadata() as Record<string, unknown>;
                const rtpTimestamp = meta.rtpTimestamp as number | undefined;

                encodedFrame.data = encodedFrame.data.slice(0, trailerStart);
                postMessage({
                  kind: 'packetTrailer',
                  timestampUs,
                  frameId,
                  rtpTimestamp: rtpTimestamp ?? 0,
                });
              }
            }
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
