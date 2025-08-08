import { Mutex } from '@livekit/mutex';

export function atomic(symbol?: symbol) {
  return function (originalMethod: any, context: ClassMethodDecoratorContext) {
    function getOrCreateMutex(mutexMap: Map<symbol, Mutex>, sym: symbol) {
      let mutex = mutexMap.get(sym);
      if (!mutex) {
        mutex = new Mutex();
        mutexMap.set(sym, mutex);
        console.log('atomic setting new mutex on map', sym.toString());
      } else {
        console.log('atomic using existing mutex on map', sym.toString());
      }
      return mutex;
    }
    context.addInitializer(function () {
      if (context.private) throw new TypeError('Not supported on private methods.');

      if (!this.mutexMap) {
        this.mutexMap = new Map();
        console.log('atomic setting new mutex map on class instance', this);
      } else {
        console.log('atomic using existing mutex map on class instance', this);
      }
    });

    const accessor =
      symbol ?? (typeof context.name === 'string' ? Symbol.for(context.name) : context.name);
    console.log('atomic accessor', accessor);

    async function replacementMethod(this: any, ...args: any[]) {
      const mutex = getOrCreateMutex(this.mutexMap, accessor);
      const unlock = await mutex.lock();
      try {
        const result = await originalMethod.call(this, ...args);
        return result;
      } finally {
        unlock();
      }
    }

    return replacementMethod;
  };
}
