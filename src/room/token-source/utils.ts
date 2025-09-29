import { RoomConfiguration, type TokenSourceResponse } from '@livekit/protocol';
import { decodeJwt } from 'jose';
import type { RoomConfigurationObject, TokenPayload, TokenSourceOptions } from './types';

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

export function extractTokenSourceOptionsFromObject<
  Input extends TokenSourceOptions & Rest,
  Rest extends object,
>(input: Input): TokenSourceOptions {
  const options: TokenSourceOptions = {};

  for (const key of Object.keys(input) as Array<keyof TokenSourceOptions>) {
    switch (key) {
      case 'roomName':
      case 'participantName':
      case 'participantIdentity':
      case 'participantMetadata':
      case 'agentName':
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
