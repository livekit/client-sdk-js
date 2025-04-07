import urlJoin from 'proper-url-join';
import { toHttpUrl } from '../room/utils';

/**
 * Creates a RTC URL from a base URL and search parameters.
 *
 * @param url - The base URL to create the RTC URL from.
 * @param searchParams - The search parameters to populate the RTC URL with.
 * @returns The RTC URL.
 */
export function createRtcUrl(url: string, searchParams: URLSearchParams) {
  return urlJoin(url, 'rtc', { query: Object.fromEntries(searchParams.entries()) });
}

export function createValidateUrl(rtcWsUrl: string) {
  const urlObj = new URL(toHttpUrl(rtcWsUrl));
  const query = Object.fromEntries(urlObj.searchParams.entries());

  return urlJoin(`${urlObj.protocol}//${urlObj.host}`, urlObj.pathname, 'validate', {
    query,
    leadingSlash: false,
  });
}
