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

  async getDevices(
    kind?: MediaDeviceKind,
    requestPermissions: boolean = true,
  ): Promise<MediaDeviceInfo[]> {
    if (requestPermissions) {
      const permissionsToAquire = {
        video: kind !== 'audioinput' && kind !== 'audiooutput',
        audio: kind !== 'videoinput',
      };
      await navigator.mediaDevices.getUserMedia(permissionsToAquire);
    }
    let devices = await navigator.mediaDevices.enumerateDevices();
    if (kind) {
      devices = devices.filter((device) => device.kind === kind);
    }
    // Chrome returns 'default' devices, we would filter them out, but put the default
    // device at first
    // we would only do this if there are more than 1 device though
    if (devices.length > 1 && devices[0].deviceId === defaultId) {
      // find another device with matching group id, and move that to 0
      const defaultDevice = devices[0];
      for (let i = 1; i < devices.length; i += 1) {
        if (devices[i].groupId === defaultDevice.groupId) {
          const temp = devices[0];
          devices[0] = devices[i];
          devices[i] = temp;
          break;
        }
      }
      return devices.filter((device) => device !== defaultDevice);
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
