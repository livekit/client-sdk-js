// tiny, simplified version of https://github.com/lancedikson/bowser/blob/master/src/parser-browsers.js
// reduced to only differentiate Chrome(ium) based browsers / Firefox / Safari

const commonVersionIdentifier = /version\/(\d+(\.?_?\d+)+)/i;

export type DetectableBrowser = 'Chrome' | 'Firefox' | 'Safari';

export type BrowserDetails = {
  name: DetectableBrowser;
  version: string;
};

let browserDetails: BrowserDetails | undefined;

/**
 * @internal
 */
export function getBrowser(userAgent?: string, force = true) {
  if (typeof userAgent === 'undefined' && typeof navigator === 'undefined') {
    return;
  }
  const ua = (userAgent ?? navigator.userAgent).toLowerCase();
  if (browserDetails === undefined || force) {
    const browser = browsersList.find(({ test }) => test.test(ua));
    browserDetails = browser?.describe(ua);
  }
  return browserDetails;
}

const browsersList = [
  {
    test: /firefox|iceweasel|fxios/i,
    describe(ua: string) {
      const browser: BrowserDetails = {
        name: 'Firefox',
        version: getMatch(/(?:firefox|iceweasel|fxios)[\s/](\d+(\.?_?\d+)+)/i, ua),
      };
      return browser;
    },
  },
  {
    test: /chrom|crios|crmo/i,
    describe(ua: string) {
      const browser: BrowserDetails = {
        name: 'Chrome',
        version: getMatch(/(?:chrome|chromium|crios|crmo)\/(\d+(\.?_?\d+)+)/i, ua),
      };

      return browser;
    },
  },
  /* Safari */
  {
    test: /safari|applewebkit/i,
    describe(ua: string) {
      const browser: BrowserDetails = {
        name: 'Safari',
        version: getMatch(commonVersionIdentifier, ua),
      };

      return browser;
    },
  },
];

function getMatch(exp: RegExp, ua: string, id = 1) {
  const match = ua.match(exp);
  return (match && match.length >= id && match[id]) || '';
}
