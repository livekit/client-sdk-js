export type SimulationOptions = {
  publish?: {
    audio?: boolean;
    video?: boolean;
  };
  participants?: {
    count?: number;
    aspectRatios?: Array<number>;
    audio?: boolean;
    video?: boolean;
  };
};
