import {
  ConnectionState,
  LocalParticipant,
  LocalTrackPublication,
  Participant,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomConnectOptions,
  RoomEvent,
  RoomOptions,
  Track,
  VideoCodec,
  setLogLevel,
} from '../src/index';
import {
  PublishedVideoTrackStats,
  SubscribedAudioTrackStats,
  SubscribedVideoTrackStats,
  longTimeout,
  waitUntil,
} from './utils';

// import { getLogger } from './compat/getLogger';

export interface AgentConfig {
  url: string;
  token: string;
  container?: HTMLElement;
}

// helper class to connect and validate state
export class Agent {
  conf: AgentConfig;

  identity: string;

  name: string;

  room: Room;

  element?: HTMLElement;

  debugLogs: [string, Record<string, unknown>][] = [];

  get joinResponse() {
    return this.room.engine.latestJoinResponse;
  }

  get localParticipant(): LocalParticipant {
    return this.room.localParticipant;
  }

  constructor(
    conf: AgentConfig,
    identity: string,
    roomOptions: RoomOptions = {},
    participantName: string = '',
  ) {
    this.conf = conf;
    this.identity = identity;
    this.name = participantName;
    if (roomOptions.adaptiveStream === true) {
      // disable background video pause if adaptive stream is enabled
      roomOptions.adaptiveStream = { pauseVideoInBackground: false };
    }

    setLogLevel('debug');

    this.room = new Room(roomOptions);
    if (this.conf.container) {
      this.element = document.createElement('div');
      this.element.id = `agent-${identity}`;
      this.element.className = 'agent-area';
      this.element.innerHTML = `
        <h4>Agent ${identity}</h4>
        <div class="participants-area">
        </div>
      `;
      this.conf.container.appendChild(this.element);
    }

    this.room
      .on(RoomEvent.TrackSubscribed, this.handleTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, this.handleTrackUnsubscribed)
      .on(RoomEvent.TrackMuted, (_, participant) => this.renderParticipant(participant))
      .on(RoomEvent.TrackUnmuted, (_, participant) => this.renderParticipant(participant))
      .on(RoomEvent.ParticipantConnected, (p: Participant) => {
        this.renderParticipant(p);
      })
      .on(RoomEvent.ParticipantDisconnected, (p: Participant) => {
        this.renderParticipant(p, true);
      })
      .on(RoomEvent.LocalTrackPublished, () => {
        this.renderParticipant(this.localParticipant);
      })
      .on(RoomEvent.LocalTrackUnpublished, () => {
        this.renderParticipant(this.localParticipant);
      });
  }

  async join(options?: RoomConnectOptions) {
    await this.room.connect(this.conf.url, this.conf.token, options).catch((e) => {
      throw new Error(
        `agent ${this.identity} failed to connect to room on server ${this.conf.url}: ${e}`,
      );
    });
    this.renderParticipant(this.localParticipant);
    // render other participants in the room
    this.room.remoteParticipants.forEach((p) => {
      this.renderParticipant(p);
    });
  }

  // actions

  async leave() {
    // store the participants before leaving in order to make sure that we don't re-render them during disconnect due to some synthesized events like TrackUnsubscribed
    const participants = [
      this.room.localParticipant,
      ...Array.from(this.room.remoteParticipants.values()),
    ];
    await this.room.disconnect();
    // now remove all remote participants from the DOM
    participants.map((participant) => this.renderParticipant(participant, true));
  }

  async leaveAndRemove() {
    await this.leave();
    this.element?.remove();
  }

  getCameraTrack(publisher: string): RemoteTrackPublication {
    const remotePub = this.room.getParticipantByIdentity(publisher)!;
    const remoteCamPub = remotePub.getTrackPublication(
      Track.Source.Camera,
    ) as RemoteTrackPublication;
    if (!remoteCamPub) {
      throw new Error("could not find publisher's camera track");
    }
    return remoteCamPub;
  }

  async ensureTrackSubscribed(trackSid: string) {
    await waitUntil(() => {
      if (this.room.state !== ConnectionState.Connected) {
        return 'room is not connected';
      }
      for (const participant of this.room.remoteParticipants.values()) {
        const pub = participant.trackPublications.get(trackSid);
        if (pub && pub.isSubscribed) {
          return;
        }
      }
      return `Track ${trackSid} was not subscribed for ${this.room.localParticipant.identity}`;
    }, longTimeout);
  }

