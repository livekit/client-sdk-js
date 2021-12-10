import { WSSignalClient } from '../api/SignalClient';
import RTCEngine from '../room/RTCEngine';

jest.mock('../api/SignalClient');
jest.mock('../room/RTCEngine');

// mock helpers for testing

const mocks = {
  SignalClient: WSSignalClient as jest.MockedClass<typeof WSSignalClient>,
  RTCEngine: RTCEngine as jest.MockedClass<typeof RTCEngine>,
  MockLocalVideoTrack: {
    stop: jest.fn(),
  },
};

export default mocks;
