import log from '../logger';
import { isSafari } from './utils';

const defaultId = 'default';

export interface PermittedDevices {
  audioDeviceId?: string;
  videoDeviceId?: string;
}
export default class DeviceManager {
  private static instance?: DeviceManager;

  static mediaDeviceKinds: MediaDeviceKind[] = ['audioinput', 'audiooutput', 'videoinput'];

  static getInstance(): DeviceManager {
    if (this.instance === undefined) {
      this.instance = new DeviceManager();
    }
    return this.instance;
  }

  static userMediaPromiseMap: Map<string, Promise<MediaStream>> = new Map();

  async getDevices(
    kind?: MediaDeviceKind,
    mediaConstraints?: MediaStreamConstraints,
    requestPermissions: boolean = true,
  ): Promise<[MediaDeviceInfo[], PermittedDevices]> {
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
    console.log('userMediaDevice promises resolved');
    let devices = await navigator.mediaDevices.enumerateDevices();
    // On firefox the user is given the option to choose which device they want to grant usage permission
    // selectedDevices stores this so the user choice is accessible
    let permittedDevices: PermittedDevices = {};

    // For backwards compatibility we set mediaConsraints based on requestPremissions
    if (!mediaConstraints && requestPermissions) {
      mediaConstraints = {
        video: kind !== 'audioinput' && kind !== 'audiooutput',
        audio: kind !== 'videoinput',
      };
    }

    if (
      mediaConstraints &&
      (mediaConstraints.audio || mediaConstraints.video) &&
      // for safari we need to skip this check, as otherwise it will re-acquire user media and fail on iOS https://bugs.webkit.org/show_bug.cgi?id=179363
      (!DeviceManager.userMediaPromiseMap.get(JSON.stringify(mediaConstraints)) || !isSafari())
    ) {
      const isDummyDeviceOrEmpty =
        devices.length === 0 ||
        devices.some((device) => {
          const noLabel = device.label === '';
          const isRelevant = kind ? device.kind === kind : true;
          return noLabel && isRelevant;
        });

      if (isDummyDeviceOrEmpty) {
        console.log('DeviceManager getUserMedia', mediaConstraints);
        const streamPromise = navigator.mediaDevices.getUserMedia(mediaConstraints);
        DeviceManager.userMediaPromiseMap.set(JSON.stringify(mediaConstraints), streamPromise);
        const stream = await streamPromise;
        devices = await navigator.mediaDevices.enumerateDevices();

        stream.getTracks().forEach((track) => {
          // Determin which devices the browser actually ended up using
          const deviceId = track.getSettings().deviceId;
          if (track.kind == 'audio') {
            permittedDevices.audioDeviceId = deviceId;
          } else if (track.kind == 'video') {
            permittedDevices.videoDeviceId = deviceId;
          }
          // and stop the tracks (They were only started to enforce the permission prompt.)
          track.stop();
        });
      }
    }
    if (kind) {
      devices = devices.filter((device) => device.kind === kind);
    }

    return [devices, permittedDevices];
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
    const [devices] = await this.getDevices(kind);

    const device = devices.find((d) => d.groupId === groupId && d.deviceId !== defaultId);

    return device?.deviceId;
  }
}
