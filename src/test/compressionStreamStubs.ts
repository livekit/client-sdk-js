import { resetDeflateRawCompressionSupportCache } from '../room/utils';

/**
 * Swaps the global `CompressionStream` / `DecompressionStream` away entirely, emulating a runtime
 * that predates the compression streams api. Returns a function that restores them.
 */
export function stubMissingCompressionStreams(): () => void {
  return stubCompressionStreams(undefined, undefined);
}

/**
 * Swaps in global `CompressionStream` / `DecompressionStream` constructors that reject the
 * `deflate-raw` format the way Chromium 80-102 does (the api exists, but only `gzip` / `deflate`
 * are supported). Returns a function that restores the real ones.
 */
export function stubMissingDeflateRawSupport(): () => void {
  return stubCompressionStreams(
    legacyFormatsOnly('CompressionStream', CompressionStream),
    legacyFormatsOnly('DecompressionStream', DecompressionStream),
  );
}

type CompressionStreamCtor<T> = new (format: CompressionFormat) => T;

function legacyFormatsOnly<T>(
  name: string,
  Real: CompressionStreamCtor<T>,
): CompressionStreamCtor<T> {
  return function LegacyCompressionStream(format: CompressionFormat) {
    if (format === 'deflate-raw') {
      throw new TypeError(
        `Failed to construct '${name}': Unsupported compression format: 'deflate-raw'`,
      );
    }
    return new Real(format);
  } as unknown as CompressionStreamCtor<T>;
}

function stubCompressionStreams(compression: unknown, decompression: unknown): () => void {
  const originalCompressionStream = globalThis.CompressionStream;
  const originalDecompressionStream = globalThis.DecompressionStream;
  (globalThis as any).CompressionStream = compression;
  (globalThis as any).DecompressionStream = decompression;
  // The support probe memoizes, which is only safe because a real runtime never changes formats
  // mid-session; swapping the globals has to invalidate it.
  resetDeflateRawCompressionSupportCache();

  return () => {
    (globalThis as any).CompressionStream = originalCompressionStream;
    (globalThis as any).DecompressionStream = originalDecompressionStream;
    resetDeflateRawCompressionSupportCache();
  };
}