  async ensureTracksPublished(identity: string, ...sources: Track.Source[]) {
    await waitUntil(() => {
      const p = this.room.getParticipantByIdentity(identity);
      if (!p) {
        return `${this.room.localParticipant.identity}: remote participant ${identity} is not found`;
      }
      for (const s of sources) {
        const pub = p.getTrackPublication(s);
        if (!pub) {
          return `${this.room.localParticipant.identity}: could not find ${identity}'s ${s} track`;
        }
      }
    });
  }

  async ensureTracksSubscribed(identity: string, ...sources: Track.Source[]) {
    await waitUntil(() => {
      const p = this.room.getParticipantByIdentity(identity);
      if (!p) {
        return `${this.room.localParticipant.identity}: remote participant ${identity} is not found`;
      }
      for (const s of sources) {
        const pub = p.getTrackPublication(s);
        if (!pub) {
          return `${this.room.localParticipant.identity}: could not find ${identity}'s ${s} track`;
        }
        if (!pub.isSubscribed) {
          return `${this.room.localParticipant.identity}: not subscribed to ${identity}'s ${s} track`;
        }
      }
    });
  }

  async waitForTrackPublished(
    identity: string,
    source: Track.Source,
  ): Promise<RemoteTrackPublication> {
    let pub: RemoteTrackPublication | undefined;
    await waitUntil(() => {
      if (this.room.state !== ConnectionState.Connected) {
        return 'room is not connected';
      }
      const p = this.room.getParticipantByIdentity(identity);
      if (!p) {
        return `${this.room.localParticipant.identity}: participant ${identity} not found`;
      }
      pub = p.getTrackPublication(source) as RemoteTrackPublication;
      if (!pub) {
        return `${this.room.localParticipant.identity}: remote participant ${identity}'s ${source} track not found`;
      }
    }, longTimeout);
    return pub!;
  }

  async waitForVideoStats(
    trackSid: string,
    minFrames: number = 10,
    ssrcNotSameAs?: number,
    videoCodec?: VideoCodec,
    timeout = longTimeout,
  ): Promise<SubscribedVideoTrackStats> {
    let stats: SubscribedVideoTrackStats;
    const subString = `(subscriber ${this.identity})`;
    await waitUntil(async () => {
      try {
        stats = await this.getSubscribedVideoStats(trackSid);
        if (ssrcNotSameAs && stats.ssrc === ssrcNotSameAs) {
          return `${trackSid}: expected different ssrc to arrive, but got same ${subString}`;
        }
        if (videoCodec && !stats.mimeType?.includes(videoCodec.toUpperCase())) {
          return `${trackSid} expect ${videoCodec} but got ${stats.mimeType} ${subString}`;
        }
        if (stats.framesDecoded !== undefined) {
          if (stats.framesDecoded < minFrames) {
            return `${trackSid}: not enough frames decoded ${stats.framesDecoded}, expected at least ${minFrames} ${subString}`;
          }
          return;
        }
      } catch (e) {
        return `${trackSid}: Exception receiving video stats ${e} ${subString}`;
      }
      return `Video stats not received for ${trackSid} ${subString}`;
    }, timeout);
    // @ts-ignore
    return stats;
  }

  async waitForSomeVideoFrames(trackSid: string, ssrcNotSameAs?: number, videoCodec?: VideoCodec) {
    let numFrames: number | undefined;
    const subString = `(subscriber ${this.identity})`;
    await waitUntil(async () => {
      try {
        const stats = await this.getSubscribedVideoStats(trackSid);
        if (ssrcNotSameAs && stats.ssrc === ssrcNotSameAs) {
          return `${trackSid}: expected different ssrc to arrive, but got same ${subString}`;
        }
        if (videoCodec && !stats.mimeType?.includes(videoCodec.toUpperCase())) {
          return `${trackSid} expect ${videoCodec} but got ${stats.mimeType} ${subString}`;
        }
        if (stats.framesDecoded !== undefined) {
          if (numFrames === undefined) {
            numFrames = stats.framesDecoded;
            return `received initial frame, but no subsequent frames ${subString}`;
          }
          if (stats.framesDecoded <= numFrames) {
            return `${trackSid}: not enough frames decoded ${subString}, existing: ${numFrames}, now: ${stats.framesDecoded}`;
          }
          return;
        }
      } catch (e) {
        return `${trackSid}: Exception receiving video stats ${e} ${subString}`;
      }
      return `no frames received for ${trackSid} ${subString}`;
    }, longTimeout);
  }

  async waitForAudioStats(
    trackSid: string,
    minPackets: number = 10,
  ): Promise<SubscribedAudioTrackStats> {
    let stats: SubscribedAudioTrackStats;
    await waitUntil(async () => {
      try {
        stats = await this.getSubscribedAudioStats(trackSid);
        if (stats.packetsReceived && stats.packetsReceived > minPackets) {
          return;
        }
      } catch (e) {
        // ignore
      }
      return `Audio stats not received for ${trackSid}`;
    }, longTimeout);
    // @ts-ignore
    return stats;
  }

