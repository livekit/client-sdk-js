import { Cryptor } from './cryptor';
import type { E2EEWorkerMessage } from './types';

const participantCryptors = new Map<string, Cryptor>();

/**
 * @param ev{string}
 */
onmessage = (ev) => {
  const { kind, payload }: E2EEWorkerMessage = ev.data;

  switch (kind) {
    case 'init':
      console.log(payload);
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

function transform(
  cipher: Cryptor,
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

function getParticipantCryptor(id: string) {
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
  self.onrtctransform = (event) => {
    const transformer = event.transformer;
    const { kind, participantId } = transformer.options;
    const cipher = getParticipantCryptor(participantId);

    console.log('transform', kind, participantId, cipher);

    transform(cipher, kind, transformer.readable, transformer.writable);
  };
}
