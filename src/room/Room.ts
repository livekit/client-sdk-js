import { EventEmitter } from 'events';
import type TypedEmitter from 'typed-emitter';
import { toProtoSessionDescription } from '../api/SignalClient';
import log from '../logger';
import { RoomConnectOptions, RoomOptions } from '../options';
import {
  DataPacket_Kind,
  ParticipantInfo,
  ParticipantInfo_State,
  ParticipantPermission,
  Room as RoomModel,
  SpeakerInfo,
  UserPacket,
} from '../proto/livekit_models';
import {
  ConnectionQualityUpdate,
  JoinResponse,
  SimulateScenario,
  StreamStateUpdate,
  SubscriptionPermissionUpdate,
} from '../proto/livekit_rtc';
import DeviceManager from './DeviceManager';
import { ConnectionError, UnsupportedServer } from './errors';
import { EngineEvent, ParticipantEvent, RoomEvent, TrackEvent } from './events';
import LocalParticipant from './participant/LocalParticipant';
import Participant, { ConnectionQuality } from './participant/Participant';
import RemoteParticipant from './participant/RemoteParticipant';
import RTCEngine, { maxICEConnectTimeout } from './RTCEngine';
import { audioDefaults, publishDefaults, videoDefaults } from './track/defaults';
import LocalTrackPublication from './track/LocalTrackPublication';
import RemoteTrackPublication from './track/RemoteTrackPublication';
import { Track } from './track/Track';
import { TrackPublication } from './track/TrackPublication';
import { AdaptiveStreamSettings, RemoteTrack } from './track/types';
import { getNewAudioContext } from './track/utils';
import { isWeb, unpackStreamId } from './utils';

export enum RoomState {
  Disconnected = 'disconnected',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
}

/**
 * In LiveKit, a room is the logical grouping for a list of participants.
 * Participants in a room can publish tracks, and subscribe to others' tracks.
 *
 * a Room fires [[RoomEvent | RoomEvents]].
 *
 * @noInheritDoc
 */
class Room extends (EventEmitter as new () => TypedEmitter<RoomEventCallbacks>) {
  state: RoomState = RoomState.Disconnected;

  /** map of sid: [[RemoteParticipant]] */
  participants: Map<string, RemoteParticipant>;

  /**
   * list of participants that are actively speaking. when this changes
   * a [[RoomEvent.ActiveSpeakersChanged]] event is fired
   */
  activeSpeakers: Participant[] = [];

  /** @internal */
  engine!: RTCEngine;

  // available after connected
  /** server assigned unique room id */
  sid: string = '';

  /** user assigned name, derived from JWT token */
  name: string = '';

  /** the current participant */
  localParticipant: LocalParticipant;

  /** room metadata */
  metadata: string | undefined = undefined;

  /** options of room */
  options: RoomOptions;

  /** connect options of room */
  private connOptions?: RoomConnectOptions;

  private audioEnabled = true;

  private audioContext?: AudioContext;

  /**
   * Creates a new Room, the primary construct for a LiveKit session.
   * @param options
   */
  constructor(options?: RoomOptions) {
    super();
    this.participants = new Map();
    this.options = options || {};

    switch (this.options?.publishDefaults?.videoCodec) {
      case 'av1':
      case 'vp9':
        this.options.publishDefaults.simulcast = undefined;
        break;
      default:
    }

    this.options.audioCaptureDefaults = {
      ...audioDefaults,
      ...options?.audioCaptureDefaults,
    };
    this.options.videoCaptureDefaults = {
      ...videoDefaults,
      ...options?.videoCaptureDefaults,
    };
    this.options.publishDefaults = {
      ...publishDefaults,
      ...options?.publishDefaults,
    };

    this.createEngine();

    this.localParticipant = new LocalParticipant('', '', this.engine, this.options);
  }

