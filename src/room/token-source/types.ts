import type { RoomConfiguration } from '@livekit/protocol';

export interface TokenResponse {
  serverUrl: string;
  participantToken: string;
}

export interface TokenOptions {
  identity?: string;
  metadata?: string;
  attributes?: Record<string, string>;
  roomConfig?: RoomConfiguration;
}

export type TokenSourceOrCallback =
  | ITokenSource
  | (() => PromiseLike<TokenResponse> | TokenResponse);

export interface ITokenSource {
  getToken(): Promise<TokenResponse>;
}

export interface IStandardTokenSource extends ITokenSource {
  setTokenOptions(options: TokenOptions): void;
}

export interface ITokenSourceInternal {}

export type EndpointOptions = Omit<RequestInit, 'body'>;

export type TokenPayload = {
  identity?: string;
  name?: string;
  metadata?: string;
  attributes?: Record<string, string>;
  roomConfig?: RoomConfiguration;
  video?: {
    room?: string;
    roomJoin?: boolean;
    canPublish?: boolean;
    canPublishData?: boolean;
    canSubscribe?: boolean;
  };
  exp?: number;
};