  async waitForSomeAudioPackets(trackSid: string) {
    let numPackets: number | undefined;
    const subString = `(subscriber ${this.identity})`;
    await waitUntil(async () => {
      try {
        const stats = await this.getSubscribedAudioStats(trackSid);
        if (stats.packetsReceived) {
          if (numPackets === undefined) {
            numPackets = stats.packetsReceived;
            return 'received initial packets';
          }
          if (stats.packetsReceived <= numPackets) {
            return `${trackSid}: not enough packets received`;
          }
          return;
        }
      } catch (e) {
        // ignore
      }
      return `no audio packets received for ${trackSid} ${subString}`;
    }, longTimeout);
  }

  async getSubscribedVideoStats(trackSid: string): Promise<SubscribedVideoTrackStats> {
    const pub = await this.getRemotePublicationBySid(trackSid);
    if (pub.kind !== Track.Kind.Video) {
      throw new Error(`Track is not a video track: ${pub.kind}`);
    }
    if (!pub.isSubscribed) {
      throw new Error(`Track not subscribed: ${trackSid}`);
    }
    const track = pub.track!;
    const stats = await track.receiver?.getStats();
    let result: SubscribedVideoTrackStats = {};
    let codecID = '';
    const codecs = new Map<string, any>();
    stats?.forEach((val) => {
      if (val.type === 'inbound-rtp') {
        codecID = val.codecId;
        // Firefox has incredibly limited stats, most of the stats aren't set:
        // https://developer.mozilla.org/en-US/docs/Web/API/RTCInboundRtpStreamStats
        result = val;
        if (val.framesDropped === undefined && result.framesDecoded && result.framesReceived) {
          result.framesDropped = result.framesReceived - result.framesDecoded;
        }
      } else if (val.type === 'codec') {
        codecs.set(val.id, val);
      }
    });
    if (result) {
      if (codecID !== '' && codecs.get(codecID)) {
        result.mimeType = codecs.get(codecID).mimeType;
      }
      return result;
    }
    throw new Error(`Could not get video stats for ${trackSid}`);
  }

  async getSubscribedAudioStats(trackSid: string): Promise<SubscribedAudioTrackStats> {
    const pub = await this.getRemotePublicationBySid(trackSid);
    if (pub.kind !== Track.Kind.Audio) {
      throw new Error(`Track is not a audio track: ${pub.kind}`);
    }
    if (!pub.isSubscribed) {
      throw new Error(`Track not subscribed: ${trackSid}`);
    }
    const track = pub.track!;
    const stats = await track.receiver?.getStats();
    let result: SubscribedAudioTrackStats = {};
    stats?.forEach((val) => {
      if (val.type !== 'inbound-rtp') {
        return;
      }
      // Firefox has incredibly limited stats, most of the stats aren't set:
      // https://developer.mozilla.org/en-US/docs/Web/API/RTCInboundRtpStreamStats
      result = {
        packetsReceived: val.packetsReceived,
        packetsLost: val.packetsLost,
        totalSamplesReceived: val.totalSamplesReceived,
        concealedSamples: val.concealedSamples,
        silentConcealedSamples: val.silentConcealedSamples,
        concealmentEvents: val.concealmentEvents,
        totalSamplesDuration: val.totalSamplesDuration,
        ssrc: val.ssrc,
      };
    });
    if (result) {
      return result;
    }
    throw new Error(`Could not get audio stats for ${trackSid}`);
  }

  async waitForPublishedVideoStats(
    trackSid: string,
    minFrames: number = 10,
    ssrcNotSameAs?: number,
    videoCodec?: VideoCodec,
    timeout = longTimeout,
  ): Promise<PublishedVideoTrackStats> {
    let stats: PublishedVideoTrackStats;
    const subString = `(publisher ${this.identity})`;
    await waitUntil(async () => {
      try {
        stats = await this.getPublishedVideoStats(trackSid);
        if (ssrcNotSameAs && stats.ssrc === ssrcNotSameAs) {
          return `${trackSid}: expected different ssrc to arrive, but got same ${subString}`;
        }
        if (videoCodec && !stats.mimeType?.includes(videoCodec.toUpperCase())) {
          return `${trackSid} expect ${videoCodec} but got ${stats.mimeType} ${subString}`;
        }
        if (stats.framesSent !== undefined) {
          if (stats.framesSent < minFrames) {
            return `${trackSid}: not enough frames sent ${stats.framesSent}, expected at least ${minFrames} ${subString}`;
          }
          return;
        }
      } catch (e) {
        return `${trackSid}: Exception receiving video stats ${e} ${subString}`;
      }
      return `Video stats not available for ${trackSid} ${subString}`;
    }, timeout);
    // @ts-ignore
    return stats;
  }

