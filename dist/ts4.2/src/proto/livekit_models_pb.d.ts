import type { BinaryReadOptions, FieldList, JsonReadOptions, JsonValue, PartialMessage, PlainMessage } from "@bufbuild/protobuf";
import { Message, proto3, Timestamp } from "@bufbuild/protobuf";
/**
 * @generated from enum livekit.AudioCodec
 */
export declare enum AudioCodec {
    /**
     * @generated from enum value: DEFAULT_AC = 0;
     */
    DEFAULT_AC = 0,
    /**
     * @generated from enum value: OPUS = 1;
     */
    OPUS = 1,
    /**
     * @generated from enum value: AAC = 2;
     */
    AAC = 2
}
/**
 * @generated from enum livekit.VideoCodec
 */
export declare enum VideoCodec {
    /**
     * @generated from enum value: DEFAULT_VC = 0;
     */
    DEFAULT_VC = 0,
    /**
     * @generated from enum value: H264_BASELINE = 1;
     */
    H264_BASELINE = 1,
    /**
     * @generated from enum value: H264_MAIN = 2;
     */
    H264_MAIN = 2,
    /**
     * @generated from enum value: H264_HIGH = 3;
     */
    H264_HIGH = 3,
    /**
     * @generated from enum value: VP8 = 4;
     */
    VP8 = 4
}
/**
 * @generated from enum livekit.ImageCodec
 */
export declare enum ImageCodec {
    /**
     * @generated from enum value: IC_DEFAULT = 0;
     */
    IC_DEFAULT = 0,
    /**
     * @generated from enum value: IC_JPEG = 1;
     */
    IC_JPEG = 1
}
/**
 * @generated from enum livekit.TrackType
 */
export declare enum TrackType {
    /**
     * @generated from enum value: AUDIO = 0;
     */
    AUDIO = 0,
    /**
     * @generated from enum value: VIDEO = 1;
     */
    VIDEO = 1,
    /**
     * @generated from enum value: DATA = 2;
     */
    DATA = 2
}
/**
 * @generated from enum livekit.TrackSource
 */
export declare enum TrackSource {
    /**
     * @generated from enum value: UNKNOWN = 0;
     */
    UNKNOWN = 0,
    /**
     * @generated from enum value: CAMERA = 1;
     */
    CAMERA = 1,
    /**
     * @generated from enum value: MICROPHONE = 2;
     */
    MICROPHONE = 2,
    /**
     * @generated from enum value: SCREEN_SHARE = 3;
     */
    SCREEN_SHARE = 3,
    /**
     * @generated from enum value: SCREEN_SHARE_AUDIO = 4;
     */
    SCREEN_SHARE_AUDIO = 4
}
/**
 * @generated from enum livekit.VideoQuality
 */
export declare enum VideoQuality {
    /**
     * @generated from enum value: LOW = 0;
     */
    LOW = 0,
    /**
     * @generated from enum value: MEDIUM = 1;
     */
    MEDIUM = 1,
    /**
     * @generated from enum value: HIGH = 2;
     */
    HIGH = 2,
    /**
     * @generated from enum value: OFF = 3;
     */
    OFF = 3
}
/**
 * @generated from enum livekit.ConnectionQuality
 */
export declare enum ConnectionQuality {
    /**
     * @generated from enum value: POOR = 0;
     */
    POOR = 0,
    /**
     * @generated from enum value: GOOD = 1;
     */
    GOOD = 1,
    /**
     * @generated from enum value: EXCELLENT = 2;
     */
    EXCELLENT = 2
}
/**
 * @generated from enum livekit.ClientConfigSetting
 */
export declare enum ClientConfigSetting {
    /**
     * @generated from enum value: UNSET = 0;
     */
    UNSET = 0,
    /**
     * @generated from enum value: DISABLED = 1;
     */
    DISABLED = 1,
    /**
     * @generated from enum value: ENABLED = 2;
     */
    ENABLED = 2
}
/**
 * @generated from enum livekit.DisconnectReason
 */
