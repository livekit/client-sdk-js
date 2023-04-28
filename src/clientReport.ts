import type Room from './room/Room';
import type { RoomEventCallbacks } from './room/Room';
import type { QualityLimitationReason } from './room/stats';
import type LocalTrackPublication from './room/track/LocalTrackPublication';
import type { TrackPublication } from './room/track/TrackPublication';

interface RTCSenderStats {
  qualityLimitationReason: QualityLimitationReason;
  qualityLimitationDurations: Record<QualityLimitationReason, number>;
}
interface RTCReceiverStats {}

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
  rtcStats: RTCReceiverStats;
  readyState: MediaStreamTrack['readyState'];
  permissionState: PermissionState;
  subscriptionState: TrackPublication.SubscriptionStatus;
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
export function createClientReporter(room: Room) {
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
        (room.localParticipant.getTracks() as LocalTrackPublication[]).map(async (pub) =>
          publicationToReport(pub),
        ),
      ),
    };
  };

  return { recordError, recordEvent };
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
