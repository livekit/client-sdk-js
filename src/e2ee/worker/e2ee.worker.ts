import { FrameCryptor } from './FrameCryptor';
import type {
  E2EEWorkerMessage,
  EnableMessage,
  ErrorMessage,
  KeyProviderOptions,
  RatchetMessage,
} from '../types';
import { workerLogger } from '../../logger';
import { KEY_PROVIDER_DEFAULTS } from '../constants';
import { ParticipantKeyHandler } from './ParticipantKeyHandler';
import { CryptorErrorReason } from '../errors';

const participantCryptors: FrameCryptor[] = [];
const participantKeys: Map<string, ParticipantKeyHandler> = new Map();

let publishCryptors: FrameCryptor[] = [];
let publisherKeys: ParticipantKeyHandler;

let isEncryptionEnabled: boolean = false;

let useSharedKey: boolean = false;

let sharedKey: CryptoKey | undefined;

let keyProviderOptions: KeyProviderOptions = KEY_PROVIDER_DEFAULTS;

workerLogger.setDefaultLevel('info');

/**
 * @param ev{string}
 */
onmessage = (ev) => {
  const { kind, data }: E2EEWorkerMessage = ev.data;

  switch (kind) {
    case 'init':
      workerLogger.info('worker initialized');
      keyProviderOptions = data.keyProviderOptions;
      useSharedKey = !!data.keyProviderOptions.sharedKey;
      // acknowledge init successful
      const enableMsg: EnableMessage = {
        kind: 'enable',
        data: { enabled: isEncryptionEnabled },
      };
      publisherKeys = new ParticipantKeyHandler(undefined, isEncryptionEnabled, keyProviderOptions);
      publisherKeys.on('keyRatcheted', emitRatchetedKeys);
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
        getParticipantKeyHandler(data.participantId).setKeyFromMaterial(data.key, data.keyIndex);
      } else {
        workerLogger.error('no participant Id was provided and shared key usage is disabled');
      }
      break;
    case 'removeTransform':
      unsetCryptorParticipant(data.trackId);
      break;
    case 'updateCodec':
      getTrackCryptor(data.participantId, data.trackId).setVideoCodec(data.codec);
      break;
    case 'setRTPMap':
      publishCryptors.forEach((cr) => {
        cr.setRtpMap(data.map);
      });
      break;
    case 'ratchetRequest':
      getParticipantKeyHandler(data.participantId).ratchetKey(data.keyIndex);

    default:
      break;
  }
};

function getTrackCryptor(participantId: string, trackId: string) {
  let cryptor = participantCryptors.find((c) => c.getTrackId() === trackId);
  if (!cryptor) {
    workerLogger.info('creating new cryptor for', { participantId });
    if (!keyProviderOptions) {
      throw Error('Missing keyProvider options');
    }
    cryptor = new FrameCryptor({
      participantId,
      keys: getParticipantKeyHandler(participantId),
      keyProviderOptions,
    });

    setupCryptorErrorEvents(cryptor);
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
    keys = new ParticipantKeyHandler(participantId, true, keyProviderOptions);
    if (sharedKey) {
      keys.setKeyFromMaterial(sharedKey);
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
    if (!keyProviderOptions) {
      throw new TypeError('Missing keyProvider options');
    }
    publishCryptor = new FrameCryptor({
      keys: publisherKeys!,
      participantId: 'publisher',
      keyProviderOptions,
    });
    setupCryptorErrorEvents(publishCryptor);
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

function setSharedKey(key: CryptoKey, index?: number) {
  workerLogger.debug('setting shared key');
  sharedKey = key;
  publisherKeys?.setKeyFromMaterial(key, index);
  for (const [, keyHandler] of participantKeys) {
    keyHandler.setKeyFromMaterial(key, index);
  }
}

function setupCryptorErrorEvents(cryptor: FrameCryptor) {
  cryptor.on('cryptorError', (error) => {
    const msg: ErrorMessage = {
      kind: 'error',
      data: { error: new Error(`${CryptorErrorReason[error.reason]}: ${error.message}`) },
    };
    postMessage(msg);
  });
}

function emitRatchetedKeys(material: CryptoKey, keyIndex?: number) {
  const msg: RatchetMessage = {
    kind: `ratchetKey`,
    data: {
      // participantId,
      keyIndex,
      material,
    },
  };
  postMessage(msg);
}

// Operations using RTCRtpScriptTransform.
// @ts-ignore
if (self.RTCTransformEvent) {
  workerLogger.debug('setup transform event');
  // @ts-ignore
  self.onrtctransform = (event) => {
    const transformer = event.transformer;
    workerLogger.debug('transformer', transformer);
    transformer.handled = true;
    const { kind, participantId, trackId, codec } = transformer.options;
    const cryptor =
      kind === 'encode' ? getPublisherCryptor(trackId) : getTrackCryptor(participantId, trackId);
    workerLogger.debug('transform', { codec });
    cryptor.setupTransform(kind, transformer.readable, transformer.writable, trackId, codec);
  };
}
