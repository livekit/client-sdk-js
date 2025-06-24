import { Mutex } from '@livekit/mutex';
import { JoinResponse, ReconnectResponse } from '@livekit/protocol';

export interface ITransport {
  connect(url: string, token: string): Promise<JoinResponse>;
  send(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  reconnect(): Promise<ReconnectResponse>;
  onMessage(callback: (data: Uint8Array) => void): void;
  onError(callback: (error: Error) => void): void;
}

export interface ITransportFactory {
  create(url: string): Promise<ITransport>;
}

export class SignalAPI {
  constructor(private transport: ITransport) {
    this.transport.onMessage(this.onMessage);
    this.transport.onError(this.onError);
  }

  @bound
  private onMessage(data: Uint8Array) {
    console.log('onMessage', data);
  }

  @bound
  private onError(error: Error) {
    console.error('onError', error);
  }

  @atomic
  join(url: string, token: string): Promise<JoinResponse> {
    return this.transport.connect(url, token);
  }

  @loggedMethod
  reconnect(): Promise<ReconnectResponse> {
    return this.transport.reconnect();
  }

  @loggedMethod
  close() {}
}

function bound<This, Args extends any[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
) {
  const methodName = context.name;
  if (context.private) {
    throw new Error(`'bound' cannot decorate private properties like ${methodName as string}.`);
  }
  context.addInitializer(function () {
    // @ts-ignore
    this[methodName] = this[methodName].bind(this);
  });
}

function loggedMethod<This, Args extends any[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
) {
    const methodName = String(context.name);

    function replacementMethod(this: This, ...args: Args): Return {
        console.debug(`LOG: Entering method '${methodName}'.`)
        const result = target.call(this, ...args);
        console.debug(`LOG: Exiting method '${methodName}'.`)
        return result;
    }

    return replacementMethod;
}

function atomic(originalMethod: any) {
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