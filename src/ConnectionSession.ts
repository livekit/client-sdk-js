import { type JoinRequest } from '@livekit/protocol';
import {
  SignalClient,
  type JoinedRoomMembership,
  type SignalOptions,
} from './api/SignalClient';
import type { LoggerOptions } from './room/types';

export class ConnectionSession {
  readonly signalClient: SignalClient;

  constructor(useJSON: boolean = false, loggerOptions: LoggerOptions = {}) {
    this.signalClient = new SignalClient(useJSON, loggerOptions);
  }

  async connect(
    url: string,
    token: string,
    options: SignalOptions,
    abortSignal?: AbortSignal,
  ): Promise<JoinedRoomMembership> {
    const joinResponse = await this.signalClient.join(url, token, options, abortSignal);
    return {
      joinResponse,
      membershipId: this.signalClient.defaultMembershipId ?? '',
    };
  }

  async joinRoom(token: string, joinRequest?: JoinRequest): Promise<JoinedRoomMembership> {
    return this.signalClient.joinRoom(token, joinRequest);
  }

  async close(reason?: string) {
    await this.signalClient.close(true, reason);
  }
}
