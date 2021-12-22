import { SignalClient } from '../api/SignalClient';
import RTCEngine from '../room/RTCEngine';

jest.mock('../api/SignalClient');
jest.mock('../room/RTCEngine');

// mock helpers for testing

const mocks = {
  SignalClient: SignalClient as jest.MockedClass<typeof SignalClient>,
  RTCEngine: RTCEngine as jest.MockedClass<typeof RTCEngine>,
  MockLocalVideoTrack: {
    stop: jest.fn(),
  },
};

export default mocks;
