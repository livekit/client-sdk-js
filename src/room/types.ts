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
  /**
   * whether to send this as reliable or lossy.
   * For data that you need delivery guarantee (such as chat messages), use Reliable.
   * For data that should arrive as quickly as possible, but you are ok with dropped
   * packets, use Lossy.
   */
  reliable?: boolean;
  /**
   * the identities of participants who will receive the message, will be sent to every one if empty
   */
  destinationIdentities?: string[];
  /** the topic under which the message gets published */
  topic?: string;
};

export type LiveKitReactNativeInfo = {
  // Corresponds to RN's PlatformOSType
  platform: 'ios' | 'android' | 'windows' | 'macos' | 'web' | 'native';
  devicePixelRatio: number;
};

export type SimulationScenario =
  | 'signal-reconnect'
  | 'speaker'
  | 'node-failure'
  | 'server-leave'
  | 'migration'
  | 'resume-reconnect'
  | 'force-tcp'
  | 'force-tls'
  | 'full-reconnect'
  // overrides server-side bandwidth estimator with set bandwidth
  // this can be used to test application behavior when congested or
  // to disable congestion control entirely (by setting bandwidth to 100Mbps)
  | 'subscriber-bandwidth'
  | 'disconnect-signal-on-resume'
  | 'disconnect-signal-on-resume-no-messages'
  // instructs the server to send a full reconnect reconnect action to the client
  | 'leave-full-reconnect';

export type LoggerOptions = {
  loggerName?: string;
  loggerContextCb?: () => Record<string, unknown>;
};

export interface TranscriptionSegment {
  id: string;
  text: string;
  language: string;
  startTime: number;
  endTime: number;
  final: boolean;
  firstReceivedTime: number;
  lastReceivedTime: number;
}

export interface ChatMessage {
  id: string;
  timestamp: number;
  message: string;
  editTimestamp?: number;
}
