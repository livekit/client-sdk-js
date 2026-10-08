import type { CoreRoomOptions } from '../options';
import { CoreRoom } from './CoreRoom';
import { type ExtensionApis, type RoomExtension, installExtensions } from './extensions';

/**
 * Creates a light room with exactly the given extensions. Dependencies install on their own
 * (`rpc` brings `dataStreams`); an extension you list, configured or not, wins over the default a
 * dependency would pull in. The result carries the extension methods under the names the full
 * `Room` uses, so code moves between the two builds unchanged.
 *
 * @example
 * ```typescript
 * const room = createRoom({ adaptiveStream: true }, [rpc, e2ee({ keyProvider, worker })]);
 * room.registerRpcMethod('greet', handler);
 * await room.connect(url, token);
 * ```
 */
export function createRoom<const E extends readonly RoomExtension<any, any>[] = []>(
  options?: CoreRoomOptions,
  extensions?: E,
): CoreRoom & ExtensionApis<E[number]> {
  const room = new CoreRoom(options);
  installExtensions(room, extensions ?? []);
  return room as CoreRoom & ExtensionApis<E[number]>;
}
