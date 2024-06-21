import { ParticipantInfo, ParticipantInfo_Kind } from '@livekit/protocol';
import type { SignalClient } from '../../api/SignalClient';
import type { LoggerOptions } from '../types';
import RemoteParticipant from './RemoteParticipant';

export default class Agent extends RemoteParticipant {
  constructor(
    signalClient: SignalClient,
    sid: string,
    identity: string | undefined,
    name: string | undefined,
    metadata: string | undefined,
    loggerOptions?: LoggerOptions,
  ) {
    super(signalClient, sid, identity, name, metadata, loggerOptions, ParticipantInfo_Kind.AGENT);
  }

  /** @internal */
  static fromParticipantInfo(
    signalClient: SignalClient,
    pi: ParticipantInfo,
    loggerOptions: LoggerOptions,
  ): Agent {
    return new Agent(signalClient, pi.sid, pi.identity, pi.name, pi.metadata, loggerOptions);
  }
}
