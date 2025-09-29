import { Mutex } from '@livekit/mutex';
import { RoomAgentDispatch, RoomConfiguration, TokenSourceRequest, TokenSourceResponse } from '@livekit/protocol';
import { decodeJwt, type JWTPayload } from 'jose';

const ONE_SECOND_IN_MILLISECONDS = 1000;
const ONE_MINUTE_IN_MILLISECONDS = 60 * ONE_SECOND_IN_MILLISECONDS;

export type TokenSourceResponseObject = Required<NonNullable<ConstructorParameters<typeof TokenSourceResponse>[0]>>;

type RoomConfigurationPayload = NonNullable<ConstructorParameters<typeof RoomConfiguration>[0]>;


export abstract class TokenSourceFixed {
  abstract fetch(): Promise<TokenSourceResponseObject>;
}

export type TokenSourceOptions = {
  roomName?: string;
  participantName?: string;
  participantIdentity?: string;
  participantMetadata?: string;
  participantAttributes?: { [key: string]: string };

  agentName?: string;
};

export abstract class TokenSourceConfigurable {
  abstract fetch(options: TokenSourceOptions): Promise<TokenSourceResponseObject>;
}

export type TokenSourceBase = TokenSourceFixed | TokenSourceConfigurable;



function isResponseExpired(response: TokenSourceResponse) {
  const jwtPayload = decodeTokenPayload(response.participantToken);
  if (!jwtPayload?.exp) {
    return true;
  }
  const expInMilliseconds = jwtPayload.exp * ONE_SECOND_IN_MILLISECONDS;
  const expiresAt = new Date(expInMilliseconds - ONE_MINUTE_IN_MILLISECONDS);

  const now = new Date();
  return expiresAt >= now;
}

type TokenPayload = JWTPayload & {
  name?: string;
  metadata?: string;
  attributes?: Record<string, string>;
  video?: {
    room?: string;
    roomJoin?: boolean;
    canPublish?: boolean;
    canPublishData?: boolean;
    canSubscribe?: boolean;
  };
  roomConfig?: RoomConfigurationPayload,
};

function decodeTokenPayload(token: string) {
  const payload = decodeJwt<Omit<TokenPayload, 'roomConfig'>>(token);

  const { roomConfig, ...rest } = payload;

  const mappedPayload: TokenPayload = {
    ...rest,
    roomConfig: payload.roomConfig
      ? RoomConfiguration.fromJson(payload.roomConfig as Record<string, any>) as RoomConfigurationPayload
      : undefined,
  };

  return mappedPayload;
}

export abstract class TokenSourceRefreshable extends TokenSourceConfigurable {
  private cachedOptions: TokenSourceOptions | null = null;
  private cachedResponse: TokenSourceResponse | null = null;

  private fetchMutex = new Mutex();

