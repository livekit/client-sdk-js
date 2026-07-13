import 'vitest';

declare module 'vitest' {
  interface ProvidedContext {
    /** ws:// base URL of the spawned mock test-server, or '' when unavailable. */
    serverUrl: string;
    /** Non-empty reason string when the e2e suite must be skipped. */
    e2eUnavailable: string;
  }
}
