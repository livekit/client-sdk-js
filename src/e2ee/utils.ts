import { ENCRYPTION_ALGORITHM, SALT } from './constants';

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

export async function deriveKeyFromString(password: string) {
  let enc = new TextEncoder();
  const salt = enc.encode(SALT);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    {
      name: 'PBKDF2',
    },
    false,
    ['deriveBits', 'deriveKey'],
  );

  const encryptionKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ENCRYPTION_ALGORITHM, length: 128 },
    true,
    ['encrypt', 'decrypt'],
  );

  return encryptionKey;
}

/**
 * Derives a set of keys from the master key.
 * See https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.1
 */
export async function deriveKeys(material: CryptoKey, salt: string) {
  const info = new ArrayBuffer(128);
  const textEncoder = new TextEncoder();

  // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey#HKDF
  // https://developer.mozilla.org/en-US/docs/Web/API/HkdfParams
  const encryptionKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: textEncoder.encode(salt),
      hash: 'SHA-256',
      info,
    },
    material,
    {
      name: ENCRYPTION_ALGORITHM,
      length: 128,
    },
    false,
    ['encrypt', 'decrypt'],
  );

  return encryptionKey;
}

export function createE2EEKey(): Uint8Array {
  return window.crypto.getRandomValues(new Uint8Array(32));
}

export function mimeTypeToCodecString(mimeType: string) {
  const codec = mimeType.split('/')[1].toLowerCase();
  return codec;
}
