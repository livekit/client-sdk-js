export default class TypedPromise<T, E extends Error> extends Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(
    executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason: E) => void) => void,
  ) {
    super(executor);
  }

  catch<TResult = never>(
    onrejected?: ((reason: E) => TResult | PromiseLike<TResult>) | null | undefined,
  ): TypedPromise<T | TResult, E> {
    return super.catch(onrejected);
  }

  static reject<E extends Error>(reason: E) {
    return super.reject(reason) as TypedPromise<never, E>;
  }
}
