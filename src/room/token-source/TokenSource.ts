import { Mutex } from '@livekit/mutex';
import { TokenSourceRequest, TokenSourceResponse } from '@livekit/protocol';
import type {
  EndpointOptions,
  IStandardTokenSource,
  ITokenSource,
  ITokenSourceInternal,
  TokenOptions,
  TokenPayload,
  TokenResponse,
} from './types';
import { areTokenOptionsEqual, decodeTokenPayload, isTokenExpired } from './utils';

export abstract class BaseTokenSource implements ITokenSource, ITokenSourceInternal {
  protected options: TokenOptions = {};

  protected fetchMutex = new Mutex();

  abstract getToken(): Promise<TokenResponse>;
}

export class TokenSourceEndpoint extends BaseTokenSource implements IStandardTokenSource {
  private url: string;

  private endpointOptions: EndpointOptions;

  private latestTokenResponse: TokenResponse | null = null;

  private needsRefresh: boolean = true;

  constructor(url: string, options?: EndpointOptions) {
    super();
    this.url = url;
    this.endpointOptions = options ?? {};
  }

  async getToken(): Promise<TokenResponse> {
    const unlock = await this.fetchMutex.lock();
    try {
      if (
        this.latestTokenResponse &&
        !isTokenExpired(this.latestTokenResponse) &&
        !this.needsRefresh
      ) {
        return this.latestTokenResponse;
      }
      const tokenRequest = await fetch(this.url, {
        ...this.endpointOptions,
        body: new TokenSourceRequest(this.options).toJsonString(),
      }).then((res) => res.json());

      const tokenResponse = TokenSourceResponse.fromJson(tokenRequest);
      this.latestTokenResponse = tokenResponse;
      return tokenResponse;
    } finally {
      unlock();
    }
  }

  setTokenOptions(options: TokenOptions): void {
    if (!areTokenOptionsEqual) {
      this.needsRefresh = true;
      this.options = options;
    }
  }

  /** @internal */
  getLatestTokenResponsePayload(): TokenPayload | null {
    const token = this.latestTokenResponse?.participantToken;
    if (!token) {
      return null;
    }
    return decodeTokenPayload(token);
  }
}

export class TokenSourceCustom extends BaseTokenSource {
  private handler: (options: TokenOptions) => PromiseLike<TokenResponse>;

  private latestTokenResponse: TokenResponse | null = null;

  constructor(handler: (options: TokenOptions) => PromiseLike<TokenResponse>) {
    super();
    this.handler = handler;
  }

  async getToken(): Promise<TokenResponse> {
    const unlock = await this.fetchMutex.lock();
    try {
      if (this.latestTokenResponse && !isTokenExpired(this.latestTokenResponse)) {
        return this.latestTokenResponse;
      }
      const tokenResponse = await this.handler(this.options);
      this.latestTokenResponse = tokenResponse;
      return tokenResponse;
    } finally {
      unlock();
    }
  }
}