  private createEngine() {
    if (this.engine) {
      return;
    }

    this.engine = new RTCEngine();

    this.engine.client.signalLatency = this.options.expSignalLatency;
    this.engine.client.onParticipantUpdate = this.handleParticipantUpdates;
    this.engine.client.onRoomUpdate = this.handleRoomUpdate;
    this.engine.client.onSpeakersChanged = this.handleSpeakersChanged;
    this.engine.client.onStreamStateUpdate = this.handleStreamStateUpdate;
    this.engine.client.onSubscriptionPermissionUpdate = this.handleSubscriptionPermissionUpdate;
    this.engine.client.onConnectionQuality = this.handleConnectionQualityUpdate;

    this.engine
      .on(
        EngineEvent.MediaTrackAdded,
        (mediaTrack: MediaStreamTrack, stream: MediaStream, receiver?: RTCRtpReceiver) => {
          this.onTrackAdded(mediaTrack, stream, receiver);
        },
      )
      .on(EngineEvent.Disconnected, () => {
        this.handleDisconnect();
      })
      .on(EngineEvent.ActiveSpeakersUpdate, this.handleActiveSpeakersUpdate)
      .on(EngineEvent.DataPacketReceived, this.handleDataPacket)
      .on(EngineEvent.Resuming, () => {
        this.state = RoomState.Reconnecting;
        this.emit(RoomEvent.Reconnecting);
        this.emit(RoomEvent.StateChanged, this.state);
      })
      .on(EngineEvent.Resumed, () => {
        this.state = RoomState.Connected;
        this.emit(RoomEvent.Reconnected);
        this.emit(RoomEvent.StateChanged, this.state);
        this.updateSubscriptions();
      })
      .on(EngineEvent.SignalResumed, () => {
        if (this.state === RoomState.Reconnecting) {
          this.sendSyncState();
        }
      })
      .on(EngineEvent.Restarting, this.handleRestarting)
      .on(EngineEvent.Restarted, this.handleRestarted);
  }

  /**
   * getLocalDevices abstracts navigator.mediaDevices.enumerateDevices.
   * In particular, it handles Chrome's unique behavior of creating `default`
   * devices. When encountered, it'll be removed from the list of devices.
   * The actual default device will be placed at top.
   * @param kind
   * @returns a list of available local devices
   */
  static getLocalDevices(
    kind?: MediaDeviceKind,
    requestPermissions: boolean = true,
  ): Promise<MediaDeviceInfo[]> {
    return DeviceManager.getInstance().getDevices(kind, requestPermissions);
  }

  connect = async (url: string, token: string, opts?: RoomConnectOptions) => {
    // guard against calling connect
    if (this.state !== RoomState.Disconnected) {
      log.warn('already connected to room', this.name);
      return;
    }

    // recreate engine if previously disconnected
    this.createEngine();

    this.acquireAudioContext();

    if (opts?.rtcConfig) {
      this.engine.rtcConfig = opts.rtcConfig;
    }

    this.connOptions = opts;

    try {
      const joinResponse = await this.engine.join(url, token, opts);
      log.debug(
        `connected to Livekit Server version: ${joinResponse.serverVersion}, region: ${joinResponse.serverRegion}`,
      );

      if (!joinResponse.serverVersion) {
        throw new UnsupportedServer('unknown server version');
      }

      if (joinResponse.serverVersion === '0.15.1' && this.options.dynacast) {
        log.debug('disabling dynacast due to server version');
        // dynacast has a bug in 0.15.1, so we cannot use it then
        this.options.dynacast = false;
      }

      this.state = RoomState.Connected;
      const pi = joinResponse.participant!;

      this.localParticipant.sid = pi.sid;
      this.localParticipant.identity = pi.identity;

      this.localParticipant.updateInfo(pi);
      // forward metadata changed for the local participant
      this.localParticipant
        .on(ParticipantEvent.MetadataChanged, (metadata: string | undefined) => {
          this.emit(RoomEvent.MetadataChanged, metadata, this.localParticipant);
        })
        .on(ParticipantEvent.ParticipantMetadataChanged, (metadata: string | undefined) => {
          this.emit(RoomEvent.ParticipantMetadataChanged, metadata, this.localParticipant);
        })
        .on(ParticipantEvent.TrackMuted, (pub: TrackPublication) => {
          this.emit(RoomEvent.TrackMuted, pub, this.localParticipant);
        })
        .on(ParticipantEvent.TrackUnmuted, (pub: TrackPublication) => {
          this.emit(RoomEvent.TrackUnmuted, pub, this.localParticipant);
        })
        .on(ParticipantEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
          this.emit(RoomEvent.LocalTrackPublished, pub, this.localParticipant);
        })
        .on(ParticipantEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
          this.emit(RoomEvent.LocalTrackUnpublished, pub, this.localParticipant);
        })
        .on(ParticipantEvent.ConnectionQualityChanged, (quality: ConnectionQuality) => {
          this.emit(RoomEvent.ConnectionQualityChanged, quality, this.localParticipant);
        })
        .on(ParticipantEvent.MediaDevicesError, (e: Error) => {
          this.emit(RoomEvent.MediaDevicesError, e);
        })
        .on(
          ParticipantEvent.ParticipantPermissionsChanged,
          (prevPermissions: ParticipantPermission) => {
            this.emit(
              RoomEvent.ParticipantPermissionsChanged,
              prevPermissions,
              this.localParticipant,
            );
          },
        );

