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

import log from '../logger';
import { isSafari } from './utils';

const defaultId = 'default';

export default class DeviceManager {
  private static instance?: DeviceManager;

  static mediaDeviceKinds: MediaDeviceKind[] = ['audioinput', 'audiooutput', 'videoinput'];

  static getInstance(): DeviceManager {
    if (this.instance === undefined) {
      this.instance = new DeviceManager();
    }
    return this.instance;
  }

  static userMediaPromiseMap: Map<MediaDeviceKind, Promise<MediaStream>> = new Map();

  async getDevices(
    kind?: MediaDeviceKind,
    requestPermissions: boolean = true,
  ): Promise<MediaDeviceInfo[]> {
    if (DeviceManager.userMediaPromiseMap?.size > 0) {
      log.debug('awaiting getUserMedia promise');
      try {
        if (kind) {
          await DeviceManager.userMediaPromiseMap.get(kind);
        } else {
          await Promise.all(DeviceManager.userMediaPromiseMap.values());
        }
      } catch (e: any) {
        log.warn('error waiting for media permissons');
      }
    }
    let devices = await navigator.mediaDevices.enumerateDevices();

    if (
      requestPermissions &&
      kind &&
      // for safari we need to skip this check, as otherwise it will re-acquire user media and fail on iOS https://bugs.webkit.org/show_bug.cgi?id=179363
      (!DeviceManager.userMediaPromiseMap.get(kind) || !isSafari())
    ) {
      const isDummyDeviceOrEmpty =
        devices.length === 0 ||
        devices.some((device) => {
          const noLabel = device.label === '';
          const isRelevant = kind ? device.kind === kind : true;
          return noLabel && isRelevant;
        });

      if (isDummyDeviceOrEmpty) {
        const permissionsToAcquire = {
          video: kind !== 'audioinput' && kind !== 'audiooutput',
          audio: kind !== 'videoinput',
        };
        const stream = await navigator.mediaDevices.getUserMedia(permissionsToAcquire);
        devices = await navigator.mediaDevices.enumerateDevices();
        stream.getTracks().forEach((track) => {
          track.stop();
        });
      }
    }
    if (kind) {
      devices = devices.filter((device) => device.kind === kind);
    }

    return devices;
  }

  async normalizeDeviceId(
    kind: MediaDeviceKind,
    deviceId?: string,
    groupId?: string,
  ): Promise<string | undefined> {
    if (deviceId !== defaultId) {
      return deviceId;
    }

    // resolve actual device id if it's 'default': Chrome returns it when no
    // device has been chosen
    const devices = await this.getDevices(kind);

    const device = devices.find((d) => d.groupId === groupId && d.deviceId !== defaultId);

    return device?.deviceId;
  }
}
