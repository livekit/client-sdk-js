import { RoomConfiguration, type TokenSourceResponse } from '@livekit/protocol';
import { decodeJwt } from 'jose';
import type { RoomConfigurationObject, TokenPayload, TokenSourceFetchOptions } from './types';

const ONE_SECOND_IN_MILLISECONDS = 1000;
const ONE_MINUTE_IN_MILLISECONDS = 60 * ONE_SECOND_IN_MILLISECONDS;

export function isResponseTokenValid(response: TokenSourceResponse) {
  const jwtPayload = decodeTokenPayload(response.participantToken);
  if (!jwtPayload?.nbf || !jwtPayload?.exp) {
    return true;
  }

  const now = new Date();

  const nbfInMilliseconds = jwtPayload.nbf * ONE_SECOND_IN_MILLISECONDS;
  const nbfDate = new Date(nbfInMilliseconds);

  const expInMilliseconds = jwtPayload.exp * ONE_SECOND_IN_MILLISECONDS;
  const expDate = new Date(expInMilliseconds - ONE_MINUTE_IN_MILLISECONDS);

  return nbfDate <= now && expDate > now;
}

/** Given a LiveKit generated participant token, decodes and returns the associated {@link TokenPayload} data. */
export function decodeTokenPayload(token: string) {
  const payload = decodeJwt<Omit<TokenPayload, 'roomConfig'>>(token);

  const { roomConfig, ...rest } = payload;

  const mappedPayload: TokenPayload = {
    ...rest,
    roomConfig: payload.roomConfig
      ? (RoomConfiguration.fromJson(
          payload.roomConfig as Record<string, any>,
        ) as RoomConfigurationObject)
      : undefined,
  };

  return mappedPayload;
}

/** Given two TokenSourceFetchOptions values, check to see if they are deep equal. */
export function areTokenSourceFetchOptionsEqual(
  a: TokenSourceFetchOptions,
  b: TokenSourceFetchOptions,
) {
  const allKeysSet = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<
    keyof TokenSourceFetchOptions
  >;

  for (const key of allKeysSet) {
    switch (key) {
      case 'roomName':
      case 'participantName':
      case 'participantIdentity':
      case 'participantMetadata':
      case 'participantAttributes':
      case 'agentName':
      case 'agentMetadata':
        if (a[key] !== b[key]) {
          return false;
        }
        break;
      default:
        // ref: https://stackoverflow.com/a/58009992
        const exhaustiveCheckedKey: never = key;
        throw new Error(`Options key ${exhaustiveCheckedKey} not being checked for equality!`);
    }
  }

  return true;
}
