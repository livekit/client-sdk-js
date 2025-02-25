import type { MockedClass } from 'vitest';
import { SignalClient } from '../api/SignalClient';
import RTCEngine from '../room/RTCEngine';
declare const mocks: {
    SignalClient: MockedClass<typeof SignalClient>;
    RTCEngine: MockedClass<typeof RTCEngine>;
    MockLocalVideoTrack: {
        stop: () => void;
    };
};
export default mocks;
//# sourceMappingURL=mocks.d.ts.map
