// https://github.com/CarterLi/websocketstream-polyfill
import { ResultAsync } from 'neverthrow';
import { ConnectionError } from '../room/errors';
import { sleep } from '../room/utils';

export interface WebSocketConnection<T extends ArrayBuffer | string = ArrayBuffer | string> {
  readable: ReadableStream<T>;
  writable: WritableStream<T>;
  protocol: string;
  extensions: string;
}

export interface WebSocketCloseInfo {
  closeCode?: number;
  reason?: string;
}

export interface WebSocketStreamOptions {
  protocols?: string[];
  signal?: AbortSignal;
}

export type WebSocketError = ReturnType<typeof ConnectionError.websocket>;

/**
 * [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) with [Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API)
 *
 * @see https://web.dev/websocketstream/
 */
export class WebSocketStream<T extends ArrayBuffer | string = ArrayBuffer | string> {
  readonly url: string;

  readonly opened: ResultAsync<WebSocketConnection<T>, WebSocketError>;

  readonly closed: ResultAsync<WebSocketCloseInfo, WebSocketError>;

  readonly close!: (closeInfo?: WebSocketCloseInfo) => void;

  get readyState(): number {
    return this.ws.readyState;
  }

  private ws: WebSocket;

  constructor(url: string, options: WebSocketStreamOptions = {}) {
    if (options.signal?.aborted) {
      throw ConnectionError.cancelled('Aborted before WS was initialized');
    }

    const ws = new WebSocket(url, options.protocols ?? []);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.url = url;

    const closeWithInfo = ({ closeCode: code, reason }: WebSocketCloseInfo = {}) =>
      ws.close(code, reason);

    // eslint-disable-next-line neverthrow/must-use-result
    this.opened = ResultAsync.fromPromise<WebSocketConnection<T>, WebSocketError>(
      new Promise((resolve, r) => {
        const reject = (err: WebSocketError) => r(err);
        const errorHandler = (e: Event) => {
          console.error(e);
          reject(
            ConnectionError.websocket('Encountered websocket error while establishing connection'),
          );
          ws.removeEventListener('open', openHandler);
        };

        const onCloseDuringOpen = (ev: CloseEvent) => {
          reject(
            ConnectionError.websocket(
              `WS closed during connection establishment: ${ev.reason}`,
              ev.code,
              ev.reason,
            ),
          );
        };

        const openHandler = () => {
          resolve({
            readable: new ReadableStream<T>({
              start(controller) {
                ws.onmessage = ({ data }) => controller.enqueue(data);
                ws.onerror = (e) => controller.error(e);
              },
              cancel: closeWithInfo,
            }),
            writable: new WritableStream<T>({
              write(chunk) {
                ws.send(chunk);
              },
              abort() {
                ws.close();
              },
              close: closeWithInfo,
            }),
            protocol: ws.protocol,
            extensions: ws.extensions,
          });
          ws.removeEventListener('error', errorHandler);
          ws.removeEventListener('close', onCloseDuringOpen);
        };

        console.log('websocket setup registering event listeners');

        ws.addEventListener('open', openHandler, { once: true });
        ws.addEventListener('error', errorHandler, { once: true });
        ws.addEventListener('close', onCloseDuringOpen, { once: true });
      }),
      (error) => error as WebSocketError,
    );

    // eslint-disable-next-line neverthrow/must-use-result
    this.closed = ResultAsync.fromPromise<WebSocketCloseInfo, WebSocketError>(
      new Promise<WebSocketCloseInfo>((resolve, r) => {
        const reject = (err: WebSocketError) => r(err);
        const errorHandler = async () => {
          const closePromise = new Promise<CloseEvent>((res) => {
            if (ws.readyState === WebSocket.CLOSED) return;
            else {
              ws.addEventListener(
                'close',
                (closeEv: CloseEvent) => {
                  res(closeEv);
                },
                { once: true },
              );
            }
          });
          const reason = await Promise.race([sleep(250), closePromise]);
          if (!reason) {
            reject(
              ConnectionError.websocket(
                'Encountered unspecified websocket error without a timely close event',
              ),
            );
          } else {
            // if we can infer the close reason from the close event then resolve with ok, we don't need to throw
            resolve({ closeCode: reason.code, reason: reason.reason });
          }
        };

        if (ws.readyState === WebSocket.CLOSED) {
          reject(ConnectionError.websocket('Websocket already closed at initialization time'));
          return;
        }

        ws.onclose = ({ code, reason }) => {
          resolve({ closeCode: code, reason });
          ws.removeEventListener('error', errorHandler);
        };

        ws.addEventListener('error', errorHandler);
      }),
      (error) => error as WebSocketError,
    );

    if (options.signal) {
      options.signal.onabort = () => ws.close(undefined, 'AbortSignal triggered');
    }

    this.close = closeWithInfo;
  }
}
