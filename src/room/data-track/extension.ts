import {
  type DataTrackInfo as DataTrackInfoProto,
  Encryption_Type,
  PublishDataTrackResponse,
  RequestResponse_Reason,
} from '@livekit/protocol';
import type { CoreRoom } from '../CoreRoom';
import { EngineEvent, RoomEvent } from '../events';
import type { ExtensionContext, ExtensionResult, RoomExtension } from '../extensions';
import LocalDataTrack from './LocalDataTrack';
import RemoteDataTrack from './RemoteDataTrack';
import IncomingDataTrackManager from './incoming/IncomingDataTrackManager';
import OutgoingDataTrackManager from './outgoing/OutgoingDataTrackManager';
import { DataTrackPublishError } from './outgoing/errors';
import type { DataTrackOptions } from './outgoing/types';
import { DataTrackInfo } from './types';

/** Methods the `dataTracks` extension adds to the local participant. */
export interface DataTrackLocalApi {
  /** Publishes a data track.
   *
   * Returns the published data track if successful. Use {@link LocalDataTrack#tryPush}
   * to send data frames on the track.
   */
  publishDataTrack(options: DataTrackOptions): Promise<LocalDataTrack>;
}

const toInfos = (protos: DataTrackInfoProto[]) => protos.map((proto) => DataTrackInfo.from(proto));

/**
 * Data tracks: continuous unreliable streams for real-time data (`publishDataTrack`,
 * `RemoteParticipant.dataTracks`, `RoomEvent.DataTrackPublished`).
 */
