import { type Future } from "../../utils";
import { type DataTrackHandle } from "../handle";
import { type DataTrackInfo } from "../track";
import { type DataTrackPublishError, type DataTrackPublishErrorReason } from "./manager";

/** Options for publishing a data track. */
type DataTrackOptions = {
  name: string,
};

/** Client requested to publish a track. */
export type InputEventPublishRequest = {
  type: 'publishRequest';
  options: DataTrackOptions;
  signal?: AbortSignal;
};

/** Get information about all currently published tracks. */
export type InputEventQueryPublished = {
  type: 'queryPublished',
  // FIXME: use onehsot future vs sending corresponding "-Response" event?
  future: Future<Array<DataTrackInfo>, never>;
};

/** Client request to unpublish a track (internal). */
export type InputEventUnpublishRequest = { type: 'unpublishRequest', handle: DataTrackHandle };

/** SFU responded to a request to publish a data track. */
export type InputEventSfuPublishResponse = {
  type: 'sfuPublishResponse';
  handle: DataTrackHandle;
  result: (
    | { type: 'ok', data: DataTrackInfo }
    | { type: 'error', error: DataTrackPublishError<DataTrackPublishErrorReason.LimitReached> }
  );
};

/** SFU notification that a track has been unpublished. */
export type InputEventSfuUnPublishResponse = { type: 'sfuUnpublishResponse', handle: DataTrackHandle };

/** Shutdown the manager and all associated tracks. */
export type InputEventShutdown = { type: 'shutdown' };

// type InputEvent =
//   | InputEventPublishRequest
//   // FIXME: no cancelled event
//   // | { type: 'publishCancelled', handle: DataTrackHandle }
//   | InputEventQueryPublished
//   | InputEventUnpublishRequest
//   | InputEventSfuPublishResponse
//   | InputEventSfuUnPublishResponse
//   | InputEventShutdown;


/** Request sent to the SFU to publish a track. */
export type OutputEventSfuPublishRequest = {
  handle: DataTrackHandle;
  name: string;
  usesE2ee: boolean;
};

/** Request sent to the SFU to unpublish a track. */
export type OutputEventSfuUnpublishRequest = {
  handle: DataTrackHandle;
};

/** Serialized packets are ready to be sent over the transport. */
export type OutputEventPacketsAvailable = {
  bytes: Uint8Array;
  signal?: AbortSignal;
};