export declare enum DisconnectReason {
    /**
     * @generated from enum value: UNKNOWN_REASON = 0;
     */
    UNKNOWN_REASON = 0,
    /**
     * @generated from enum value: CLIENT_INITIATED = 1;
     */
    CLIENT_INITIATED = 1,
    /**
     * @generated from enum value: DUPLICATE_IDENTITY = 2;
     */
    DUPLICATE_IDENTITY = 2,
    /**
     * @generated from enum value: SERVER_SHUTDOWN = 3;
     */
    SERVER_SHUTDOWN = 3,
    /**
     * @generated from enum value: PARTICIPANT_REMOVED = 4;
     */
    PARTICIPANT_REMOVED = 4,
    /**
     * @generated from enum value: ROOM_DELETED = 5;
     */
    ROOM_DELETED = 5,
    /**
     * @generated from enum value: STATE_MISMATCH = 6;
     */
    STATE_MISMATCH = 6,
    /**
     * @generated from enum value: JOIN_FAILURE = 7;
     */
    JOIN_FAILURE = 7
}
/**
 * @generated from enum livekit.ReconnectReason
 */
export declare enum ReconnectReason {
    /**
     * @generated from enum value: RR_UNKNOWN = 0;
     */
    RR_UNKNOWN = 0,
    /**
     * @generated from enum value: RR_SIGNAL_DISCONNECTED = 1;
     */
    RR_SIGNAL_DISCONNECTED = 1,
    /**
     * @generated from enum value: RR_PUBLISHER_FAILED = 2;
     */
    RR_PUBLISHER_FAILED = 2,
    /**
     * @generated from enum value: RR_SUBSCRIBER_FAILED = 3;
     */
    RR_SUBSCRIBER_FAILED = 3,
    /**
     * @generated from enum value: RR_SWITCH_CANDIDATE = 4;
     */
    RR_SWITCH_CANDIDATE = 4
}
/**
 * @generated from enum livekit.SubscriptionError
 */
export declare enum SubscriptionError {
    /**
     * @generated from enum value: SE_UNKNOWN = 0;
     */
    SE_UNKNOWN = 0,
    /**
     * @generated from enum value: SE_CODEC_UNSUPPORTED = 1;
     */
    SE_CODEC_UNSUPPORTED = 1,
    /**
     * @generated from enum value: SE_TRACK_NOTFOUND = 2;
     */
    SE_TRACK_NOTFOUND = 2
}
/**
 * @generated from message livekit.Room
 */
