import type RemoteParticipant from './participant/RemoteParticipant';

export type SimulationOptions = {
  publish?: {
    audio?: boolean;
    video?: boolean;
    useRealTracks?: boolean;
  };
  participants?: {
    count?: number;
    aspectRatios?: Array<number>;
    audio?: boolean;
    video?: boolean;
  };
};

export type DataPublishOptions = {
  /** the participants who will receive the message */
  destination?: RemoteParticipant[] | string[];
  /** the topic under which the message gets published */
  topic?: string;
};
