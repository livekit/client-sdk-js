import { RoomConfiguration, TokenSourceRequest, TokenSourceResponse } from '@livekit/protocol';
import { decodeJwt } from 'jose';
import log, { LoggerNames, getLogger } from '../logger';
import type { ValueToSnakeCase } from '../utils/camelToSnakeCase';

const ONE_SECOND_IN_MILLISECONDS = 1000;
const ONE_MINUTE_IN_MILLISECONDS = 60 * ONE_SECOND_IN_MILLISECONDS;

type RoomConfigurationPayload = ValueToSnakeCase<
  NonNullable<ConstructorParameters<typeof RoomConfiguration>[0]>
>;

/** TokenSource handles generating credentials for connecting to a new Room */
export abstract class TokenSource {
  protected cachedResponse: TokenSource.Response | null = null;

  constructor(response: TokenSource.PartialResponse | null = null) {
    this.cachedResponse = response ? TokenSource.Response.fromJson(response) : null;
  }

  getCachedResponseJwtPayload() {
    const token = this.cachedResponse?.participantToken;
    if (!token) {
      return null;
    }

    return decodeJwt<{
      name?: string;
      metadata?: string;
      attributes?: Record<string, string>;
      roomConfig?: RoomConfigurationPayload;
      video?: {
        room?: string;
        roomJoin?: boolean;
        canPublish?: boolean;
        canPublishData?: boolean;
        canSubscribe?: boolean;
      };
    }>(token);
  }

  protected isCachedResponseExpired() {
    const jwtPayload = this.getCachedResponseJwtPayload();
    if (!jwtPayload?.exp) {
      return true;
    }
    const expInMilliseconds = jwtPayload.exp * ONE_SECOND_IN_MILLISECONDS;
    const expiresAt = new Date(expInMilliseconds - ONE_MINUTE_IN_MILLISECONDS);

    const now = new Date();
    return expiresAt >= now;
  }

  abstract generate(): Promise<TokenSource.Response>;
}
export namespace TokenSource {
  export const Request = TokenSourceRequest;
  export type Request = TokenSourceRequest;

  export const Response = TokenSourceResponse;
  export type Response = TokenSourceResponse;

  export type PartialRequest = NonNullable<ConstructorParameters<typeof TokenSource.Request>[0]>;
  export type PartialResponse = NonNullable<ConstructorParameters<typeof TokenSource.Response>[0]>;

  /** The `TokenSource` request object sent to the server as part of fetching a refreshable
   * `TokenSource` like Endpoint or SandboxTokenServer.
   *
   * Use this as a type for your request body if implementing a server endpoint in node.js.
   */
  export type RequestPayload = ValueToSnakeCase<PartialRequest>;

  /** The `TokenSource` response object sent from the server as part of fetching a refreshable
   * `TokenSource` like Endpoint or SandboxTokenServer.
   *
   * Use this as a type for your response body if implementing a server endpoint in node.js.
   */
  export type ResponsePayload = ValueToSnakeCase<PartialResponse>;

  /**
   * TokenSource.Refreshable handles getting credentials for connecting to a new Room from
   * an async source, caching them and auto refreshing them if they expire. */
  export abstract class Refreshable extends TokenSource {
    private request = new TokenSource.Request();

    private inProgressFetch: Promise<TokenSource.Response> | null = null;

    protected isSameAsCachedRequest(request: TokenSource.Request) {
      return TokenSource.Request.equals(this.request, request);
    }

    /**
     * Store request metadata which will be provide explicitly when fetching new credentials.
     *
     * @example new TokenSource.Custom((request /* <= This value! *\/) => ({ serverUrl: "...", participantToken: "..." })) */
    setRequest(request: PartialRequest) {
      const parsedRequest = new TokenSource.Request(request);

      if (!this.isSameAsCachedRequest(parsedRequest)) {
        this.cachedResponse = null;
      }
      this.request = parsedRequest;
    }

    clearRequest() {
      this.request = new TokenSource.Request();
      this.cachedResponse = null;
    }

    async generate(): Promise<TokenSource.Response> {
      if (this.isCachedResponseExpired()) {
        await this.refresh();
      }

      return this.cachedResponse!;
    }

    async refresh() {
      if (this.inProgressFetch) {
        await this.inProgressFetch;
        return;
      }

      try {
        this.inProgressFetch = this.fetch(this.request);
        this.cachedResponse = await this.inProgressFetch;
      } finally {
        this.inProgressFetch = null;
      }
    }

    protected abstract fetch(request: TokenSource.Request): Promise<TokenSource.Response>;
  }

  export class Literal extends TokenSource {
    private log = log;

    constructor(payload: PartialResponse) {
      super(payload);
      this.log = getLogger(LoggerNames.TokenSource);
    }

