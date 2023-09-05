import { MockedClass } from 'vitest';
import { SignalClient } from '../api/SignalClient';
import RTCEngine from '../room/RTCEngine';
declare const mocks: {
    SignalClient: MockedClass<typeof SignalClient>;
    RTCEngine: MockedClass<typeof RTCEngine>;
    MockLocalVideoTrack: {
        stop: import("@vitest/spy").Mock<any, any>;
    };
};
export default mocks;
//# sourceMappingURL=mocks.d.ts.map