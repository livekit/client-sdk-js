import type { BinaryReadOptions, FieldList, JsonReadOptions, JsonValue, PartialMessage, PlainMessage } from "@bufbuild/protobuf";
import { Message, proto3 } from "@bufbuild/protobuf";
import { ClientConfiguration, ConnectionQuality, DisconnectReason, Encryption_Type, ParticipantInfo, ParticipantTracks, Room, ServerInfo, SpeakerInfo, SubscriptionError, TrackInfo, TrackSource, TrackType, VideoLayer, VideoQuality } from "./livekit_models_pb.js";
/**
 * @generated from enum livekit.SignalTarget
 */
export declare enum SignalTarget {
    /**
     * @generated from enum value: PUBLISHER = 0;
     */
    PUBLISHER = 0,
    /**
     * @generated from enum value: SUBSCRIBER = 1;
     */
    SUBSCRIBER = 1
}
/**
 * @generated from enum livekit.StreamState
 */
export declare enum StreamState {
    /**
     * @generated from enum value: ACTIVE = 0;
     */
    ACTIVE = 0,
    /**
     * @generated from enum value: PAUSED = 1;
     */
    PAUSED = 1
}
/**
 * @generated from enum livekit.CandidateProtocol
 */
export declare enum CandidateProtocol {
    /**
     * @generated from enum value: UDP = 0;
     */
    UDP = 0,
    /**
     * @generated from enum value: TCP = 1;
     */
    TCP = 1,
    /**
     * @generated from enum value: TLS = 2;
     */
    TLS = 2
}
/**
 * @generated from message livekit.SignalRequest
 */
