/**
 * Test helper: resolves `true` if `promise` is still pending after `ms`
 * (default: one macrotask), `false` if it has already settled — regardless of
 * whether it resolved or rejected.
 *
 * Use to assert that something has *not* happened yet (e.g. an onClose callback
 * that must stay silent), optionally within a timeout window. Preferable to
 * `Promise.race([p, Promise.resolve(sentinel)])` when the "not yet" needs to
 * hold for a duration rather than just the current microtask.
 */
export async function isPending(promise: Promise<unknown>, ms = 0): Promise<boolean> {
  const pending = Symbol('pending');
  // Swallow settlement (incl. rejection) so racing it can't raise unhandled
  // rejections when the timer wins.
  const settled = promise.then(
    () => 'settled' as const,
    () => 'settled' as const,
  );
  const timer = new Promise<typeof pending>((resolve) => {
    setTimeout(() => resolve(pending), ms);
  });
  return (await Promise.race([settled, timer])) === pending;
}