  protected isSameAsCachedOptions(options: TokenSourceOptions) {
    if (!this.cachedOptions) {
      return false;
    }

    for (const key of Object.keys(this.cachedOptions) as Array<keyof TokenSourceOptions>) {
      switch (key) {
        case 'roomName':
        case 'participantName':
        case 'participantIdentity':
        case 'participantMetadata':
        case 'participantAttributes':
        case 'agentName':
          if (this.cachedOptions[key] !== options[key]) {
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

  protected shouldUseCachedValue(options: TokenSourceOptions) {
    if (!this.cachedResponse) {
      return false;
    }
    if (isResponseExpired(this.cachedResponse)) {
      return false;
    }
    if (this.isSameAsCachedOptions(options)) {
      return false;
    }
    return true;
  }

  getCachedResponseJwtPayload() {
    if (!this.cachedResponse) {
      return null;
    }
    return decodeTokenPayload(this.cachedResponse.participantToken);
  }

  async fetch(options: TokenSourceOptions): Promise<TokenSourceResponseObject> {
    const unlock = await this.fetchMutex.lock();
    try {
      if (this.shouldUseCachedValue(options)) {
        return this.cachedResponse!.toJson() as TokenSourceResponseObject;
      }
      this.cachedOptions = options;

      const tokenResponse = await this.update(options);
      this.cachedResponse = tokenResponse;
      return tokenResponse;
    } finally {
      unlock();
    }
  }

  protected abstract update(options: TokenSourceOptions): Promise<TokenSourceResponse>;
}


type LiteralOrFn = TokenSourceResponseObject | (() => TokenSourceResponseObject | Promise<TokenSourceResponseObject>);
export class TokenSourceLiteral extends TokenSourceFixed {
  private literalOrFn: LiteralOrFn;

  constructor(literalOrFn: LiteralOrFn) {
    super();
    this.literalOrFn = literalOrFn;
  }

  async fetch(): Promise<TokenSourceResponseObject> {
    if (typeof this.literalOrFn === 'function') {
      return this.literalOrFn();
    } else {
      return this.literalOrFn;
    }
  }
}


type CustomFn = (options: TokenSourceOptions) => TokenSourceResponseObject | Promise<TokenSourceResponseObject>;

class TokenSourceCustom extends TokenSourceRefreshable {
  private customFn: CustomFn;
  constructor(customFn: CustomFn) {
    super();
    this.customFn = customFn;
  }

  protected async update(options: TokenSourceOptions) {
    const resultMaybePromise = this.customFn(options);

    let result;
    if (resultMaybePromise instanceof Promise) {
      result = await resultMaybePromise;
    } else {
      result = resultMaybePromise;
    }

    return TokenSourceResponse.fromJson(result, {
      // NOTE: it could be possible that the response body could contain more fields than just
      // what's in TokenSourceResponse depending on the implementation (ie, SandboxTokenServer)
      ignoreUnknownFields: true,
    });
  }
}


export type EndpointOptions = Omit<RequestInit, 'body'>;

class TokenSourceEndpoint extends TokenSourceRefreshable {
  private url: string;
  private endpointOptions: EndpointOptions;

  constructor(url: string, options: EndpointOptions = {}) {
    super();
    this.url = url;
    this.endpointOptions = options;
  }

  protected async update(options: TokenSourceOptions) {
    // NOTE: I don't like the repetitive nature of this, `options` shouldn't be a thing,
    // `request` should just be passed through instead...
    const request = new TokenSourceRequest();
    request.roomName = options.roomName;
    request.participantName = options.participantName;
    request.participantIdentity = options.participantIdentity;
    request.participantMetadata = options.participantMetadata;
    request.participantAttributes = options.participantAttributes ?? {};
    request.roomConfig = options.agentName ? (
      new RoomConfiguration({
        agents: [
          new RoomAgentDispatch({
            agentName: options.agentName,
            metadata: '', // FIXME: how do I support this? Maybe make agentName -> agentToDispatch?
          }),
        ],
      })
    ) : undefined;

    const response = await fetch(this.url, {
      ...this.endpointOptions,
      method: this.endpointOptions.method ?? 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.endpointOptions.headers,
      },
      body: request.toJsonString(),
    });

    if (!response.ok) {
      throw new Error(
        `Error generating token from endpoint ${this.url}: received ${response.status} / ${await response.text()}`,
      );
    }

    const body = await response.json();
    return TokenSourceResponse.fromJson(body, {
      // NOTE: it could be possible that the response body could contain more fields than just
      // what's in TokenSourceResponse depending on the implementation (ie, SandboxTokenServer)
      ignoreUnknownFields: true,
    });
  }
}

export type SandboxTokenServerOptions = {
  baseUrl?: string;
};

export class TokenSourceSandboxTokenServer extends TokenSourceEndpoint {
  constructor(sandboxId: string, options: SandboxTokenServerOptions) {
    const { baseUrl = 'https://cloud-api.livekit.io', ...rest } = options;

    super(`${baseUrl}/api/v2/sandbox/connection-details`, {
      ...rest,
      headers: {
        'X-Sandbox-ID': sandboxId,
      },
    });
  }
}

export const TokenSource = {
  /** TokenSource.literal contains a single, literal set of credentials. */
  literal(literalOrFn: LiteralOrFn) {
    return new TokenSourceLiteral(literalOrFn);
  },

  /**
   * TokenSource.custom allows a user to define a manual function which generates new
   * {@link ResponsePayload} values on demand.
   *
   * Use this to get credentials from custom backends / etc.
   */
  custom(customFn: CustomFn) {
    return new TokenSourceCustom(customFn);
  },

  /**
   * TokenSource.endpoint creates a token source that fetches credentials from a given URL using
   * the standard endpoint format:
   * FIXME: add docs link here in the future!
   */
  endpoint(url: string, options: EndpointOptions = {}) {
    return new TokenSourceEndpoint(url, options);
  },

  /**
   * TokenSource.sandboxTokenServer queries a sandbox token server for credentials,
   * which supports quick prototyping / getting started types of use cases.
   *
   * This token provider is INSECURE and should NOT be used in production.
   *
   * For more info:
   * @see https://cloud.livekit.io/projects/p_/sandbox/templates/token-server
   */
  sandboxTokenServer(sandboxId: string, options: SandboxTokenServerOptions) {
    return new TokenSourceSandboxTokenServer(sandboxId, options);
  },
};
