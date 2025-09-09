import { decodeJwt } from 'jose';

export type ConnectionDetails = {
  serverUrl: string;
  roomName?: string;
  participantName?: string;
  participantToken: string;
};

const ONE_SECOND_IN_MILLISECONDS = 1000;
const ONE_MINUTE_IN_MILLISECONDS = 60 * ONE_SECOND_IN_MILLISECONDS;

/**
 * ConnectionCredentials handles getting credentials for connecting to a new Room, caching
 * the last result and using it until it expires. */
export abstract class ConnectionCredentials {
  private cachedConnectionDetails: ConnectionDetails | null = null;

  protected isCachedConnectionDetailsExpired() {
    const token = this.cachedConnectionDetails?.participantToken;
    if (!token) {
      return true;
    }

    const jwtPayload = decodeJwt(token);
    if (!jwtPayload.exp) {
      return true;
    }
    const expInMilliseconds = jwtPayload.exp * ONE_SECOND_IN_MILLISECONDS;
    const expiresAt = new Date(expInMilliseconds - ONE_MINUTE_IN_MILLISECONDS);

    const now = new Date();
    return expiresAt >= now;
  }

  async generate() {
    if (this.isCachedConnectionDetailsExpired()) {
      await this.refresh();
    }

    return this.cachedConnectionDetails!;
  }

  async refresh() {
    this.cachedConnectionDetails = await this.fetch();
  }

  protected abstract fetch(): Promise<ConnectionDetails>;
}

export namespace ConnectionCredentials {
  /** ConnectionCredentials.Custom allows a user to define a manual function which generates new
   * {@link ConnectionDetails} values on demand. Use this to get credentials from custom backends / etc.
   * */
  export class Custom extends ConnectionCredentials {
    protected fetch: () => Promise<ConnectionDetails>;

    constructor(handler: () => Promise<ConnectionDetails>) {
      super();
      this.fetch = handler;
    }
  }

  /** ConnectionCredentials.Literal contains a single, literal set of credentials.
   * Note that refreshing credentials isn't implemented, because there is only one set provided.
   * */
  export class Literal extends ConnectionCredentials {
    payload: ConnectionDetails;

    constructor(payload: ConnectionDetails) {
      super();
      this.payload = payload;
    }

    async fetch() {
      if (this.isCachedConnectionDetailsExpired()) {
        // FIXME: figure out a better logging solution?
        console.warn(
          'The credentials within ConnectionCredentials.Literal have expired, so any upcoming uses of them will likely fail.',
        );
      }
      return this.payload;
    }
  }

  export type SandboxOptions = {
    sandboxId: string;
    baseUrl?: string;

    /** The name of the room to join. If omitted, a random new room name will be generated instead. */
    roomName?: string;

    /** The identity of the participant the token should connect as connect as. If omitted, a random
     * identity will be used instead. */
    participantName?: string;

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
    protected options: SandboxOptions;

    constructor(options: SandboxOptions) {
      super();
      this.options = options;

      if (process.env.NODE_ENV === 'production' && !this.options.disableSecurityWarning) {
        // FIXME: figure out a better logging solution?
        console.warn(
          'ConnectionCredentials.SandboxTokenServer is meant for development, and is not security hardened. In production, implement your own token generation solution.',
        );
      }
    }

    async fetch() {
      const baseUrl = this.options.baseUrl ?? 'https://cloud-api.livekit.io';
      const response = await fetch(`${baseUrl}/api/sandbox/connection-details`, {
        method: 'POST',
        headers: {
          'X-Sandbox-ID': this.options.sandboxId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomName: this.options.roomName,
          participantName: this.options.participantName,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Error generting token from sandbox token server: received ${response.status} / ${await response.text()}`,
        );
      }

      const body: ConnectionDetails = await response.json();
      return body;
    }
  }
}
