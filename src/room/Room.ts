import { EventEmitter } from 'events';
import log from '../logger';
import { RoomConnectOptions, RoomOptions } from '../options';
import {
  DataPacket_Kind, ParticipantInfo,
  ParticipantInfo_State, Room as RoomModel, SpeakerInfo, UserPacket,
} from '../proto/livekit_models';
import { ConnectionQualityUpdate } from '../proto/livekit_rtc';
import DeviceManager from './DeviceManager';
import { ConnectionError, UnsupportedServer } from './errors';
import {
  EngineEvent, ParticipantEvent, RoomEvent, TrackEvent,
} from './events';
import LocalParticipant from './participant/LocalParticipant';
import Participant, { ConnectionQuality } from './participant/Participant';
import RemoteParticipant from './participant/RemoteParticipant';
import RTCEngine, { maxICEConnectTimeout } from './RTCEngine';
import LocalTrackPublication from './track/LocalTrackPublication';
import {
  AudioCaptureOptions,
  AudioPresets,
  ScreenSharePresets,
  TrackPublishDefaults,
  VideoCaptureOptions,
  VideoPresets,
} from './track/options';
import RemoteTrackPublication from './track/RemoteTrackPublication';
import { Track } from './track/Track';
import TrackPublication from './track/TrackPublication';
import { RemoteTrack } from './track/types';
import { unpackStreamId } from './utils';
import { toProtoSessionDescription } from '../api/SignalClient';

export enum RoomState {
  Disconnected = 'disconnected',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
}

const publishDefaults: TrackPublishDefaults = {
  audioBitrate: AudioPresets.speech.maxBitrate,
  dtx: true,
  simulcast: true,
  screenShareEncoding: ScreenSharePresets.hd_15.encoding,
  stopMicTrackOnMute: false,
};

const audioDefaults: AudioCaptureOptions = {
  autoGainControl: true,
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
};

const videoDefaults: VideoCaptureOptions = {
  resolution: VideoPresets.qhd.resolution,
};

/**
 * In LiveKit, a room is the logical grouping for a list of participants.
 * Participants in a room can publish tracks, and subscribe to others' tracks.
 *
 * a Room fires [[RoomEvent | RoomEvents]].
 *
 * @noInheritDoc
 */
class Room extends EventEmitter {
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
  connOptions?: RoomConnectOptions;

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

