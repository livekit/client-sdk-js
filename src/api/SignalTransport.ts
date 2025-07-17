import {
  ConnectRequest,
  ConnectResponse,
  Signalv2ClientEnvelope,
  Signalv2ClientMessage,
  Signalv2ServerMessage,
} from '@livekit/protocol';

export interface ITransportOptions {
  url: string;
  token: string;
  connectRequest: ConnectRequest;
}

type ValidServerMessage = Exclude<
  NonNullable<Signalv2ServerMessage['message']>,
  { case: 'fragment' } | { case: 'envelope' } | { case: undefined }
>;

export interface ITransportConnection {
  connectResponse: ConnectResponse;
  readableStream: ReadableStream<Signalv2ServerMessage>;
  writableStream: WritableStream<Signalv2ClientMessage>;
}

export interface ITransport {
  connect(options: ITransportOptions): Promise<ITransportConnection>;
  close(): Promise<void>;
}

export interface ITransportFactory {
  create(): Promise<ITransport>;
}

export class HybridSignalTransport implements ITransport {
  private readonly pc: RTCPeerConnection;

  private dc?: RTCDataChannel;

  abortController: AbortController;

  constructor(peerConnection: RTCPeerConnection) {
    this.pc = peerConnection;
    this.abortController = new AbortController();
  }

  async connect({ url, token, connectRequest }: ITransportOptions): Promise<ITransportConnection> {
    const dc = this.pc.createDataChannel('signal', {
      ordered: true,
      maxRetransmits: 0,
    });
    this.dc = dc;

    const joinRequest = await fetch(`${url}/join`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: connectRequest.toBinary(),
      signal: this.abortController.signal,
    });

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    const connectResponse = ConnectResponse.fromBinary(
      new Uint8Array(await joinRequest.arrayBuffer()),
    );

    const readableStream = new ReadableStream<Signalv2ServerMessage>({
      start: (controller) => {
        dc.addEventListener('message', (event: MessageEvent<Uint8Array>) => {
          const serverMessage = Signalv2ServerMessage.fromBinary(new Uint8Array(event.data));
          switch (serverMessage.message.case) {
            case 'envelope':
              controller.enqueue(serverMessage.message.value);
              break;
            case 'connectResponse':
              controller.enqueue(serverMessage.message.value);
              break;
            default:
              throw new Error(`Unknown server message type: ${serverMessage.message.case}`);
          }
        });

        dc.addEventListener('error', (event: Event) => {
          controller.error(event);
        });

        dc.addEventListener('closed', () => {
          controller.close();
        });
      },
    });

    const writableStream = new WritableStream({
      async write(request: Signalv2ClientMessage) {
        if (dc.readyState === 'closing' || dc.readyState === 'closed') {
          throw new Error('Signalling channel is closed');
        }

        if (dc.readyState !== 'open') {
          await new Promise((resolve, reject) => {
            dc.addEventListener('open', resolve);
            dc.addEventListener('error', reject);
          });
        }
        const envelope = new Signalv2ClientEnvelope({
          clientMessages: [request],
        });
        // TODO chunking
        dc.send(envelope.toBinary());
      },
      close: () => {
        dc.close();
      },

      abort: () => {
        dc.close();
      },
    });

    return {
      connectResponse,
      readableStream,
      writableStream,
    };
  }

  async close(): Promise<void> {
    this.abortController.abort();
    this.dc?.close();
  }
}
