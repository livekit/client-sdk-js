import { SignalRequest, SignalResponse, JoinResponse } from '@livekit/protocol';
import type { ITransport } from './SignalTransport';
import { Future, getClientInfo } from '../room/utils';
import { atomic } from '../decorators';


export class SignalAPI {

  private writer?: WritableStreamDefaultWriter<SignalRequest>;

  private promiseMap = new Map<string, Future<SignalResponse>>();

  private offerId = 0;

  private transport: ITransport;

  private sequenceNumber = 0;

  private latestRemoteSequenceNumber = 0;

  constructor(transport: ITransport) {
    this.transport = transport;
  }

  @atomic
  async join(url: string, token: string, connectOpts: ConnectOpts): Promise<JoinResponse> {
    const clientInfo = getClientInfo();
    const { readableStream, writableStream } = await this.transport.connect({ url, token, clientInfo, connectOpts });
    const reader = readableStream.getReader();
    const { done, value } = await reader.read();
    reader.releaseLock();
    if(value?.message?.case !== 'join') {
      throw new Error('Expected join response');
    }
    if(done || !value) {
      throw new Error('Connection closed without join response');
    }
    this.readLoop(readableStream);
    this.writer = writableStream.getWriter();

    return value.message.value;
  }

  async readLoop(readableStream: ReadableStream<SignalResponse>) {
    const reader = readableStream.getReader();
    while (true) {
      try { 
      
        const { done, value } = await reader.read();
        if (done || !value) break;


        const resolverId = getResolverId(value.message);
        if(resolverId) {
          const responseKey = getResponseKey(value.message.case, resolverId);
          const future = this.promiseMap.get(responseKey);
          if (future) {
            future.resolve?.(value);
            continue;
          }
        }

        switch(value.message.case) {
          case 'join':
          case 'answer':
          case 'requestResponse':
            console.warn(`received ${value.message.case} these should all be handled by the promise map`);
            break;
          case 'leave':
            value.message.value.
            this.close();
            break;
          default:
            console.debug(`received unsupported message ${value.message.case} `);
            break;
        }

      } catch(e) {
        Array.from(this.promiseMap.values()).forEach(future => future.reject?.(e));
        this.promiseMap.clear();
        break;
      }
    }
  }

  @atomic
  async sendOfferAndAwaitAnswer(offer: RTCSessionDescriptionInit): Promise<SessionDescription> {
    // const offerId = this.offerId++;
    // if(!this.writer) {
    //   throw new Error('Writable stream not initialized');
    // }

    // const request = new SessionDescription({
    //   type: 'offer',
    //   sdp: offer.sdp,
    //   // id: offer.id,
    // });

    // await this.writer.write([this.createClientRequest({ case: 'offer', value: request })]);

    // const future = new Future<Signalv2ServerMessage>();
    // // we want an answer for this offer so we queue up a future for it
    // this.promiseMap.set(getResponseKey('answer', offerId), future);
    // const answerResponse = await future.promise;

    // if(answerResponse.message.case === 'answer') {
    //   return answerResponse.message.value;
    // }

    throw new Error('Answer not found');
  }

  private getNextSequencer(): Sequencer {
    return new Sequencer({
      messageId: this.sequenceNumber++,
      lastProcessedRemoteMessageId: this.latestRemoteSequenceNumber,
    });
  }


  // @loggedMethod
  async reconnect(): Promise<void> {
    //return this.transport.reconnect();
  }

  // @loggedMethod
  close() {
    return this.transport.disconnect();
  }
}


function getResponseKey(requestType: SignalResponse['message']['case'], messageId: number) {
  return `${requestType}-${messageId}`;
}


function getResolverId(message: SignalResponse['message']) {
  if(typeof message.value !== 'object') {
    return null;
  }
  if('requestId' in message.value) {
    return message.value.requestId;
  } else if('id' in message.value) {
    return message.value.id;
  }
  return null;
}