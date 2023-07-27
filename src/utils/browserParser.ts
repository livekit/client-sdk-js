/**
 * Copyright 2023 LiveKit, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// tiny, simplified version of https://github.com/lancedikson/bowser/blob/master/src/parser-browsers.js
// reduced to only differentiate Chrome(ium) based browsers / Firefox / Safari

const commonVersionIdentifier = /version\/(\d+(\.?_?\d+)+)/i;

export type DetectableBrowser = 'Chrome' | 'Firefox' | 'Safari';
export type DetectableOS = 'iOS' | 'macOS';

export type BrowserDetails = {
  name: DetectableBrowser;
  version: string;
  os?: DetectableOS;
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
        os: ua.toLowerCase().includes('fxios') ? 'iOS' : undefined,
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
        os: ua.toLowerCase().includes('crios') ? 'iOS' : undefined,
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
        os: ua.includes('mobile/') ? 'iOS' : 'macOS',
      };

      return browser;
    },
  },
];

function getMatch(exp: RegExp, ua: string, id = 1) {
  const match = ua.match(exp);
  return (match && match.length >= id && match[id]) || '';
}
