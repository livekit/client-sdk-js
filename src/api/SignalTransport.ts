import { Mutex } from '@livekit/mutex';
import {
  ConnectRequest,
  ConnectResponse,
  Envelope,
  Fragment,
  Signalv2ClientMessage,
  Signalv2ServerMessage,
  Signalv2WireMessage,
} from '@livekit/protocol';
import { sleep } from '../room/utils';

const MAX_WIRE_MESSAGE_SIZE = 16_000;
const BUFFER_LOW_THRESHOLD = 65535;

export enum SignalConnectionState {
  Connecting,
  Connected,
  Reconnecting,
  Disconnected,
}

export interface ITransportOptions {
  url: string;
  token: string;
  clientRequest: Signalv2ClientMessage;
}

export interface ITransportConnection {
  connectResponse: ConnectResponse;
  readableStream: ReadableStream<Signalv2ServerMessage>;
  writableStream: WritableStream<Array<Signalv2ClientMessage>>;
}

export interface ITransport {
  connect(options: ITransportOptions): Promise<ITransportConnection>;
  close(): Promise<void>;
  currentState: SignalConnectionState;
}

export interface ITransportFactory {
  create(): Promise<ITransport>;
}

export class DCSignalTransport implements ITransport {
  private readonly pc: RTCPeerConnection;

  private dc: RTCDataChannel;

  abortController: AbortController;

  private fragmentBuffer: Map<number, Array<Fragment | null>> = new Map();

  private bufferLowMutex: Mutex;

  private state: SignalConnectionState = SignalConnectionState.Connecting;

  get currentState(): SignalConnectionState {
    return this.state;
  }

  constructor(peerConnection: RTCPeerConnection) {
    this.pc = peerConnection;
    this.pc.addEventListener('iceconnectionstatechange', this.handleICEConnectionStateChange);
    this.dc = this.pc.createDataChannel('signal', {
      ordered: true,
      maxRetransmits: 0,
    });
    this.dc.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;
    this.abortController = new AbortController();
    this.bufferLowMutex = new Mutex();
  }

  private handleICEConnectionStateChange(event: Event) {
    const pc = event.target as RTCPeerConnection;
    switch (pc.iceConnectionState) {
      case 'new':
      case 'checking':
        this.state = SignalConnectionState.Connecting;
        break;
      case 'connected':
      case 'completed':
        this.state = SignalConnectionState.Connected;
        break;
      case 'disconnected':
        this.state = SignalConnectionState.Reconnecting;
        break;
      case 'failed':
      case 'closed':
        this.state = SignalConnectionState.Disconnected;
        break;
    }
  }

  private get isBufferedAmountLow(): boolean {
    return this.dc.bufferedAmount <= this.dc.bufferedAmountLowThreshold;
  }

  async waitForBufferedAmountLow(): Promise<void> {
    // mutex is used to prevent race condition when multiple writes are happening at the same time
    const unlock = await this.bufferLowMutex.lock();
    while (!this.isBufferedAmountLow) {
      sleep(10);
    }
    unlock();
  }

  async connect({ url, token, clientRequest }: ITransportOptions): Promise<ITransportConnection> {
    const dc = this.pc.createDataChannel('signal', {
      ordered: true,
      maxRetransmits: 0,
    });

    const connectRequest = new Signalv2WireMessage({
      message: {
        case: 'envelope',
        value: new Envelope({
          clientMessages: [clientRequest],
        }),
      },
    });

    const joinRequest = await fetch(`${url}/rtc/v2`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-protobuf',
      },
      body: connectRequest.toBinary(),
      signal: this.abortController.signal,
    });

    if (!joinRequest.ok) {
      console.warn(`Failed to join room: ${joinRequest.statusText}`);
    }

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    const signalResponse = Signalv2WireMessage.fromBinary(
      new Uint8Array(await joinRequest.arrayBuffer()),
    );

    if (signalResponse.message.case !== 'envelope') {
      throw new Error('Invalid response from server');
    }
    const envelope = signalResponse.message.value;

    if (
      envelope.serverMessages.length !== 1 ||
      envelope.serverMessages[0].message.case !== 'connectResponse'
    ) {
      throw new Error('Invalid response from server');
    }

    const connectResponse = envelope.serverMessages[0].message.value;

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

        dc.addEventListener('open', () => {
          console.info('Signal channel opened');
        });
      },
    });

    const writableStream = new WritableStream({
      write: async (requests: Array<Signalv2ClientMessage>) => {
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
            await this.waitForBufferedAmountLow();
            dc.send(wireMessage.toBinary());
          }
        } else {
          const wireMessage = new Signalv2WireMessage({
            message: {
              case: 'envelope',
              value: envelope,
            },
          });
          await this.waitForBufferedAmountLow();
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
