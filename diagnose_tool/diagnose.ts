//@ts-ignore
import {
  ConnectionState,
  ExternalE2EEKeyProvider,
  LogLevel,
  Participant,
  RemoteVideoTrack,
  RoomEvent,
  RoomOptions,
  Track,
  VideoCodec,
  VideoPresets,
  setLogLevel,
  supportsAV1,
  supportsVP9,
} from '../src/index';
import { ScalabilityMode } from '../src/room/track/options';
import { isSVCCodec } from '../src/room/utils';
import { Agent } from './agent';
import { Candidate, CandidatePair, TestItem, TestSummary } from './stats';
import { sleep } from './utils';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const state = {
  isFrontFacing: false,
  encoder: new TextEncoder(),
  decoder: new TextDecoder(),
  defaultDevices: new Map<MediaDeviceKind, string>(),
  bitrateInterval: undefined as any,
  e2eeKeyProvider: new ExternalE2EEKeyProvider(),
};
const testConfig = {
  duration: 60000,
  maxProbeBitrates: 10_700_000,
  pubPreset: VideoPresets.h1080,
};

const videoFile = `${window.location.origin}/resources/crescent_1080.webm`;

let pubAgent: Agent | undefined;
let subAgent: Agent | undefined;
let pubSummary: TestSummary | undefined;
let subSummary: TestSummary | undefined;
let resultElements: HTMLElement[] = [];

const searchParams = new URLSearchParams(window.location.search);
const storedUrl = searchParams.get('url') ?? 'ws://localhost:7880';
const storedToken = searchParams.get('token') ?? '';
const storedShouldSubscribe = searchParams.get('shouldSubscribe') ?? '';
const storedSubscribeToken = searchParams.get('subscribeToken') ?? '';
(<HTMLInputElement>$('url')).value = storedUrl;
(<HTMLInputElement>$('token')).value = storedToken;
(<HTMLInputElement>$('test-subscribe')).checked = storedShouldSubscribe === 'true';
(<HTMLInputElement>$('subscribe-token')).value = storedSubscribeToken;

function updateSearchParams(
  url: string,
  token: string,
  shouldSubscribe: string,
  subscribeToken: string,
) {
  const params = new URLSearchParams({ url, token, shouldSubscribe, subscribeToken });
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}

// handles actions from the HTML
const appActions = {
  connectWithFormInput: async () => {
    const url = (<HTMLInputElement>$('url')).value;
    const token = (<HTMLInputElement>$('token')).value;
    const preferredCodec = (<HTMLSelectElement>$('preferred-codec')).value as VideoCodec;
    const scalabilityMode = (<HTMLSelectElement>$('scalability-mode')).value;
    const shouldSubscribe = (<HTMLInputElement>$('test-subscribe')).checked;
    const subscribeToken = shouldSubscribe
      ? (<HTMLInputElement>$('subscribe-token')).value
      : undefined;

    setLogLevel(LogLevel.debug);
    updateSearchParams(url, token, shouldSubscribe ? 'true' : '', subscribeToken ?? '');

    const roomOpts: RoomOptions = {
      publishDefaults: {
        videoCodec: preferredCodec || 'vp8',
        scalabilityMode: 'L3T3',
        videoEncoding: {
          maxBitrate: testConfig.maxProbeBitrates,
          maxFramerate: testConfig.pubPreset.encoding.maxFramerate,
        },
        videoSimulcastLayers: [VideoPresets.h90],
      },
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
      },
    };
    if (
      roomOpts.publishDefaults?.videoCodec === 'av1' ||
      roomOpts.publishDefaults?.videoCodec === 'vp9'
    ) {
      roomOpts.publishDefaults.backupCodec = true;
      if (scalabilityMode !== '') {
        roomOpts.publishDefaults.scalabilityMode = scalabilityMode as ScalabilityMode;
      }
    }

    await appActions.connectToRoom(url, token, roomOpts, subscribeToken);
  },

  connectToRoom: async (
    url: string,
    token: string,
    roomOptions?: RoomOptions,
    subscribeToken?: string,
  ): Promise<undefined> => {
    const sessionArea = $('summary-area');
    resultElements.forEach((ele) => sessionArea.removeChild(ele));

    pubAgent = new Agent(
      {
        url,
        token,
        container: $('session-area'),
      },
      'publisher',
      roomOptions,
    );

    pubAgent.room.on(RoomEvent.Connected, () => setButtonState('start-button', true));
    pubAgent.room.on(RoomEvent.Disconnected, () => setButtonState('start-button', false));

    if (subscribeToken) {
      subAgent = new Agent(
        {
          url,
          token: subscribeToken,
          container: $('session-area'),
        },
        'subscriber',
      );
    }

    const [track] = await Promise.all([
      createMediaStreamTrackFromVideo(videoFile),
      pubAgent.join(),
      subAgent?.join({ autoSubscribe: true }),
    ]);
    const camPub = await pubAgent.localParticipant.publishTrack(track, {
      name: 'videofile',
      source: Track.Source.Camera,
    });

    // intercept dynacast notify to avoid dynacast for svc codecs.
    pubAgent.room.engine.client.onSubscribedQualityUpdate = undefined;

    // const camPub = await pubAgent.localParticipant.setCameraEnabled(true);
    if (subAgent) {
      await subAgent.ensureTrackSubscribed(camPub!.trackSid);
      subSummary = new TestSummary(
        {
          bitrates: testConfig.pubPreset.encoding.maxBitrate / 2,
          fps: testConfig.pubPreset.encoding.maxFramerate!,
        },
        true,
      );
    }
    pubSummary = new TestSummary({
      bitrates: testConfig.pubPreset.encoding.maxBitrate,
      fps: testConfig.pubPreset.encoding.maxFramerate!,
    });
    state.bitrateInterval = setInterval(renderBitrate, 1000);

    // wait awhile for bandwidth/encoding becoming stable
    await sleep(10000);

    const statsInterval = setInterval(async () => {
      await collectStats(camPub!.trackSid);
    }, 1000);
    await sleep(testConfig.duration);
    await collectStats(camPub!.trackSid, true);
    await pubAgent.leaveAndRemove();
    await subAgent?.leaveAndRemove();
    clearInterval(statsInterval);
    clearInterval(state.bitrateInterval);

    (<HTMLVideoElement>$('video-source')).pause();

    renderSummary(pubSummary.summary(testConfig.duration / 1000), true);
    if (subAgent) {
      renderSummary(subSummary!.summary(testConfig.duration / 1000));
    }
  },
};

