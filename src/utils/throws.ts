// A copy of `Throws` from `@livekit/throws-transformer/throws`. The published declarations name
// this type, and the transformer is a devDependency, so a consumer could not resolve an import
// of it. The transformer matches the `__throws` brand, not the import path: keep the brand as is.

type Primitives = void | null | undefined | string | number | bigint | boolean | symbol;

/**
 * Branded type that encodes possible thrown errors in the return type. The error types are
 * phantom types for static analysis; the runtime value is just T.
 */
export type Throws<T, E extends Error> =
  | (T & {
      readonly __throws?: E;
    })
  | Extract<T, Primitives>;
