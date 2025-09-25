import { RoomConfiguration } from '@livekit/protocol';
import { decodeJwt } from 'jose';
import type { TokenOptions, TokenPayload, TokenResponse } from './types';

export const ONE_SECOND_IN_MILLISECONDS = 1000;
export const ONE_MINUTE_IN_MILLISECONDS = 60 * ONE_SECOND_IN_MILLISECONDS;

export function areTokenOptionsEqual(options1: TokenOptions, options2: TokenOptions) {
  return JSON.stringify(options1) === JSON.stringify(options2);
}

export function isTokenExpired(tokenResponse: TokenResponse) {
  const jwtPayload = decodeTokenPayload(tokenResponse.participantToken);
  if (!jwtPayload?.exp) {
    return true;
  }
  const expInMilliseconds = jwtPayload.exp * ONE_SECOND_IN_MILLISECONDS;
  const expiresAt = new Date(expInMilliseconds - ONE_MINUTE_IN_MILLISECONDS);

  const now = new Date();
  return expiresAt >= now;
}

export function decodeTokenPayload(token: string) {
  const payload = decodeJwt<Omit<TokenPayload, 'roomConfig'>>(token);

  const { sub, roomConfig, ...rest } = payload;

  const mappedPayload: TokenPayload = {
    ...rest,
    identity: payload.sub,
    roomConfig: payload.roomConfig
      ? RoomConfiguration.fromJson(payload.roomConfig as Record<string, any>)
      : undefined,
  };

  return mappedPayload;
}
