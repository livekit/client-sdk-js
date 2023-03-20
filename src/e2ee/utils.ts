import { videoCodecs } from '../room/track/options';
import type { VideoCodec } from '../room/track/options';
import { ENCRYPTION_ALGORITHM } from './constants';

export function isE2EESupported() {
  return isInsertableStreamSupported() || isScriptTransformSupported();
}

export function isScriptTransformSupported() {
  // @ts-ignore
  return typeof window.RTCRtpScriptTransform !== 'undefined';
}

export function isInsertableStreamSupported() {
  return (
    typeof window.RTCRtpSender !== 'undefined' &&
    // @ts-ignore
    typeof window.RTCRtpSender.prototype.createEncodedStreams !== 'undefined'
  );
}

export function isVideoFrame(
  frame: RTCEncodedAudioFrame | RTCEncodedVideoFrame,
): frame is RTCEncodedVideoFrame {
  return 'type' in frame;
}

export async function importKey(
  keyBytes: Uint8Array | ArrayBuffer,
  algorithm: string | { name: string } = { name: ENCRYPTION_ALGORITHM },
  usage: 'derive' | 'encrypt' = 'encrypt',
) {
  // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    algorithm,
    false,
    usage === 'derive' ? ['deriveBits', 'deriveKey'] : ['encrypt', 'decrypt'],
  );
}

export async function createKeyMaterialFromString(password: string) {
  let enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    {
      name: 'PBKDF2',
    },
    false,
    ['deriveBits', 'deriveKey'],
  );

  return keyMaterial;
}

function getAlgoOptions(algorithmName: string, salt: string) {
  const textEncoder = new TextEncoder();
  const encodedSalt = textEncoder.encode(salt);
  switch (algorithmName) {
    case 'HKDF':
      return {
        name: 'HKDF',
        salt: encodedSalt,
        hash: 'SHA-256',
        info: new ArrayBuffer(128),
      };
    case 'PBKDF2': {
      return {
        name: 'PBKDF2',
        salt: encodedSalt,
        hash: 'SHA-256',
        iterations: 100000,
      };
    }
    default:
      throw new Error(`algorithm ${algorithmName} is currently unsupported`);
  }
}

/**
 * Derives a set of keys from the master key.
 * See https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.1
 */
export async function deriveKeys(material: CryptoKey, salt: string) {
  const algorithmOptions = getAlgoOptions(material.algorithm.name, salt);

  // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey#HKDF
  // https://developer.mozilla.org/en-US/docs/Web/API/HkdfParams
  const encryptionKey = await crypto.subtle.deriveKey(
    algorithmOptions,
    material,
    {
      name: ENCRYPTION_ALGORITHM,
      length: 128,
    },
    false,
    ['encrypt', 'decrypt'],
  );

  return { material, encryptionKey };
}

export function createE2EEKey(): Uint8Array {
  return window.crypto.getRandomValues(new Uint8Array(32));
}

export function mimeTypeToVideoCodecString(mimeType: string) {
  const codec = mimeType.split('/')[1].toLowerCase() as VideoCodec;
  if (!videoCodecs.includes(codec)) {
    throw Error(`Video codec not supported: ${codec}`);
  }
  return codec;
}

/**
 * Ratchets a key. See
 * https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.5.1
 */
export async function ratchet(material: CryptoKey, salt: string): Promise<ArrayBuffer> {
  const algorithmOptions = getAlgoOptions(material.algorithm.name, salt);

  // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits
  return crypto.subtle.deriveBits(algorithmOptions, material, 256);
}
