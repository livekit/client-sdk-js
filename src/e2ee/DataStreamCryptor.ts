import type { DataStream_Chunk } from '@livekit/protocol';
import { CryptorError, CryptorErrorReason } from './errors';
import { encryptionEnabledMap } from './worker/FrameCryptor';
import type { ParticipantKeyHandler } from './worker/ParticipantKeyHandler';

export class DataStreamCryptor<T> {
  protected keys: ParticipantKeyHandler;
  protected participantIdentity?: string;

  constructor(keyHandler: ParticipantKeyHandler) {
    this.keys = keyHandler;
  }

  protected isEnabled(): boolean {
    if (this.participantIdentity) {
        return !!encryptionEnabledMap.get(this.participantIdentity);
      } else {
        return false;
      };
  }

  protected encodeFunction(stream: ReadableStream<T>): ReadableStream<T> {
    throw Error('not implemented for subclass');
  }

  protected decodeFunction(stream: ReadableStream<T>): ReadableStream<T> {
    throw Error('not implemented for subclass');
  }
}

export class ByteStreamCryptor extends DataStreamCryptor<DataStream_Chunk> {
  protected encodeFunction(stream: ReadableStream<DataStream_Chunk>): ReadableStream<DataStream_Chunk> {
    const transformer = new TransformStream<DataStream_Chunk, DataStream_Chunk>({
      transform: (chunk, controller) => {
        if (
            !this.isEnabled() ||
            // skip for encryption for empty chunks
            chunk.content.byteLength === 0
          ) {
            return controller.enqueue(chunk);
          }
          const keySet = this.keys.getKeySet();
          if (!keySet) {
            controller.error(new CryptorError(
                `key set not found for ${
                  this.participantIdentity
                } at index ${this.keys.getCurrentKeyIndex()}`,
                CryptorErrorReason.MissingKey,
                this.participantIdentity,
              ),
            );
            return;
          }
          const { encryptionKey } = keySet;
          const keyIndex = this.keys.getCurrentKeyIndex();
      
          if (encryptionKey) {
            const iv = this.makeIV(
              encodedFrame.getMetadata().synchronizationSource ?? -1,
              encodedFrame.timestamp,
            );
            let frameInfo = this.getUnencryptedBytes(encodedFrame);
      
            // Thіs is not encrypted and contains the VP8 payload descriptor or the Opus TOC byte.
            const frameHeader = new Uint8Array(encodedFrame.data, 0, frameInfo.unencryptedBytes);
      
            // Frame trailer contains the R|IV_LENGTH and key index
            const frameTrailer = new Uint8Array(2);
      
            frameTrailer[0] = IV_LENGTH;
            frameTrailer[1] = keyIndex;
      
        controller.enqueue(new TextEncoder().encode(chunk));
      },
    });
    return stream.pipeThrough(transformer);
  }

  protected decodeFunction(stream: ReadableStream<Uint8Array>): ReadableStream<string> {
    const transformer = new TransformStream<Uint8Array, string>({
      transform(chunk, controller) {
        controller.enqueue(new TextDecoder().decode(chunk));
      },
    });
    return stream.pipeThrough(transformer);
  }
}
