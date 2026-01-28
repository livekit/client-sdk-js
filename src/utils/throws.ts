/**
 * Branded type that encodes possible thrown errors in the return type.
 *
 * Usage:
 *   function fetchUser(id: string): Throws<User, NetworkError | NotFoundError> { ... }
 *
 * The actual runtime value is just T - the error types are phantom types
 * that exist only for static analysis.
 *
 * To indicate that a function shouldn't throw any errors, make it return `Throws<T, never>`.
 *
 * For more info about how this is checked, see ./throws-transformer at the root of this repo.
 */
export type Throws<T, E extends Error> = T & { readonly __throws?: E };

/**
 * Extract the error types from a Throws type.
 */
export type ExtractErrors<T> = T extends Throws<any, infer E> ? E : never;

/**
 * Extract the success type from a Throws type.
 */
export type ExtractSuccess<T> = T extends Throws<infer S, any> ? S : T;

/**
 * Combine error types from multiple Throws types.
 */
export type CombineErrors<T extends any[]> = T extends [infer First, ...infer Rest]
  ? ExtractErrors<First> | CombineErrors<Rest>
  : never;

/**
 * Helper to propagate errors - use this when your function calls other
 * throwing functions and wants to propagate their errors.
 */
export type PropagatesErrors<T, AdditionalErrors extends Error = never> = Throws<
  ExtractSuccess<T>,
  ExtractErrors<T> | AdditionalErrors
>;