      // populate remote participants, these should not trigger new events
      joinResponse.otherParticipants.forEach((info) => {
        this.getOrCreateParticipant(info.sid, info);
      });

      this.name = joinResponse.room!.name;
      this.sid = joinResponse.room!.sid;
      this.metadata = joinResponse.room!.metadata;
      this.emit(RoomEvent.StateChanged, this.state);
    } catch (err) {
      this.engine.close();
      throw err;
    }

    // don't return until ICE connected
    return new Promise<Room>((resolve, reject) => {
      const connectTimeout = setTimeout(() => {
        // timeout
        this.engine.close();
        reject(new ConnectionError('could not connect after timeout'));
      }, maxICEConnectTimeout);

      this.engine.once(EngineEvent.Connected, () => {
        clearTimeout(connectTimeout);

        // also hook unload event
        if (isWeb()) {
          window.addEventListener('beforeunload', this.onBeforeUnload);
          navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange);
        }

        resolve(this);
      });
    });
  };

  /**
   * disconnects the room, emits [[RoomEvent.Disconnected]]
   */
  disconnect = (stopTracks = true) => {
    // send leave
    if (this.engine) {
      this.engine.client.sendLeave();
      this.engine.close();
    }
    this.handleDisconnect(stopTracks);
    /* @ts-ignore */
    this.engine = undefined;
  };

  /**
   * retrieves a participant by identity
   * @param identity
   * @returns
   */
  getParticipantByIdentity(identity: string): Participant | undefined {
    for (const [, p] of this.participants) {
      if (p.identity === identity) {
        return p;
      }
    }
    if (this.localParticipant.identity === identity) {
      return this.localParticipant;
    }
  }

  /**
   * @internal for testing
   */
  simulateScenario(scenario: string) {
    let req: SimulateScenario | undefined;
    switch (scenario) {
      case 'speaker':
        req = SimulateScenario.fromPartial({
          speakerUpdate: 3,
        });
        break;
      case 'node-failure':
        req = SimulateScenario.fromPartial({
          nodeFailure: true,
        });
        break;
      case 'server-leave':
        req = SimulateScenario.fromPartial({
          serverLeave: true,
        });
        break;
      case 'migration':
        req = SimulateScenario.fromPartial({
          migration: true,
        });
        break;
      default:
    }
    if (req) {
      this.engine.client.sendSimulateScenario(req);
    }
  }

  private onBeforeUnload = () => {
    this.disconnect();
  };

  /**
   * Browsers have different policies regarding audio playback. Most requiring
   * some form of user interaction (click/tap/etc).
   * In those cases, audio will be silent until a click/tap triggering one of the following
   * - `startAudio`
   * - `getUserMedia`
   */
  async startAudio() {
    this.acquireAudioContext();

    const elements: Array<HTMLMediaElement> = [];
    this.participants.forEach((p) => {
      p.audioTracks.forEach((t) => {
        if (t.track) {
          t.track.attachedElements.forEach((e) => {
            elements.push(e);
          });
        }
      });
    });

    try {
      await Promise.all(elements.map((e) => e.play()));
      this.handleAudioPlaybackStarted();
    } catch (err) {
      this.handleAudioPlaybackFailed(err);
      throw err;
    }
  }

  /**
   * Returns true if audio playback is enabled
   */
  get canPlaybackAudio(): boolean {
    return this.audioEnabled;
  }

  /**
   * Switches all active device used in this room to the given device.
   *
   * Note: setting AudioOutput is not supported on some browsers. See [setSinkId](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId#browser_compatibility)
   *
   * @param kind use `videoinput` for camera track,
   *  `audioinput` for microphone track,
   *  `audiooutput` to set speaker for all incoming audio tracks
   * @param deviceId
   */
  async switchActiveDevice(kind: MediaDeviceKind, deviceId: string) {
    if (kind === 'audioinput') {
      const tracks = Array.from(this.localParticipant.audioTracks.values()).filter(
        (track) => track.source === Track.Source.Microphone,
      );
      await Promise.all(tracks.map((t) => t.audioTrack?.setDeviceId(deviceId)));
      this.options.audioCaptureDefaults!.deviceId = deviceId;
    } else if (kind === 'videoinput') {
      const tracks = Array.from(this.localParticipant.videoTracks.values()).filter(
        (track) => track.source === Track.Source.Camera,
      );
      await Promise.all(tracks.map((t) => t.videoTrack?.setDeviceId(deviceId)));
      this.options.videoCaptureDefaults!.deviceId = deviceId;
    } else if (kind === 'audiooutput') {
      const elements: HTMLMediaElement[] = [];
      this.participants.forEach((p) => {
        p.audioTracks.forEach((t) => {
          if (t.isSubscribed && t.track) {
            t.track.attachedElements.forEach((e) => {
              elements.push(e);
            });
          }
        });
      });

      await Promise.all(
        elements.map(async (e) => {
          if ('setSinkId' in e) {
            /* @ts-ignore */
            await e.setSinkId(deviceId);
          }
        }),
      );
    }
  }

  private onTrackAdded(
    mediaTrack: MediaStreamTrack,
    stream: MediaStream,
    receiver?: RTCRtpReceiver,
  ) {
    const parts = unpackStreamId(stream.id);
    const participantId = parts[0];
    let trackId = parts[1];
    if (!trackId || trackId === '') trackId = mediaTrack.id;

    const participant = this.getOrCreateParticipant(participantId);
    let adaptiveStreamSettings: AdaptiveStreamSettings | undefined;
    if (this.options.adaptiveStream) {
      if (typeof this.options.adaptiveStream === 'object') {
        adaptiveStreamSettings = this.options.adaptiveStream;
      } else {
        adaptiveStreamSettings = {};
      }
    }
    participant.addSubscribedMediaTrack(
      mediaTrack,
      trackId,
      stream,
      receiver,
      adaptiveStreamSettings,
    );
  }

  private handleRestarting = () => {
    this.state = RoomState.Reconnecting;
    this.emit(RoomEvent.Reconnecting);
    this.emit(RoomEvent.StateChanged, this.state);

    // also unwind existing participants & existing subscriptions
    for (const p of this.participants.values()) {
      this.handleParticipantDisconnected(p.sid, p);
    }
  };

  private handleRestarted = async (joinResponse: JoinResponse) => {
    log.debug('reconnected to server region', joinResponse.serverRegion);
    this.state = RoomState.Connected;
    this.emit(RoomEvent.Reconnected);
    this.emit(RoomEvent.StateChanged, this.state);

    // rehydrate participants
    if (joinResponse.participant) {
      // with a restart, the sid will have changed, we'll map our understanding to it
      this.localParticipant.sid = joinResponse.participant.sid;
      this.handleParticipantUpdates([joinResponse.participant]);
    }
    this.handleParticipantUpdates(joinResponse.otherParticipants);

    // unpublish & republish tracks
    const localPubs: LocalTrackPublication[] = [];
    this.localParticipant.tracks.forEach((pub) => {
      if (pub.track) {
        localPubs.push(pub);
      }
    });

    await Promise.all(
      localPubs.map(async (pub) => {
        const track = pub.track!;
        this.localParticipant.unpublishTrack(track, false);
        this.localParticipant.publishTrack(track, pub.options);
      }),
    );
  };

  private handleDisconnect(shouldStopTracks = true) {
    if (this.state === RoomState.Disconnected) {
      return;
    }
    this.participants.forEach((p) => {
      p.tracks.forEach((pub) => {
        p.unpublishTrack(pub.trackSid);
      });
    });

    this.localParticipant.tracks.forEach((pub) => {
      if (pub.track) {
        this.localParticipant.unpublishTrack(pub.track);
      }
      if (shouldStopTracks) {
        pub.track?.detach();
        pub.track?.stop();
      }
    });

    this.participants.clear();
    this.activeSpeakers = [];
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = undefined;
    }
    if (isWeb()) {
      window.removeEventListener('beforeunload', this.onBeforeUnload);
      navigator.mediaDevices.removeEventListener('devicechange', this.handleDeviceChange);
    }
    this.state = RoomState.Disconnected;
    this.emit(RoomEvent.Disconnected);
    this.emit(RoomEvent.StateChanged, this.state);
  }

  private handleParticipantUpdates = (participantInfos: ParticipantInfo[]) => {
    // handle changes to participant state, and send events
    participantInfos.forEach((info) => {
      if (
        info.sid === this.localParticipant.sid ||
        info.identity === this.localParticipant.identity
      ) {
        this.localParticipant.updateInfo(info);
        return;
      }

      let remoteParticipant = this.participants.get(info.sid);
      const isNewParticipant = !remoteParticipant;

      // create participant if doesn't exist
      remoteParticipant = this.getOrCreateParticipant(info.sid, info);

      // when it's disconnected, send updates
      if (info.state === ParticipantInfo_State.DISCONNECTED) {
        this.handleParticipantDisconnected(info.sid, remoteParticipant);
      } else if (isNewParticipant) {
        // fire connected event
        this.emit(RoomEvent.ParticipantConnected, remoteParticipant);
      } else {
        // just update, no events
        remoteParticipant.updateInfo(info);
      }
    });
  };

  private handleParticipantDisconnected(sid: string, participant?: RemoteParticipant) {
    // remove and send event
    this.participants.delete(sid);
    if (!participant) {
      return;
    }

    participant.tracks.forEach((publication) => {
      participant.unpublishTrack(publication.trackSid);
    });
    this.emit(RoomEvent.ParticipantDisconnected, participant);
  }

  // updates are sent only when there's a change to speaker ordering
  private handleActiveSpeakersUpdate = (speakers: SpeakerInfo[]) => {
    const activeSpeakers: Participant[] = [];
    const seenSids: any = {};
    speakers.forEach((speaker) => {
      seenSids[speaker.sid] = true;
      if (speaker.sid === this.localParticipant.sid) {
        this.localParticipant.audioLevel = speaker.level;
        this.localParticipant.setIsSpeaking(true);
        activeSpeakers.push(this.localParticipant);
      } else {
        const p = this.participants.get(speaker.sid);
        if (p) {
          p.audioLevel = speaker.level;
          p.setIsSpeaking(true);
          activeSpeakers.push(p);
        }
      }
    });

    if (!seenSids[this.localParticipant.sid]) {
      this.localParticipant.audioLevel = 0;
      this.localParticipant.setIsSpeaking(false);
    }
    this.participants.forEach((p) => {
      if (!seenSids[p.sid]) {
        p.audioLevel = 0;
        p.setIsSpeaking(false);
      }
    });

    this.activeSpeakers = activeSpeakers;
    this.emit(RoomEvent.ActiveSpeakersChanged, activeSpeakers);
  };

  // process list of changed speakers
  private handleSpeakersChanged = (speakerUpdates: SpeakerInfo[]) => {
    const lastSpeakers = new Map<string, Participant>();
    this.activeSpeakers.forEach((p) => {
      lastSpeakers.set(p.sid, p);
    });
    speakerUpdates.forEach((speaker) => {
      let p: Participant | undefined = this.participants.get(speaker.sid);
      if (speaker.sid === this.localParticipant.sid) {
        p = this.localParticipant;
      }
      if (!p) {
        return;
      }
      p.audioLevel = speaker.level;
      p.setIsSpeaking(speaker.active);

      if (speaker.active) {
        lastSpeakers.set(speaker.sid, p);
      } else {
        lastSpeakers.delete(speaker.sid);
      }
    });
    const activeSpeakers = Array.from(lastSpeakers.values());
    activeSpeakers.sort((a, b) => b.audioLevel - a.audioLevel);
    this.activeSpeakers = activeSpeakers;
    this.emit(RoomEvent.ActiveSpeakersChanged, activeSpeakers);
  };

  private handleStreamStateUpdate = (streamStateUpdate: StreamStateUpdate) => {
    streamStateUpdate.streamStates.forEach((streamState) => {
      const participant = this.participants.get(streamState.participantSid);
      if (!participant) {
        return;
      }
      const pub = participant.getTrackPublication(streamState.trackSid);
      if (!pub || !pub.track) {
        return;
      }
      pub.track.streamState = Track.streamStateFromProto(streamState.state);
      participant.emit(ParticipantEvent.TrackStreamStateChanged, pub, pub.track.streamState);
      this.emit(ParticipantEvent.TrackStreamStateChanged, pub, pub.track.streamState, participant);
    });
  };

  private handleSubscriptionPermissionUpdate = (update: SubscriptionPermissionUpdate) => {
    const participant = this.participants.get(update.participantSid);
    if (!participant) {
      return;
    }
    const pub = participant.getTrackPublication(update.trackSid);
    if (!pub) {
      return;
    }

    pub._allowed = update.allowed;
    participant.emit(
      ParticipantEvent.TrackSubscriptionPermissionChanged,
      pub,
      pub.subscriptionStatus,
    );
    this.emit(
      ParticipantEvent.TrackSubscriptionPermissionChanged,
      pub,
      pub.subscriptionStatus,
      participant,
    );
  };

  private handleDataPacket = (userPacket: UserPacket, kind: DataPacket_Kind) => {
    // find the participant
    const participant = this.participants.get(userPacket.participantSid);

    this.emit(RoomEvent.DataReceived, userPacket.payload, participant, kind);

    // also emit on the participant
    participant?.emit(ParticipantEvent.DataReceived, userPacket.payload, kind);
  };

  private handleAudioPlaybackStarted = () => {
    if (this.canPlaybackAudio) {
      return;
    }
    this.audioEnabled = true;
    this.emit(RoomEvent.AudioPlaybackStatusChanged, true);
  };

  private handleAudioPlaybackFailed = (e: any) => {
    log.warn('could not playback audio', e);
    if (!this.canPlaybackAudio) {
      return;
    }
    this.audioEnabled = false;
    this.emit(RoomEvent.AudioPlaybackStatusChanged, false);
  };

  private handleDeviceChange = async () => {
    this.emit(RoomEvent.MediaDevicesChanged);
  };

  private handleRoomUpdate = (r: RoomModel) => {
    this.metadata = r.metadata;
    this.emit(RoomEvent.RoomMetadataChanged, r.metadata);
  };

  private handleConnectionQualityUpdate = (update: ConnectionQualityUpdate) => {
    update.updates.forEach((info) => {
      if (info.participantSid === this.localParticipant.sid) {
        this.localParticipant.setConnectionQuality(info.quality);
        return;
      }
      const participant = this.participants.get(info.participantSid);
      if (participant) {
        participant.setConnectionQuality(info.quality);
      }
    });
  };

  private acquireAudioContext() {
    if (this.audioContext) {
      this.audioContext.close();
    }
    // by using an AudioContext, it reduces lag on audio elements
    // https://stackoverflow.com/questions/9811429/html5-audio-tag-on-safari-has-a-delay/54119854#54119854
    const ctx = getNewAudioContext();
    if (ctx) {
      this.audioContext = ctx;
    }
  }

  private createParticipant(id: string, info?: ParticipantInfo): RemoteParticipant {
    let participant: RemoteParticipant;
    if (info) {
      participant = RemoteParticipant.fromParticipantInfo(this.engine.client, info);
    } else {
      participant = new RemoteParticipant(this.engine.client, id, '');
    }
    return participant;
  }

  private getOrCreateParticipant(id: string, info?: ParticipantInfo): RemoteParticipant {
    if (this.participants.has(id)) {
      return this.participants.get(id) as RemoteParticipant;
    }
    // it's possible for the RTC track to arrive before signaling data
    // when this happens, we'll create the participant and make the track work
    const participant = this.createParticipant(id, info);
    this.participants.set(id, participant);

    // also forward events
    // trackPublished is only fired for tracks added after both local participant
    // and remote participant joined the room
    participant
      .on(ParticipantEvent.TrackPublished, (trackPublication: RemoteTrackPublication) => {
        this.emit(RoomEvent.TrackPublished, trackPublication, participant);
      })
      .on(
        ParticipantEvent.TrackSubscribed,
        (track: RemoteTrack, publication: RemoteTrackPublication) => {
          // monitor playback status
          if (track.kind === Track.Kind.Audio) {
            track.on(TrackEvent.AudioPlaybackStarted, this.handleAudioPlaybackStarted);
            track.on(TrackEvent.AudioPlaybackFailed, this.handleAudioPlaybackFailed);
          }
          this.emit(RoomEvent.TrackSubscribed, track, publication, participant);
        },
      )
      .on(ParticipantEvent.TrackUnpublished, (publication: RemoteTrackPublication) => {
        this.emit(RoomEvent.TrackUnpublished, publication, participant);
      })
      .on(
        ParticipantEvent.TrackUnsubscribed,
        (track: RemoteTrack, publication: RemoteTrackPublication) => {
          this.emit(RoomEvent.TrackUnsubscribed, track, publication, participant);
        },
      )
      .on(ParticipantEvent.TrackSubscriptionFailed, (sid: string) => {
        this.emit(RoomEvent.TrackSubscriptionFailed, sid, participant);
      })
      .on(ParticipantEvent.TrackMuted, (pub: TrackPublication) => {
        this.emit(RoomEvent.TrackMuted, pub, participant);
      })
      .on(ParticipantEvent.TrackUnmuted, (pub: TrackPublication) => {
        this.emit(RoomEvent.TrackUnmuted, pub, participant);
      })
      .on(ParticipantEvent.MetadataChanged, (metadata: string | undefined) => {
        this.emit(RoomEvent.MetadataChanged, metadata, participant);
      })
      .on(ParticipantEvent.ParticipantMetadataChanged, (metadata: string | undefined) => {
        this.emit(RoomEvent.ParticipantMetadataChanged, metadata, participant);
      })
      .on(ParticipantEvent.ConnectionQualityChanged, (quality: ConnectionQuality) => {
        this.emit(RoomEvent.ConnectionQualityChanged, quality, participant);
      })
      .on(
        ParticipantEvent.ParticipantPermissionsChanged,
        (prevPermissions: ParticipantPermission) => {
          this.emit(RoomEvent.ParticipantPermissionsChanged, prevPermissions, participant);
        },
      );
    return participant;
  }

  private sendSyncState() {
    if (
      this.engine.subscriber === undefined ||
      this.engine.subscriber.pc.localDescription === null
    ) {
      return;
    }
    const previousSdp = this.engine.subscriber.pc.localDescription;

    /* 1. autosubscribe on, so subscribed tracks = all tracks - unsub tracks,
          in this case, we send unsub tracks, so server add all tracks to this
          subscribe pc and unsub special tracks from it.
       2. autosubscribe off, we send subscribed tracks.
    */
    const sendUnsub = this.connOptions?.autoSubscribe || false;
    const trackSids = new Array<string>();
    this.participants.forEach((participant) => {
      participant.tracks.forEach((track) => {
        if (track.isSubscribed !== sendUnsub) {
          trackSids.push(track.trackSid);
        }
      });
    });

    this.engine.client.sendSyncState({
      answer: toProtoSessionDescription({
        sdp: previousSdp.sdp,
        type: previousSdp.type,
      }),
      subscription: {
        trackSids,
        subscribe: !sendUnsub,
        participantTracks: [],
      },
      publishTracks: this.localParticipant.publishedTracksInfo(),
      dataChannels: this.localParticipant.dataChannelsInfo(),
    });
  }

  /**
   * After resuming, we'll need to notify the server of the current
   * subscription settings.
   */
  private updateSubscriptions() {
    for (const p of this.participants.values()) {
      for (const pub of p.videoTracks.values()) {
        if (pub.isSubscribed && pub instanceof RemoteTrackPublication) {
          pub.emitTrackUpdate();
        }
      }
    }
  }

  // /** @internal */
  emit<E extends keyof RoomEventCallbacks>(
    event: E,
    ...args: Parameters<RoomEventCallbacks[E]>
  ): boolean {
    log.debug('room event', event, ...args);
    return super.emit(event, ...args);
  }
}

