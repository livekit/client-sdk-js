import type {
  DataPacket,
  Encryption_Type,
  ParticipantInfo,
  PublishDataTrackResponse,
  Room as RoomModel,
} from '@livekit/protocol';
import type { BaseE2EEManager } from '../e2ee/E2eeManager';
import type { FrameMetadataOptions } from '../frameMetadata/FrameMetadataManager';
import type { StructuredLogger } from '../logger';
import type { CoreRoom } from './CoreRoom';
import type RTCEngine from './RTCEngine';
import type { ByteStreamWriter } from './data-stream/outgoing/StreamWriter';
import type { VideoPublisher } from './participant/LocalParticipant';
import type RemoteParticipant from './participant/RemoteParticipant';
import type { StreamBytesOptions } from './types';

/**
 * A feature that `createRoom(options, [...])` (or the full `Room`) installs on a room. The
 * methods returned from `install` are copied onto the room (`room`) and its local participant
 * (`local`) under the same names the full SDK uses, so code moves between the light and full
 * builds unchanged.
 *
 * `install` runs synchronously right after the room is constructed, before any user code, so
 * handlers registered there are in place before `connect()`.
 */
export interface RoomExtension<RoomApi = {}, LocalApi = {}> {
  readonly key: symbol;
  /** Hard dependencies. They install first; an instance the app lists explicitly wins over them. */
  readonly requires?: readonly RoomExtension<any, any>[];
  install(room: CoreRoom, ctx: ExtensionContext): ExtensionResult<RoomApi, LocalApi>;
}

/**
 * What `install` returns: the APIs to copy onto the room and its local participant, and what the
 * extension contributes to core (slots, packet ownership, hooks). Extra members are not copied
 * anywhere; dependent extensions read them through `ctx.get(extension)`.
 */
export interface ExtensionResult<RoomApi = {}, LocalApi = {}> {
  room?: RoomApi;
  localParticipant?: LocalApi;
  /** Called from `Room.dispose()`, in reverse install order. Must be synchronous. */
  dispose?(): void;
  /** Values core reads; see {@link CoreSlots}. */
  slots?: Partial<CoreSlots>;
  /** The `DataPacket` oneof cases this extension owns. A second owner throws at install. */
  dataPackets?: { [C in DataPacketCase]?: DataPacketHandler<C> };
  /** Local data track publications for the sync state the room sends on resume. */
  syncState?(): PublishDataTrackResponse[];
  /**
   * Runs once every extension of the list is installed, with the current engine, and again
   * whenever the room replaces it (after a close). The room's own engine listeners are registered
   * first, so a listener on the same engine event sees room state already updated.
   */
  onEngineCreated?(engine: RTCEngine): void;
  /**
   * Runs at the start of every disconnect, including one that reaches an already disconnected
   * room, before the room emits `RoomEvent.Disconnected`.
   */
  onDisconnect?(): void;
  /** Runs after the room creates a remote participant from a `ParticipantInfo`. */
  onParticipantCreated?(participant: RemoteParticipant, info: ParticipantInfo): void;
  /** Runs after the room applied a participant update (join, update, reconnect). */
  onParticipantUpdates?(infos: ParticipantInfo[]): void;
}

export type DataPacketHandler<C extends DataPacketCase> = (
  value: DataPacketValue<C>,
  packet: DataPacket,
  encryptionType: Encryption_Type,
  participant: RemoteParticipant | undefined,
) => void;

/**
 * The values core reads from extensions. An extension fills a slot through the `slots` of its
 * install result; core and the local participant read it. Adding one is a key here plus the read.
 * @experimental
 */
export interface CoreSlots {
  /** `RTCEngine` and the publish path encrypt through it (`e2ee`). */
  e2eeManager: BaseE2EEManager;
  /** The engine's sender transform, the join capability and `publishTrack` read it (`frameMetadata`). */
  frameMetadataOptions: FrameMetadataOptions;
  /** Opens an outgoing byte stream (`dataStreams`). The preconnect audio buffer goes through it. */
  byteStreamOpener: (options?: StreamBytesOptions) => Promise<ByteStreamWriter>;
  /** The video publish pipeline (`video`). Without it, publishing a video track throws. */
  videoPublisher: VideoPublisher;
}

export type DataPacketCase = NonNullable<DataPacket['value']['case']>;
export type DataPacketValue<C extends DataPacketCase> = Extract<
  DataPacket['value'],
  { case: C }
>['value'];

