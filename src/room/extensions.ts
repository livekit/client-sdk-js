import type { DataPacket, Encryption_Type } from '@livekit/protocol';
import type { StructuredLogger } from '../logger';
import type { CoreRoom } from './CoreRoom';
import type RTCEngine from './RTCEngine';
import type RemoteParticipant from './participant/RemoteParticipant';

/**
 * A feature that `CoreRoom.with(...)` adds to a room class. The methods returned from
 * `install` are copied onto the room (`room`) and its local participant (`local`) under the
 * same names the full SDK uses, so code moves between the light and full builds unchanged.
 *
 * `install` runs synchronously inside the `Room` constructor, before any user code, so handlers
 * registered there are in place before `connect()`.
 */
export interface RoomExtension<RoomApi = {}, LocalApi = {}> {
  readonly key: symbol;
  /** Hard dependencies. `with()` installs them first and dedupes by `key`. */
  readonly requires?: readonly RoomExtension<any, any>[];
  install(room: CoreRoom, ctx: ExtensionContext): ExtensionResult<RoomApi, LocalApi>;
}

/**
 * What `install` returns. Extra members (beyond `room`/`local`/`dispose`) are not copied
 * anywhere; dependent extensions read them through `ctx.get(extension)`.
 */
export interface ExtensionResult<RoomApi = {}, LocalApi = {}> {
  room?: RoomApi;
  local?: LocalApi;
  /** Called from `Room.dispose()`, in reverse install order. Must be synchronous. */
  dispose?(): void;
}

export type DataPacketCase = NonNullable<DataPacket['value']['case']>;
export type DataPacketValue<C extends DataPacketCase> = Extract<
  DataPacket['value'],
  { case: C }
>['value'];

/**
 * The hooks core exposes to extensions. Everything else an extension needs (`remoteParticipants`,
 * `localParticipant`, `emit`, `options`, `engine`) is public on the room already.
 * @internal
 */
export interface ExtensionContext {
  log: StructuredLogger;
  /**
   * Runs now with the current engine and again whenever the room replaces it (after a close).
   * The room's own engine listeners are registered before this runs, so a hook that listens to
   * the same engine event sees room state already updated.
   */
  onEngineCreated(cb: (engine: RTCEngine) => void): void;
  /** Claims a `DataPacket` oneof case. Throws if another extension already owns it. */
  onDataPacket<C extends DataPacketCase>(
    kind: C,
    handler: (
      value: DataPacketValue<C>,
      packet: DataPacket,
      encryptionType: Encryption_Type,
      participant: RemoteParticipant | undefined,
    ) => void,
  ): void;
  /**
   * Runs at the start of every disconnect, including one that reaches an already disconnected
   * room, before the room emits `RoomEvent.Disconnected`.
   */
  onDisconnect(cb: () => void): void;
  /** The `install` result of an already installed extension (a hard dependency). */
  get<E extends RoomExtension<any, any>>(ext: E): ReturnType<E['install']>;
}

type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void
  ? I
  : never;

type ApiOf<E> = E extends RoomExtension<infer R, any> ? R : never;
type LocalOf<E> = E extends RoomExtension<any, infer L> ? L : never;
type Deps<E> = E extends { requires: readonly (infer D)[] } ? D | Deps<D> : never;
type All<E> = E | Deps<E>;

export type RoomClass = abstract new (...args: any) => CoreRoom;

/** The class `CoreRoom.with(...)` returns: the base class plus every extension's API. */
export type ExtendedRoom<S extends RoomClass, E> = Omit<S, 'prototype'> & {
  new (...args: ConstructorParameters<S>): InstanceType<S> &
    UnionToIntersection<ApiOf<All<E>>> & {
      localParticipant: InstanceType<S>['localParticipant'] & UnionToIntersection<LocalOf<All<E>>>;
    };
  prototype: InstanceType<S>;
};