export const dataTracks = {
  key: Symbol('dataTracks'),
  install(
    room: CoreRoom,
    ctx: ExtensionContext,
  ): ExtensionResult<{}, DataTrackLocalApi> & {
    incoming: IncomingDataTrackManager;
    outgoing: OutgoingDataTrackManager;
  } {
    const incoming = new IncomingDataTrackManager({ e2eeManager: ctx.getE2eeManager() });
    const outgoing = new OutgoingDataTrackManager({ e2eeManager: ctx.getE2eeManager() });
    ctx.onE2eeManagerChanged((manager) => {
      incoming.updateE2eeManager(manager);
      outgoing.updateE2eeManager(manager);
    });

    incoming
      .on('sfuUpdateSubscription', (event) => {
        room.engine.client.sendUpdateDataSubscription(event.sid, event.subscribe);
      })
      .on('trackPublished', (event) => {
        if (event.track.publisherIdentity === room.localParticipant.identity) {
          // Only advertize tracks from other participants
          return;
        }
        room.emit(RoomEvent.DataTrackPublished, event.track);
        room.remoteParticipants.get(event.track.publisherIdentity)?.addRemoteDataTrack(event.track);
      })
      .on('trackUnpublished', (event) => {
        if (event.publisherIdentity === room.localParticipant.identity) {
          // Only advertize tracks from other participants
          return;
        }
        room.emit(RoomEvent.DataTrackUnpublished, event.sid);
        room.remoteParticipants.get(event.publisherIdentity)?.removeRemoteDataTrack(event.sid);
      });

    outgoing
      .on('sfuPublishRequest', (event) => {
        room.engine.client.sendPublishDataTrackRequest(event.handle, event.name, event.usesE2ee);
      })
      .on('sfuUnpublishRequest', (event) => {
        room.engine.client.sendUnPublishDataTrackRequest(event.handle);
      })
      .on('trackPublished', (event) => {
        room.emit(RoomEvent.LocalDataTrackPublished, event.track);
      })
      .on('trackUnpublished', (event) => {
        room.emit(RoomEvent.LocalDataTrackUnpublished, event.sid);
      })
      .on('packetAvailable', ({ handle, bytes }) => {
        room.engine
          .sendDataTrackFrame(bytes)
          .finally(() => outgoing.handlePacketSendComplete(handle));
      });

    ctx.onEngineCreated((engine) => {
      engine
        .on(EngineEvent.PublishDataTrackResponse, (event) => {
          if (!event.info) {
            ctx.log.warn(
              `received PublishDataTrackResponse, but event.info was ${event.info}, so skipping.`,
            );
            return;
          }
          outgoing.receivedSfuPublishResponse(event.info.pubHandle, {
            type: 'ok',
            data: {
              sid: event.info.sid,
              pubHandle: event.info.pubHandle,
              name: event.info.name,
              usesE2ee: event.info.encryption !== Encryption_Type.NONE,
            },
          });
        })
        .on(EngineEvent.UnPublishDataTrackResponse, (event) => {
          if (!event.info) {
            ctx.log.warn(
              `received UnPublishDataTrackResponse, but event.info was ${event.info}, so skipping.`,
            );
            return;
          }
          outgoing.receivedSfuUnpublishResponse(event.info.pubHandle);
        })
        .on(EngineEvent.DataTrackSubscriberHandles, (event) => {
          const handleToSidMapping = new Map(
            Object.entries(event.subHandles).map(([key, value]) => {
              return [parseInt(key, 10), value.trackSid];
            }),
          );
          incoming.receivedSfuSubscriberHandles(handleToSidMapping);
        })
        .on(EngineEvent.DataTrackPacketReceived, (packetBytes) => {
          try {
            incoming.packetReceived(packetBytes);
          } catch (err) {
            // NOTE: wrapping in the bare try/catch like this means that the Throws<...> type doesn't
            // propagate upwards into the public interface.
            throw err;
          }
        })
        .on(EngineEvent.Joined, (joinResponse) => {
          incoming.receiveSfuPublicationUpdates(
            new Map(
              joinResponse.otherParticipants.map((participant) => [
                participant.identity,
                toInfos(participant.dataTracks),
              ]),
            ),
          );
        })
        .on(EngineEvent.Restarted, () => {
          outgoing.sfuWillRepublishTracks();
          incoming.resendSubscriptionUpdates();
        })
        .on(EngineEvent.SignalRequestResponse, (response) => {
          if (response.request.case !== 'publishDataTrack') {
            return;
          }
          let error;
          switch (response.reason) {
            case RequestResponse_Reason.NOT_ALLOWED:
              error = DataTrackPublishError.notAllowed(response.message);
              break;
            case RequestResponse_Reason.DUPLICATE_NAME:
              error = DataTrackPublishError.duplicateName(response.message);
              break;
            case RequestResponse_Reason.INVALID_NAME:
              error = DataTrackPublishError.invalidName(response.message);
              break;
            case RequestResponse_Reason.LIMIT_EXCEEDED:
              error = DataTrackPublishError.limitReached(response.message);
              break;
            default:
              error = DataTrackPublishError.unknown(response.reason, response.message);
              break;
          }
          outgoing.receivedSfuPublishResponse(response.request.value.pubHandle, {
            type: 'error',
            error,
          });
        });
    });

    ctx.onDisconnect(() => {
      incoming.reset();
      outgoing.reset();
    });
    ctx.onParticipantCreated((participant, info) => {
      for (const proto of info.dataTracks) {
        participant.addRemoteDataTrack(
          new RemoteDataTrack(DataTrackInfo.from(proto), incoming, {
            publisherIdentity: info.identity,
          }),
        );
      }
    });
    ctx.onParticipantUpdates((infos) => {
      incoming.receiveSfuPublicationUpdates(
        new Map(
          infos
            .filter((info) => info.identity !== room.localParticipant.identity)
            .map((info) => [info.identity, toInfos(info.dataTracks)]),
        ),
      );
    });
    ctx.onSyncState(() =>
      outgoing
        .queryPublished()
        .map((info) => new PublishDataTrackResponse({ info: DataTrackInfo.toProtobuf(info) })),
    );
    room.on(RoomEvent.ParticipantDisconnected, (participant) =>
      incoming.handleRemoteParticipantDisconnected(participant.identity),
    );

    return {
      incoming,
      outgoing,
      local: {
        publishDataTrack: async (options) => {
          const track = new LocalDataTrack(options, outgoing);
          await track.publish();
          return track;
        },
      },
    };
  },
} satisfies RoomExtension<{}, DataTrackLocalApi>;
