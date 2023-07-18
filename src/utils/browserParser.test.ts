import { describe, expect, it } from 'vitest';
import { compareVersions } from '../room/utils';
import { getBrowser } from './browserParser';

describe('browser parser', () => {
  const safariUA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15';
  const firefoxUA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/112.0';

  const chromeUA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36';

  const braveUA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.5060.134 Safari/537.36';

  it('parses Safari correctly', () => {
    const details = getBrowser(safariUA, true);
    expect(details?.name).toBe('Safari');
    expect(details?.version).toBe('16.3');
  });
  it('parses Firefox correctly', () => {
    const details = getBrowser(firefoxUA, true);
    expect(details?.name).toBe('Firefox');
    expect(details?.version).toBe('112.0');
  });
  it('parses Chrome correctly', () => {
    const details = getBrowser(chromeUA, true);
    expect(details?.name).toBe('Chrome');
    expect(details?.version).toBe('112.0.0.0');
  });
  it('detects brave as chromium based', () => {
    const details = getBrowser(braveUA, true);
    expect(details?.name).toBe('Chrome');
    expect(details?.version).toBe('103.0.5060.134');
  });
});

describe('version compare', () => {
  it('compares versions correctly', () => {
    expect(compareVersions('12.3.5', '11.8.9')).toBe(1);
    expect(compareVersions('12.3.5', '12.3.5')).toBe(0);
    expect(compareVersions('12.3.5', '14.1.5')).toBe(-1);
  });
  it('can handle different version lengths', () => {
    expect(compareVersions('12', '11.8.9')).toBe(1);
    expect(compareVersions('12', '12.0.0')).toBe(0);
    expect(compareVersions('12', '14.1.5')).toBe(-1);

    expect(compareVersions('12.3.5', '11')).toBe(1);
    expect(compareVersions('12.0.0', '12')).toBe(0);
    expect(compareVersions('12.3.5', '14')).toBe(-1);
  });

  it('treats empty strings as smaller', () => {
    expect(compareVersions('12', '')).toBe(1);
    expect(compareVersions('', '12.0.0')).toBe(-1);
  });
});
