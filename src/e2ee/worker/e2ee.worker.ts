import { workerLogger } from '../../logger';
import type { AudioCodec, VideoCodec } from '../../room/track/options';
import { KEY_PROVIDER_DEFAULTS } from '../constants';
import { CryptorErrorReason } from '../errors';
import { CryptorEvent, KeyHandlerEvent } from '../events';
import type {
  E2EEWorkerMessage,
  ErrorMessage,
  InitAck,
  KeyProviderOptions,
  RatchetMessage,
  RatchetRequestMessage,
} from '../types';
import { FrameCryptor, encryptionEnabledMap } from './FrameCryptor';
import { ParticipantKeyHandler } from './ParticipantKeyHandler';

const participantCryptors: FrameCryptor[] = [];
const participantKeys: Map<string, ParticipantKeyHandler> = new Map();
let sharedKeyHandler: ParticipantKeyHandler | undefined;

let isEncryptionEnabled: boolean = false;

let useSharedKey: boolean = false;

let sharedKey: CryptoKey | undefined;

let sifTrailer: Uint8Array | undefined;

let keyProviderOptions: KeyProviderOptions = KEY_PROVIDER_DEFAULTS;

const rtpMap = new Map<number, AudioCodec | VideoCodec>();

workerLogger.setDefaultLevel('info');

onmessage = (ev) => {
  const { kind, data }: E2EEWorkerMessage = ev.data;

  switch (kind) {
    case 'init':
      workerLogger.info('worker initialized');
      keyProviderOptions = data.keyProviderOptions;
      useSharedKey = !!data.keyProviderOptions.sharedKey;
      // acknowledge init successful
      const ackMsg: InitAck = {
        kind: 'initAck',
        data: { enabled: isEncryptionEnabled },
      };
      postMessage(ackMsg);
      break;
    case 'enable':
      setEncryptionEnabled(data.enabled, data.participantIdentity);
      workerLogger.info('updated e2ee enabled status');
      // acknowledge enable call successful
      postMessage(ev.data);
      break;
    case 'decode':
      let cryptor = getTrackCryptor(data.participantIdentity, data.trackId);
      cryptor.setupTransform(
        kind,
        data.readableStream,
        data.writableStream,
        data.trackId,
        data.codec,
      );
      break;
    case 'encode':
      let pubCryptor = getTrackCryptor(data.participantIdentity, data.trackId);
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
        workerLogger.warn('set shared key');
        setSharedKey(data.key, data.keyIndex);
      } else if (data.participantIdentity) {
        workerLogger.warn(`set participant sender key ${data.participantIdentity}`);
        getParticipantKeyHandler(data.participantIdentity).setKey(data.key, data.keyIndex);
      } else {
        workerLogger.error('no participant Id was provided and shared key usage is disabled');
      }
      break;
    case 'removeTransform':
      unsetCryptorParticipant(data.trackId);
      break;
    case 'updateCodec':
      getTrackCryptor(data.participantIdentity, data.trackId).setCodec(data.codec);
      break;
    case 'setRTPMap':
      // this is only used for the local participant
      for (const [key, val] of data.map) {
        rtpMap.set(key, val);
      }
      participantCryptors.forEach((cr) => {
        cr.setRtpMap(rtpMap);
      });
      break;
    case 'ratchetRequest':
      handleRatchetRequest(data);
      break;
    case 'setSifTrailer':
      handleSifTrailer(data.trailer);
      break;
    default:
      break;
  }
};

async function handleRatchetRequest(data: RatchetRequestMessage['data']) {
  if (useSharedKey) {
    const keyHandler = getSharedKeyHandler();
    await keyHandler.ratchetKey(data.keyIndex);
    keyHandler.resetKeyStatus();
  } else if (data.participantIdentity) {
    const keyHandler = getParticipantKeyHandler(data.participantIdentity);
    await keyHandler.ratchetKey(data.keyIndex);
    keyHandler.resetKeyStatus();
  } else {
    workerLogger.error(
      'no participant Id was provided for ratchet request and shared key usage is disabled',
    );
  }
}

function getTrackCryptor(participantIdentity: string, trackId: string) {
  let cryptor = participantCryptors.find((c) => c.getTrackId() === trackId);
  if (!cryptor) {
    workerLogger.info('creating new cryptor for', { participantIdentity });
    if (!keyProviderOptions) {
      throw Error('Missing keyProvider options');
    }
    cryptor = new FrameCryptor({
      participantIdentity,
      keys: getParticipantKeyHandler(participantIdentity),
      keyProviderOptions,
      sifTrailer,
    });
    setupCryptorErrorEvents(cryptor);
    cryptor.setRtpMap(rtpMap);
    participantCryptors.push(cryptor);
  } else if (participantIdentity !== cryptor.getParticipantIdentity()) {
    // assign new participant id to track cryptor and pass in correct key handler
    cryptor.setParticipant(participantIdentity, getParticipantKeyHandler(participantIdentity));
  }
  if (sharedKey) {
  }
  return cryptor;
}

function getParticipantKeyHandler(participantIdentity: string) {
  if (useSharedKey) {
    return getSharedKeyHandler();
  }
  let keys = participantKeys.get(participantIdentity);
  if (!keys) {
    keys = new ParticipantKeyHandler(participantIdentity, keyProviderOptions);
    if (sharedKey) {
      keys.setKey(sharedKey);
    }
    keys.on(KeyHandlerEvent.KeyRatcheted, emitRatchetedKeys);
    participantKeys.set(participantIdentity, keys);
  }
  return keys;
}

function getSharedKeyHandler() {
  if (!sharedKeyHandler) {
    sharedKeyHandler = new ParticipantKeyHandler('shared-key', keyProviderOptions);
  }
  return sharedKeyHandler;
}

function unsetCryptorParticipant(trackId: string) {
  participantCryptors.find((c) => c.getTrackId() === trackId)?.unsetParticipant();
}

function setEncryptionEnabled(enable: boolean, participantIdentity: string) {
  encryptionEnabledMap.set(participantIdentity, enable);
}

function setSharedKey(key: CryptoKey, index?: number) {
  workerLogger.debug('setting shared key');
  sharedKey = key;
  getSharedKeyHandler().setKey(key, index);
}

function setupCryptorErrorEvents(cryptor: FrameCryptor) {
  cryptor.on(CryptorEvent.Error, (error) => {
    const msg: ErrorMessage = {
      kind: 'error',
      data: { error: new Error(`${CryptorErrorReason[error.reason]}: ${error.message}`) },
    };
    postMessage(msg);
  });
}

function emitRatchetedKeys(material: CryptoKey, participantIdentity: string, keyIndex?: number) {
  const msg: RatchetMessage = {
    kind: `ratchetKey`,
    data: {
      participantIdentity,
      keyIndex,
      material,
    },
  };
  postMessage(msg);
}

function handleSifTrailer(trailer: Uint8Array) {
  sifTrailer = trailer;
  participantCryptors.forEach((c) => {
    c.setSifTrailer(trailer);
  });
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
    const { kind, participantIdentity, trackId, codec } = transformer.options;
    const cryptor = getTrackCryptor(participantIdentity, trackId);
    workerLogger.debug('transform', { codec });
    cryptor.setupTransform(kind, transformer.readable, transformer.writable, trackId, codec);
  };
}
