// eslint-disable-next-line import/no-extraneous-dependencies
import { MockedClass, vi } from 'vitest';
import { SignalClient } from '../api/SignalClient';
import RTCEngine from '../room/RTCEngine';

vi.mock('../api/SignalClient');
vi.mock('../room/RTCEngine');

// mock helpers for testing

const mocks = {
  SignalClient: SignalClient as MockedClass<typeof SignalClient>,
  RTCEngine: RTCEngine as MockedClass<typeof RTCEngine>,
  MockLocalVideoTrack: {
    stop: vi.fn(),
  },
};

export default mocks;