/**
 * What core exposes to an extension at install time. Everything the extension contributes goes
 * through its install result instead. Everything else it needs (`remoteParticipants`,
 * `localParticipant`, `emit`, `options`, `engine`) is public on the room already.
 * @experimental
 */
export interface ExtensionContext {
  log: StructuredLogger;
  /** The `install` result of an already installed extension (a hard dependency). */
  get<E extends RoomExtension<any, any>>(ext: E): ReturnType<E['install']>;
  /** Reads a slot. Slots of the whole list are filled before any `onEngineCreated` runs. */
  slot<K extends keyof CoreSlots>(slot: K): CoreSlots[K] | undefined;
  /** Returns the remote participant for an identity, creating it from `info` when new. */
  getOrCreateParticipant(identity: string, info: ParticipantInfo): RemoteParticipant;
  /** Puts the room into the connected state without a server (`simulatedParticipants`). */
  simulateConnected(roomInfo: RoomModel, localParticipantInfo: ParticipantInfo): void;
}

type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void
  ? I
  : never;

type ApiOf<E> = E extends RoomExtension<infer R, any> ? R : never;
type LocalOf<E> = E extends RoomExtension<any, infer L> ? L : never;
type Deps<E> = E extends { requires: readonly (infer D)[] } ? D | Deps<D> : never;
type All<E> = E | Deps<E>;

/** The methods a set of extensions (and their dependencies) adds to a room and its local participant. */
export type ExtensionApis<E> = UnionToIntersection<ApiOf<All<E>>> & {
  localParticipant: UnionToIntersection<LocalOf<All<E>>>;
};

/** An extension with its options bound. */
export type ConfiguredExtension<
  Result extends ExtensionResult<any, any>,
  Requires extends readonly RoomExtension<any, any>[],
> = {
  readonly key: symbol;
  readonly requires: Requires;
  install(room: CoreRoom, ctx: ExtensionContext): Result;
};

/**
 * An extension that takes options. Listed bare (`[e2ee]`) it installs from the room options the
 * full `Room` uses today; called (`[e2ee(options)]`) it installs with those options. A function
 * (`e2ee(() => options)`) is evaluated inside each room's constructor, for resources such as
 * workers that must be per room.
 */
export type ConfigurableExtension<
  Result extends ExtensionResult<any, any>,
  Options,
  Requires extends readonly RoomExtension<any, any>[],
> = ConfiguredExtension<Result, Requires> &
  ((options: Options | (() => Options)) => ConfiguredExtension<Result, Requires>);

/** Builds a {@link ConfigurableExtension}. The option type comes from the `options` parameter. */
export function defineExtension<
  Result extends ExtensionResult<any, any>,
  Options,
  const Requires extends readonly RoomExtension<any, any>[] = [],
>(
  name: string,
  requires: Requires,
  install: (room: CoreRoom, ctx: ExtensionContext, options: Options | undefined) => Result,
): ConfigurableExtension<Result, Options, Requires> {
  const key = Symbol(`lk.extension.${name}`);
  const configure = (
    options?: Options | (() => Options),
  ): ConfiguredExtension<Result, Requires> => ({
    key,
    requires,
    install: (room, ctx) =>
      install(room, ctx, typeof options === 'function' ? (options as () => Options)() : options),
  });
  return Object.assign((options: Options | (() => Options)) => configure(options), configure());
}

/**
 * Installs extensions on a room: dependencies first, each key once. An extension the caller
 * lists explicitly wins over the default a dependency would pull in, whatever the order.
 * @experimental
 */
export function installExtensions(
  room: CoreRoom,
  extensions: readonly RoomExtension<any, any>[],
): void {
  const explicit = new Map<symbol, RoomExtension<any, any>>();
  for (const ext of extensions) {
    if (explicit.has(ext.key)) {
      // @throws-transformer ignore - programmer error
      throw new Error(`extension '${String(ext.key)}' is listed twice`);
    }
    explicit.set(ext.key, ext);
  }
  const resolved: RoomExtension<any, any>[] = [];
  const add = (ext: RoomExtension<any, any>, stack: symbol[]) => {
    const chosen = explicit.get(ext.key) ?? ext;
    if (stack.includes(chosen.key)) {
      // @throws-transformer ignore - programmer error
      throw new Error(`extension '${String(chosen.key)}' depends on itself`);
    }
    if (resolved.includes(chosen)) {
      return;
    }
    chosen.requires?.forEach((dep) => add(dep, [...stack, chosen.key]));
    resolved.push(chosen);
  };
  extensions.forEach((ext) => add(ext, []));
  room.installExtensions(resolved);
}
