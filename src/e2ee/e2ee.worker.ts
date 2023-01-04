import { Cryptor, ParticipantKeys } from './cryptor';
import type { E2EEWorkerMessage, EnableMessage } from './types';
import { setLogLevel, workerLogger } from '../logger';

const participantCryptors: Cryptor[] = [];
const participantKeys: ParticipantKeys[] = [];
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
      let cryptor = getTrackCryptor(data.participantId);
      cryptor.setupTransform(
        kind,
        data.readableStream,
        data.writableStream,
        data.trackId,
        data.codec,
      );
      break;
    case 'encode':
      let pubCryptor = getPublisherCryptor();
      pubCryptor.setupTransform(
        kind,
        data.readableStream,
        data.writableStream,
        data.trackId,
        data.codec,
      );
      break;
    case 'setKey':
      if (useSharedKey) {
        workerLogger.debug('set shared key');
        setSharedKey(data.key, data.keyIndex);
      } else if (data.participantId) {
        getTrackCryptor(data.participantId).setKey(data.key, data.keyIndex);
      } else {
        workerLogger.error('no participant Id was provided and shared key usage is disabled');
      }
      break;
    case 'removeTransform':
      unsetCryptorParticipant(data.trackId);
      break;
    default:
      break;
  }
};

function getTrackCryptor(participantId: string, trackId: string) {
  let cryptor = participantCryptors.find((c) => c.getTrackId() === trackId);
  if (!cryptor) {
    workerLogger.info('creating new cryptor for', { participantId });
    cryptor = new Cryptor({ enabled: isEncryptionEnabled, sharedKey: useSharedKey });
    if (useSharedKey && sharedKey) {
      cryptor.setKey(sharedKey);
    }
    cryptor.setParticipant(participantId);
    participantCryptors.push(cryptor);
  } else if (participantId === cryptor.getParticipantId()) {
    // all good
  } else {
    // assign new participant id to track cryptor, probably needs to update keys as well
  }
  return cryptor;
}

function getParticipantCryptors();

function unsetCryptorParticipant(trackId: string) {
  participantCryptors.find((c) => c.getTrackId() === trackId)?.setParticipant(undefined);
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
    const { kind, participantId, codec } = transformer.options;
    const cryptor = kind === 'encode' ? getPublisherCryptor() : getTrackCryptor(participantId);
    workerLogger.debug('transform');
    cryptor.setupTransform(kind, transformer.readable, transformer.writable, codec);
  };
}
