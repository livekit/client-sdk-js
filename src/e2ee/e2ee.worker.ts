import { Cryptor } from './cryptor';
import type { E2EEWorkerMessage, EnableMessage, ErrorMessage } from './types';
import { setLogLevel, workerLogger } from '../logger';
import { E2EEError, E2EEErrorReason } from './errors';

const participantCryptors = new Map<string, Cryptor>();
let publishCryptor: Cryptor | undefined;

let isEncryptionEnabled: boolean = false;

let sharedKey: Uint8Array | undefined;
let useSharedKey: boolean = false;

setLogLevel('debug', 'lk-e2ee-worker');

/**
 * @param ev{string}
 */
onmessage = (ev) => {
  const { kind, data }: E2EEWorkerMessage = ev.data;

  switch (kind) {
    case 'init':
      workerLogger.info('worker initialized');
      useSharedKey = !!data.sharedKey;
      // acknowledge init successful
      const enableMsg: EnableMessage = {
        kind: 'enable',
        data: { enabled: isEncryptionEnabled },
      };
      postMessage(enableMsg);
      break;
    case 'enable':
      setParticipantCryptorEnabled(data.enabled, data.participantId);
      workerLogger.info('updated e2ee enabled status');
      // acknowledge enable call successful
      postMessage(ev.data);
      break;
    case 'decode':
      let cryptor = getParticipantCryptor(data.participantId);
      transform(cryptor, kind, data.readableStream, data.writableStream);
      break;
    case 'encode':
      let pubCryptor = getPublisherCryptor();
      transform(pubCryptor, kind, data.readableStream, data.writableStream);
      break;
    case 'setKey':
      if (useSharedKey) {
        workerLogger.debug('set shared key');
        setSharedKey(data.key, data.keyIndex);
      } else if (data.participantId) {
        getParticipantCryptor(data.participantId).setKey(data.key, data.keyIndex);
      } else {
        workerLogger.error('no participant Id was provided and shared key usage is disabled');
      }
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

function getParticipantCryptor(id: string) {
  let cryptor = participantCryptors.get(id);
  if (!cryptor) {
    workerLogger.info('creating new cryptor for', { id });
    cryptor = new Cryptor({ enabled: isEncryptionEnabled, sharedKey: useSharedKey });
    if (useSharedKey && sharedKey) {
      cryptor.setKey(sharedKey);
    }
    participantCryptors.set(id, cryptor);
  }
  return cryptor;
}

function getPublisherCryptor() {
  if (!publishCryptor) {
    publishCryptor = new Cryptor({ enabled: isEncryptionEnabled, sharedKey: useSharedKey });
    if (useSharedKey && sharedKey) {
      publishCryptor.setKey(sharedKey);
    }
  }
  return publishCryptor;
}

function setParticipantCryptorEnabled(enable: boolean, participantId?: string) {
  if (!participantId) {
    isEncryptionEnabled = enable;
    publishCryptor?.setEnabled(enable);
  } else {
    participantCryptors.get(participantId)?.setEnabled(enable);
  }
}

function setSharedKey(key: Uint8Array, index?: number) {
  workerLogger.debug('setting shared key');
  sharedKey = key;
  publishCryptor?.setKey(key, index);
  for (const [, cryptor] of participantCryptors) {
    cryptor.setKey(key, index);
  }
}

// Operations using RTCRtpScriptTransform.
// @ts-ignore
if (self.RTCTransformEvent) {
  workerLogger.debug('setup transform event');
  // @ts-ignore
  self.onrtctransform = async (event) => {
    const transformer = event.transformer;
    console.log('transformer', event);
    transformer.handled = true;
    const { kind, participantId } = transformer.options;
    const cipher = kind === 'encode' ? getPublisherCryptor() : getParticipantCryptor(participantId);
    workerLogger.debug('transform');
    await transform(cipher, kind, transformer.readable, transformer.writable);
  };
}