  async getPublishedVideoStats(trackSid: string): Promise<PublishedVideoTrackStats> {
    const pub = await this.getLocalPublicationBySid(trackSid);
    if (pub.kind !== Track.Kind.Video) {
      throw new Error(`Track is not a video track: ${pub.kind}`);
    }
    const track = pub.track!;
    const stats = await track.getRTCStatsReport();
    let result: PublishedVideoTrackStats = {};
    if (!stats) {
      return result;
    }

    let codecID = '';
    const codecs = new Map<string, any>();
    stats?.forEach((val) => {
      if (val.type === 'outbound-rtp') {
        codecID = val.codecId;
        result = {
          framesSent: val.framesSent,
          packetsSent: val.packetsSent,
          ssrc: val.ssrc,
        };
      } else if (val.type === 'codec') {
        codecs.set(val.id, val);
      }
    });
    if (result) {
      if (codecID !== '' && codecs.get(codecID)) {
        result.mimeType = codecs.get(codecID).mimeType;
      }
      return result;
    }
    throw new Error(`Could not get video stats for ${trackSid}`);
  }

  async getLocalPublicationBySid(trackSid: string): Promise<LocalTrackPublication> {
    this.ensureConnected();
    const pub = this.localParticipant.trackPublications.get(trackSid);
    if (!pub) {
      throw new Error(`Track not found: ${trackSid}`);
    }
    return pub;
  }

  async getRemotePublicationBySid(trackSid: string): Promise<RemoteTrackPublication> {
    this.ensureConnected();
    let pub: RemoteTrackPublication | undefined;
    for (const participant of this.room.remoteParticipants.values()) {
      pub = participant.trackPublications.get(trackSid);
      if (pub) {
        break;
      }
    }
    if (!pub) {
      throw new Error(`Track not found: ${trackSid}`);
    }
    return pub;
  }

  getParticipantByIdentity(identity: string): Participant | undefined {
    return this.room.getParticipantByIdentity(identity);
  }

  protected ensureConnected() {
    if (this.room.state !== ConnectionState.Connected) {
      throw new Error(`expected room to be connected, actual state: ${this.room.state}`);
    }
  }

  protected handleTrackSubscribed = (
    _track: RemoteTrack,
    _pub: RemoteTrackPublication,
    p: RemoteParticipant,
  ) => {
    this.renderParticipant(p);
  };

  protected handleTrackUnsubscribed = (_track: any, _pub: any, p: RemoteParticipant) => {
    this.renderParticipant(p);
  };

  protected renderParticipant(p: Participant, remove: boolean = false) {
    const participantsArea = this.element?.querySelector('.participants-area');

    if (!participantsArea) {
      return;
    }

    let div = participantsArea.querySelector(`#participant-${this.identity}-${p.identity}`);
    if (!div && !remove) {
      div = document.createElement('div');
      div.id = `participant-${this.identity}-${p.identity}`;
      div.className = 'participant';
      div.innerHTML = `
        <video id="video-${this.identity}-${p.identity}" muted></video>
        <div class="info-bar">
          <div class="name">
          </div>
          <div class="right">
            <span id="codec-${this.identity}-${p.identity}" class="codec">
            </span>
            <span id="size-${this.identity}-${p.identity}" class="size">
            </span>
            <span id="bitrate-${this.identity}-${p.identity}" class="bitrate">
            </span>
          </div>
        </div>`;
      participantsArea.appendChild(div);
    }

    const videoElm = <HTMLVideoElement>div?.querySelector(`#video-${this.identity}-${p.identity}`);
    if (remove || !div) {
      if (videoElm) {
        videoElm.srcObject = null;
        videoElm.src = '';
      }
      div?.remove();
      return;
    }

    div.querySelector('.name')!.textContent = p.identity;
    const cameraPub = p.getTrackPublication(Track.Source.Camera);
    const cameraEnabled = cameraPub?.isSubscribed && !cameraPub.isMuted;
    if (cameraEnabled) {
      cameraPub.videoTrack?.attach(videoElm);
      if (p instanceof LocalParticipant) {
        // flip
        videoElm.style.transform = 'scale(-1, 1)';
      }
    } else if (cameraPub?.videoTrack) {
      // detach manually whenever possible
      cameraPub.videoTrack?.detach(videoElm);
    } else {
      videoElm.src = '';
      videoElm.srcObject = null;
    }
  }
}
