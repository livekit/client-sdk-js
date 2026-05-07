import { type LocalDataTrack, type RemoteDataTrack, Room, RoomEvent } from '../../src/index';
import type { DataTrackFrame } from '../../src/room/data-track/frame';

const $ = (id: string) => document.getElementById(id)!;

const encoder = new TextEncoder();

let roomName = `data-tracks-example`;

let publisherRoom: Room | null = null;
let subscriberRoom: Room | null = null;

let localDataTracks: Array<LocalDataTrack> = [];
let remoteDataTracks: Array<RemoteDataTrack> = [];

// ── Connection ──────────────────────────────────────────────────────────────

async function connectPublisher() {
  const btn = $('publisher-connect-btn') as HTMLButtonElement;

  if (publisherRoom) {
    await publisherRoom.disconnect();
    publisherRoom = null;
    localDataTracks = [];
    renderLocalTracks();
    ($('publish-btn') as HTMLButtonElement).disabled = true;
    btn.textContent = 'Connect';
    $('publisher-identity')!.textContent = '';
    updateRoomStatus();
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Connecting...';

  const identity = `publisher-${Math.random().toString(36).substring(7)}`;
  try {
    publisherRoom = await connectParticipant(identity, roomName);
  } catch (err) {
    console.error('Publisher failed to connect:', err);
    btn.disabled = false;
    btn.textContent = 'Connect';
    return;
  }

  $('publisher-identity')!.textContent = identity;
  ($('publish-btn') as HTMLButtonElement).disabled = false;
  btn.disabled = false;
  btn.textContent = 'Disconnect';
  updateRoomStatus();
}

async function connectSubscriber() {
  const btn = $('subscriber-connect-btn') as HTMLButtonElement;

  if (subscriberRoom) {
    await subscriberRoom.disconnect();
    subscriberRoom = null;
    remoteDataTracks = [];
    renderRemoteTracks();
    btn.textContent = 'Connect';
    $('subscriber-identity')!.textContent = '';
    updateRoomStatus();
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Connecting...';

  // Attach event handlers before connecting so we don't miss DataTrackPublished
  // events that fire during the connection handshake.
  const room = new Room();
  room
    .on(RoomEvent.DataTrackPublished, (track) => {
      remoteDataTracks.push(track);
      renderRemoteTracks();
    })
    .on(RoomEvent.DataTrackUnpublished, (sid) => {
      const index = remoteDataTracks.findIndex((t) => t.info.sid === sid);
      if (index >= 0) {
        remoteDataTracks.splice(index, 1);
        renderRemoteTracks();
      }
    });

  const identity = `publisher-${Math.random().toString(36).substring(7)}`;
  try {
    const { token, url } = await fetchToken(identity, roomName);
    await room.connect(url, token);
    await new Promise<void>((resolve) => {
      if (room.state === 'connected') {
        resolve();
      } else {
        room.once(RoomEvent.Connected, () => resolve());
      }
    });
    subscriberRoom = room;
  } catch (err) {
    console.error('Subscriber failed to connect:', err);
    btn.disabled = false;
    btn.textContent = 'Connect';
    return;
  }

  $('subscriber-identity')!.textContent = identity;
  btn.disabled = false;
  btn.textContent = 'Disconnect';
  updateRoomStatus();
}

function updateRoomStatus() {
  const roomNameEl = $('room-name');
  if (publisherRoom || subscriberRoom) {
    roomNameEl.textContent = roomName;
  } else {
    roomNameEl.textContent = 'Not connected';
  }
}

async function connectParticipant(identity: string, room: string): Promise<Room> {
  const r = new Room();
  const { token, url } = await fetchToken(identity, room);

  await r.connect(url, token);

  await new Promise<void>((resolve) => {
    if (r.state === 'connected') {
      resolve();
    } else {
      r.once(RoomEvent.Connected, () => resolve());
    }
  });

  return r;
}

async function fetchToken(
  identity: string,
  roomName: string,
): Promise<{ token: string; url: string }> {
  const response = await fetch('/api/get-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity, roomName }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch token');
  }

  const data = await response.json();
  return { token: data.token, url: data.url };
}

// ── Publishing (left column) ────────────────────────────────────────────────

async function publishDataTrack() {
  const input = $('publish-name') as HTMLInputElement;
  const button = $('publish-btn') as HTMLButtonElement;

  if (!publisherRoom) {
    return;
  }

  button.textContent = 'Publishing...';
  button.disabled = true;
  input.classList.remove('is-invalid');

  try {
    const localDataTrack = await publisherRoom.localParticipant.publishDataTrack({
      name: input.value,
    });
    input.value = '';
    localDataTracks.push(localDataTrack);
    renderLocalTracks();
  } catch (err) {
    console.error('publishDataTrack failed:', err);
    input.classList.add('is-invalid');
  } finally {
    button.textContent = 'Publish';
    button.disabled = false;
  }
}

function createLocalTrackElement(localDataTrack: LocalDataTrack): HTMLElement | null {
  if (!localDataTrack.isPublished()) {
    return null;
  }
  const { sid, pubHandle, name } = localDataTrack.info;

  const card = document.createElement('div');
  card.className = 'track-card';
  card.dataset.sid = sid;

  card.innerHTML = `
    <div class="track-card-header">
      <span class="track-name" title="${name}">${name}</span>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span class="badge-live">Live</span>
        <button class="btn btn-outline-danger btn-sm delete-btn" type="button">Unpublish</button>
      </div>
    </div>
    <div class="track-meta">
      <span>SID: ${sid}</span>
      <span>Handle: ${pubHandle}</span>
    </div>
    <div class="slider-row">
      <input type="range" min="0" max="512" value="0" />
      <span class="slider-value">0</span>
    </div>
  `;

  const slider = card.querySelector<HTMLInputElement>('input[type="range"]')!;
  const valueLabel = card.querySelector<HTMLSpanElement>('.slider-value')!;
  const deleteBtn = card.querySelector<HTMLButtonElement>('.delete-btn')!;

  slider.addEventListener('input', () => {
    valueLabel.textContent = slider.value;
    try {
      localDataTrack.tryPush({ payload: encoder.encode(slider.value) });
    } catch (err) {
      console.error(`Local data track ${sid}: tryPush failed:`, err);
    }
  });

  deleteBtn.addEventListener('click', async () => {
    deleteBtn.disabled = true;
    try {
      await localDataTrack.unpublish();
    } catch (err) {
      console.error(`DataTrack:${sid} unpublish failed:`, err);
      deleteBtn.disabled = false;
      return;
    }
    localDataTracks.splice(localDataTracks.indexOf(localDataTrack), 1);
    renderLocalTracks();
  });

  return card;
}

function renderLocalTracks() {
  const wrapper = $('local-tracks-list');
  const publishedTracks = localDataTracks.filter((l) => l.isPublished());
  const renderedSids = new Set<string>();

  for (const child of Array.from(wrapper.children)) {
    const el = child as HTMLElement;
    const sid = el.dataset.sid!;
    if (!publishedTracks.find((l) => l.info.sid === sid)) {
      el.remove();
    }
    renderedSids.add(sid);
  }

  for (const track of publishedTracks.filter((l) => !renderedSids.has(l.info.sid))) {
    const el = createLocalTrackElement(track);
    if (el) {
      wrapper.appendChild(el);
    }
  }
}

// ── Subscription (right column) ─────────────────────────────────────────────

const CHART_WIDTH = 500;
const CHART_HEIGHT = 160;
const CHART_PAD = { top: 8, right: 8, bottom: 8, left: 8 };
const CHART_PLOT_W = CHART_WIDTH - CHART_PAD.left - CHART_PAD.right;
const CHART_PLOT_H = CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;
const TIME_WINDOW_MS = 30_000;
const MAX_VALUE = 512;

function valueToY(value: number): number {
  const clamped = Math.max(0, Math.min(MAX_VALUE, value));
  return CHART_PAD.top + CHART_PLOT_H - (clamped / MAX_VALUE) * CHART_PLOT_H;
}

function renderChartPath(points: Array<{ time: number; value: number }>): string {
  const now = Date.now();

  if (points.length === 0) {
    return '';
  }

  // Newest values on the right, advancing left
  let d = '';
  for (const pt of points) {
    const age = now - pt.time;
    const x = CHART_PAD.left + CHART_PLOT_W - (age / TIME_WINDOW_MS) * CHART_PLOT_W;
    const y = valueToY(pt.value);
    d += d === '' ? `M${CHART_PAD.left + CHART_PLOT_W},${y} L${x},${y}` : ` L${x},${y}`;
  }
  return d;
}

function createRemoteTrackElement(remoteDataTrack: RemoteDataTrack): HTMLElement {
  const { sid, pubHandle, name } = remoteDataTrack.info;
  const identity = remoteDataTrack.publisherIdentity;

  const card = document.createElement('div');
  card.className = 'track-card';
  card.dataset.sid = sid;

  card.innerHTML = `
    <div class="track-card-header">
      <span class="track-name" title="${identity}: ${name}">${identity}: ${name}</span>
      <div class="subscription-buttons">
        <button class="btn btn-success btn-sm subscribe-btn" type="button">Subscribe</button>
        <button class="btn btn-warning btn-sm abort-btn" type="button" style="display:none;">Abort</button>
        <button class="btn btn-danger btn-sm cancel-btn" type="button" style="display:none;">Cancel Read</button>
        <button class="btn-icon fullscreen-btn" type="button" title="Fullscreen">&#x26F6;</button>
      </div>
    </div>
    <div class="track-meta">
      <span>SID: ${sid}</span>
      <span>Handle: ${pubHandle}</span>
    </div>
    <div class="chart-container">
      <svg viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" preserveAspectRatio="xMidYMid meet">
        <line x1="${CHART_PAD.left}" y1="${CHART_PAD.top + CHART_PLOT_H}" x2="${CHART_PAD.left + CHART_PLOT_W}" y2="${CHART_PAD.top + CHART_PLOT_H}" stroke="#6c757d" stroke-width="1" />
        <line x1="${CHART_PAD.left}" y1="${CHART_PAD.top}" x2="${CHART_PAD.left}" y2="${CHART_PAD.top + CHART_PLOT_H}" stroke="#6c757d" stroke-width="1" />
        <path class="chart-path" d="" fill="none" stroke="#ff4444" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" />
      </svg>
      <span class="chart-placeholder">Subscription not started</span>
    </div>
  `;

  const pathEl = card.querySelector<SVGPathElement>('.chart-path')!;
  const placeholder = card.querySelector<HTMLSpanElement>('.chart-placeholder')!;
  const subscribeBtn = card.querySelector<HTMLButtonElement>('.subscribe-btn')!;
  const abortBtn = card.querySelector<HTMLButtonElement>('.abort-btn')!;
  const cancelBtn = card.querySelector<HTMLButtonElement>('.cancel-btn')!;
  const fullscreenBtn = card.querySelector<HTMLButtonElement>('.fullscreen-btn')!;

  let subscriptionAbortController: AbortController | null = null;
  let reader: ReadableStreamDefaultReader<DataTrackFrame> | null = null;
  let renderInterval: number | null = null;
  let points: Array<{ time: number; value: number }> = [];

  function prunePoints(): void {
    const cutoff = Date.now() - TIME_WINDOW_MS;
    while (points.length > 0 && points[points.length - 1].time < cutoff) {
      points.pop();
    }
  }

  function renderChart(): void {
    prunePoints();
    pathEl.setAttribute('d', renderChartPath(points));
  }

  function startRenderLoop(): void {
    if (renderInterval) return;
    renderInterval = window.setInterval(renderChart, 1000 / 30);
  }

  function stopRenderLoop(): void {
    if (renderInterval) {
      window.clearInterval(renderInterval);
      renderInterval = null;
    }
  }

  async function startSubscription(): Promise<void> {
    points = [];
    pathEl.setAttribute('d', '');
    placeholder.style.display = 'none';

    subscribeBtn.style.display = 'none';
    abortBtn.style.display = '';
    cancelBtn.style.display = '';

    startRenderLoop();

    subscriptionAbortController = new AbortController();
    const stream = remoteDataTrack.subscribe({
      signal: subscriptionAbortController.signal,
    });
    reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const str = new TextDecoder().decode(value.payload);
        const parsed = parseInt(str, 10);
        if (!isNaN(parsed)) {
          points.unshift({ time: Date.now(), value: parsed });
        }
      }
    } catch (err) {
      console.error(`Remote data track ${sid}: subscription failed:`, err);
    } finally {
      cleanupAfterStop();
    }
  }

  function stopViaAbort(): void {
    if (subscriptionAbortController) {
      subscriptionAbortController.abort();
      subscriptionAbortController = null;
    }
    cleanupAfterStop();
  }

  function stopViaCancelRead(): void {
    if (reader) {
      reader.cancel();
      reader = null;
    }
    cleanupAfterStop();
  }

  function cleanupAfterStop(): void {
    subscriptionAbortController = null;
    reader = null;
    stopRenderLoop();
    renderChart();
    subscribeBtn.style.display = '';
    abortBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
    if (points.length === 0) {
      placeholder.style.display = '';
      placeholder.textContent = 'Subscription not started';
    }
  }

  // Fullscreen: render the chart data into a full-viewport SVG using a ResizeObserver
  fullscreenBtn.addEventListener('click', () => {
    const overlay = $('fullscreen-overlay');
    const content = $('fullscreen-content');
    content.innerHTML = '';

    const fsSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    fsSvg.style.width = '100%';
    fsSvg.style.height = '100%';
    fsSvg.style.background = '#0d0d1a';

    const fsAxisX = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const fsAxisY = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    fsAxisX.setAttribute('stroke', '#6c757d');
    fsAxisX.setAttribute('stroke-width', '1');
    fsAxisY.setAttribute('stroke', '#6c757d');
    fsAxisY.setAttribute('stroke-width', '1');

    const fsPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    fsPath.setAttribute('fill', 'none');
    fsPath.setAttribute('stroke', '#ff4444');
    fsPath.setAttribute('stroke-width', '4');
    fsPath.setAttribute('stroke-linejoin', 'round');
    fsPath.setAttribute('stroke-linecap', 'round');

    fsSvg.appendChild(fsAxisX);
    fsSvg.appendChild(fsAxisY);
    fsSvg.appendChild(fsPath);
    content.appendChild(fsSvg);

    const fsPad = { top: 20, right: 20, bottom: 20, left: 20 };

    function updateFullscreenLayout() {
      const w = content.clientWidth;
      const h = content.clientHeight;
      const pW = w - fsPad.left - fsPad.right;
      const pH = h - fsPad.top - fsPad.bottom;

      fsSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);

      fsAxisX.setAttribute('x1', String(fsPad.left));
      fsAxisX.setAttribute('y1', String(fsPad.top + pH));
      fsAxisX.setAttribute('x2', String(fsPad.left + pW));
      fsAxisX.setAttribute('y2', String(fsPad.top + pH));

      fsAxisY.setAttribute('x1', String(fsPad.left));
      fsAxisY.setAttribute('y1', String(fsPad.top));
      fsAxisY.setAttribute('x2', String(fsPad.left));
      fsAxisY.setAttribute('y2', String(fsPad.top + pH));
    }

    function renderFullscreenChart() {
      // Only animate if the subscription is still active
      if (!renderInterval) {
        return;
      }

      const w = content.clientWidth;
      const h = content.clientHeight;
      const pW = w - fsPad.left - fsPad.right;
      const pH = h - fsPad.top - fsPad.bottom;
      const now = Date.now();

      if (points.length === 0) {
        fsPath.setAttribute('d', '');
        return;
      }

      let d = '';
      for (const pt of points) {
        const age = now - pt.time;
        const x = fsPad.left + pW - (age / TIME_WINDOW_MS) * pW;
        const clamped = Math.max(0, Math.min(MAX_VALUE, pt.value));
        const y = fsPad.top + pH - (clamped / MAX_VALUE) * pH;
        d += d === '' ? `M${fsPad.left + pW},${y} L${x},${y}` : ` L${x},${y}`;
      }
      fsPath.setAttribute('d', d);
    }

    updateFullscreenLayout();

    const resizeObserver = new ResizeObserver(() => {
      updateFullscreenLayout();
      renderFullscreenChart();
    });
    resizeObserver.observe(content);

    const fsRenderInterval = window.setInterval(renderFullscreenChart, 1000 / 30);

    overlay.style.display = 'flex';

    const closeFullscreen = () => {
      window.clearInterval(fsRenderInterval);
      resizeObserver.disconnect();
      overlay.style.display = 'none';
      content.innerHTML = '';
    };

    $('fullscreen-close').onclick = closeFullscreen;
  });

  subscribeBtn.addEventListener('click', startSubscription);
  abortBtn.addEventListener('click', stopViaAbort);
  cancelBtn.addEventListener('click', stopViaCancelRead);

  // Auto-start subscription
  startSubscription();

  return card;
}

function renderRemoteTracks() {
  const wrapper = $('remote-tracks-list');
  const renderedSids = new Set<string>();

  for (const child of Array.from(wrapper.children)) {
    const el = child as HTMLElement;
    if (!el.dataset.sid) {
      el.remove();
      continue;
    }
    const sid = el.dataset.sid;
    if (!remoteDataTracks.find((r) => r.info.sid === sid)) {
      el.remove();
    }
    renderedSids.add(sid);
  }

  for (const track of remoteDataTracks.filter((r) => !renderedSids.has(r.info.sid))) {
    wrapper.appendChild(createRemoteTrackElement(track));
  }

  if (remoteDataTracks.length === 0 && wrapper.children.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = 'No remote tracks published yet.';
    wrapper.appendChild(p);
  }
}

// ── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  $('publisher-connect-btn').addEventListener('click', connectPublisher);
  $('subscriber-connect-btn').addEventListener('click', connectSubscriber);
  $('publish-btn').addEventListener('click', publishDataTrack);

  // Close fullscreen on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const overlay = $('fullscreen-overlay');
      if (overlay.style.display !== 'none') {
        overlay.style.display = 'none';
        $('fullscreen-content').innerHTML = '';
      }
    }
  });
});
