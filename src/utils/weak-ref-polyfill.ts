/**
 * A `WeakRef`-like reference that falls back to a strong reference on runtime
 * environments that do not implement `WeakRef`.
 *
 * This is primarily useful for breaking reference cycles (so an object can be
 * garbage collected once no longer referenced elsewhere) while remaining safe
 * on legacy browsers. On those legacy browsers the fallback reintroduces the
 * strong reference — and therefore the cycle — which is an acceptable trade-off
 * since they typically lack the modern APIs these cycles arise from anyway.
 *
 * Mirrors the `WeakRef` API: call {@link deref} to retrieve the referenced
 * value, which returns `undefined` once it has been collected.
 *
 * @link https://developer.mozilla.org/en-US/docs/Web/API/WeakRef
 */
export class WeakRefPolyfill<T extends object> {
  private weak?: WeakRef<T>;

  private strong?: T;

  constructor(value: T) {
    if (typeof WeakRef !== 'undefined') {
      this.weak = new WeakRef(value);
    } else {
      this.strong = value;
    }
  }

  deref(): T | undefined {
    return this.weak ? this.weak.deref() : this.strong;
  }
}
