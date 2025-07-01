import type { JoinResponse, ReconnectResponse } from '@livekit/protocol';
import { SignalRequest, SignalResponse } from '@livekit/protocol';

export interface ITransportOptions {
  url: string;
  token: string;
}

export interface ITransportConnection {
  joinResponse: JoinResponse;
  readableStream: ReadableStream<SignalResponse>;
  writableStream: WritableStream<SignalRequest>;
}

export interface ITransport {
  connect(options: ITransportOptions): Promise<ITransportConnection>;
  reconnect(options: ITransportOptions): Promise<ReconnectResponse>;
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

  async connect({ url, token }: ITransportOptions): Promise<ITransportConnection> {
    const dc = this.pc.createDataChannel('signal', {
      ordered: true,
      maxRetransmits: 0,
    });
    this.dc = dc;

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    const joinRequest = await fetch(`${url}/join`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const joinResponse = await joinRequest.json();

    const readableStream = new ReadableStream({
      start: (controller) => {
        dc.addEventListener('message', (event: MessageEvent<Uint8Array>) => {
          controller.enqueue(SignalResponse.fromBinary(new Uint8Array(event.data)));
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
      async write(request: SignalRequest) {
        if (dc.readyState === 'closing' || dc.readyState === 'closed') {
          throw new Error('Signalling channel is closed');
        }

        if (dc.readyState !== 'open') {
          await new Promise((resolve, reject) => {
            dc.addEventListener('open', resolve);
            dc.addEventListener('error', reject);
          });
        }
        // TODO chunking
        dc.send(request.toBinary());
      },
      close: () => {
        dc.close();
      },

      abort: () => {
        dc.close();
      },
    });

    return {
      joinResponse,
      readableStream,
      writableStream,
    };
  }

  async reconnect(options: ITransportOptions): Promise<ReconnectResponse> {
    const reconnectRequest = await fetch(`${options.url}/reconnect`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.token}`,
      },
    });

    const reconnectResponse = await reconnectRequest.json();
    // TODO is this enough? ideally we could just continue to use the existing streams from the connect method
    this.pc.restartIce();

    return reconnectResponse;
  }

  async close(): Promise<void> {
    this.abortController.abort();
    this.dc?.close();
  }
}
