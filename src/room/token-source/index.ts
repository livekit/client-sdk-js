import { TokenSourceCustom, TokenSourceEndpoint } from './TokenSource';
import type {
  EndpointOptions,
  IStandardTokenSource,
  ITokenSource,
  TokenOptions,
  TokenResponse,
  TokenSourceOrCallback,
} from './types';

function endpoint(url: string, options?: EndpointOptions) {
  return new TokenSourceEndpoint(url, options) as IStandardTokenSource;
}

function sandbox(sandboxId: string) {
  const url = 'https://cloud-api.livekit.io';
  return new TokenSourceEndpoint(url, {
    headers: {
      'X-Sandbox-ID': sandboxId,
    },
  }) as IStandardTokenSource;
}

function custom(handler: (options: TokenOptions) => PromiseLike<TokenResponse>) {
  return new TokenSourceCustom(handler) as ITokenSource;
}

export const TokenSource = { endpoint, sandbox, custom };
export type {
  EndpointOptions as TokenSourceEndpointOptions,
  IStandardTokenSource,
  ITokenSource,
  TokenResponse,
  TokenOptions,
  TokenSourceOrCallback,
};
