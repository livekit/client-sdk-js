import { ClientInfo, SignalRequest, SignalResponse } from '@livekit/protocol';
import { WebSocketStream } from './WebsocketStream';
import { atomic } from '../decorators';
import { createRtcUrl, createValidateUrl } from './utils';
import { isReactNative } from '../room/utils';
import { ConnectionError, ConnectionErrorReason } from '../room/errors';

export enum SignalConnectionState {
  Initial,
  Connecting,
  Connected,
  Reconnecting,
  Disconnecting,
  Disconnected,
}

// internal options
interface ConnectOpts extends SignalOptions {
  /** internal */
  reconnect?: boolean;
  /** internal */
  reconnectReason?: number;
  /** internal */
  sid?: string;
  /** internal */
  // joinRequest: JoinRequest; // TODO: add this back in
}

// public options
export interface SignalOptions {
  autoSubscribe: boolean;
  adaptiveStream?: boolean;
  maxRetries: number;
  e2eeEnabled: boolean;
  websocketTimeout: number;
}

export interface ITransportOptions {
  url: string;
  token: string;
  connectOpts: ConnectOpts;
  clientInfo: ClientInfo;
}

export interface ITransportConnection {
  readableStream: ReadableStream<SignalResponse>;
  writableStream: WritableStream<SignalRequest>;
}

export interface ITransport {
  connect(options: ITransportOptions): Promise<ITransportConnection>;
  disconnect(): Promise<void>;
  state: SignalConnectionState;
}

export interface ITransportFactory {
  create(): Promise<ITransport>;
}

export class WSTransport implements ITransport {
  private wsStream?: WebSocketStream;

  private _state: SignalConnectionState;

  constructor() {
    this._state = SignalConnectionState.Initial;
  }

  get state() {
    return this._state;
  }

  private updateState(state: SignalConnectionState) {
    this._state = state;
  }

  @atomic
  async connect(options: ITransportOptions) {
    this.updateState(SignalConnectionState.Connecting);

    const params = createConnectionParams(options.token, options.clientInfo, options.connectOpts);
    const rtcUrl = createRtcUrl(options.url, params);
    const validateUrl = createValidateUrl(rtcUrl);

    try {

    this.wsStream = new WebSocketStream(rtcUrl);

    
      const connection = await this.wsStream.opened;

      this.wsStream.closed.catch((e) => {
        console.error('encountered websocket error', e);
      }).finally(() => {
        this.updateState(SignalConnectionState.Disconnected);
        this.wsStream = undefined;
      });

      this.updateState(SignalConnectionState.Connected);

      const requestEncoder = new ClientRequestEncoder();
      requestEncoder.readable.pipeTo(connection.writable);

      return {
        readableStream: connection.readable.pipeThrough(new ServerResponseDecoder()),
        writableStream: requestEncoder.writable,
      };
    } catch (error) {
      this.updateState(SignalConnectionState.Disconnecting);
      const resp = await fetch(validateUrl);
      this.updateState(SignalConnectionState.Disconnected);
      if (resp.status.toFixed(0).startsWith('4')) {
        const msg = await resp.text();
        throw new ConnectionError(msg, ConnectionErrorReason.NotAllowed, resp.status);
      } else if (error instanceof Error) {
        throw new ConnectionError(
          `Encountered unknown websocket error during connection: ${error.name}: ${error.message}`,
          ConnectionErrorReason.InternalError,
          resp.status,
        );
      } else {
        throw error;
      }
    }
  }

  async disconnect(reason?: string) {
    this.updateState(SignalConnectionState.Disconnecting);
    await this.wsStream?.close({ reason });
    this.updateState(SignalConnectionState.Disconnected);
  }
}

class ServerResponseDecoder extends TransformStream<Uint8Array | string, SignalResponse> {
  constructor() {
    super({
      transform(chunk, controller) {
        let resp: SignalResponse;

        if (typeof chunk === 'string') {
          resp = SignalResponse.fromJson(JSON.parse(chunk), { ignoreUnknownFields: true });
        } else {
          resp = SignalResponse.fromBinary(chunk);
        }

        controller.enqueue(resp);
      },
    });
  }
}

class ClientRequestEncoder extends TransformStream<SignalRequest, Uint8Array | string> {
  constructor() {
    super({
      transform(chunk, controller) {
        controller.enqueue(chunk.toBinary());
      },
    });
  }
}

function createConnectionParams(
  token: string,
  info: ClientInfo,
  opts: ConnectOpts,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set('access_token', token);

  // opts
  if (opts.reconnect) {
    params.set('reconnect', '1');
    if (opts.sid) {
      params.set('sid', opts.sid);
    }
  }

  params.set('auto_subscribe', opts.autoSubscribe ? '1' : '0');

  // ClientInfo
  params.set('sdk', isReactNative() ? 'reactnative' : 'js');
  params.set('version', info.version!);
  params.set('protocol', info.protocol!.toString());
  if (info.deviceModel) {
    params.set('device_model', info.deviceModel);
  }
  if (info.os) {
    params.set('os', info.os);
  }
  if (info.osVersion) {
    params.set('os_version', info.osVersion);
  }
  if (info.browser) {
    params.set('browser', info.browser);
  }
  if (info.browserVersion) {
    params.set('browser_version', info.browserVersion);
  }

  if (opts.adaptiveStream) {
    params.set('adaptive_stream', '1');
  }

  if (opts.reconnectReason) {
    params.set('reconnect_reason', opts.reconnectReason.toString());
  }

  // @ts-ignore
  if (navigator.connection?.type) {
    // @ts-ignore
    params.set('network', navigator.connection.type);
  }

  return params;
}

