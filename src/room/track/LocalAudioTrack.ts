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

import log from '../../logger';
import { TrackEvent } from '../events';
import { computeBitrate, monitorFrequency } from '../stats';
import type { AudioSenderStats } from '../stats';
import { isWeb, unwrapConstraint } from '../utils';
import LocalTrack from './LocalTrack';
import { Track } from './Track';
import type { AudioCaptureOptions } from './options';
import { constraintsForOptions, detectSilence } from './utils';

export default class LocalAudioTrack extends LocalTrack {
  /** @internal */
  stopOnMute: boolean = false;

  private prevStats?: AudioSenderStats;

  /**
   *
   * @param mediaTrack
   * @param constraints MediaTrackConstraints that are being used when restarting or reacquiring tracks
   * @param userProvidedTrack Signals to the SDK whether or not the mediaTrack should be managed (i.e. released and reacquired) internally by the SDK
   */
  constructor(
    mediaTrack: MediaStreamTrack,
    constraints?: MediaTrackConstraints,
    userProvidedTrack = true,
  ) {
    super(mediaTrack, Track.Kind.Audio, constraints, userProvidedTrack);
    this.checkForSilence();
  }

  async setDeviceId(deviceId: ConstrainDOMString): Promise<boolean> {
    if (this._constraints.deviceId === deviceId) {
      return true;
    }
    this._constraints.deviceId = deviceId;
    if (!this.isMuted) {
      await this.restartTrack();
    }
    return (
      this.isMuted || unwrapConstraint(deviceId) === this.mediaStreamTrack.getSettings().deviceId
    );
  }

  async mute(): Promise<LocalAudioTrack> {
    const unlock = await this.muteLock.lock();
    try {
      // disabled special handling as it will cause BT headsets to switch communication modes
      if (this.source === Track.Source.Microphone && this.stopOnMute && !this.isUserProvided) {
        log.debug('stopping mic track');
        // also stop the track, so that microphone indicator is turned off
        this._mediaStreamTrack.stop();
      }
      await super.mute();
      return this;
    } finally {
      unlock();
    }
  }

  async unmute(): Promise<LocalAudioTrack> {
    const unlock = await this.muteLock.lock();
    try {
      const deviceHasChanged =
        this._constraints.deviceId &&
        this._mediaStreamTrack.getSettings().deviceId !==
          unwrapConstraint(this._constraints.deviceId);

      if (
        this.source === Track.Source.Microphone &&
        (this.stopOnMute || this._mediaStreamTrack.readyState === 'ended' || deviceHasChanged) &&
        !this.isUserProvided
      ) {
        log.debug('reacquiring mic track');
        await this.restartTrack();
      }
      await super.unmute();

      return this;
    } finally {
      unlock();
    }
  }

  async restartTrack(options?: AudioCaptureOptions) {
    let constraints: MediaTrackConstraints | undefined;
    if (options) {
      const streamConstraints = constraintsForOptions({ audio: options });
      if (typeof streamConstraints.audio !== 'boolean') {
        constraints = streamConstraints.audio;
      }
    }
    await this.restart(constraints);
  }

  protected async restart(constraints?: MediaTrackConstraints): Promise<LocalTrack> {
    const track = await super.restart(constraints);
    this.checkForSilence();
    return track;
  }

  /* @internal */
  startMonitor() {
    if (!isWeb()) {
      return;
    }
    if (this.monitorInterval) {
      return;
    }
    this.monitorInterval = setInterval(() => {
      this.monitorSender();
    }, monitorFrequency);
  }

  protected monitorSender = async () => {
    if (!this.sender) {
      this._currentBitrate = 0;
      return;
    }

    let stats: AudioSenderStats | undefined;
    try {
      stats = await this.getSenderStats();
    } catch (e) {
      log.error('could not get audio sender stats', { error: e });
      return;
    }

    if (stats && this.prevStats) {
      this._currentBitrate = computeBitrate(stats, this.prevStats);
    }

    this.prevStats = stats;
  };

  async getSenderStats(): Promise<AudioSenderStats | undefined> {
    if (!this.sender?.getStats) {
      return undefined;
    }

    const stats = await this.sender.getStats();
    let audioStats: AudioSenderStats | undefined;
    stats.forEach((v) => {
      if (v.type === 'outbound-rtp') {
        audioStats = {
          type: 'audio',
          streamId: v.id,
          packetsSent: v.packetsSent,
          packetsLost: v.packetsLost,
          bytesSent: v.bytesSent,
          timestamp: v.timestamp,
          roundTripTime: v.roundTripTime,
          jitter: v.jitter,
        };
      }
    });

    return audioStats;
  }

  async checkForSilence() {
    const trackIsSilent = await detectSilence(this);
    if (trackIsSilent) {
      if (!this.isMuted) {
        log.warn('silence detected on local audio track');
      }
      this.emit(TrackEvent.AudioSilenceDetected);
    }
    return trackIsSilent;
  }
}
