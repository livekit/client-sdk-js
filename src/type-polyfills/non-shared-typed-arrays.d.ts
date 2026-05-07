// As of TS 5.7, `Uint8Array` is generic over its backing buffer (`Uint8Array<ArrayBufferLike>`),
// which includes `SharedArrayBuffer`. Many Web APIs (WebCrypto, structured clone, RTCDataChannel)
// only accept the non-shared variant `Uint8Array<ArrayBuffer>`. Using `ReturnType<typeof Uint8Array.from>`
// resolves to that non-shared variant on TS versions that support the generic, while remaining
// equivalent to plain `Uint8Array` on older versions — so this alias works across the range we support.
type NonSharedUint8Array = ReturnType<typeof Uint8Array.from>;
