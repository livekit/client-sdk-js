import { Cryptor } from './cryptor';
import type { E2EEWorkerMessage } from './types';

const participantCryptors = new Map<string, Cryptor>();
let sharedCryptor: Cryptor | undefined;

/**
 * @param ev{string}
 */
onmessage = (ev) => {
  const { kind, payload }: E2EEWorkerMessage = ev.data;

  switch (kind) {
    case 'init':
      const { sharedKey } = payload;
      console.log('worker initialized', sharedKey);
      if (sharedKey) {
        sharedCryptor = new Cryptor({ sharedKey });
      }
      break;
    case 'decode':
    case 'encode':
      let cipher = getParticipantCryptor(payload.participantId);
      console.log('received encode message');
      transform(cipher, kind, payload.readableStream, payload.writableStream);
      break;
    case 'setKey':
      getParticipantCryptor(payload.participantId).setKey(payload.key, payload.keyIndex);
      break;
    default:
      break;
  }
};

async function transform(
  cipher: Cryptor,
  operation: 'encode' | 'decode',
  readableStream: ReadableStream<RTCEncodedAudioFrame | RTCEncodedVideoFrame>,
  writableStream: WritableStream<RTCEncodedAudioFrame | RTCEncodedVideoFrame>,
) {
  if (operation === 'encode' || operation === 'decode') {
    const transformFn = operation === 'encode' ? cipher.encodeFunction : cipher.decodeFunction;
    const transformStream = new TransformStream({
      transform: transformFn.bind(cipher),
    });
    await readableStream.pipeThrough(transformStream).pipeTo(writableStream);
  } else {
    console.error(`Invalid operation: ${operation}`);
  }
}

function getParticipantCryptor(id?: string) {
  if (!id) {
    return sharedCryptor!;
  }
  let cryptor = participantCryptors.get(id);
  if (!cryptor) {
    cryptor = new Cryptor();
    participantCryptors.set(id, cryptor);
  }
  return cryptor;
}

// Operations using RTCRtpScriptTransform.
// @ts-ignore
if (self.RTCTransformEvent) {
  console.warn('setup transform event');
  // @ts-ignore
  self.onrtctransform = async (event) => {
    const transformer = event.transformer;
    const { kind, participantId } = transformer.options;
    const cipher = getParticipantCryptor(participantId);

    console.log('transform', transformer, kind, participantId, cipher);

    await transform(cipher, kind, transformer.readable, transformer.writable);
  };
}
