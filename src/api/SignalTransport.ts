import {
  ConnectRequest,
  ConnectResponse,
  Envelope,
  Fragment,
  Signalv2ClientMessage,
  Signalv2ServerMessage,
  Signalv2WireMessage,
} from '@livekit/protocol';

const MAX_WIRE_MESSAGE_SIZE = 16_000;

export interface ITransportOptions {
  url: string;
  token: string;
  connectRequest: ConnectRequest;
}

export interface ITransportConnection {
  connectResponse: ConnectResponse;
  readableStream: ReadableStream<Signalv2ServerMessage>;
  writableStream: WritableStream<Array<Signalv2ClientMessage>>;
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

  private fragmentBuffer: Map<number, Array<Fragment | null>> = new Map();

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
          const serverMessage = Signalv2WireMessage.fromBinary(new Uint8Array(event.data));
          if (serverMessage.message.case === 'envelope') {
            for (const message of serverMessage.message.value.serverMessages) {
              controller.enqueue(message);
            }
          } else if (serverMessage.message.case === 'fragment') {
            const fragment = serverMessage.message.value;
            const buffer =
              this.fragmentBuffer.get(fragment.packetId) ||
              new Array<Fragment | null>(fragment.numFragments).fill(null);
            buffer[fragment.fragmentNumber] = fragment;
            this.fragmentBuffer.set(fragment.packetId, buffer);
            if (buffer.every((f) => f !== null)) {
              const rawEnvelope = Uint8Array.from(buffer.map((f) => f.data));
              if (rawEnvelope.byteLength !== fragment.totalSize) {
                console.warn(
                  `Fragments of packet ${fragment.packetId} have incorrect size: ${rawEnvelope.byteLength} !== ${fragment.totalSize}`,
                );
                return;
              }
              const envelope = Envelope.fromBinary(rawEnvelope);
              this.fragmentBuffer.delete(fragment.packetId);
              for (const message of envelope.serverMessages) {
                controller.enqueue(message);
              }
            }
          } else {
            // TODO log warning
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
      async write(requests: Array<Signalv2ClientMessage>) {
        if (dc.readyState === 'closing' || dc.readyState === 'closed') {
          throw new Error('Signalling channel is closed');
        }

        if (dc.readyState !== 'open') {
          await new Promise((resolve, reject) => {
            dc.addEventListener('open', resolve);
            dc.addEventListener('error', reject);
          });
        }
        const envelope = new Envelope({
          clientMessages: requests,
        });
        const binaryEnvelope = envelope.toBinary();
        const envelopeSize = binaryEnvelope.byteLength;
        if (envelopeSize > MAX_WIRE_MESSAGE_SIZE) {
          console.info(`Sending fragmented envelope of ${envelopeSize} bytes`);
          const numFragments = Math.ceil(envelopeSize / MAX_WIRE_MESSAGE_SIZE);
          const fragments = [];

          for (let i = 0; i < numFragments; i++) {
            fragments.push(
              new Fragment({
                packetId: 0,
                fragmentNumber: i,
                data: binaryEnvelope.slice(
                  i * MAX_WIRE_MESSAGE_SIZE,
                  (i + 1) * MAX_WIRE_MESSAGE_SIZE,
                ),
                totalSize: envelopeSize,
                numFragments,
              }),
            );
          }
          for (const fragment of fragments) {
            const wireMessage = new Signalv2WireMessage({
              message: {
                case: 'fragment',
                value: fragment,
              },
            });
            dc.send(wireMessage.toBinary());
          }
        } else {
          const wireMessage = new Signalv2WireMessage({
            message: {
              case: 'envelope',
              value: envelope,
            },
          });
          dc.send(wireMessage.toBinary());
        }
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
