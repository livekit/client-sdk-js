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

import { describe, expect, test } from 'vitest';
import { facingModeFromDeviceLabel } from './facingMode';

describe('Test facingMode detection', () => {
  test('OBS virtual camera should be detected.', () => {
    const result = facingModeFromDeviceLabel('OBS Virtual Camera');
    expect(result?.facingMode).toEqual('environment');
    expect(result?.confidence).toEqual('medium');
  });

  test.each([
    ['Peter’s iPhone Camera', { facingMode: 'environment', confidence: 'medium' }],
    ['iPhone de Théo Camera', { facingMode: 'environment', confidence: 'medium' }],
  ])(
    'Device labels that contain "iphone" should return facingMode "environment".',
    (label, expected) => {
      const result = facingModeFromDeviceLabel(label);
      expect(result?.facingMode).toEqual(expected.facingMode);
      expect(result?.confidence).toEqual(expected.confidence);
    },
  );

  test.each([
    ['Peter’s iPad Camera', { facingMode: 'environment', confidence: 'medium' }],
    ['iPad de Théo Camera', { facingMode: 'environment', confidence: 'medium' }],
  ])('Device label that contain "ipad" should detect.', (label, expected) => {
    const result = facingModeFromDeviceLabel(label);
    expect(result?.facingMode).toEqual(expected.facingMode);
    expect(result?.confidence).toEqual(expected.confidence);
  });
});
