// https://github.com/CarterLi/websocketstream-polyfill
import { ResultAsync } from 'neverthrow';
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

export type WebSocketOpenError =
  | { type: 'abort'; message: string }
  | { type: 'connection'; error: Event };

export type WebSocketCloseError =
  | { type: 'unspecified'; message: string }
  | { type: 'error'; error: Event };

export interface WebSocketStreamOptions {
  protocols?: string[];
  signal?: AbortSignal;
}

/**
 * [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) with [Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API)
 *
 * @see https://web.dev/websocketstream/
 */
export class WebSocketStream<T extends ArrayBuffer | string = ArrayBuffer | string> {
  readonly url: string;

  readonly opened: ResultAsync<WebSocketConnection<T>, WebSocketOpenError>;

  readonly closed: ResultAsync<WebSocketCloseInfo, WebSocketCloseError>;

  readonly close!: (closeInfo?: WebSocketCloseInfo) => void;

  get readyState(): number {
    return this.ws.readyState;
  }

  private ws: WebSocket;

  constructor(url: string, options: WebSocketStreamOptions = {}) {
    if (options.signal?.aborted) {
      throw new DOMException('This operation was aborted', 'AbortError');
    }

    this.url = url;

    const ws = new WebSocket(url, options.protocols ?? []);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    const closeWithInfo = ({ closeCode: code, reason }: WebSocketCloseInfo = {}) =>
      ws.close(code, reason);

    // eslint-disable-next-line neverthrow/must-use-result
    this.opened = ResultAsync.fromPromise<WebSocketConnection<T>, WebSocketOpenError>(
      new Promise((resolve, reject) => {
        const errorHandler = (e: Event) => {
          reject(e);
          ws.removeEventListener('open', openHandler);
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
        };

        ws.addEventListener('open', openHandler, { once: true });
        ws.addEventListener('error', errorHandler, { once: true });
      }),
      (error) => ({ type: 'connection', error: error as Event }),
    );

    // eslint-disable-next-line neverthrow/must-use-result
    this.closed = ResultAsync.fromPromise<WebSocketCloseInfo, WebSocketCloseError>(
      new Promise((resolve, reject) => {
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
            reject({
              type: 'unspecified',
              message: 'Encountered unspecified websocket error without a timely close event',
            });
          } else {
            // if we can infer the close reason from the close event then resolve with ok, we don't need to throw
            resolve({ closeCode: reason.code, reason: reason.reason });
          }
        };

        ws.onclose = ({ code, reason }) => {
          resolve({ closeCode: code, reason });
          ws.removeEventListener('error', errorHandler);
        };

        ws.addEventListener('error', errorHandler);
      }),
      (error) => error as WebSocketCloseError,
    );

    if (options.signal) {
      options.signal.onabort = () => ws.close();
    }

    this.close = closeWithInfo;
  }
}