    async generate(): Promise<TokenSource.Response> {
      if (this.isCachedResponseExpired()) {
        this.log.warn(
          'The credentials within TokenSource.Literal have expired, so any upcoming uses of them will likely fail.',
        );
      }

      return this.cachedResponse!;
    }
  }

  /** TokenSource.Literal contains a single, literal set of credentials.
   * Note that refreshing credentials isn't implemented, because there is only one set provided.
   * */
  export function literal(response: PartialResponse) {
    return new Literal(response);
  }

  export class Custom extends TokenSource.Refreshable {
    protected fetch: (request: TokenSource.Request) => Promise<TokenSource.Response>;

    constructor(handler: (request: TokenSource.Request) => Promise<TokenSource.Response>) {
      super();
      this.fetch = handler;
    }
  }

  /** TokenSource.Custom allows a user to define a manual function which generates new
   * {@link ResponsePayload} values on demand.
   *
   * Use this to get credentials from custom backends / etc.
   * */
  export function custom(handler: (request: TokenSource.Request) => Promise<TokenSource.Response>) {
    return new Custom(handler);
  }

  export type EndpointOptions = {
    headers?: Record<string, string>;
  };

  export class Endpoint extends TokenSource.Refreshable {
    protected url: string;

    protected options: EndpointOptions | null;

    constructor(url: string, options?: EndpointOptions) {
      super();
      this.url = url;
      this.options = options ?? null;
    }

    async fetch(request: TokenSource.Request): Promise<TokenSource.Response> {
      const requestPayload = request.toJson({
        useProtoFieldName: true,
      }) as TokenSource.RequestPayload;

      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.options?.headers ?? {}),
        },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        throw new Error(
          `Error generating token from endpoint ${this.url}: received ${response.status} / ${await response.text()}`,
        );
      }

      const body: TokenSource.ResponsePayload = await response.json();
      return TokenSourceResponse.fromJson(body, {
        // NOTE: it could be possible that the response body could contain more fields than just
        // what's in TokenSourceResponse depending on the implementation (ie, SandboxTokenServer)
        ignoreUnknownFields: true,
      });
    }
  }

  export function endpoint(url: string, options?: EndpointOptions) {
    return new Endpoint(url, options);
  }

  export type SandboxTokenServerOptions = EndpointOptions & {
    sandboxId: string;
    baseUrl?: string;
  };

  export class SandboxTokenServer extends TokenSource.Endpoint {
    constructor(options: SandboxTokenServerOptions) {
      const { sandboxId, baseUrl = 'https://cloud-api.livekit.io', ...rest } = options;

      super(`${baseUrl}/api/v2/sandbox/connection-details`, {
        ...rest,
        headers: {
          ...(rest?.headers ?? {}),
          'X-Sandbox-ID': sandboxId,
        },
      });
    }
  }

  /** TokenSource.SandboxTokenServer queries a sandbox token server for credentials,
   * which supports quick prototyping / getting started types of use cases.
   *
   * This token provider is INSECURE and should NOT be used in production.
   *
   * For more info:
   * @see https://cloud.livekit.io/projects/p_/sandbox/templates/token-server */
  export function sandboxTokenServer(options: SandboxTokenServerOptions) {
    return new SandboxTokenServer(options);
  }

  export type SandboxTokenServerV1Options = Pick<
    RequestPayload,
    'room_name' | 'participant_name' | 'room_config'
  > & {
    sandboxId: string;
    baseUrl?: string;
  };

  /**
   * A temporary v1 sandbox token server adaptor for backwards compatibility while the v2 endpoints
   * are getting deployed.
   *
   * FIXME: get rid of this before merging the TokenSource pull request!!
   * */
  export class SandboxTokenServerV1 extends TokenSource.Refreshable {
    protected options: SandboxTokenServerV1Options;

    constructor(options: SandboxTokenServerV1Options) {
      super();
      this.options = options;
    }

    async fetch(request: TokenSource.Request) {
      const requestPayload = request.toJson({
        useProtoFieldName: true,
      }) as TokenSource.RequestPayload;

      const baseUrl = this.options.baseUrl ?? 'https://cloud-api.livekit.io';

      const roomName = this.options.room_name ?? requestPayload.room_name;
      const participantName = this.options.participant_name ?? requestPayload.participant_name;
      const roomConfig = this.options.room_config ?? requestPayload.room_config;

      const response = await fetch(`${baseUrl}/api/sandbox/connection-details`, {
        method: 'POST',
        headers: {
          'X-Sandbox-ID': this.options.sandboxId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomName,
          participantName,
          roomConfig,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Error generating token from sandbox token server: received ${response.status} / ${await response.text()}`,
        );
      }

      const rawBody = await response.json();
      return TokenSource.Response.fromJson(rawBody);
    }
  }
}