    this.localParticipant = new LocalParticipant(
      '', '', this.engine, this.options,
    );
  }

  private createEngine() {
    if (this.engine) {
      return;
    }

    this.engine = new RTCEngine();
    this.engine.on(
      EngineEvent.MediaTrackAdded,
      (
        mediaTrack: MediaStreamTrack,
        stream: MediaStream,
        receiver?: RTCRtpReceiver,
      ) => {
        this.onTrackAdded(mediaTrack, stream, receiver);
      },
    );

    this.engine.on(EngineEvent.Disconnected, () => {
      this.handleDisconnect();
    });

    this.engine.on(
      EngineEvent.ParticipantUpdate,
      (participants: ParticipantInfo[]) => {
        this.handleParticipantUpdates(participants);
      },
    );

    this.engine.on(EngineEvent.RoomUpdate, this.handleRoomUpdate);
    this.engine.on(EngineEvent.ActiveSpeakersUpdate, this.handleActiveSpeakersUpdate);
    this.engine.on(EngineEvent.SpeakersChanged, this.handleSpeakersChanged);
    this.engine.on(EngineEvent.DataPacketReceived, this.handleDataPacket);

    this.engine.on(EngineEvent.Reconnecting, () => {
      this.state = RoomState.Reconnecting;
      this.emit(RoomEvent.Reconnecting);
    });

    this.engine.on(EngineEvent.Reconnected, () => {
      this.state = RoomState.Connected;
      this.emit(RoomEvent.Reconnected);
    });

    this.engine.on(EngineEvent.SignalConnected, () => {
      if (this.state == RoomState.Reconnecting) {
        this.sendSyncState()
      }
    });

    this.engine.on(EngineEvent.ConnectionQualityUpdate, this.handleConnectionQualityUpdate);
  }

  /**
   * getLocalDevices abstracts navigator.mediaDevices.enumerateDevices.
   * In particular, it handles Chrome's unique behavior of creating `default`
   * devices. When encountered, it'll be removed from the list of devices.
   * The actual default device will be placed at top.
   * @param kind
   * @returns a list of available local devices
   */
  static getLocalDevices(kind: MediaDeviceKind): Promise<MediaDeviceInfo[]> {
    return DeviceManager.getInstance().getDevices(kind);
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

    this.connOptions = opts

    try {
      const joinResponse = await this.engine.join(url, token, opts);
      log.debug('connected to Livekit Server', joinResponse.serverVersion);

      if (!joinResponse.serverVersion) {
        throw new UnsupportedServer('unknown server version');
      }

      this.state = RoomState.Connected;
      const pi = joinResponse.participant!;
      this.localParticipant = new LocalParticipant(
        pi.sid,
        pi.identity,
        this.engine,
        this.options,
      );

      this.localParticipant.updateInfo(pi);
      // forward metadata changed for the local participant
      this.localParticipant
        .on(ParticipantEvent.MetadataChanged, (metadata: object) => {
          this.emit(RoomEvent.MetadataChanged, metadata, this.localParticipant);
        })
        .on(ParticipantEvent.ParticipantMetadataChanged, (metadata: object) => {
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
        });

      // populate remote participants, these should not trigger new events
      joinResponse.otherParticipants.forEach((info) => {
        this.getOrCreateParticipant(info.sid, info);
      });

      this.name = joinResponse.room!.name;
      this.sid = joinResponse.room!.sid;
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
        window.addEventListener('beforeunload', this.onBeforeUnload);
        navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange);

        resolve(this);
      });
    });
  };

  /**
   * disconnects the room, emits [[RoomEvent.Disconnected]]
   */
  disconnect = (stopTracks = true) => {
    // send leave
    this.engine.client.sendLeave();
    this.engine.close();
    this.handleDisconnect(stopTracks);
    /* @ts-ignore */
    this.engine = undefined;
  };

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
      const tracks = Array
        .from(this.localParticipant.audioTracks.values())
        .filter((track) => track.source === Track.Source.Microphone);
      await Promise.all(tracks.map((t) => t.audioTrack?.setDeviceId(deviceId)));
      this.options.audioCaptureDefaults!.deviceId = deviceId;
    } else if (kind === 'videoinput') {
      const tracks = Array
        .from(this.localParticipant.videoTracks.values())
        .filter((track) => track.source === Track.Source.Camera);
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

      await Promise.all(elements.map(async (e) => {
        if ('setSinkId' in e) {
          /* @ts-ignore */
          await e.setSinkId(deviceId);
        }
      }));
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
    participant.addSubscribedMediaTrack(
      mediaTrack,
      trackId,
      receiver,
      this.options.autoManageVideo,
    );
  }

  private handleDisconnect(shouldStopTracks = true) {
    if (this.state === RoomState.Disconnected) {
      return;
    }
    this.participants.forEach((p) => {
      p.tracks.forEach((pub) => {
        p.unpublishTrack(pub.trackSid);
      });
    });
    if (shouldStopTracks) {
      this.localParticipant.tracks.forEach((pub) => {
        pub.track?.detach();
        pub.track?.stop();
      });
    }
    this.participants.clear();
    this.activeSpeakers = [];
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = undefined;
    }
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    navigator.mediaDevices.removeEventListener('devicechange', this.handleDeviceChange);
    this.state = RoomState.Disconnected;
    this.emit(RoomEvent.Disconnected);
  }

  private handleParticipantUpdates(participantInfos: ParticipantInfo[]) {
    // handle changes to participant state, and send events
    participantInfos.forEach((info) => {
      if (info.sid === this.localParticipant.sid) {
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
  }

  private handleParticipantDisconnected(
    sid: string,
    participant?: RemoteParticipant,
  ) {
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

  private handleDataPacket = (
    userPacket: UserPacket,
    kind: DataPacket_Kind,
  ) => {
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
    // @ts-ignore
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      this.audioContext = new AudioContext();
    }
  }

  private getOrCreateParticipant(
    id: string,
    info?: ParticipantInfo,
  ): RemoteParticipant {
    let participant = this.participants.get(id);
    if (!participant) {
      // it's possible for the RTC track to arrive before signaling data
      // when this happens, we'll create the participant and make the track work
      if (info) {
        participant = RemoteParticipant.fromParticipantInfo(
          this.engine.client,
          info,
        );
      } else {
        participant = new RemoteParticipant(this.engine.client, id, '');
      }
      this.participants.set(id, participant);
      // also forward events

      // trackPublished is only fired for tracks added after both local participant
      // and remote participant joined the room
      participant
        .on(ParticipantEvent.TrackPublished, (trackPublication: RemoteTrackPublication) => {
          this.emit(RoomEvent.TrackPublished, trackPublication, participant);
        })
        .on(ParticipantEvent.TrackSubscribed,
          (track: RemoteTrack, publication: RemoteTrackPublication) => {
          // monitor playback status
            if (track.kind === Track.Kind.Audio) {
              track.on(TrackEvent.AudioPlaybackStarted, this.handleAudioPlaybackStarted);
              track.on(TrackEvent.AudioPlaybackFailed, this.handleAudioPlaybackFailed);
            }
            this.emit(RoomEvent.TrackSubscribed, track, publication, participant);
          })
        .on(ParticipantEvent.TrackUnpublished, (publication: RemoteTrackPublication) => {
          this.emit(RoomEvent.TrackUnpublished, publication, participant);
        })
        .on(ParticipantEvent.TrackUnsubscribed,
          (track: RemoteTrack, publication: RemoteTrackPublication) => {
            this.emit(RoomEvent.TrackUnsubscribed, track, publication, participant);
          })
        .on(ParticipantEvent.TrackSubscriptionFailed, (sid: string) => {
          this.emit(RoomEvent.TrackSubscriptionFailed, sid, participant);
        })
        .on(ParticipantEvent.TrackMuted, (pub: TrackPublication) => {
          this.emit(RoomEvent.TrackMuted, pub, participant);
        })
        .on(ParticipantEvent.TrackUnmuted, (pub: TrackPublication) => {
          this.emit(RoomEvent.TrackUnmuted, pub, participant);
        })
        .on(ParticipantEvent.MetadataChanged, (metadata: any) => {
          this.emit(RoomEvent.MetadataChanged, metadata, participant);
        })
        .on(ParticipantEvent.ParticipantMetadataChanged, (metadata: any) => {
          this.emit(RoomEvent.ParticipantMetadataChanged, metadata, participant);
        })
        .on(ParticipantEvent.ConnectionQualityChanged, (quality: ConnectionQuality) => {
          this.emit(RoomEvent.ConnectionQualityChanged, quality, participant);
        });
    }
    return participant;
  }

  private sendSyncState() {
    if (this.engine.subscriber == undefined || this.engine.subscriber.pc.localDescription == null) {
      return
    }
    // this.engine.subscriber.onOffer = (offer) => {
      // in case of auto subscribe, send unsubscribe state
      // else send subscribe state
      const previousSdp = this.engine.subscriber.pc.localDescription
      const sendUnsub = this.connOptions?.autoSubscribe || false
      const trackSids = new Array<string>()
      this.participants.forEach(participant => {
        participant.tracks.forEach(track => {
          if (track.isSubscribed != sendUnsub) {
            trackSids.push(track.trackSid)
          }
        })
      });

      this.engine.client.sendSyncState({
        offer: toProtoSessionDescription({
          sdp: previousSdp.sdp,
          type: previousSdp.type,
        }),
        subscription: {
          trackSids: trackSids,
          subscribe: !sendUnsub,
          participantTracks: [],
        },
        publishTracks: this.localParticipant.publishedTracksInfo(),
      })
    // }
    // this.engine.subscriber.createAndSendOffer({iceRestart: true})
  }

  /** @internal */
  emit(event: string | symbol, ...args: any[]): boolean {
    log.debug('room event', event, ...args);
    return super.emit(event, ...args);
  }
}

export default Room;