declare global {
  interface Window {
    currentRoom: any;
    appActions: typeof appActions;
  }
}

window.appActions = appActions;

// -------------------------- rendering helpers ----------------------------- //

function renderBitrate() {
  [pubAgent, subAgent].forEach((agent) => {
    if (!agent || agent.room.state !== ConnectionState.Connected) return;

    const participants: Participant[] = [...agent.room.remoteParticipants.values()];
    participants.push(agent.room.localParticipant);

    for (const p of participants) {
      const elm = $(`bitrate-${agent.identity}-${p.identity}`);
      let totalBitrate = 0;
      for (const t of p.trackPublications.values()) {
        if (t.track) {
          totalBitrate += t.track.currentBitrate;
        }

        if (t.source === Track.Source.Camera) {
          if (t.videoTrack instanceof RemoteVideoTrack) {
            const codecElm = $(`codec-${agent.identity}-${p.identity}`)!;
            codecElm.innerHTML = t.videoTrack.getDecoderImplementation() ?? '';
          }
        }
      }
      let displayText = '';
      if (totalBitrate > 0) {
        displayText = `${Math.round(totalBitrate / 1024).toLocaleString()} kbps`;
      }
      if (elm) {
        elm.innerHTML = displayText;
      }
    }
  });
}

async function collectStats(trackSid: string, includeCandidate?: boolean): Promise<void> {
  const promises = [collectStatsForAgent(pubAgent!, pubSummary!, trackSid, true, includeCandidate)];
  if (subAgent) {
    promises.push(collectStatsForAgent(subAgent!, subSummary!, trackSid, false, includeCandidate));
  }
  await Promise.all(promises);
}

async function collectStatsForAgent(
  agent: Agent,
  summary: TestSummary,
  trackSid: string,
  isPub: boolean,
  includeCandidate?: boolean,
) {
  const pc = isPub
    ? agent?.room.engine.pcManager?.publisher
    : agent?.room.engine.pcManager?.subscriber;
  const pcStats = await pc?.getStats();
  let candidatePair: CandidatePair | undefined;
  pcStats?.forEach((val) => {
    if (
      !candidatePair &&
      val.type === 'candidate-pair' &&
      val.nominated &&
      val.state === 'succeeded' &&
      (val.availableOutgoingBitrate || val.availableIncomingBitrate)
    ) {
      candidatePair = val;
    }
  });

  if (!candidatePair) {
    console.log('cant find succeeded candidate pair');
    return;
  }

  let candidate: Candidate | undefined;
  if (includeCandidate) {
    pcStats?.forEach((val) => {
      if (
        !candidate &&
        val.type === 'local-candidate' &&
        val.id === candidatePair?.localCandidateId
      ) {
        candidate = val;
      }
    });
  }

  if (isPub) {
    const pubTrackStats = await (
      await agent.getLocalPublicationBySid(trackSid)
    )?.videoTrack?.getSenderStats();
    if (!pubTrackStats || pubTrackStats.length === 0) {
      console.log('cant find rtp transceiver stats');
      return;
    }
    let pubTrackStat = pubTrackStats[0];
    if (pubTrackStats.length > 1) {
      const highLayer = pubTrackStats.find((stat) => stat.rid !== 'q');
      if (highLayer) {
        pubTrackStat = highLayer;
      }
    }
    summary?.pushStats({
      selectedLocalCandidate: candidate,
      candidatePair: candidatePair,
      senderStats: pubTrackStat,
    });
  } else {
    const subTrackStats = await agent.getSubscribedVideoStats(trackSid);
    summary.pushStats({
      selectedLocalCandidate: candidate,
      candidatePair: candidatePair,
      receiverStats: subTrackStats,
    });
  }
}

