import { toHttpUrl } from '../room/utils';

export function createRtcUrl(url: string, searchParams: URLSearchParams) {
  const urlObj = new URL(url);
  searchParams.forEach((value, key) => {
    urlObj.searchParams.set(key, value);
  });
  return appendUrlPath(urlObj, 'rtc');
}

export function createValidateUrl(rtcWsUrl: string) {
  const urlObj = new URL(toHttpUrl(rtcWsUrl));
  return appendUrlPath(urlObj, 'validate');
}

function ensureTrailingSlash(url: string) {
  return url.endsWith('/') ? url : `${url}/`;
}

function appendUrlPath(urlObj: URL, path: string) {
  const result = `${urlObj.protocol}//${urlObj.host}${ensureTrailingSlash(urlObj.pathname)}${path}`;
  if (urlObj.searchParams.size > 0) {
    return `${result}?${urlObj.searchParams.toString()}`;
  }
  return result;
}
