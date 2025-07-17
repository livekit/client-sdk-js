import { Mutex } from '@livekit/mutex';
import { ConnectionSettings, ConnectRequest, ConnectResponse, SessionDescription, SignalRequest, SignalResponse } from '@livekit/protocol';
import type { ITransport } from './SignalTransport';
import { Future, getClientInfo } from '../room/utils';


export class SignalAPI {

  private writer?: WritableStreamDefaultWriter<SignalRequest>;

  private promiseMap = new Map<string, Future<SignalResponse>>();

  private offerId = 0;

  private transport: ITransport;

  constructor(transport: ITransport) {
    this.transport = transport;
  }

  @atomic
  async join(url: string, token: string): Promise<ConnectResponse> {
   const connectRequest =  new ConnectRequest({
      clientInfo: getClientInfo(),
      connectionSettings: new ConnectionSettings({
        adaptiveStream: true,
        autoSubscribe: true,
      })
    });
    const { readableStream, writableStream, connectResponse } = await this.transport.connect({ url, token, connectRequest });
    this.readLoop(readableStream);
    this.writer = writableStream.getWriter();
    return connectResponse;
  }

  async readLoop(readableStream: ReadableStream<SignalResponse>) {
    const reader = readableStream.getReader();
    while (true) {
      try { 
      
        const { done, value } = await reader.read();
        if(!value) {
          continue;
        }
        // @ts-ignore
        const responseKey = getResponseKey(value.message.case, value.message.value!.id as number);
        const future = this.promiseMap.get(responseKey);
        if (future) {
          future.resolve?.(value);
        }

        if (done) break;
      } catch(e) {
        Array.from(this.promiseMap.values()).forEach(future => future.reject?.(e));
        this.promiseMap.clear();
        break;
      }
    }
  }

  @atomic
  async sendOfferAndAwaitAnswer(offer: RTCSessionDescriptionInit): Promise<SessionDescription> {
    const offerId = this.offerId++;
    if(!this.writer) {
      throw new Error('Writable stream not initialized');
    }

    const request = new SessionDescription({
      type: 'offer',
      sdp: offer.sdp,
      // id: offer.id,
    });

    await this.writer.write(new SignalRequest({
      message: { case: 'offer', value: request },
    }));

    const future = new Future<SignalResponse>();
    // we want an answer for this offer so we queue up a future for it
    this.promiseMap.set(getResponseKey('answer', offerId), future);
    const answerResponse = await future.promise;

    if(answerResponse.message.case === 'answer') {
      return answerResponse.message.value;
    }

    throw new Error('Answer not found');
  }

  // @loggedMethod
  async reconnect(): Promise<void> {
    //return this.transport.reconnect();
  }

  // @loggedMethod
  close() {
    this.transport.close();
  }
}


// function loggedMethod<This, Args extends any[], Return>(
//     target: (this: This, ...args: Args) => Return,
//     context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
// ) {
//     const methodName = String(context.name);

//     function replacementMethod(this: This, ...args: Args): Return {
//         console.debug(`LOG: Entering method '${methodName}'.`)
//         const result = target.call(this, ...args);
//         console.debug(`LOG: Exiting method '${methodName}'.`)
//         return result;
//     }

//     return replacementMethod;
// }

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

function getResponseKey(requestType: SignalResponse['message']['case'], requestId: number) {
  return `${requestType}-${requestId}`;
}