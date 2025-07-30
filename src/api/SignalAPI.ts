import { ConnectionSettings, ConnectRequest, ConnectResponse, Sequencer, SessionDescription, Signalv2ClientMessage, Signalv2ServerMessage } from '@livekit/protocol';
import type { ITransport } from './SignalTransport';
import { Future, getClientInfo } from '../room/utils';
import { atomic } from '../decorators';


export class SignalAPI {

  private writer?: WritableStreamDefaultWriter<Array<Signalv2ClientMessage>>;

  private promiseMap = new Map<string, Future<Signalv2ServerMessage>>();

  private offerId = 0;

  private transport: ITransport;

  private sequenceNumber = 0;

  private latestRemoteSequenceNumber = 0;

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

    const clientRequest = this.createClientRequest({ case: 'connectRequest', value: connectRequest });

    const { readableStream, writableStream, connectResponse } = await this.transport.connect({ url, token, clientRequest });
    this.readLoop(readableStream);
    this.writer = writableStream.getWriter();
    return connectResponse;
  }

  async readLoop(readableStream: ReadableStream<Signalv2ServerMessage>) {
    const reader = readableStream.getReader();
    while (true) {
      try { 
      
        const { done, value } = await reader.read();
        if(!value) {
          continue;
        }
        this.latestRemoteSequenceNumber = value.sequencer!.messageId;
        const responseKey = getResponseKey(value.message!.case, value.sequencer!.messageId);
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


 createClientRequest(request: Signalv2ClientMessage['message']): Signalv2ClientMessage {
  return new Signalv2ClientMessage({
   sequencer: this.getNextSequencer(),
   message: request,
  });
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


function getResponseKey(requestType: Signalv2ServerMessage['message']['case'], messageId: number) {
  return `${requestType}-${messageId}`;
}
