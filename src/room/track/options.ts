export interface LocalTrackOptions {
  name?: string;
}

export interface LocalDataTrackOptions extends LocalTrackOptions {
  maxPacketLifeTime?: number;
  maxRetransmits?: number;
  ordered?: boolean;
}
