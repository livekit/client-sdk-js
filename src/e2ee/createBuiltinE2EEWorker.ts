import log from '../logger';

export function createBuiltinE2EEWorker() {
  if (typeof Worker === 'undefined') {
    return undefined;
  }

  try {
    return new Worker(new URL('./livekit-client.e2ee.worker.mjs', import.meta.url), {
      type: 'module',
      name: 'livekit-client-e2ee',
    });
  } catch (moduleError) {
    log.debug('failed to initialize module e2ee worker, falling back to classic worker', {
      error: moduleError,
    });
  }

  try {
    return new Worker(new URL('./livekit-client.e2ee.worker.js', import.meta.url), {
      name: 'livekit-client-e2ee',
    });
  } catch (workerError) {
    log.warn('failed to initialize built-in e2ee worker', { error: workerError });
    return undefined;
  }
}
