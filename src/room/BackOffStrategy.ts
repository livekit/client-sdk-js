import { extractProjectFromUrl, sleep } from './utils';

const CONNECTION_BACKOFF_MIN = 500;
const CONNECTION_BACKOFF_MAX = 15_000;

export class BackOffStrategy {
  private static _instance: BackOffStrategy | null = null;

  private failedConnectionAttempts = new Map<string, number>();

  private backOffPromises = new Map<string, Promise<void>>();

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static get instance(): BackOffStrategy {
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
      sleep(Math.min(CONNECTION_BACKOFF_MIN * Math.pow(2, failureCount), CONNECTION_BACKOFF_MAX)),
    );
  }

  getBackOffPromise(urlString: string): Promise<void> {
    const url = new URL(urlString);
    const projectName = url && extractProjectFromUrl(url);
    return (projectName && this.backOffPromises.get(projectName)) || Promise.resolve();
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
