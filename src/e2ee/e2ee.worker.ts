import { Cryptor, ParticipantKeys } from './cryptor';
import type { E2EEWorkerMessage, EnableMessage } from './types';
import { setLogLevel, workerLogger } from '../logger';

const participantCryptors: Cryptor[] = [];
const participantKeys: Map<string, ParticipantKeys> = new Map();

let publishCryptors: Cryptor[] = [];
let publisherKeys: ParticipantKeys;

let isEncryptionEnabled: boolean = false;

let useSharedKey: boolean = false;

let sharedKey: Uint8Array | undefined;

setLogLevel('debug', 'lk-e2ee');

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
      publisherKeys = new ParticipantKeys(useSharedKey, isEncryptionEnabled);
      postMessage(enableMsg);
      break;
    case 'enable':
      setEncryptionEnabled(data.enabled, data.participantId);
      workerLogger.info('updated e2ee enabled status');
      // acknowledge enable call successful
      postMessage(ev.data);
      break;
    case 'decode':
      let cryptor = getTrackCryptor(data.participantId, data.trackId);
      cryptor.setupTransform(
        kind,
        data.readableStream,
        data.writableStream,
        data.trackId,
        data.codec,
      );
      break;
    case 'encode':
      let pubCryptor = getPublisherCryptor(data.trackId);
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
        getParticipantKeyHandler(data.participantId).setKey(data.key, data.keyIndex);
      } else {
        workerLogger.error('no participant Id was provided and shared key usage is disabled');
      }
      break;
    case 'removeTransform':
      unsetCryptorParticipant(data.trackId);
      break;
    case 'updateCodec':
      getTrackCryptor(data.participantId, data.trackId).setCodec(data.codec);
      break;
    default:
      break;
  }
};

function getTrackCryptor(participantId: string, trackId: string) {
  let cryptor = participantCryptors.find((c) => c.getTrackId() === trackId);
  if (!cryptor) {
    workerLogger.info('creating new cryptor for', { participantId });
    cryptor = new Cryptor({
      sharedKey: useSharedKey,
      participantId,
      keys: getParticipantKeyHandler(participantId),
    });
    participantCryptors.push(cryptor);
  } else if (participantId !== cryptor.getParticipantId()) {
    // assign new participant id to track cryptor and pass in correct key handler
    cryptor.setParticipant(participantId, getParticipantKeyHandler(participantId));
  }
  if (sharedKey) {
  }
  return cryptor;
}

function getParticipantKeyHandler(participantId?: string) {
  if (!participantId) {
    return publisherKeys!;
  }
  let keys = participantKeys.get(participantId);
  if (!keys) {
    keys = new ParticipantKeys();
    if (sharedKey) {
      keys.setKey(sharedKey);
    }
    participantKeys.set(participantId, keys);
  }
  return keys;
}

function unsetCryptorParticipant(trackId: string) {
  participantCryptors.find((c) => c.getTrackId() === trackId)?.unsetParticipant();
}

function getPublisherCryptor(trackId: string) {
  let publishCryptor = publishCryptors.find((cryptor) => cryptor.getTrackId() === trackId);
  if (!publishCryptor) {
    publishCryptor = new Cryptor({
      sharedKey: useSharedKey,
      keys: publisherKeys!,
      participantId: 'publisher',
    });
    publishCryptors.push(publishCryptor);
  }
  return publishCryptor;
}

function setEncryptionEnabled(enable: boolean, participantId?: string) {
  if (!participantId) {
    isEncryptionEnabled = enable;
    publisherKeys.setEnabled(enable);
  } else {
    getParticipantKeyHandler(participantId).setEnabled(enable);
  }
}

function setSharedKey(key: Uint8Array, index?: number) {
  workerLogger.debug('setting shared key');
  sharedKey = key;
  publisherKeys?.setKey(key, index);
  for (const [, keyHandler] of participantKeys) {
    keyHandler.setKey(key, index);
  }
}

// Operations using RTCRtpScriptTransform.
// @ts-ignore
if (self.RTCTransformEvent) {
  workerLogger.debug('setup transform event');
  // @ts-ignore
  self.onrtctransform = (event) => {
    const transformer = event.transformer;
    console.log('transformer', event);
    transformer.handled = true;
    const { kind, participantId, trackId, codec } = transformer.options;
    const cryptor =
      kind === 'encode' ? getPublisherCryptor(trackId) : getTrackCryptor(participantId, trackId);
    workerLogger.debug('transform', { codec, cryptor });
    cryptor.setupTransform(kind, transformer.readable, transformer.writable, trackId, codec);
  };
}
