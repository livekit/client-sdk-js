// As of TS 5.7, `Uint8Array` is generic over its backing buffer (`Uint8Array<ArrayBufferLike>`),
// which includes `SharedArrayBuffer`. Many Web APIs (WebCrypto, structured clone, RTCDataChannel)
// only accept the non-shared variant `Uint8Array<ArrayBuffer>`. Using `ReturnType<typeof Uint8Array.from>`
// resolves to that non-shared variant on TS versions that support the generic, while remaining
// equivalent to plain `Uint8Array` on older versions — so this alias works across the range we support.
//
// Exported as a normal type (rather than an ambient global) so it is emitted into the published `dist`
// types and imported explicitly wherever it is used. An earlier ambient `.d.ts` declaration was resolved
// during our own build but never shipped, so consumers' type-checkers (and tools like API Extractor)
// failed with "Cannot find name 'NonSharedUint8Array'" on our emitted `.d.ts` files.
export type NonSharedUint8Array = ReturnType<typeof Uint8Array.from>;
