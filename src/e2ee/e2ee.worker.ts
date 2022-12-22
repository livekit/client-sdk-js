import { Cryptor } from './cryptor';
import type { E2EEWorkerMessage, EnableMessage, ErrorMessage } from './types';
import { setLogLevel, workerLogger } from '../logger';
import { E2EEError, E2EEErrorReason } from './errors';

const participantCryptors = new Map<string, Cryptor>();
let sharedCryptor: Cryptor | undefined;

let isEncryptionEnabled: boolean = false;

setLogLevel('debug', 'lk-e2ee-worker');

/**
 * @param ev{string}
 */
onmessage = (ev) => {
  const { kind, data }: E2EEWorkerMessage = ev.data;

  switch (kind) {
    case 'init':
      const { sharedKey } = data;
      workerLogger.info('worker initialized');
      if (sharedKey) {
        sharedCryptor = new Cryptor({ sharedKey, enabled: isEncryptionEnabled });
      }
      // acknowledge init successful
      const enableMsg: EnableMessage = {
        kind: 'enable',
        data: { enabled: isEncryptionEnabled },
      };
      postMessage(enableMsg);
      break;
    case 'enable':
      setCryptorsEnabled(data.enabled);
      workerLogger.info('updated e2ee enabled status');
      // acknowledge enable call successful
      postMessage(ev.data);
      break;
    case 'decode':
    case 'encode':
      let cipher = getParticipantCryptor(data.participantId);
      transform(cipher, kind, data.readableStream, data.writableStream);
      break;
    case 'setKey':
      getParticipantCryptor(data.participantId).setKey(data.key, data.keyIndex);
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
    try {
      await readableStream.pipeThrough(transformStream).pipeTo(writableStream);
    } catch (e: any) {
      const errorMsg: ErrorMessage = {
        kind: 'error',
        data: {
          error: new E2EEError(e.message, E2EEErrorReason.InternalError),
        },
      };
      postMessage(errorMsg);
    }
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
    cryptor = new Cryptor({ enabled: isEncryptionEnabled });
    participantCryptors.set(id, cryptor);
  }
  return cryptor;
}

function setCryptorsEnabled(enable: boolean) {
  isEncryptionEnabled = enable;
  sharedCryptor?.setEnabled(enable);
  for (const [, cryptor] of participantCryptors) {
    cryptor.setEnabled(enable);
  }
}

// Operations using RTCRtpScriptTransform.
// @ts-ignore
if (self.RTCTransformEvent) {
  workerLogger.info('setup transform event');
  // @ts-ignore
  self.onrtctransform = async (event) => {
    const transformer = event.transformer;
    const { kind, participantId } = transformer.options;
    const cipher = getParticipantCryptor(participantId);
    workerLogger.debug('transform');
    await transform(cipher, kind, transformer.readable, transformer.writable);
  };
}
