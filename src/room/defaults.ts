import { TrackPublishDefaults } from './track/options';

let trackDefaults: TrackPublishDefaults = {};

export function getTrackDefaults(): TrackPublishDefaults {
  return trackDefaults;
}

export function setTrackDefaults(defaults: TrackPublishDefaults) {
  trackDefaults = defaults;
}
