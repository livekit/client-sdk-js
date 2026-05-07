import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackOffStrategy } from './BackOffStrategy';
import * as utils from './utils';

vi.mock('./utils', async () => {
  const actual = await vi.importActual('./utils');
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sleep: vi.fn((ms: number) => Promise.resolve()),
    extractProjectFromUrl: vi.fn((url: URL) => {
      // @ts-ignore
      return actual.extractProjectFromUrl(url);
    }),
  };
});

describe('BackOffStrategy', () => {
  beforeEach(() => {
    // Reset singleton and mocks before each test
    (BackOffStrategy as any)._instance = null;
    vi.clearAllMocks();
  });

  it('should return the same singleton instance', () => {
    const instance1 = BackOffStrategy.getInstance();
    const instance2 = BackOffStrategy.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should not add failed attempts for self-hosted URLs', () => {
    const strategy = BackOffStrategy.getInstance();
    const selfHostedUrl = 'wss://my-server.com';

    strategy.addFailedConnectionAttempt(selfHostedUrl);

    // Verify extractProjectFromUrl was called and returned null
    expect(utils.extractProjectFromUrl).toHaveBeenCalledWith(new URL(selfHostedUrl));
    // Verify sleep was not called since no project name exists
    expect(utils.sleep).not.toHaveBeenCalled();
  });

  it('should apply exponential backoff for cloud URLs', () => {
    const strategy = BackOffStrategy.getInstance();
    const cloudUrl = 'wss://myproject.livekit.cloud';

    // First failure: 500ms
    strategy.addFailedConnectionAttempt(cloudUrl);
    expect(utils.sleep).toHaveBeenCalledWith(500);

    // Second failure: 1000ms
    strategy.addFailedConnectionAttempt(cloudUrl);
    expect(utils.sleep).toHaveBeenCalledWith(1000);

    // Third failure: 2000ms
    strategy.addFailedConnectionAttempt(cloudUrl);
    expect(utils.sleep).toHaveBeenCalledWith(2000);

    // Fourth failure: 4000ms
    strategy.addFailedConnectionAttempt(cloudUrl);
    expect(utils.sleep).toHaveBeenCalledWith(4000);
  });

  it('should cap backoff at maximum delay', () => {
    const strategy = BackOffStrategy.getInstance();
    const cloudUrl = 'wss://myproject.livekit.cloud';
    const maxBackoff = 15_000;

    // Simulate many failures to reach max backoff
    for (let i = 0; i < 10; i++) {
      strategy.addFailedConnectionAttempt(cloudUrl);
    }

    // Last call should be capped at 15000ms
    const lastCall = (utils.sleep as any).mock.calls[(utils.sleep as any).mock.calls.length - 1];
    expect(lastCall[0]).toBeLessThanOrEqual(maxBackoff);
  });

  it('should reset failed attempts for a specific project', () => {
    const strategy = BackOffStrategy.getInstance();
    const cloudUrl = 'wss://myproject.livekit.cloud';

    // Add multiple failures
    strategy.addFailedConnectionAttempt(cloudUrl);
    strategy.addFailedConnectionAttempt(cloudUrl);
    strategy.addFailedConnectionAttempt(cloudUrl);

    // Reset the project
    strategy.resetFailedConnectionAttempts(cloudUrl);

    // Next failure should start from base delay again
    vi.clearAllMocks();
    strategy.addFailedConnectionAttempt(cloudUrl);
    expect(utils.sleep).toHaveBeenCalledWith(500);
  });

  it('should isolate backoff state between different projects', () => {
    const strategy = BackOffStrategy.getInstance();
    const project1Url = 'wss://project1.livekit.cloud';
    const project2Url = 'wss://project2.livekit.cloud';

    // Add failures to project1
    strategy.addFailedConnectionAttempt(project1Url);
    strategy.addFailedConnectionAttempt(project1Url);

    // Add failures to project2
    strategy.addFailedConnectionAttempt(project2Url);

    // Verify project2 starts at base delay despite project1 having multiple failures
    const calls = (utils.sleep as any).mock.calls;
    expect(calls[0][0]).toBe(500); // project1 first failure
    expect(calls[1][0]).toBe(1000); // project1 second failure
    expect(calls[2][0]).toBe(500); // project2 first failure (independent)
  });

  it('should return correct backoff promise', async () => {
    const strategy = BackOffStrategy.getInstance();
    const cloudUrl = 'wss://myproject.livekit.cloud';
    const selfHostedUrl = 'wss://my-server.com';

    // Add a failure to create a backoff promise
    strategy.addFailedConnectionAttempt(cloudUrl);
    const backoffPromise = strategy.getBackOffPromise(cloudUrl);

    // Should return a promise for cloud URLs with failures
    expect(backoffPromise).toBeInstanceOf(Promise);

    // Should return resolved promise for self-hosted URLs
    const selfHostedPromise = strategy.getBackOffPromise(selfHostedUrl);
    expect(selfHostedPromise).toBeInstanceOf(Promise);
    await expect(selfHostedPromise).resolves.toBeUndefined();
  });

  it('should clear all state with resetAll', () => {
    const strategy = BackOffStrategy.getInstance();
    const project1Url = 'wss://project1.livekit.cloud';
    const project2Url = 'wss://project2.livekit.cloud';

    // Add failures to multiple projects
    strategy.addFailedConnectionAttempt(project1Url);
    strategy.addFailedConnectionAttempt(project1Url);
    strategy.addFailedConnectionAttempt(project2Url);

    // Reset all state
    strategy.resetAll();

    // Next failures should start from base delay for all projects
    vi.clearAllMocks();
    strategy.addFailedConnectionAttempt(project1Url);
    strategy.addFailedConnectionAttempt(project2Url);

    const calls = (utils.sleep as any).mock.calls;
    expect(calls[0][0]).toBe(500); // project1 back to base
    expect(calls[1][0]).toBe(500); // project2 back to base
  });
});
