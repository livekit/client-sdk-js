import { RoomConfiguration } from '@livekit/protocol';
import { decodeJwt } from 'jose';
import log, { LoggerNames, getLogger } from '../logger';

const ONE_SECOND_IN_MILLISECONDS = 1000;
const ONE_MINUTE_IN_MILLISECONDS = 60 * ONE_SECOND_IN_MILLISECONDS;

/**
 * ConnectionCredentials handles getting credentials for connecting to a new Room, caching
 * the last result and using it until it expires. */
export abstract class ConnectionCredentials {
  private request: ConnectionCredentials.Request = {};

  protected cachedResponse: ConnectionCredentials.Response | null = null;

  private inProgressFetch: Promise<ConnectionCredentials.Response> | null = null;

  protected getCachedResponseJwtPayload() {
    const token = this.cachedResponse?.participantToken;
    if (!token) {
      return null;
    }

    return decodeJwt<{ roomConfig?: ReturnType<RoomConfiguration['toJson']> }>(token);
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

  getCachedResponseRoomConfig() {
    const roomConfigJsonValue = this.getCachedResponseJwtPayload()?.roomConfig;
    if (!roomConfigJsonValue) {
      return null;
    }
    return RoomConfiguration.fromJson(roomConfigJsonValue);
  }

  protected isSameAsCachedRequest(request: ConnectionCredentials.Request) {
    if (!this.request) {
      return false;
    }

    if (this.request.roomName !== request.roomName) {
      return false;
    }
    if (this.request.participantName !== request.participantName) {
      return false;
    }
    if (
      (!this.request.roomConfig && request.roomConfig) ||
      (this.request.roomConfig && !request.roomConfig)
    ) {
      return false;
    }
    if (
      this.request.roomConfig &&
      request.roomConfig &&
      !this.request.roomConfig.equals(request.roomConfig)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Store request metadata which will be provide explicitly when fetching new credentials.
   *
   * @example new ConnectionCredentials.Custom((request /* <= This value! *\/) => ({ serverUrl: "...", participantToken: "..." })) */
  setRequest(request: ConnectionCredentials.Request) {
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
    request: ConnectionCredentials.Request,
  ): Promise<ConnectionCredentials.Response>;
}

export namespace ConnectionCredentials {
  export type Request = {
    /** The name of the room being requested when generating credentials */
    roomName?: string;

    /** The identity of the participant being requested for this client when generating credentials */
    participantName?: string;

    /**
     * A RoomConfiguration object can be passed to request extra parameters should be included when
     * generating connection credentials - dispatching agents, defining egress settings, etc
     * @see https://docs.livekit.io/home/get-started/authentication/#room-configuration
     */
    roomConfig?: RoomConfiguration;
  };
  export type Response = {
    serverUrl: string;
    participantToken: string;
  };


  /** ConnectionCredentials.Literal contains a single, literal set of credentials.
   * Note that refreshing credentials isn't implemented, because there is only one set provided.
   * */
  export class Literal extends ConnectionCredentials {
    private log = log;

    constructor(payload: Response) {
      super();
      this.cachedResponse = payload;
      this.log = getLogger(LoggerNames.ConnectionCredentials);
    }

    async fetch() {
      if (this.isCachedResponseExpired()) {
        this.log.warn(
          'The credentials within ConnectionCredentials.Literal have expired, so any upcoming uses of them will likely fail.',
        );
      }
      return this.cachedResponse!;
    }
  }

  /** ConnectionCredentials.Custom allows a user to define a manual function which generates new
   * {@link Response} values on demand. Use this to get credentials from custom backends / etc.
   * */
  export class Custom extends ConnectionCredentials {
    protected fetch: (request: Request) => Promise<Response>;

    constructor(handler: (request: Request) => Promise<Response>) {
      super();
      this.fetch = handler;
    }
  }

  export type SandboxTokenServerOptions = Pick<
    Request,
    'roomName' | 'participantName' | 'roomConfig'
  > & {
    sandboxId: string;
    baseUrl?: string;

    /** Disable sandbox security related warning log if ConnectionCredentials.Sandbox is used in
     * production */
    disableSecurityWarning?: boolean;
  };

  /** ConnectionCredentials.SandboxTokenServer queries a sandbox token server for credentials,
   * which supports quick prototyping / getting started types of use cases.
   *
   * This token provider is INSECURE and should NOT be used in production.
   *
   * For more info:
   * @see https://cloud.livekit.io/projects/p_/sandbox/templates/token-server */
  export class SandboxTokenServer extends ConnectionCredentials {
    protected options: SandboxTokenServerOptions;

    private log = log;

    constructor(options: SandboxTokenServerOptions) {
      super();
      this.options = options;

      this.log = getLogger(LoggerNames.ConnectionCredentials);

      if (process.env.NODE_ENV === 'production' && !this.options.disableSecurityWarning) {
        this.log.warn(
          'ConnectionCredentials.SandboxTokenServer is meant for development, and is not security hardened. In production, implement your own token generation solution.',
        );
      }
    }

    async fetch(request: Request) {
      const baseUrl = this.options.baseUrl ?? 'https://cloud-api.livekit.io';

      const roomName = this.options.roomName ?? request.roomName;
      const participantName = this.options.participantName ?? request.participantName;
      const roomConfig = this.options.roomConfig ?? request.roomConfig;

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

      const body: Exclude<Response, 'roomConfig'> = await response.json();
      return { ...body, roomConfig };
    }
  }
}
