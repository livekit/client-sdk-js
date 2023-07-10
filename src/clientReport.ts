import type Room from './room/Room';
import type { RoomEventCallbacks } from './room/Room';
import type { QualityLimitationReason } from './room/stats';
import type LocalTrackPublication from './room/track/LocalTrackPublication';
import type RemoteTrackPublication from './room/track/RemoteTrackPublication';
import type { TrackPublication } from './room/track/TrackPublication';

interface RTCSenderStats {
  qualityLimitationReason: QualityLimitationReason;
  qualityLimitationDurations: Record<QualityLimitationReason, number>;
}
interface RTCReceiverStats {
  jitter?: number;
  freezeCount?: number;
  totalFreezeDuration?: number;
}

interface EventReport {
  type: keyof RoomEventCallbacks;
  reason?: string;
  timestamp: number;
}

interface PublicationReport {
  sid: string;
  rtcStats: RTCSenderStats[];
  readyState: MediaStreamTrack['readyState'];
  label: MediaStreamTrack['label'];
  muted: LocalTrackPublication['isMuted'];
}

interface SubscriptionReport {
  sid: string;
  rtcStats: RTCReceiverStats;
  readyState?: MediaStreamTrack['readyState'];
  permissionStatus: TrackPublication.PermissionStatus;
  subscriptionStatus: TrackPublication.SubscriptionStatus;
}

interface ApiError {
  code: number;
  timestamp: number;
}

interface DeviceInfo {
  ua: string;
  concurrency?: number;
}

interface ClientReport {
  publications: PublicationReport[];
  subscriptions: SubscriptionReport[];
  events: EventReport[];
  errors: ApiError[];
  deviceInfo: DeviceInfo;
}

type WithoutTimestamp<T> = Omit<T, 'timestamp'>;

/**
 * @internal
 */
export function createWebClientReporter(room: Room) {
  const errors: ApiError[] = [];
  const events: EventReport[] = [];
  const recordError = (error: WithoutTimestamp<ApiError>) => {
    errors.push({ ...error, timestamp: Date.now() });
  };
  const recordEvent = (event: WithoutTimestamp<EventReport>) => {
    events.push({ ...event, timestamp: Date.now() });
  };

  const createReport = async () => {
    const report: ClientReport = {
      publications: await Promise.all(
        (room.localParticipant.getTracks() as LocalTrackPublication[]).map(publicationToReport),
      ),
      subscriptions: await Promise.all(
        Array.from(room.participants.values()).reduce((acc, p) => {
          acc.push(...(p.getTracks() as RemoteTrackPublication[]).map(subscriptionToReport));
          return acc;
        }, [] as Promise<SubscriptionReport>[]),
      ),
      events,
      errors,
      deviceInfo: {
        ua: navigator.userAgent,
        concurrency: navigator.hardwareConcurrency,
      },
    };

    return report;
  };

  return { recordError, recordEvent, createReport };
}

async function publicationToReport(pub: LocalTrackPublication) {
  if (!pub.track) {
    throw Error('expected track to be present on local publication');
  }
  const senderStats = await pub.track.getSenderStats();
  let rtcStats: RTCSenderStats[] = [];
  if (Array.isArray(senderStats)) {
    rtcStats = senderStats.map(({ qualityLimitationReason, qualityLimitationDurations }) => {
      return { qualityLimitationDurations, qualityLimitationReason };
    });
  }
  return {
    sid: pub.trackSid,
    readyState: pub.track.mediaStreamTrack.readyState,
    label: pub.track.mediaStreamTrack.readyState,
    muted: pub.track.isMuted,
    rtcStats,
  } satisfies PublicationReport;
}

async function subscriptionToReport(pub: RemoteTrackPublication) {
  const senderStats = await pub.track?.getReceiverStats();
  let rtcStats: RTCReceiverStats = {};
  if (senderStats !== undefined) {
    rtcStats = { jitter: senderStats.jitter };
    if (senderStats.type === 'video') {
      rtcStats = {
        ...rtcStats,
        freezeCount: senderStats.freezeCount,
        totalFreezeDuration: senderStats.totalFreezeDuration,
      };
    }
  }
  return {
    sid: pub.trackSid,
    readyState: pub.track?.mediaStreamTrack.readyState,
    permissionStatus: pub.permissionStatus,
    subscriptionStatus: pub.subscriptionStatus,
    rtcStats,
  } satisfies SubscriptionReport;
}
