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
    /** the participants who will receive the message, will be sent to every one if empty */
    destination?: RemoteParticipant[] | string[];
    /** the topic under which the message gets published */
    topic?: string;
};
export type LiveKitReactNativeInfo = {
    platform: 'ios' | 'android' | 'windows' | 'macos' | 'web' | 'native';
    devicePixelRatio: number;
};
export type SimulationScenario = 'signal-reconnect' | 'speaker' | 'node-failure' | 'server-leave' | 'migration' | 'resume-reconnect' | 'force-tcp' | 'force-tls' | 'full-reconnect' | 'subscriber-bandwidth';
//# sourceMappingURL=types.d.ts.map