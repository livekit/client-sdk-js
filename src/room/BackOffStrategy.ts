import { extractProjectFromUrl, sleep } from './utils';

const CONNECTION_BACKOFF_MIN_MS = 500;
const CONNECTION_BACKOFF_MAX_MS = 15_000;

/**
 * BackOffStrategy implements exponential backoff for connection failures.
 *
 * When severe connection failures occur (e.g., network issues, server unavailability),
 * this strategy introduces increasing delays between reconnection attempts to avoid
 * overwhelming the server and to give transient issues time to resolve.
 *
 * This strategy is only applied to LiveKit Cloud projects. It identifies
 * projects by extracting the project name from the connection URL and tracks failures
 * per project. Self-hosted deployments (URLs without a project identifier) are not
 * subject to backoff delays.
 *
 * The class is implemented as a singleton to maintain consistent backoff state across
 * the entire application lifecycle instead of room instance lifecycle.
 */
export class BackOffStrategy {
  private static _instance: BackOffStrategy | null = null;

  private failedConnectionAttempts = new Map<string, number>();

  private backOffPromises = new Map<string, Promise<void>>();

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static getInstance(): BackOffStrategy {
    if (!this._instance) {
      this._instance = new BackOffStrategy();
    }
    return this._instance;
  }

  addFailedConnectionAttempt(urlString: string) {
    const url = new URL(urlString);
    const projectName = extractProjectFromUrl(url);
    if (!projectName) {
      return;
    }
    let failureCount = this.failedConnectionAttempts.get(projectName) ?? 0;
    this.failedConnectionAttempts.set(projectName, failureCount + 1);
    this.backOffPromises.set(
      projectName,
      sleep(
        Math.min(CONNECTION_BACKOFF_MIN_MS * Math.pow(2, failureCount), CONNECTION_BACKOFF_MAX_MS),
      ),
    );
  }

  getBackOffPromise(urlString: string): Promise<void> {
    const url = new URL(urlString);
    const projectName = url && extractProjectFromUrl(url);
    const backoffPromise = projectName && this.backOffPromises.get(projectName);
    return backoffPromise || Promise.resolve();
  }

  resetFailedConnectionAttempts(urlString: string) {
    const url = new URL(urlString);
    const projectName = url && extractProjectFromUrl(url);
    if (projectName) {
      this.failedConnectionAttempts.set(projectName, 0);
      this.backOffPromises.set(projectName, Promise.resolve());
    }
  }

  resetAll() {
    this.backOffPromises.clear();
    this.failedConnectionAttempts.clear();
  }
}
