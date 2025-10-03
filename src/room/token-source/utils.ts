import { RoomConfiguration, type TokenSourceResponse } from '@livekit/protocol';
import { decodeJwt } from 'jose';
import type { RoomConfigurationObject, TokenPayload, TokenSourceFetchOptions } from './types';

const ONE_SECOND_IN_MILLISECONDS = 1000;
const ONE_MINUTE_IN_MILLISECONDS = 60 * ONE_SECOND_IN_MILLISECONDS;

export function isResponseExpired(response: TokenSourceResponse) {
  const jwtPayload = decodeTokenPayload(response.participantToken);
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
  for (const key of Object.keys(a) as Array<keyof TokenSourceFetchOptions>) {
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

export function extractTokenSourceFetchOptionsFromObject<
  Input extends TokenSourceFetchOptions & Rest,
  Rest extends object,
>(input: Input): TokenSourceFetchOptions {
  const options: TokenSourceFetchOptions = {};

  for (const key of Object.keys(input) as Array<keyof TokenSourceFetchOptions>) {
    switch (key) {
      case 'roomName':
      case 'participantName':
      case 'participantIdentity':
      case 'participantMetadata':
      case 'agentName':
      case 'agentMetadata':
        options[key] = input[key];
        break;

      case 'participantAttributes':
        options.participantAttributes = options.participantAttributes ?? {};
        break;

      default:
        // ref: https://stackoverflow.com/a/58009992
        key satisfies never;
        break;
    }
  }

  return options;
}
