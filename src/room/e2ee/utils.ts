import type { KeySet } from './types';

export function supportsE2EE() {
  return supportsInsertableStreams() || supportsScriptTransform();
}

export function supportsScriptTransform() {
  // @ts-ignore
  return typeof window.RTCRtpScriptTransform !== 'undefined';
}

export function supportsInsertableStreams() {
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

export async function importKey(keyBytes: Uint8Array) {
  // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey
  return crypto.subtle.importKey('raw', keyBytes, 'HKDF', false, ['deriveBits', 'deriveKey']);
}

/**
 * Derives a set of keys from the master key.
 * See https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.1
 */
export async function deriveKeys(material: CryptoKey): Promise<KeySet> {
  const info = new ArrayBuffer(128);
  const textEncoder = new TextEncoder();

  // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey#HKDF
  // https://developer.mozilla.org/en-US/docs/Web/API/HkdfParams
  const encryptionKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: textEncoder.encode('JFrameEncryptionKey'),
      hash: 'SHA-256',
      info,
    },
    material,
    {
      name: 'AES-GCM',
      length: 128,
    },
    false,
    ['encrypt', 'decrypt'],
  );

  return {
    material,
    cryptoKey: encryptionKey,
  };
}

/**
 * Ratchets a key. See
 * https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.5.1
 */
export async function ratchet(material: CryptoKey): Promise<ArrayBuffer> {
  const textEncoder = new TextEncoder();

  // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits
  return crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      salt: textEncoder.encode('JFrameRatchetKey'),
      hash: 'SHA-256',
      info: new ArrayBuffer(256),
    },
    material,
    256,
  );
}