function renderSummary(items: TestItem[], isPub?: boolean) {
  const summaryTable = <HTMLTableElement>document.createElement('table');
  const caption = summaryTable.createCaption();
  const head = summaryTable.createTHead().insertRow();
  ['', 'Result', 'Expect', 'Pass'].forEach((text) => {
    head.insertCell().innerText = text;
  });

  let summaryPass = true;
  const body = summaryTable.createTBody();
  items.forEach((item) => {
    if (item.pass === false) {
      summaryPass = false;
    }
    const row = body.insertRow();
    [item.name, item.actual, item.expect, item.pass].forEach((val) => {
      const cell = row.insertCell();
      if (val === undefined) {
        cell.innerText = '/';
      } else {
        cell.innerText = val.toString();
      }
    });
  });
  caption.innerText = `${isPub ? 'Publish' : 'Subscribe'} Test ${summaryPass ? 'Pass' : 'Failed'}`;
  resultElements.push($('summary-area').appendChild(summaryTable));
}

async function createMediaStreamTrackFromVideo(url: string): Promise<MediaStreamTrack> {
  // Fetch the video file as a Blob
  const response = await fetch(url);
  if (!response.ok) throw new Error('Video fetching failed');
  const videoBlob = await response.blob();

  // Create a video element
  const video = <HTMLVideoElement>$('video-source');

  video.src = URL.createObjectURL(videoBlob);

  const loadPromise = new Promise<void>((resolve) => {
    video.oncanplay = () => resolve();
  });

  await loadPromise;
  /* @ts-ignore */
  const track = video.captureStream().getVideoTracks()[0];
  // console.log(
  //   "MediaStreamTrack created:",
  //   track,
  //   video,
  //   /* @ts-ignore */
  //   video.captureStream().getTracks(),
  // );
  // Load the video and start the stream
  video.play();
  return track;
}

function setButtonState(buttonId: string, isDisabled: boolean | undefined = undefined) {
  const el = $(buttonId) as HTMLButtonElement;
  if (!el) return;
  if (isDisabled !== undefined) {
    el.disabled = isDisabled;
  }
}

function populateSupportedCodecs() {
  /*
<option value="" selected>PreferredCodec</option>
                <option value="vp8">VP8</option>
                <option value="h264">H.264</option>
                <option value="vp9">VP9</option>
                <option value="av1">AV1</option>
*/
  const codecSelect = $('preferred-codec');
  const options: string[][] = [
    ['', 'Preferred codec'],
    ['h264', 'H.264'],
    ['vp8', 'VP8'],
  ];
  if (supportsVP9()) {
    options.push(['vp9', 'VP9']);
  }
  if (supportsAV1()) {
    options.push(['av1', 'AV1']);
  }
  for (const o of options) {
    const n = document.createElement('option');
    n.value = o[0];
    n.appendChild(document.createTextNode(o[1]));
    codecSelect.appendChild(n);
  }
}

function populateScalabilityModes() {
  const modeSelect = $('scalability-mode');
  const modes: string[] = [
    'L1T1',
    'L1T2',
    'L1T3',
    'L2T1',
    'L2T1h',
    'L2T1_KEY',
    'L2T2',
    'L2T2h',
    'L2T2_KEY',
    'L2T3',
    'L2T3h',
    'L2T3_KEY',
    'L3T1',
    'L3T1h',
    'L3T1_KEY',
    'L3T2',
    'L3T2h',
    'L3T2_KEY',
    'L3T3',
    'L3T3h',
    'L3T3_KEY',
  ];
  let n = document.createElement('option');
  n.value = '';
  n.text = 'ScalabilityMode';
  modeSelect.appendChild(n);
  for (const mode of modes) {
    n = document.createElement('option');
    n.value = mode;
    n.text = mode;
    modeSelect.appendChild(n);
  }

  const codecSelect = <HTMLSelectElement>$('preferred-codec');
  codecSelect.onchange = () => {
    if (isSVCCodec(codecSelect.value)) {
      modeSelect.removeAttribute('disabled');
    } else {
      modeSelect.setAttribute('disabled', 'true');
    }
  };
}

function handleSubscribeOption() {
  const subscribeCheckBox = <HTMLInputElement>$('test-subscribe');

  const onclick = () => {
    if (subscribeCheckBox.checked) {
      $('subscribe-token-container').removeAttribute('hidden');
    } else {
      $('subscribe-token-container').setAttribute('hidden', '');
    }
  };

  subscribeCheckBox.addEventListener('click', onclick);
  onclick();
}

populateSupportedCodecs();
populateScalabilityModes();
handleSubscribeOption();
