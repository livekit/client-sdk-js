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
    platform: 'ios' | 'android' | 'windows' | 'macos' | 'web' | 'native';
    devicePixelRatio: number;
};
export type SimulationScenario = 'signal-reconnect' | 'speaker' | 'node-failure' | 'server-leave' | 'migration' | 'resume-reconnect' | 'force-tcp' | 'force-tls' | 'full-reconnect' | 'subscriber-bandwidth' | 'disconnect-signal-on-resume' | 'disconnect-signal-on-resume-no-messages';
export type LoggerOptions = {
    loggerName?: string;
    loggerContextCb?: () => Record<string, unknown>;
};
//# sourceMappingURL=types.d.ts.map