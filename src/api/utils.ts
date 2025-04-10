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

  // Replace trailing slash or no slash with /validate
  urlObj.pathname = ensureTrailingSlash(urlObj.pathname) + 'validate';

  return urlObj.toString(); // preserves searchParams automatically
}

function ensureTrailingSlash(path: string) {
  return path.endsWith('/') ? path : `${path}/`;
}

function appendUrlPath(urlObj: URL, path: string) {
  const result = `${urlObj.protocol}//${urlObj.host}${ensureTrailingSlash(urlObj.pathname)}${path}`;
  if (urlObj.searchParams.size > 0) {
    return `${result}?${urlObj.searchParams.toString()}`;
  }
  return result;
}
