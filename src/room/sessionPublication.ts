import type { RoomConnectOptions } from '../options';
import type {
  PreparePublicationOptions,
  PreparedPublication,
  PreparedPublicationState,
} from './PreparedPublication';

// Versioned protocol shared only with components-js. Not exported from either SDK entry.
export const sessionPublicationKey = Symbol.for('livekit.internal.sessionPublication.v1');

/** Private integration between Session startup and the room's publication lifecycle. */
export interface SessionPublicationBridge {
  prepare(options: PreparePublicationOptions): PreparedPublication;
  connect(
    url: string,
    token: string,
    options: RoomConnectOptions | undefined,
    publications: readonly PreparedPublicationState[],
  ): Promise<void>;
}