export declare class Room extends Message<Room> {
    /**
     * @generated from field: string sid = 1;
     */
    sid: string;
    /**
     * @generated from field: string name = 2;
     */
    name: string;
    /**
     * @generated from field: uint32 empty_timeout = 3;
     */
    emptyTimeout: number;
    /**
     * @generated from field: uint32 max_participants = 4;
     */
    maxParticipants: number;
    /**
     * @generated from field: int64 creation_time = 5;
     */
    creationTime: bigint;
    /**
     * @generated from field: string turn_password = 6;
     */
    turnPassword: string;
    /**
     * @generated from field: repeated livekit.Codec enabled_codecs = 7;
     */
    enabledCodecs: Codec[];
    /**
     * @generated from field: string metadata = 8;
     */
    metadata: string;
    /**
     * @generated from field: uint32 num_participants = 9;
     */
    numParticipants: number;
    /**
     * @generated from field: uint32 num_publishers = 11;
     */
    numPublishers: number;
    /**
     * @generated from field: bool active_recording = 10;
     */
    activeRecording: boolean;
    constructor(data?: PartialMessage<Room>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.Room";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): Room;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): Room;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): Room;
    static equals(a: Room | PlainMessage<Room> | undefined, b: Room | PlainMessage<Room> | undefined): boolean;
}
/**
 * @generated from message livekit.Codec
 */
export declare class Codec extends Message<Codec> {
    /**
     * @generated from field: string mime = 1;
     */
    mime: string;
    /**
     * @generated from field: string fmtp_line = 2;
     */
    fmtpLine: string;
    constructor(data?: PartialMessage<Codec>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.Codec";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): Codec;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): Codec;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): Codec;
    static equals(a: Codec | PlainMessage<Codec> | undefined, b: Codec | PlainMessage<Codec> | undefined): boolean;
}
/**
 * @generated from message livekit.PlayoutDelay
 */
export declare class PlayoutDelay extends Message<PlayoutDelay> {
    /**
     * @generated from field: bool enabled = 1;
     */
    enabled: boolean;
    /**
     * @generated from field: uint32 min = 2;
     */
    min: number;
    /**
     * @generated from field: uint32 max = 3;
     */
    max: number;
    constructor(data?: PartialMessage<PlayoutDelay>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.PlayoutDelay";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): PlayoutDelay;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): PlayoutDelay;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): PlayoutDelay;
    static equals(a: PlayoutDelay | PlainMessage<PlayoutDelay> | undefined, b: PlayoutDelay | PlainMessage<PlayoutDelay> | undefined): boolean;
}
/**
 * @generated from message livekit.ParticipantPermission
 */
export declare class ParticipantPermission extends Message<ParticipantPermission> {
    /**
     * allow participant to subscribe to other tracks in the room
     *
     * @generated from field: bool can_subscribe = 1;
     */
    canSubscribe: boolean;
    /**
     * allow participant to publish new tracks to room
     *
     * @generated from field: bool can_publish = 2;
     */
    canPublish: boolean;
    /**
     * allow participant to publish data
     *
     * @generated from field: bool can_publish_data = 3;
     */
    canPublishData: boolean;
    /**
     * sources that are allowed to be published
     *
     * @generated from field: repeated livekit.TrackSource can_publish_sources = 9;
     */
    canPublishSources: TrackSource[];
    /**
     * indicates that it's hidden to others
     *
     * @generated from field: bool hidden = 7;
     */
    hidden: boolean;
    /**
     * indicates it's a recorder instance
     *
     * @generated from field: bool recorder = 8;
     */
    recorder: boolean;
    /**
     * indicates that participant can update own metadata
     *
     * @generated from field: bool can_update_metadata = 10;
     */
    canUpdateMetadata: boolean;
    constructor(data?: PartialMessage<ParticipantPermission>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.ParticipantPermission";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ParticipantPermission;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ParticipantPermission;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ParticipantPermission;
    static equals(a: ParticipantPermission | PlainMessage<ParticipantPermission> | undefined, b: ParticipantPermission | PlainMessage<ParticipantPermission> | undefined): boolean;
}
/**
 * @generated from message livekit.ParticipantInfo
 */
export declare class ParticipantInfo extends Message<ParticipantInfo> {
    /**
     * @generated from field: string sid = 1;
     */
    sid: string;
    /**
     * @generated from field: string identity = 2;
     */
    identity: string;
    /**
     * @generated from field: livekit.ParticipantInfo.State state = 3;
     */
    state: ParticipantInfo_State;
    /**
     * @generated from field: repeated livekit.TrackInfo tracks = 4;
     */
    tracks: TrackInfo[];
    /**
     * @generated from field: string metadata = 5;
     */
    metadata: string;
    /**
     * timestamp when participant joined room, in seconds
     *
     * @generated from field: int64 joined_at = 6;
     */
    joinedAt: bigint;
    /**
     * @generated from field: string name = 9;
     */
    name: string;
    /**
     * @generated from field: uint32 version = 10;
     */
    version: number;
    /**
     * @generated from field: livekit.ParticipantPermission permission = 11;
     */
    permission?: ParticipantPermission;
    /**
     * @generated from field: string region = 12;
     */
    region: string;
    /**
     * indicates the participant has an active publisher connection
     * and can publish to the server
     *
     * @generated from field: bool is_publisher = 13;
     */
    isPublisher: boolean;
    constructor(data?: PartialMessage<ParticipantInfo>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.ParticipantInfo";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ParticipantInfo;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ParticipantInfo;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ParticipantInfo;
    static equals(a: ParticipantInfo | PlainMessage<ParticipantInfo> | undefined, b: ParticipantInfo | PlainMessage<ParticipantInfo> | undefined): boolean;
}
/**
 * @generated from enum livekit.ParticipantInfo.State
 */
export declare enum ParticipantInfo_State {
    /**
     * websocket' connected, but not offered yet
     *
     * @generated from enum value: JOINING = 0;
     */
    JOINING = 0,
    /**
     * server received client offer
     *
     * @generated from enum value: JOINED = 1;
     */
    JOINED = 1,
    /**
     * ICE connectivity established
     *
     * @generated from enum value: ACTIVE = 2;
     */
    ACTIVE = 2,
    /**
     * WS disconnected
     *
     * @generated from enum value: DISCONNECTED = 3;
     */
    DISCONNECTED = 3
}
/**
 * @generated from message livekit.Encryption
 */
export declare class Encryption extends Message<Encryption> {
    constructor(data?: PartialMessage<Encryption>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.Encryption";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): Encryption;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): Encryption;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): Encryption;
    static equals(a: Encryption | PlainMessage<Encryption> | undefined, b: Encryption | PlainMessage<Encryption> | undefined): boolean;
}
/**
 * @generated from enum livekit.Encryption.Type
 */
export declare enum Encryption_Type {
    /**
     * @generated from enum value: NONE = 0;
     */
    NONE = 0,
    /**
     * @generated from enum value: GCM = 1;
     */
    GCM = 1,
    /**
     * @generated from enum value: CUSTOM = 2;
     */
    CUSTOM = 2
}
/**
 * @generated from message livekit.SimulcastCodecInfo
 */
export declare class SimulcastCodecInfo extends Message<SimulcastCodecInfo> {
    /**
     * @generated from field: string mime_type = 1;
     */
    mimeType: string;
    /**
     * @generated from field: string mid = 2;
     */
    mid: string;
    /**
     * @generated from field: string cid = 3;
     */
    cid: string;
    /**
     * @generated from field: repeated livekit.VideoLayer layers = 4;
     */
    layers: VideoLayer[];
    constructor(data?: PartialMessage<SimulcastCodecInfo>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.SimulcastCodecInfo";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SimulcastCodecInfo;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SimulcastCodecInfo;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SimulcastCodecInfo;
    static equals(a: SimulcastCodecInfo | PlainMessage<SimulcastCodecInfo> | undefined, b: SimulcastCodecInfo | PlainMessage<SimulcastCodecInfo> | undefined): boolean;
}
/**
 * @generated from message livekit.TrackInfo
 */
export declare class TrackInfo extends Message<TrackInfo> {
    /**
     * @generated from field: string sid = 1;
     */
    sid: string;
    /**
     * @generated from field: livekit.TrackType type = 2;
     */
    type: TrackType;
    /**
     * @generated from field: string name = 3;
     */
    name: string;
    /**
     * @generated from field: bool muted = 4;
     */
    muted: boolean;
    /**
     * original width of video (unset for audio)
     * clients may receive a lower resolution version with simulcast
     *
     * @generated from field: uint32 width = 5;
     */
    width: number;
    /**
     * original height of video (unset for audio)
     *
     * @generated from field: uint32 height = 6;
     */
    height: number;
    /**
     * true if track is simulcasted
     *
     * @generated from field: bool simulcast = 7;
     */
    simulcast: boolean;
    /**
     * true if DTX (Discontinuous Transmission) is disabled for audio
     *
     * @generated from field: bool disable_dtx = 8;
     */
    disableDtx: boolean;
    /**
     * source of media
     *
     * @generated from field: livekit.TrackSource source = 9;
     */
    source: TrackSource;
    /**
     * @generated from field: repeated livekit.VideoLayer layers = 10;
     */
    layers: VideoLayer[];
    /**
     * mime type of codec
     *
     * @generated from field: string mime_type = 11;
     */
    mimeType: string;
    /**
     * @generated from field: string mid = 12;
     */
    mid: string;
    /**
     * @generated from field: repeated livekit.SimulcastCodecInfo codecs = 13;
     */
    codecs: SimulcastCodecInfo[];
    /**
     * @generated from field: bool stereo = 14;
     */
    stereo: boolean;
    /**
     * true if RED (Redundant Encoding) is disabled for audio
     *
     * @generated from field: bool disable_red = 15;
     */
    disableRed: boolean;
    /**
     * @generated from field: livekit.Encryption.Type encryption = 16;
     */
    encryption: Encryption_Type;
    /**
     * @generated from field: string stream = 17;
     */
    stream: string;
    constructor(data?: PartialMessage<TrackInfo>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.TrackInfo";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): TrackInfo;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): TrackInfo;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): TrackInfo;
    static equals(a: TrackInfo | PlainMessage<TrackInfo> | undefined, b: TrackInfo | PlainMessage<TrackInfo> | undefined): boolean;
}
/**
 * provide information about available spatial layers
 *
 * @generated from message livekit.VideoLayer
 */
export declare class VideoLayer extends Message<VideoLayer> {
    /**
     * for tracks with a single layer, this should be HIGH
     *
     * @generated from field: livekit.VideoQuality quality = 1;
     */
    quality: VideoQuality;
    /**
     * @generated from field: uint32 width = 2;
     */
    width: number;
    /**
     * @generated from field: uint32 height = 3;
     */
    height: number;
    /**
     * target bitrate in bit per second (bps), server will measure actual
     *
     * @generated from field: uint32 bitrate = 4;
     */
    bitrate: number;
    /**
     * @generated from field: uint32 ssrc = 5;
     */
    ssrc: number;
    constructor(data?: PartialMessage<VideoLayer>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.VideoLayer";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): VideoLayer;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): VideoLayer;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): VideoLayer;
    static equals(a: VideoLayer | PlainMessage<VideoLayer> | undefined, b: VideoLayer | PlainMessage<VideoLayer> | undefined): boolean;
}
/**
 * new DataPacket API
 *
 * @generated from message livekit.DataPacket
 */
export declare class DataPacket extends Message<DataPacket> {
    /**
     * @generated from field: livekit.DataPacket.Kind kind = 1;
     */
    kind: DataPacket_Kind;
    /**
     * @generated from oneof livekit.DataPacket.value
     */
    value: {
        /**
         * @generated from field: livekit.UserPacket user = 2;
         */
        value: UserPacket;
        case: "user";
    } | {
        /**
         * @generated from field: livekit.ActiveSpeakerUpdate speaker = 3;
         */
        value: ActiveSpeakerUpdate;
        case: "speaker";
    } | {
        case: undefined;
        value?: undefined;
    };
    constructor(data?: PartialMessage<DataPacket>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.DataPacket";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): DataPacket;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): DataPacket;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): DataPacket;
    static equals(a: DataPacket | PlainMessage<DataPacket> | undefined, b: DataPacket | PlainMessage<DataPacket> | undefined): boolean;
}
/**
 * @generated from enum livekit.DataPacket.Kind
 */
export declare enum DataPacket_Kind {
    /**
     * @generated from enum value: RELIABLE = 0;
     */
    RELIABLE = 0,
    /**
     * @generated from enum value: LOSSY = 1;
     */
    LOSSY = 1
}
/**
 * @generated from message livekit.ActiveSpeakerUpdate
 */
export declare class ActiveSpeakerUpdate extends Message<ActiveSpeakerUpdate> {
    /**
     * @generated from field: repeated livekit.SpeakerInfo speakers = 1;
     */
    speakers: SpeakerInfo[];
    constructor(data?: PartialMessage<ActiveSpeakerUpdate>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.ActiveSpeakerUpdate";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ActiveSpeakerUpdate;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ActiveSpeakerUpdate;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ActiveSpeakerUpdate;
    static equals(a: ActiveSpeakerUpdate | PlainMessage<ActiveSpeakerUpdate> | undefined, b: ActiveSpeakerUpdate | PlainMessage<ActiveSpeakerUpdate> | undefined): boolean;
}
/**
 * @generated from message livekit.SpeakerInfo
 */
export declare class SpeakerInfo extends Message<SpeakerInfo> {
    /**
     * @generated from field: string sid = 1;
     */
    sid: string;
    /**
     * audio level, 0-1.0, 1 is loudest
     *
     * @generated from field: float level = 2;
     */
    level: number;
    /**
     * true if speaker is currently active
     *
     * @generated from field: bool active = 3;
     */
    active: boolean;
    constructor(data?: PartialMessage<SpeakerInfo>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.SpeakerInfo";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SpeakerInfo;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SpeakerInfo;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SpeakerInfo;
    static equals(a: SpeakerInfo | PlainMessage<SpeakerInfo> | undefined, b: SpeakerInfo | PlainMessage<SpeakerInfo> | undefined): boolean;
}
/**
 * @generated from message livekit.UserPacket
 */
export declare class UserPacket extends Message<UserPacket> {
    /**
     * participant ID of user that sent the message
     *
     * @generated from field: string participant_sid = 1;
     */
    participantSid: string;
    /**
     * @generated from field: string participant_identity = 5;
     */
    participantIdentity: string;
    /**
     * user defined payload
     *
     * @generated from field: bytes payload = 2;
     */
    payload: Uint8Array;
    /**
     * the ID of the participants who will receive the message (sent to all by default)
     *
     * @generated from field: repeated string destination_sids = 3;
     */
    destinationSids: string[];
    /**
     * identities of participants who will receive the message (sent to all by default)
     *
     * @generated from field: repeated string destination_identities = 6;
     */
    destinationIdentities: string[];
    /**
     * topic under which the message was published
     *
     * @generated from field: optional string topic = 4;
     */
    topic?: string;
    constructor(data?: PartialMessage<UserPacket>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.UserPacket";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): UserPacket;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): UserPacket;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): UserPacket;
    static equals(a: UserPacket | PlainMessage<UserPacket> | undefined, b: UserPacket | PlainMessage<UserPacket> | undefined): boolean;
}
/**
 * @generated from message livekit.ParticipantTracks
 */
export declare class ParticipantTracks extends Message<ParticipantTracks> {
    /**
     * participant ID of participant to whom the tracks belong
     *
     * @generated from field: string participant_sid = 1;
     */
    participantSid: string;
    /**
     * @generated from field: repeated string track_sids = 2;
     */
    trackSids: string[];
    constructor(data?: PartialMessage<ParticipantTracks>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.ParticipantTracks";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ParticipantTracks;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ParticipantTracks;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ParticipantTracks;
    static equals(a: ParticipantTracks | PlainMessage<ParticipantTracks> | undefined, b: ParticipantTracks | PlainMessage<ParticipantTracks> | undefined): boolean;
}
/**
 * details about the server
 *
 * @generated from message livekit.ServerInfo
 */
export declare class ServerInfo extends Message<ServerInfo> {
    /**
     * @generated from field: livekit.ServerInfo.Edition edition = 1;
     */
    edition: ServerInfo_Edition;
    /**
     * @generated from field: string version = 2;
     */
    version: string;
    /**
     * @generated from field: int32 protocol = 3;
     */
    protocol: number;
    /**
     * @generated from field: string region = 4;
     */
    region: string;
    /**
     * @generated from field: string node_id = 5;
     */
    nodeId: string;
    /**
     * additional debugging information. sent only if server is in development mode
     *
     * @generated from field: string debug_info = 6;
     */
    debugInfo: string;
    constructor(data?: PartialMessage<ServerInfo>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.ServerInfo";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ServerInfo;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ServerInfo;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ServerInfo;
    static equals(a: ServerInfo | PlainMessage<ServerInfo> | undefined, b: ServerInfo | PlainMessage<ServerInfo> | undefined): boolean;
}
/**
 * @generated from enum livekit.ServerInfo.Edition
 */
export declare enum ServerInfo_Edition {
    /**
     * @generated from enum value: Standard = 0;
     */
    Standard = 0,
    /**
     * @generated from enum value: Cloud = 1;
     */
    Cloud = 1
}
/**
 * details about the client
 *
 * @generated from message livekit.ClientInfo
 */
export declare class ClientInfo extends Message<ClientInfo> {
    /**
     * @generated from field: livekit.ClientInfo.SDK sdk = 1;
     */
    sdk: ClientInfo_SDK;
    /**
     * @generated from field: string version = 2;
     */
    version: string;
    /**
     * @generated from field: int32 protocol = 3;
     */
    protocol: number;
    /**
     * @generated from field: string os = 4;
     */
    os: string;
    /**
     * @generated from field: string os_version = 5;
     */
    osVersion: string;
    /**
     * @generated from field: string device_model = 6;
     */
    deviceModel: string;
    /**
     * @generated from field: string browser = 7;
     */
    browser: string;
    /**
     * @generated from field: string browser_version = 8;
     */
    browserVersion: string;
    /**
     * @generated from field: string address = 9;
     */
    address: string;
    /**
     * wifi, wired, cellular, vpn, empty if not known
     *
     * @generated from field: string network = 10;
     */
    network: string;
    constructor(data?: PartialMessage<ClientInfo>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.ClientInfo";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ClientInfo;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ClientInfo;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ClientInfo;
    static equals(a: ClientInfo | PlainMessage<ClientInfo> | undefined, b: ClientInfo | PlainMessage<ClientInfo> | undefined): boolean;
}
/**
 * @generated from enum livekit.ClientInfo.SDK
 */
export declare enum ClientInfo_SDK {
    /**
     * @generated from enum value: UNKNOWN = 0;
     */
    UNKNOWN = 0,
    /**
     * @generated from enum value: JS = 1;
     */
    JS = 1,
    /**
     * @generated from enum value: SWIFT = 2;
     */
    SWIFT = 2,
    /**
     * @generated from enum value: ANDROID = 3;
     */
    ANDROID = 3,
    /**
     * @generated from enum value: FLUTTER = 4;
     */
    FLUTTER = 4,
    /**
     * @generated from enum value: GO = 5;
     */
    GO = 5,
    /**
     * @generated from enum value: UNITY = 6;
     */
    UNITY = 6,
    /**
     * @generated from enum value: REACT_NATIVE = 7;
     */
    REACT_NATIVE = 7,
    /**
     * @generated from enum value: RUST = 8;
     */
    RUST = 8,
    /**
     * @generated from enum value: PYTHON = 9;
     */
    PYTHON = 9,
    /**
     * @generated from enum value: CPP = 10;
     */
    CPP = 10
}
/**
 * server provided client configuration
 *
 * @generated from message livekit.ClientConfiguration
 */
export declare class ClientConfiguration extends Message<ClientConfiguration> {
    /**
     * @generated from field: livekit.VideoConfiguration video = 1;
     */
    video?: VideoConfiguration;
    /**
     * @generated from field: livekit.VideoConfiguration screen = 2;
     */
    screen?: VideoConfiguration;
    /**
     * @generated from field: livekit.ClientConfigSetting resume_connection = 3;
     */
    resumeConnection: ClientConfigSetting;
    /**
     * @generated from field: livekit.DisabledCodecs disabled_codecs = 4;
     */
    disabledCodecs?: DisabledCodecs;
    /**
     * @generated from field: livekit.ClientConfigSetting force_relay = 5;
     */
    forceRelay: ClientConfigSetting;
    constructor(data?: PartialMessage<ClientConfiguration>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.ClientConfiguration";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ClientConfiguration;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ClientConfiguration;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ClientConfiguration;
    static equals(a: ClientConfiguration | PlainMessage<ClientConfiguration> | undefined, b: ClientConfiguration | PlainMessage<ClientConfiguration> | undefined): boolean;
}
/**
 * @generated from message livekit.VideoConfiguration
 */
export declare class VideoConfiguration extends Message<VideoConfiguration> {
    /**
     * @generated from field: livekit.ClientConfigSetting hardware_encoder = 1;
     */
    hardwareEncoder: ClientConfigSetting;
    constructor(data?: PartialMessage<VideoConfiguration>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.VideoConfiguration";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): VideoConfiguration;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): VideoConfiguration;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): VideoConfiguration;
    static equals(a: VideoConfiguration | PlainMessage<VideoConfiguration> | undefined, b: VideoConfiguration | PlainMessage<VideoConfiguration> | undefined): boolean;
}
/**
 * @generated from message livekit.DisabledCodecs
 */
export declare class DisabledCodecs extends Message<DisabledCodecs> {
    /**
     * disabled for both publish and subscribe
     *
     * @generated from field: repeated livekit.Codec codecs = 1;
     */
    codecs: Codec[];
    /**
     * only disable for publish
     *
     * @generated from field: repeated livekit.Codec publish = 2;
     */
    publish: Codec[];
    constructor(data?: PartialMessage<DisabledCodecs>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.DisabledCodecs";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): DisabledCodecs;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): DisabledCodecs;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): DisabledCodecs;
    static equals(a: DisabledCodecs | PlainMessage<DisabledCodecs> | undefined, b: DisabledCodecs | PlainMessage<DisabledCodecs> | undefined): boolean;
}
/**
 * @generated from message livekit.RTPDrift
 */
export declare class RTPDrift extends Message<RTPDrift> {
    /**
     * @generated from field: google.protobuf.Timestamp start_time = 1;
     */
    startTime?: Timestamp;
    /**
     * @generated from field: google.protobuf.Timestamp end_time = 2;
     */
    endTime?: Timestamp;
    /**
     * @generated from field: double duration = 3;
     */
    duration: number;
    /**
     * @generated from field: uint64 start_timestamp = 4;
     */
    startTimestamp: bigint;
    /**
     * @generated from field: uint64 end_timestamp = 5;
     */
    endTimestamp: bigint;
    /**
     * @generated from field: uint64 rtp_clock_ticks = 6;
     */
    rtpClockTicks: bigint;
    /**
     * @generated from field: int64 drift_samples = 7;
     */
    driftSamples: bigint;
    /**
     * @generated from field: double drift_ms = 8;
     */
    driftMs: number;
    /**
     * @generated from field: double clock_rate = 9;
     */
    clockRate: number;
    constructor(data?: PartialMessage<RTPDrift>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.RTPDrift";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): RTPDrift;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): RTPDrift;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): RTPDrift;
    static equals(a: RTPDrift | PlainMessage<RTPDrift> | undefined, b: RTPDrift | PlainMessage<RTPDrift> | undefined): boolean;
}
/**
 * @generated from message livekit.RTPStats
 */
export declare class RTPStats extends Message<RTPStats> {
    /**
     * @generated from field: google.protobuf.Timestamp start_time = 1;
     */
    startTime?: Timestamp;
    /**
     * @generated from field: google.protobuf.Timestamp end_time = 2;
     */
    endTime?: Timestamp;
    /**
     * @generated from field: double duration = 3;
     */
    duration: number;
    /**
     * @generated from field: uint32 packets = 4;
     */
    packets: number;
    /**
     * @generated from field: double packet_rate = 5;
     */
    packetRate: number;
    /**
     * @generated from field: uint64 bytes = 6;
     */
    bytes: bigint;
    /**
     * @generated from field: uint64 header_bytes = 39;
     */
    headerBytes: bigint;
    /**
     * @generated from field: double bitrate = 7;
     */
    bitrate: number;
    /**
     * @generated from field: uint32 packets_lost = 8;
     */
    packetsLost: number;
    /**
     * @generated from field: double packet_loss_rate = 9;
     */
    packetLossRate: number;
    /**
     * @generated from field: float packet_loss_percentage = 10;
     */
    packetLossPercentage: number;
    /**
     * @generated from field: uint32 packets_duplicate = 11;
     */
    packetsDuplicate: number;
    /**
     * @generated from field: double packet_duplicate_rate = 12;
     */
    packetDuplicateRate: number;
    /**
     * @generated from field: uint64 bytes_duplicate = 13;
     */
    bytesDuplicate: bigint;
    /**
     * @generated from field: uint64 header_bytes_duplicate = 40;
     */
    headerBytesDuplicate: bigint;
    /**
     * @generated from field: double bitrate_duplicate = 14;
     */
    bitrateDuplicate: number;
    /**
     * @generated from field: uint32 packets_padding = 15;
     */
    packetsPadding: number;
    /**
     * @generated from field: double packet_padding_rate = 16;
     */
    packetPaddingRate: number;
    /**
     * @generated from field: uint64 bytes_padding = 17;
     */
    bytesPadding: bigint;
    /**
     * @generated from field: uint64 header_bytes_padding = 41;
     */
    headerBytesPadding: bigint;
    /**
     * @generated from field: double bitrate_padding = 18;
     */
    bitratePadding: number;
    /**
     * @generated from field: uint32 packets_out_of_order = 19;
     */
    packetsOutOfOrder: number;
    /**
     * @generated from field: uint32 frames = 20;
     */
    frames: number;
    /**
     * @generated from field: double frame_rate = 21;
     */
    frameRate: number;
    /**
     * @generated from field: double jitter_current = 22;
     */
    jitterCurrent: number;
    /**
     * @generated from field: double jitter_max = 23;
     */
    jitterMax: number;
    /**
     * @generated from field: map<int32, uint32> gap_histogram = 24;
     */
    gapHistogram: {
        [key: number]: number;
    };
    /**
     * @generated from field: uint32 nacks = 25;
     */
    nacks: number;
    /**
     * @generated from field: uint32 nack_acks = 37;
     */
    nackAcks: number;
    /**
     * @generated from field: uint32 nack_misses = 26;
     */
    nackMisses: number;
    /**
     * @generated from field: uint32 nack_repeated = 38;
     */
    nackRepeated: number;
    /**
     * @generated from field: uint32 plis = 27;
     */
    plis: number;
    /**
     * @generated from field: google.protobuf.Timestamp last_pli = 28;
     */
    lastPli?: Timestamp;
    /**
     * @generated from field: uint32 firs = 29;
     */
    firs: number;
    /**
     * @generated from field: google.protobuf.Timestamp last_fir = 30;
     */
    lastFir?: Timestamp;
    /**
     * @generated from field: uint32 rtt_current = 31;
     */
    rttCurrent: number;
    /**
     * @generated from field: uint32 rtt_max = 32;
     */
    rttMax: number;
    /**
     * @generated from field: uint32 key_frames = 33;
     */
    keyFrames: number;
    /**
     * @generated from field: google.protobuf.Timestamp last_key_frame = 34;
     */
    lastKeyFrame?: Timestamp;
    /**
     * @generated from field: uint32 layer_lock_plis = 35;
     */
    layerLockPlis: number;
    /**
     * @generated from field: google.protobuf.Timestamp last_layer_lock_pli = 36;
     */
    lastLayerLockPli?: Timestamp;
    /**
     * @generated from field: livekit.RTPDrift packet_drift = 44;
     */
    packetDrift?: RTPDrift;
    /**
     * NEXT_ID: 46
     *
     * @generated from field: livekit.RTPDrift report_drift = 45;
     */
    reportDrift?: RTPDrift;
    constructor(data?: PartialMessage<RTPStats>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.RTPStats";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): RTPStats;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): RTPStats;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): RTPStats;
    static equals(a: RTPStats | PlainMessage<RTPStats> | undefined, b: RTPStats | PlainMessage<RTPStats> | undefined): boolean;
}
/**
 * @generated from message livekit.TimedVersion
 */
export declare class TimedVersion extends Message<TimedVersion> {
    /**
     * @generated from field: int64 unix_micro = 1;
     */
    unixMicro: bigint;
    /**
     * @generated from field: int32 ticks = 2;
     */
    ticks: number;
    constructor(data?: PartialMessage<TimedVersion>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.TimedVersion";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): TimedVersion;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): TimedVersion;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): TimedVersion;
    static equals(a: TimedVersion | PlainMessage<TimedVersion> | undefined, b: TimedVersion | PlainMessage<TimedVersion> | undefined): boolean;
}
//# sourceMappingURL=livekit_models_pb.d.ts.map
