import { RoomConfiguration } from '@livekit/protocol';
import { decodeJwt } from 'jose';
import log, { LoggerNames, getLogger } from '../logger';

const ONE_SECOND_IN_MILLISECONDS = 1000;
const ONE_MINUTE_IN_MILLISECONDS = 60 * ONE_SECOND_IN_MILLISECONDS;

/** TokenSource handles generating credentials for connecting to a new Room */
export abstract class TokenSource {
  protected cachedResponse: TokenSource.ResponsePayload | null = null;

  constructor(response: TokenSource.ResponsePayload | null = null) {
    this.cachedResponse = response;
  }

  getCachedResponseJwtPayload() {
    const token = this.cachedResponse?.participant_token;
    if (!token) {
      return null;
    }

    return decodeJwt<{
      name?: string;
      metadata?: string;
      attributes?: Record<string, string>;
      roomConfig?: ReturnType<RoomConfiguration['toJson']>;
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

  abstract generate(): Promise<TokenSource.ResponsePayload>;
}
export namespace TokenSource {
  export type RequestPayload = {
    /** The name of the room being requested when generating credentials */
    room_name?: string;

    /** The name of the participant being requested for this client when generating credentials */
    participant_name?: string;

    /** The identity of the participant being requested for this client when generating credentials */
    participant_identity?: string;

    /** Any participant metadata being included along with the credentials generation operation */
    participant_metadata?: string;

    /** Any participant attributes being included along with the credentials generation operation */
    participant_attributes?: Record<string, string>;

    /**
     * A RoomConfiguration object can be passed to request extra parameters should be included when
     * generating connection credentials - dispatching agents, defining egress settings, etc
     * @see https://docs.livekit.io/home/get-started/authentication/#room-configuration
     */
    room_config?: RoomConfiguration;
  };
  export type ResponsePayload = {
    server_url: string;
    participant_token: string;
  };

  /**
   * TokenSource.Refreshable handles getting credentials for connecting to a new Room from
   * an async source, caching them and auto refreshing them if they expire. */
  export abstract class Refreshable extends TokenSource {
    private request: TokenSource.RequestPayload = {};

    private inProgressFetch: Promise<TokenSource.ResponsePayload> | null = null;

    protected isSameAsCachedRequest(request: TokenSource.RequestPayload) {
      if (!this.request) {
        return false;
      }

      if (this.request.room_name !== request.room_name) {
        return false;
      }
      if (this.request.participant_name !== request.participant_name) {
        return false;
      }
      if (
        (!this.request.room_config && request.room_config) ||
        (this.request.room_config && !request.room_config)
      ) {
        return false;
      }
      if (
        this.request.room_config &&
        request.room_config &&
        !this.request.room_config.equals(request.room_config)
      ) {
        return false;
      }

      return true;
    }

    /**
     * Store request metadata which will be provide explicitly when fetching new credentials.
     *
     * @example new TokenSource.Custom((request /* <= This value! *\/) => ({ serverUrl: "...", participantToken: "..." })) */
    setRequest(request: TokenSource.RequestPayload) {
      if (!this.isSameAsCachedRequest(request)) {
        this.cachedResponse = null;
      }
      this.request = request;
    }

    clearRequest() {
      this.request = {};
      this.cachedResponse = null;
    }

    async generate() {
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

    protected abstract fetch(
      request: TokenSource.RequestPayload,
    ): Promise<TokenSource.ResponsePayload>;
  }

  /** TokenSource.Literal contains a single, literal set of credentials.
   * Note that refreshing credentials isn't implemented, because there is only one set provided.
   * */
  export class Literal extends TokenSource {
    private log = log;

    constructor(payload: ResponsePayload) {
      super(payload);
      this.log = getLogger(LoggerNames.TokenSource);
    }

    async generate() {
      if (this.isCachedResponseExpired()) {
        this.log.warn(
          'The credentials within TokenSource.Literal have expired, so any upcoming uses of them will likely fail.',
        );
      }
      return this.cachedResponse!;
    }
  }

  /** TokenSource.Custom allows a user to define a manual function which generates new
   * {@link ResponsePayload} values on demand. Use this to get credentials from custom backends / etc.
   * */
  export class Custom extends TokenSource.Refreshable {
    protected fetch: (request: RequestPayload) => Promise<ResponsePayload>;

    constructor(handler: (request: RequestPayload) => Promise<ResponsePayload>) {
      super();
      this.fetch = handler;
    }
  }

  export type SandboxTokenServerOptions = Pick<
    RequestPayload,
    'room_name' | 'participant_name' | 'room_config'
  > & {
    sandboxId: string;
    baseUrl?: string;
  };

  /** TokenSource.SandboxTokenServer queries a sandbox token server for credentials,
   * which supports quick prototyping / getting started types of use cases.
   *
   * This token provider is INSECURE and should NOT be used in production.
   *
   * For more info:
   * @see https://cloud.livekit.io/projects/p_/sandbox/templates/token-server */
  export class SandboxTokenServer extends TokenSource.Refreshable {
    protected options: SandboxTokenServerOptions;

    constructor(options: SandboxTokenServerOptions) {
      super();
      this.options = options;
    }

    async fetch(request: RequestPayload) {
      const baseUrl = this.options.baseUrl ?? 'https://cloud-api.livekit.io';

      const roomName = this.options.room_name ?? request.room_name;
      const participantName = this.options.participant_name ?? request.participant_name;
      const roomConfig = this.options.room_config ?? request.room_config;

      const response = await fetch(`${baseUrl}/api/sandbox/connection-details`, {
        method: 'POST',
        headers: {
          'X-Sandbox-ID': this.options.sandboxId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomName,
          participantName,
          roomConfig: roomConfig?.toJson(),
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Error generating token from sandbox token server: received ${response.status} / ${await response.text()}`,
        );
      }

      const rawBody = await response.json();
      return {
        server_url: rawBody.serverUrl,
        participant_token: rawBody.participantToken,
      };
    }
  }
}
