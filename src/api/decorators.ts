// export function loggedMethod<This, Args extends any[], Return>(
//     target: (this: This, ...args: Args) => Return,
//     context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
// ) {
//     const methodName = String(context.name);
import { Mutex } from '@livekit/mutex';

//     function replacementMethod(this: This, ...args: Args): Return {
//         console.debug(`LOG: Entering method '${methodName}'.`)
//         const result = target.call(this, ...args);
//         console.debug(`LOG: Exiting method '${methodName}'.`)
//         return result;
//     }

//     return replacementMethod;
// }

export function atomic(originalMethod: any) {
  const mutex = new Mutex();

  async function replacementMethod(this: any, ...args: any[]) {
    const unlock = await mutex.lock();
    try {
      const result = await originalMethod.call(this, ...args);
      return result;
    } finally {
      unlock();
    }
  }

  return replacementMethod;
}
