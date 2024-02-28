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
      // for safari we need to skip this check, as otherwise it will re-acquire user media and fail on iOS https://bugs.webkit.org/show_bug.cgi?id=179363
      !(isSafari() && this.hasDeviceInUse(kind))
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

    // `default` devices will have the same groupId as the entry with the actual device id so we store the counts for each group id
    const groupIdCounts = new Map(devices.map((d) => [d.groupId, 0]));

    devices.forEach((d) => groupIdCounts.set(d.groupId, (groupIdCounts.get(d.groupId) ?? 0) + 1));

    console.log(groupIdCounts, devices);

    const device = devices.find(
      (d) =>
        (groupId === d.groupId || (groupIdCounts.get(d.groupId) ?? 0) > 1) &&
        d.deviceId !== defaultId,
    );

    console.log(device);

    return device?.deviceId;
  }

  private hasDeviceInUse(kind?: MediaDeviceKind): boolean {
    return kind
      ? DeviceManager.userMediaPromiseMap.has(kind)
      : DeviceManager.userMediaPromiseMap.size > 0;
  }
}
