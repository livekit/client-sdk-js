import { Cipher } from './cipher';
import type { E2EEWorkerMessage } from './types';

const participantCiphers = new Map<string, Cipher>();

onmessage = (ev: MessageEvent<E2EEWorkerMessage>) => {
  const { kind, payload } = ev.data;

  switch (kind) {
    case 'init':
      console.log(payload);
      break;
    case 'decode':
    case 'encode':
      let cipher = getParticipantCipher(payload.participantId);
      transform(cipher, kind, payload.readableStream, payload.writableStream);
      break;
    case 'setKey':
      getParticipantCipher(payload.participantId).setKey(payload.key, payload.keyIndex);
      break;
    default:
      break;
  }
};

// Operations using RTCRtpScriptTransform.
// @ts-ignore
if (self.RTCTransformEvent) {
  // @ts-ignore
  self.onrtctransform = (event) => {
    const transformer = event.transformer;
    const { kind, participantId } = transformer.options;
    const cipher = getParticipantCipher(participantId);

    transform(cipher, kind, transformer.readable, transformer.writable);
  };
}

function transform(
  cipher: Cipher,
  operation: 'encode' | 'decode',
  readableStream: ReadableStream,
  writableStream: WritableStream,
) {
  if (operation === 'encode' || operation === 'decode') {
    const transformFn = operation === 'encode' ? cipher.encodeFunction : cipher.decodeFunction;
    const transformStream = new TransformStream({
      transform: transformFn.bind(cipher),
    });

    readableStream.pipeThrough(transformStream).pipeTo(writableStream);
  } else {
    console.error(`Invalid operation: ${operation}`);
  }
}

function getParticipantCipher(id: string) {
  let cipher = participantCiphers.get(id);
  if (!cipher) {
    cipher = new Cipher();
    participantCiphers.set(id, cipher);
  }
  return cipher;
}