export declare class SignalRequest extends Message<SignalRequest> {
    /**
     * @generated from oneof livekit.SignalRequest.message
     */
    message: {
        /**
         * initial join exchange, for publisher
         *
         * @generated from field: livekit.SessionDescription offer = 1;
         */
        value: SessionDescription;
        case: "offer";
    } | {
        /**
         * participant answering publisher offer
         *
         * @generated from field: livekit.SessionDescription answer = 2;
         */
        value: SessionDescription;
        case: "answer";
    } | {
        /**
         * @generated from field: livekit.TrickleRequest trickle = 3;
         */
        value: TrickleRequest;
        case: "trickle";
    } | {
        /**
         * @generated from field: livekit.AddTrackRequest add_track = 4;
         */
        value: AddTrackRequest;
        case: "addTrack";
    } | {
        /**
         * mute the participant's published tracks
         *
         * @generated from field: livekit.MuteTrackRequest mute = 5;
         */
        value: MuteTrackRequest;
        case: "mute";
    } | {
        /**
         * Subscribe or unsubscribe from tracks
         *
         * @generated from field: livekit.UpdateSubscription subscription = 6;
         */
        value: UpdateSubscription;
        case: "subscription";
    } | {
        /**
         * Update settings of subscribed tracks
         *
         * @generated from field: livekit.UpdateTrackSettings track_setting = 7;
         */
        value: UpdateTrackSettings;
        case: "trackSetting";
    } | {
        /**
         * Immediately terminate session
         *
         * @generated from field: livekit.LeaveRequest leave = 8;
         */
        value: LeaveRequest;
        case: "leave";
    } | {
        /**
         * Update published video layers
         *
         * @generated from field: livekit.UpdateVideoLayers update_layers = 10;
         */
        value: UpdateVideoLayers;
        case: "updateLayers";
    } | {
        /**
         * Update subscriber permissions
         *
         * @generated from field: livekit.SubscriptionPermission subscription_permission = 11;
         */
        value: SubscriptionPermission;
        case: "subscriptionPermission";
    } | {
        /**
         * sync client's subscribe state to server during reconnect
         *
         * @generated from field: livekit.SyncState sync_state = 12;
         */
        value: SyncState;
        case: "syncState";
    } | {
        /**
         * Simulate conditions, for client validations
         *
         * @generated from field: livekit.SimulateScenario simulate = 13;
         */
        value: SimulateScenario;
        case: "simulate";
    } | {
        /**
         * client triggered ping to server
         *
         * deprecated by ping_req (message Ping)
         *
         * @generated from field: int64 ping = 14;
         */
        value: bigint;
        case: "ping";
    } | {
        /**
         * update a participant's own metadata and/or name
         *
         * @generated from field: livekit.UpdateParticipantMetadata update_metadata = 15;
         */
        value: UpdateParticipantMetadata;
        case: "updateMetadata";
    } | {
        /**
         * @generated from field: livekit.Ping ping_req = 16;
         */
        value: Ping;
        case: "pingReq";
    } | {
        case: undefined;
        value?: undefined;
    };
    constructor(data?: PartialMessage<SignalRequest>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.SignalRequest";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SignalRequest;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SignalRequest;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SignalRequest;
    static equals(a: SignalRequest | PlainMessage<SignalRequest> | undefined, b: SignalRequest | PlainMessage<SignalRequest> | undefined): boolean;
}
/**
 * @generated from message livekit.SignalResponse
 */
export declare class SignalResponse extends Message<SignalResponse> {
    /**
     * @generated from oneof livekit.SignalResponse.message
     */
    message: {
        /**
         * sent when join is accepted
         *
         * @generated from field: livekit.JoinResponse join = 1;
         */
        value: JoinResponse;
        case: "join";
    } | {
        /**
         * sent when server answers publisher
         *
         * @generated from field: livekit.SessionDescription answer = 2;
         */
        value: SessionDescription;
        case: "answer";
    } | {
        /**
         * sent when server is sending subscriber an offer
         *
         * @generated from field: livekit.SessionDescription offer = 3;
         */
        value: SessionDescription;
        case: "offer";
    } | {
        /**
         * sent when an ICE candidate is available
         *
         * @generated from field: livekit.TrickleRequest trickle = 4;
         */
        value: TrickleRequest;
        case: "trickle";
    } | {
        /**
         * sent when participants in the room has changed
         *
         * @generated from field: livekit.ParticipantUpdate update = 5;
         */
        value: ParticipantUpdate;
        case: "update";
    } | {
        /**
         * sent to the participant when their track has been published
         *
         * @generated from field: livekit.TrackPublishedResponse track_published = 6;
         */
        value: TrackPublishedResponse;
        case: "trackPublished";
    } | {
        /**
         * Immediately terminate session
         *
         * @generated from field: livekit.LeaveRequest leave = 8;
         */
        value: LeaveRequest;
        case: "leave";
    } | {
        /**
         * server initiated mute
         *
         * @generated from field: livekit.MuteTrackRequest mute = 9;
         */
        value: MuteTrackRequest;
        case: "mute";
    } | {
        /**
         * indicates changes to speaker status, including when they've gone to not speaking
         *
         * @generated from field: livekit.SpeakersChanged speakers_changed = 10;
         */
        value: SpeakersChanged;
        case: "speakersChanged";
    } | {
        /**
         * sent when metadata of the room has changed
         *
         * @generated from field: livekit.RoomUpdate room_update = 11;
         */
        value: RoomUpdate;
        case: "roomUpdate";
    } | {
        /**
         * when connection quality changed
         *
         * @generated from field: livekit.ConnectionQualityUpdate connection_quality = 12;
         */
        value: ConnectionQualityUpdate;
        case: "connectionQuality";
    } | {
        /**
         * when streamed tracks state changed, used to notify when any of the streams were paused due to
         * congestion
         *
         * @generated from field: livekit.StreamStateUpdate stream_state_update = 13;
         */
        value: StreamStateUpdate;
        case: "streamStateUpdate";
    } | {
        /**
         * when max subscribe quality changed, used by dynamic broadcasting to disable unused layers
         *
         * @generated from field: livekit.SubscribedQualityUpdate subscribed_quality_update = 14;
         */
        value: SubscribedQualityUpdate;
        case: "subscribedQualityUpdate";
    } | {
        /**
         * when subscription permission changed
         *
         * @generated from field: livekit.SubscriptionPermissionUpdate subscription_permission_update = 15;
         */
        value: SubscriptionPermissionUpdate;
        case: "subscriptionPermissionUpdate";
    } | {
        /**
         * update the token the client was using, to prevent an active client from using an expired token
         *
         * @generated from field: string refresh_token = 16;
         */
        value: string;
        case: "refreshToken";
    } | {
        /**
         * server initiated track unpublish
         *
         * @generated from field: livekit.TrackUnpublishedResponse track_unpublished = 17;
         */
        value: TrackUnpublishedResponse;
        case: "trackUnpublished";
    } | {
        /**
         * respond to ping
         *
         * deprecated by pong_resp (message Pong)
         *
         * @generated from field: int64 pong = 18;
         */
        value: bigint;
        case: "pong";
    } | {
        /**
         * sent when client reconnects
         *
         * @generated from field: livekit.ReconnectResponse reconnect = 19;
         */
        value: ReconnectResponse;
        case: "reconnect";
    } | {
        /**
         * respond to Ping
         *
         * @generated from field: livekit.Pong pong_resp = 20;
         */
        value: Pong;
        case: "pongResp";
    } | {
        /**
         * Subscription response, client should not expect any media from this subscription if it fails
         *
         * @generated from field: livekit.SubscriptionResponse subscription_response = 21;
         */
        value: SubscriptionResponse;
        case: "subscriptionResponse";
    } | {
        case: undefined;
        value?: undefined;
    };
    constructor(data?: PartialMessage<SignalResponse>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.SignalResponse";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SignalResponse;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SignalResponse;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SignalResponse;
    static equals(a: SignalResponse | PlainMessage<SignalResponse> | undefined, b: SignalResponse | PlainMessage<SignalResponse> | undefined): boolean;
}
/**
 * @generated from message livekit.SimulcastCodec
 */
export declare class SimulcastCodec extends Message<SimulcastCodec> {
    /**
     * @generated from field: string codec = 1;
     */
    codec: string;
    /**
     * @generated from field: string cid = 2;
     */
    cid: string;
    constructor(data?: PartialMessage<SimulcastCodec>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.SimulcastCodec";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SimulcastCodec;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SimulcastCodec;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SimulcastCodec;
    static equals(a: SimulcastCodec | PlainMessage<SimulcastCodec> | undefined, b: SimulcastCodec | PlainMessage<SimulcastCodec> | undefined): boolean;
}
/**
 * @generated from message livekit.AddTrackRequest
 */
export declare class AddTrackRequest extends Message<AddTrackRequest> {
    /**
     * client ID of track, to match it when RTC track is received
     *
     * @generated from field: string cid = 1;
     */
    cid: string;
    /**
     * @generated from field: string name = 2;
     */
    name: string;
    /**
     * @generated from field: livekit.TrackType type = 3;
     */
    type: TrackType;
    /**
     * to be deprecated in favor of layers
     *
     * @generated from field: uint32 width = 4;
     */
    width: number;
    /**
     * @generated from field: uint32 height = 5;
     */
    height: number;
    /**
     * true to add track and initialize to muted
     *
     * @generated from field: bool muted = 6;
     */
    muted: boolean;
    /**
     * true if DTX (Discontinuous Transmission) is disabled for audio
     *
     * @generated from field: bool disable_dtx = 7;
     */
    disableDtx: boolean;
    /**
     * @generated from field: livekit.TrackSource source = 8;
     */
    source: TrackSource;
    /**
     * @generated from field: repeated livekit.VideoLayer layers = 9;
     */
    layers: VideoLayer[];
    /**
     * @generated from field: repeated livekit.SimulcastCodec simulcast_codecs = 10;
     */
    simulcastCodecs: SimulcastCodec[];
    /**
     * server ID of track, publish new codec to exist track
     *
     * @generated from field: string sid = 11;
     */
    sid: string;
    /**
     * @generated from field: bool stereo = 12;
     */
    stereo: boolean;
    /**
     * true if RED (Redundant Encoding) is disabled for audio
     *
     * @generated from field: bool disable_red = 13;
     */
    disableRed: boolean;
    /**
     * @generated from field: livekit.Encryption.Type encryption = 14;
     */
    encryption: Encryption_Type;
    /**
     * which stream the track belongs to, used to group tracks together.
     * if not specified, server will infer it from track source to bundle camera/microphone, screenshare/audio together
     *
     * @generated from field: string stream = 15;
     */
    stream: string;
    constructor(data?: PartialMessage<AddTrackRequest>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.AddTrackRequest";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): AddTrackRequest;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): AddTrackRequest;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): AddTrackRequest;
    static equals(a: AddTrackRequest | PlainMessage<AddTrackRequest> | undefined, b: AddTrackRequest | PlainMessage<AddTrackRequest> | undefined): boolean;
}
/**
 * @generated from message livekit.TrickleRequest
 */
export declare class TrickleRequest extends Message<TrickleRequest> {
    /**
     * @generated from field: string candidateInit = 1;
     */
    candidateInit: string;
    /**
     * @generated from field: livekit.SignalTarget target = 2;
     */
    target: SignalTarget;
    constructor(data?: PartialMessage<TrickleRequest>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.TrickleRequest";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): TrickleRequest;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): TrickleRequest;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): TrickleRequest;
    static equals(a: TrickleRequest | PlainMessage<TrickleRequest> | undefined, b: TrickleRequest | PlainMessage<TrickleRequest> | undefined): boolean;
}
/**
 * @generated from message livekit.MuteTrackRequest
 */
export declare class MuteTrackRequest extends Message<MuteTrackRequest> {
    /**
     * @generated from field: string sid = 1;
     */
    sid: string;
    /**
     * @generated from field: bool muted = 2;
     */
    muted: boolean;
    constructor(data?: PartialMessage<MuteTrackRequest>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.MuteTrackRequest";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): MuteTrackRequest;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): MuteTrackRequest;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): MuteTrackRequest;
    static equals(a: MuteTrackRequest | PlainMessage<MuteTrackRequest> | undefined, b: MuteTrackRequest | PlainMessage<MuteTrackRequest> | undefined): boolean;
}
/**
 * @generated from message livekit.JoinResponse
 */
export declare class JoinResponse extends Message<JoinResponse> {
    /**
     * @generated from field: livekit.Room room = 1;
     */
    room?: Room;
    /**
     * @generated from field: livekit.ParticipantInfo participant = 2;
     */
    participant?: ParticipantInfo;
    /**
     * @generated from field: repeated livekit.ParticipantInfo other_participants = 3;
     */
    otherParticipants: ParticipantInfo[];
    /**
     * deprecated. use server_info.version instead.
     *
     * @generated from field: string server_version = 4;
     */
    serverVersion: string;
    /**
     * @generated from field: repeated livekit.ICEServer ice_servers = 5;
     */
    iceServers: ICEServer[];
    /**
     * use subscriber as the primary PeerConnection
     *
     * @generated from field: bool subscriber_primary = 6;
     */
    subscriberPrimary: boolean;
    /**
     * when the current server isn't available, return alternate url to retry connection
     * when this is set, the other fields will be largely empty
     *
     * @generated from field: string alternative_url = 7;
     */
    alternativeUrl: string;
    /**
     * @generated from field: livekit.ClientConfiguration client_configuration = 8;
     */
    clientConfiguration?: ClientConfiguration;
    /**
     * deprecated. use server_info.region instead.
     *
     * @generated from field: string server_region = 9;
     */
    serverRegion: string;
    /**
     * @generated from field: int32 ping_timeout = 10;
     */
    pingTimeout: number;
    /**
     * @generated from field: int32 ping_interval = 11;
     */
    pingInterval: number;
    /**
     * @generated from field: livekit.ServerInfo server_info = 12;
     */
    serverInfo?: ServerInfo;
    /**
     * Server-Injected-Frame byte trailer, used to identify unencrypted frames when e2ee is enabled
     *
     * @generated from field: bytes sif_trailer = 13;
     */
    sifTrailer: Uint8Array;
    constructor(data?: PartialMessage<JoinResponse>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.JoinResponse";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): JoinResponse;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): JoinResponse;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): JoinResponse;
    static equals(a: JoinResponse | PlainMessage<JoinResponse> | undefined, b: JoinResponse | PlainMessage<JoinResponse> | undefined): boolean;
}
/**
 * @generated from message livekit.ReconnectResponse
 */
export declare class ReconnectResponse extends Message<ReconnectResponse> {
    /**
     * @generated from field: repeated livekit.ICEServer ice_servers = 1;
     */
    iceServers: ICEServer[];
    /**
     * @generated from field: livekit.ClientConfiguration client_configuration = 2;
     */
    clientConfiguration?: ClientConfiguration;
    constructor(data?: PartialMessage<ReconnectResponse>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.ReconnectResponse";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ReconnectResponse;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ReconnectResponse;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ReconnectResponse;
    static equals(a: ReconnectResponse | PlainMessage<ReconnectResponse> | undefined, b: ReconnectResponse | PlainMessage<ReconnectResponse> | undefined): boolean;
}
/**
 * @generated from message livekit.TrackPublishedResponse
 */
export declare class TrackPublishedResponse extends Message<TrackPublishedResponse> {
    /**
     * @generated from field: string cid = 1;
     */
    cid: string;
    /**
     * @generated from field: livekit.TrackInfo track = 2;
     */
    track?: TrackInfo;
    constructor(data?: PartialMessage<TrackPublishedResponse>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.TrackPublishedResponse";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): TrackPublishedResponse;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): TrackPublishedResponse;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): TrackPublishedResponse;
    static equals(a: TrackPublishedResponse | PlainMessage<TrackPublishedResponse> | undefined, b: TrackPublishedResponse | PlainMessage<TrackPublishedResponse> | undefined): boolean;
}
/**
 * @generated from message livekit.TrackUnpublishedResponse
 */
export declare class TrackUnpublishedResponse extends Message<TrackUnpublishedResponse> {
    /**
     * @generated from field: string track_sid = 1;
     */
    trackSid: string;
    constructor(data?: PartialMessage<TrackUnpublishedResponse>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.TrackUnpublishedResponse";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): TrackUnpublishedResponse;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): TrackUnpublishedResponse;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): TrackUnpublishedResponse;
    static equals(a: TrackUnpublishedResponse | PlainMessage<TrackUnpublishedResponse> | undefined, b: TrackUnpublishedResponse | PlainMessage<TrackUnpublishedResponse> | undefined): boolean;
}
/**
 * @generated from message livekit.SessionDescription
 */
export declare class SessionDescription extends Message<SessionDescription> {
    /**
     * "answer" | "offer" | "pranswer" | "rollback"
     *
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: string sdp = 2;
     */
    sdp: string;
    constructor(data?: PartialMessage<SessionDescription>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.SessionDescription";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SessionDescription;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SessionDescription;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SessionDescription;
    static equals(a: SessionDescription | PlainMessage<SessionDescription> | undefined, b: SessionDescription | PlainMessage<SessionDescription> | undefined): boolean;
}
/**
 * @generated from message livekit.ParticipantUpdate
 */
export declare class ParticipantUpdate extends Message<ParticipantUpdate> {
    /**
     * @generated from field: repeated livekit.ParticipantInfo participants = 1;
     */
    participants: ParticipantInfo[];
    constructor(data?: PartialMessage<ParticipantUpdate>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.ParticipantUpdate";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ParticipantUpdate;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ParticipantUpdate;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ParticipantUpdate;
    static equals(a: ParticipantUpdate | PlainMessage<ParticipantUpdate> | undefined, b: ParticipantUpdate | PlainMessage<ParticipantUpdate> | undefined): boolean;
}
/**
 * @generated from message livekit.UpdateSubscription
 */
export declare class UpdateSubscription extends Message<UpdateSubscription> {
    /**
     * @generated from field: repeated string track_sids = 1;
     */
    trackSids: string[];
    /**
     * @generated from field: bool subscribe = 2;
     */
    subscribe: boolean;
    /**
     * @generated from field: repeated livekit.ParticipantTracks participant_tracks = 3;
     */
    participantTracks: ParticipantTracks[];
    constructor(data?: PartialMessage<UpdateSubscription>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.UpdateSubscription";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): UpdateSubscription;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): UpdateSubscription;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): UpdateSubscription;
    static equals(a: UpdateSubscription | PlainMessage<UpdateSubscription> | undefined, b: UpdateSubscription | PlainMessage<UpdateSubscription> | undefined): boolean;
}
/**
 * @generated from message livekit.UpdateTrackSettings
 */
export declare class UpdateTrackSettings extends Message<UpdateTrackSettings> {
    /**
     * @generated from field: repeated string track_sids = 1;
     */
    trackSids: string[];
    /**
     * when true, the track is placed in a paused state, with no new data returned
     *
     * @generated from field: bool disabled = 3;
     */
    disabled: boolean;
    /**
     * deprecated in favor of width & height
     *
     * @generated from field: livekit.VideoQuality quality = 4;
     */
    quality: VideoQuality;
    /**
     * for video, width to receive
     *
     * @generated from field: uint32 width = 5;
     */
    width: number;
    /**
     * for video, height to receive
     *
     * @generated from field: uint32 height = 6;
     */
    height: number;
    /**
     * @generated from field: uint32 fps = 7;
     */
    fps: number;
    /**
     * subscription priority. 1 being the highest (0 is unset)
     * when unset, server sill assign priority based on the order of subscription
     * server will use priority in the following ways:
     * 1. when subscribed tracks exceed per-participant subscription limit, server will
     *    pause the lowest priority tracks
     * 2. when the network is congested, server will assign available bandwidth to
     *    higher priority tracks first. lowest priority tracks can be paused
     *
     * @generated from field: uint32 priority = 8;
     */
    priority: number;
    constructor(data?: PartialMessage<UpdateTrackSettings>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.UpdateTrackSettings";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): UpdateTrackSettings;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): UpdateTrackSettings;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): UpdateTrackSettings;
    static equals(a: UpdateTrackSettings | PlainMessage<UpdateTrackSettings> | undefined, b: UpdateTrackSettings | PlainMessage<UpdateTrackSettings> | undefined): boolean;
}
/**
 * @generated from message livekit.LeaveRequest
 */
export declare class LeaveRequest extends Message<LeaveRequest> {
    /**
     * sent when server initiates the disconnect due to server-restart
     * indicates clients should attempt full-reconnect sequence
     *
     * @generated from field: bool can_reconnect = 1;
     */
    canReconnect: boolean;
    /**
     * @generated from field: livekit.DisconnectReason reason = 2;
     */
    reason: DisconnectReason;
    constructor(data?: PartialMessage<LeaveRequest>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.LeaveRequest";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): LeaveRequest;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): LeaveRequest;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): LeaveRequest;
    static equals(a: LeaveRequest | PlainMessage<LeaveRequest> | undefined, b: LeaveRequest | PlainMessage<LeaveRequest> | undefined): boolean;
}
/**
 * message to indicate published video track dimensions are changing
 *
 * @generated from message livekit.UpdateVideoLayers
 */
export declare class UpdateVideoLayers extends Message<UpdateVideoLayers> {
    /**
     * @generated from field: string track_sid = 1;
     */
    trackSid: string;
    /**
     * @generated from field: repeated livekit.VideoLayer layers = 2;
     */
    layers: VideoLayer[];
    constructor(data?: PartialMessage<UpdateVideoLayers>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.UpdateVideoLayers";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): UpdateVideoLayers;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): UpdateVideoLayers;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): UpdateVideoLayers;
    static equals(a: UpdateVideoLayers | PlainMessage<UpdateVideoLayers> | undefined, b: UpdateVideoLayers | PlainMessage<UpdateVideoLayers> | undefined): boolean;
}
/**
 * @generated from message livekit.UpdateParticipantMetadata
 */
export declare class UpdateParticipantMetadata extends Message<UpdateParticipantMetadata> {
    /**
     * @generated from field: string metadata = 1;
     */
    metadata: string;
    /**
     * @generated from field: string name = 2;
     */
    name: string;
    constructor(data?: PartialMessage<UpdateParticipantMetadata>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.UpdateParticipantMetadata";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): UpdateParticipantMetadata;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): UpdateParticipantMetadata;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): UpdateParticipantMetadata;
    static equals(a: UpdateParticipantMetadata | PlainMessage<UpdateParticipantMetadata> | undefined, b: UpdateParticipantMetadata | PlainMessage<UpdateParticipantMetadata> | undefined): boolean;
}
/**
 * @generated from message livekit.ICEServer
 */
export declare class ICEServer extends Message<ICEServer> {
    /**
     * @generated from field: repeated string urls = 1;
     */
    urls: string[];
    /**
     * @generated from field: string username = 2;
     */
    username: string;
    /**
     * @generated from field: string credential = 3;
     */
    credential: string;
    constructor(data?: PartialMessage<ICEServer>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.ICEServer";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ICEServer;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ICEServer;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ICEServer;
    static equals(a: ICEServer | PlainMessage<ICEServer> | undefined, b: ICEServer | PlainMessage<ICEServer> | undefined): boolean;
}
/**
 * @generated from message livekit.SpeakersChanged
 */
export declare class SpeakersChanged extends Message<SpeakersChanged> {
    /**
     * @generated from field: repeated livekit.SpeakerInfo speakers = 1;
     */
    speakers: SpeakerInfo[];
    constructor(data?: PartialMessage<SpeakersChanged>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.SpeakersChanged";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SpeakersChanged;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SpeakersChanged;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SpeakersChanged;
    static equals(a: SpeakersChanged | PlainMessage<SpeakersChanged> | undefined, b: SpeakersChanged | PlainMessage<SpeakersChanged> | undefined): boolean;
}
/**
 * @generated from message livekit.RoomUpdate
 */
export declare class RoomUpdate extends Message<RoomUpdate> {
    /**
     * @generated from field: livekit.Room room = 1;
     */
    room?: Room;
    constructor(data?: PartialMessage<RoomUpdate>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.RoomUpdate";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): RoomUpdate;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): RoomUpdate;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): RoomUpdate;
    static equals(a: RoomUpdate | PlainMessage<RoomUpdate> | undefined, b: RoomUpdate | PlainMessage<RoomUpdate> | undefined): boolean;
}
/**
 * @generated from message livekit.ConnectionQualityInfo
 */
export declare class ConnectionQualityInfo extends Message<ConnectionQualityInfo> {
    /**
     * @generated from field: string participant_sid = 1;
     */
    participantSid: string;
    /**
     * @generated from field: livekit.ConnectionQuality quality = 2;
     */
    quality: ConnectionQuality;
    /**
     * @generated from field: float score = 3;
     */
    score: number;
    constructor(data?: PartialMessage<ConnectionQualityInfo>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.ConnectionQualityInfo";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ConnectionQualityInfo;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ConnectionQualityInfo;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ConnectionQualityInfo;
    static equals(a: ConnectionQualityInfo | PlainMessage<ConnectionQualityInfo> | undefined, b: ConnectionQualityInfo | PlainMessage<ConnectionQualityInfo> | undefined): boolean;
}
/**
 * @generated from message livekit.ConnectionQualityUpdate
 */
export declare class ConnectionQualityUpdate extends Message<ConnectionQualityUpdate> {
    /**
     * @generated from field: repeated livekit.ConnectionQualityInfo updates = 1;
     */
    updates: ConnectionQualityInfo[];
    constructor(data?: PartialMessage<ConnectionQualityUpdate>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.ConnectionQualityUpdate";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ConnectionQualityUpdate;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ConnectionQualityUpdate;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ConnectionQualityUpdate;
    static equals(a: ConnectionQualityUpdate | PlainMessage<ConnectionQualityUpdate> | undefined, b: ConnectionQualityUpdate | PlainMessage<ConnectionQualityUpdate> | undefined): boolean;
}
/**
 * @generated from message livekit.StreamStateInfo
 */
export declare class StreamStateInfo extends Message<StreamStateInfo> {
    /**
     * @generated from field: string participant_sid = 1;
     */
    participantSid: string;
    /**
     * @generated from field: string track_sid = 2;
     */
    trackSid: string;
    /**
     * @generated from field: livekit.StreamState state = 3;
     */
    state: StreamState;
    constructor(data?: PartialMessage<StreamStateInfo>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.StreamStateInfo";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): StreamStateInfo;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): StreamStateInfo;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): StreamStateInfo;
    static equals(a: StreamStateInfo | PlainMessage<StreamStateInfo> | undefined, b: StreamStateInfo | PlainMessage<StreamStateInfo> | undefined): boolean;
}
/**
 * @generated from message livekit.StreamStateUpdate
 */
export declare class StreamStateUpdate extends Message<StreamStateUpdate> {
    /**
     * @generated from field: repeated livekit.StreamStateInfo stream_states = 1;
     */
    streamStates: StreamStateInfo[];
    constructor(data?: PartialMessage<StreamStateUpdate>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.StreamStateUpdate";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): StreamStateUpdate;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): StreamStateUpdate;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): StreamStateUpdate;
    static equals(a: StreamStateUpdate | PlainMessage<StreamStateUpdate> | undefined, b: StreamStateUpdate | PlainMessage<StreamStateUpdate> | undefined): boolean;
}
/**
 * @generated from message livekit.SubscribedQuality
 */
export declare class SubscribedQuality extends Message<SubscribedQuality> {
    /**
     * @generated from field: livekit.VideoQuality quality = 1;
     */
    quality: VideoQuality;
    /**
     * @generated from field: bool enabled = 2;
     */
    enabled: boolean;
    constructor(data?: PartialMessage<SubscribedQuality>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.SubscribedQuality";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SubscribedQuality;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SubscribedQuality;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SubscribedQuality;
    static equals(a: SubscribedQuality | PlainMessage<SubscribedQuality> | undefined, b: SubscribedQuality | PlainMessage<SubscribedQuality> | undefined): boolean;
}
/**
 * @generated from message livekit.SubscribedCodec
 */
export declare class SubscribedCodec extends Message<SubscribedCodec> {
    /**
     * @generated from field: string codec = 1;
     */
    codec: string;
    /**
     * @generated from field: repeated livekit.SubscribedQuality qualities = 2;
     */
    qualities: SubscribedQuality[];
    constructor(data?: PartialMessage<SubscribedCodec>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.SubscribedCodec";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SubscribedCodec;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SubscribedCodec;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SubscribedCodec;
    static equals(a: SubscribedCodec | PlainMessage<SubscribedCodec> | undefined, b: SubscribedCodec | PlainMessage<SubscribedCodec> | undefined): boolean;
}
/**
 * @generated from message livekit.SubscribedQualityUpdate
 */
export declare class SubscribedQualityUpdate extends Message<SubscribedQualityUpdate> {
    /**
     * @generated from field: string track_sid = 1;
     */
    trackSid: string;
    /**
     * @generated from field: repeated livekit.SubscribedQuality subscribed_qualities = 2;
     */
    subscribedQualities: SubscribedQuality[];
    /**
     * @generated from field: repeated livekit.SubscribedCodec subscribed_codecs = 3;
     */
    subscribedCodecs: SubscribedCodec[];
    constructor(data?: PartialMessage<SubscribedQualityUpdate>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.SubscribedQualityUpdate";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SubscribedQualityUpdate;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SubscribedQualityUpdate;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SubscribedQualityUpdate;
    static equals(a: SubscribedQualityUpdate | PlainMessage<SubscribedQualityUpdate> | undefined, b: SubscribedQualityUpdate | PlainMessage<SubscribedQualityUpdate> | undefined): boolean;
}
/**
 * @generated from message livekit.TrackPermission
 */
export declare class TrackPermission extends Message<TrackPermission> {
    /**
     * permission could be granted either by participant sid or identity
     *
     * @generated from field: string participant_sid = 1;
     */
    participantSid: string;
    /**
     * @generated from field: bool all_tracks = 2;
     */
    allTracks: boolean;
    /**
     * @generated from field: repeated string track_sids = 3;
     */
    trackSids: string[];
    /**
     * @generated from field: string participant_identity = 4;
     */
    participantIdentity: string;
    constructor(data?: PartialMessage<TrackPermission>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.TrackPermission";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): TrackPermission;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): TrackPermission;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): TrackPermission;
    static equals(a: TrackPermission | PlainMessage<TrackPermission> | undefined, b: TrackPermission | PlainMessage<TrackPermission> | undefined): boolean;
}
/**
 * @generated from message livekit.SubscriptionPermission
 */
export declare class SubscriptionPermission extends Message<SubscriptionPermission> {
    /**
     * @generated from field: bool all_participants = 1;
     */
    allParticipants: boolean;
    /**
     * @generated from field: repeated livekit.TrackPermission track_permissions = 2;
     */
    trackPermissions: TrackPermission[];
    constructor(data?: PartialMessage<SubscriptionPermission>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.SubscriptionPermission";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SubscriptionPermission;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SubscriptionPermission;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SubscriptionPermission;
    static equals(a: SubscriptionPermission | PlainMessage<SubscriptionPermission> | undefined, b: SubscriptionPermission | PlainMessage<SubscriptionPermission> | undefined): boolean;
}
/**
 * @generated from message livekit.SubscriptionPermissionUpdate
 */
export declare class SubscriptionPermissionUpdate extends Message<SubscriptionPermissionUpdate> {
    /**
     * @generated from field: string participant_sid = 1;
     */
    participantSid: string;
    /**
     * @generated from field: string track_sid = 2;
     */
    trackSid: string;
    /**
     * @generated from field: bool allowed = 3;
     */
    allowed: boolean;
    constructor(data?: PartialMessage<SubscriptionPermissionUpdate>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.SubscriptionPermissionUpdate";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SubscriptionPermissionUpdate;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SubscriptionPermissionUpdate;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SubscriptionPermissionUpdate;
    static equals(a: SubscriptionPermissionUpdate | PlainMessage<SubscriptionPermissionUpdate> | undefined, b: SubscriptionPermissionUpdate | PlainMessage<SubscriptionPermissionUpdate> | undefined): boolean;
}
/**
 * @generated from message livekit.SyncState
 */
export declare class SyncState extends Message<SyncState> {
    /**
     * last subscribe answer before reconnecting
     *
     * @generated from field: livekit.SessionDescription answer = 1;
     */
    answer?: SessionDescription;
    /**
     * @generated from field: livekit.UpdateSubscription subscription = 2;
     */
    subscription?: UpdateSubscription;
    /**
     * @generated from field: repeated livekit.TrackPublishedResponse publish_tracks = 3;
     */
    publishTracks: TrackPublishedResponse[];
    /**
     * @generated from field: repeated livekit.DataChannelInfo data_channels = 4;
     */
    dataChannels: DataChannelInfo[];
    /**
     * last received server side offer before reconnecting
     *
     * @generated from field: livekit.SessionDescription offer = 5;
     */
    offer?: SessionDescription;
    constructor(data?: PartialMessage<SyncState>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.SyncState";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SyncState;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SyncState;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SyncState;
    static equals(a: SyncState | PlainMessage<SyncState> | undefined, b: SyncState | PlainMessage<SyncState> | undefined): boolean;
}
/**
 * @generated from message livekit.DataChannelInfo
 */
export declare class DataChannelInfo extends Message<DataChannelInfo> {
    /**
     * @generated from field: string label = 1;
     */
    label: string;
    /**
     * @generated from field: uint32 id = 2;
     */
    id: number;
    /**
     * @generated from field: livekit.SignalTarget target = 3;
     */
    target: SignalTarget;
    constructor(data?: PartialMessage<DataChannelInfo>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.DataChannelInfo";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): DataChannelInfo;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): DataChannelInfo;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): DataChannelInfo;
    static equals(a: DataChannelInfo | PlainMessage<DataChannelInfo> | undefined, b: DataChannelInfo | PlainMessage<DataChannelInfo> | undefined): boolean;
}
/**
 * @generated from message livekit.SimulateScenario
 */
export declare class SimulateScenario extends Message<SimulateScenario> {
    /**
     * @generated from oneof livekit.SimulateScenario.scenario
     */
    scenario: {
        /**
         * simulate N seconds of speaker activity
         *
         * @generated from field: int32 speaker_update = 1;
         */
        value: number;
        case: "speakerUpdate";
    } | {
        /**
         * simulate local node failure
         *
         * @generated from field: bool node_failure = 2;
         */
        value: boolean;
        case: "nodeFailure";
    } | {
        /**
         * simulate migration
         *
         * @generated from field: bool migration = 3;
         */
        value: boolean;
        case: "migration";
    } | {
        /**
         * server to send leave
         *
         * @generated from field: bool server_leave = 4;
         */
        value: boolean;
        case: "serverLeave";
    } | {
        /**
         * switch candidate protocol to tcp
         *
         * @generated from field: livekit.CandidateProtocol switch_candidate_protocol = 5;
         */
        value: CandidateProtocol;
        case: "switchCandidateProtocol";
    } | {
        /**
         * maximum bandwidth for subscribers, in bps
         * when zero, clears artificial bandwidth limit
         *
         * @generated from field: int64 subscriber_bandwidth = 6;
         */
        value: bigint;
        case: "subscriberBandwidth";
    } | {
        case: undefined;
        value?: undefined;
    };
    constructor(data?: PartialMessage<SimulateScenario>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.SimulateScenario";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SimulateScenario;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SimulateScenario;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SimulateScenario;
    static equals(a: SimulateScenario | PlainMessage<SimulateScenario> | undefined, b: SimulateScenario | PlainMessage<SimulateScenario> | undefined): boolean;
}
/**
 * @generated from message livekit.Ping
 */
export declare class Ping extends Message<Ping> {
    /**
     * @generated from field: int64 timestamp = 1;
     */
    timestamp: bigint;
    /**
     * rtt in milliseconds calculated by client
     *
     * @generated from field: int64 rtt = 2;
     */
    rtt: bigint;
    constructor(data?: PartialMessage<Ping>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.Ping";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): Ping;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): Ping;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): Ping;
    static equals(a: Ping | PlainMessage<Ping> | undefined, b: Ping | PlainMessage<Ping> | undefined): boolean;
}
/**
 * @generated from message livekit.Pong
 */
export declare class Pong extends Message<Pong> {
    /**
     * timestamp field of last received ping request
     *
     * @generated from field: int64 last_ping_timestamp = 1;
     */
    lastPingTimestamp: bigint;
    /**
     * @generated from field: int64 timestamp = 2;
     */
    timestamp: bigint;
    constructor(data?: PartialMessage<Pong>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.Pong";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): Pong;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): Pong;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): Pong;
    static equals(a: Pong | PlainMessage<Pong> | undefined, b: Pong | PlainMessage<Pong> | undefined): boolean;
}
/**
 * @generated from message livekit.RegionSettings
 */
export declare class RegionSettings extends Message<RegionSettings> {
    /**
     * @generated from field: repeated livekit.RegionInfo regions = 1;
     */
    regions: RegionInfo[];
    constructor(data?: PartialMessage<RegionSettings>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.RegionSettings";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): RegionSettings;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): RegionSettings;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): RegionSettings;
    static equals(a: RegionSettings | PlainMessage<RegionSettings> | undefined, b: RegionSettings | PlainMessage<RegionSettings> | undefined): boolean;
}
/**
 * @generated from message livekit.RegionInfo
 */
export declare class RegionInfo extends Message<RegionInfo> {
    /**
     * @generated from field: string region = 1;
     */
    region: string;
    /**
     * @generated from field: string url = 2;
     */
    url: string;
    /**
     * @generated from field: int64 distance = 3;
     */
    distance: bigint;
    constructor(data?: PartialMessage<RegionInfo>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.RegionInfo";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): RegionInfo;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): RegionInfo;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): RegionInfo;
    static equals(a: RegionInfo | PlainMessage<RegionInfo> | undefined, b: RegionInfo | PlainMessage<RegionInfo> | undefined): boolean;
}
/**
 * @generated from message livekit.SubscriptionResponse
 */
export declare class SubscriptionResponse extends Message<SubscriptionResponse> {
    /**
     * @generated from field: string track_sid = 1;
     */
    trackSid: string;
    /**
     * @generated from field: livekit.SubscriptionError err = 2;
     */
    err: SubscriptionError;
    constructor(data?: PartialMessage<SubscriptionResponse>);
    static readonly runtime: typeof proto3;
    static readonly typeName = "livekit.SubscriptionResponse";
    static readonly fields: FieldList;
    static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): SubscriptionResponse;
    static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): SubscriptionResponse;
    static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): SubscriptionResponse;
    static equals(a: SubscriptionResponse | PlainMessage<SubscriptionResponse> | undefined, b: SubscriptionResponse | PlainMessage<SubscriptionResponse> | undefined): boolean;
}
//# sourceMappingURL=livekit_rtc_pb.d.ts.map