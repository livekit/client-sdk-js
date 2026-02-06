import type { DataTrackHandle } from "./handle";

export type DataTrackSid = string;

/** Information about a published data track. */
export type DataTrackInfo = {
  sid: DataTrackSid,
  pubHandle: DataTrackHandle,
  name: String,
  usesE2ee: boolean,
};

