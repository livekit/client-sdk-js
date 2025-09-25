import { TokenSourceCustom, TokenSourceEndpoint } from './TokenSource';
import type {
  EndpointOptions,
  IStandardTokenSource,
  ITokenSource,
  TokenOptions,
  TokenResponse,
  TokenSourceOrCallback,
} from './types';

/**
 * TokenSource.endpoint creates a token source that fetches credentials from a given URL.
 * Use this to get credentials.
 */
function endpoint(url: string, options?: EndpointOptions) {
  return new TokenSourceEndpoint(url, options) as IStandardTokenSource;
}

/**
 * TokenSource.sandbox queries a sandbox token server for credentials,
 * which supports quick prototyping / getting started types of use cases.
 *
 * This token provider is INSECURE and should NOT be used in production.
 *
 * For more info:
 * @see https://cloud.livekit.io/projects/p_/sandbox/templates/token-server
 */
function sandbox(sandboxId: string) {
  const url = 'https://cloud-api.livekit.io';
  return new TokenSourceEndpoint(url, {
    headers: {
      'X-Sandbox-ID': sandboxId,
    },
  }) as IStandardTokenSource;
}

/**
 * TokenSource.custom allows a user to define a manual function which generates new
 * {@link ResponsePayload} values on demand.
 *
 * Use this to get credentials from custom backends / etc.
 */
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