export default Room;

export type RoomEventCallbacks = {
  reconnecting: () => void;
  reconnected: () => void;
  disconnected: () => void;
  stateChanged: (state: RoomState) => void;
  mediaDevicesChanged: () => void;
  participantConnected: (participant: RemoteParticipant) => void;
  participantDisconnected: (participant: RemoteParticipant) => void;
  trackPublished: (publication: RemoteTrackPublication, participant: RemoteParticipant) => void;
  trackSubscribed: (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ) => void;
  trackSubscriptionFailed: (trackSid: string, participant: RemoteParticipant) => void;
  trackUnpublished: (publication: RemoteTrackPublication, participant: RemoteParticipant) => void;
  trackUnsubscribed: (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ) => void;
  trackMuted: (publication: TrackPublication, participant: Participant) => void;
  trackUnmuted: (publication: TrackPublication, participant: Participant) => void;
  localTrackPublished: (publication: LocalTrackPublication, participant: LocalParticipant) => void;
  localTrackUnpublished: (
    publication: LocalTrackPublication,
    participant: LocalParticipant,
  ) => void;
  /**
   * @deprecated use [[participantMetadataChanged]] instead
   */
  metadataChanged: (
    metadata: string | undefined,
    participant?: RemoteParticipant | LocalParticipant,
  ) => void;
  participantMetadataChanged: (
    metadata: string | undefined,
    participant: RemoteParticipant | LocalParticipant,
  ) => void;
  participantPermissionsChanged: (
    prevPermissions: ParticipantPermission,
    participant: RemoteParticipant | LocalParticipant,
  ) => void;
  activeSpeakersChanged: (speakers: Array<Participant>) => void;
  roomMetadataChanged: (metadata: string) => void;
  dataReceived: (
    payload: Uint8Array,
    participant?: RemoteParticipant,
    kind?: DataPacket_Kind,
  ) => void;
  connectionQualityChanged: (quality: ConnectionQuality, participant: Participant) => void;
  mediaDevicesError: (error: Error) => void;
  trackStreamStateChanged: (
    publication: RemoteTrackPublication,
    streamState: Track.StreamState,
    participant: RemoteParticipant,
  ) => void;
  trackSubscriptionPermissionChanged: (
    publication: RemoteTrackPublication,
    status: TrackPublication.SubscriptionStatus,
    participant: RemoteParticipant,
  ) => void;
  audioPlaybackChanged: (playing: boolean) => void;
};
