import { SignJWT } from 'jose';

/**
 * Mint a LiveKit access token for the mock test-server (HS256, dev secret).
 *
 * The mock's signal behavior mode is selected via a participant attribute
 * under the reserved key `lk.mock` (dot notation, matching LiveKit's internal
 * attribute convention), whose value is the JSON control object
 * `{"signal":"<mode>"}` — mirroring the X-Lk-Mock header protocol. Attributes
 * are a standard AccessToken field (a string map), so a dedicated `lk-mock`
 * key coexists with any real metadata/attributes and needs no bespoke token
 * construction. The room name is just a room; it no longer encodes behavior.
 */
export interface TokenOptions {
  /** Mock behavior mode (e.g. 'no_pong'); omitted → the mock defaults to 'happy'. */
  signal?: string;
  /** LeaveRequest action the leave modes should send (0=DISCONNECT,1=RESUME,2=RECONNECT). */
  leaveAction?: number;
  room?: string;
  identity?: string;
  apiKey?: string;
  secret?: string;
  ttlSeconds?: number;
}

export async function createToken(opts: TokenOptions = {}): Promise<string> {
  const {
    signal,
    leaveAction,
    room = 'e2e-room',
    identity = `test-${Math.random().toString(36).slice(2, 8)}`,
    apiKey = 'devkey',
    secret = 'secret',
    ttlSeconds = 600,
  } = opts;
  const key = new TextEncoder().encode(secret);
  const payload: Record<string, unknown> = {
    video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
  };
  if (signal) {
    const control: Record<string, unknown> = { signal };
    if (leaveAction !== undefined) {
      control.leaveAction = leaveAction;
    }
    payload.attributes = { 'lk.mock': JSON.stringify(control) };
  }
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(apiKey)
    .setSubject(identity)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key);
}

/** A syntactically-valid token signed with the WRONG secret — for 401 tests. */
export async function createInvalidToken(): Promise<string> {
  return createToken({ secret: 'not-the-secret' });
}
