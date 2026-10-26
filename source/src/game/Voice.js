import { sound } from './Sound.js';

/**
 * Voice chat inside the gallery. Everyone who is in the room gets a direct audio link to everyone else (WebRTC, peer to
 * peer; the relay only carries the set-up notes). Nothing is sent until you press the microphone button (or V) and allow
 * the microphone; press it again to mute, and again to talk. You hear the others without doing anything.
 *
 * Each link is made once, with an audio channel that can send and receive; turning the microphone on or off just
 * puts a sound source in it or takes it out, so there is no re-negotiation while you talk.
 */

const ICE = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  // a public relay for networks that block a direct link (some mobile data): the audio is still encrypted end to end
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
];
const SPEAK = 0.035;                      // loudness that counts as talking

export function createVoice({ getNet, getName, showToast }) {
  const links = new Map();                // peer id -> { pc, tr, audio, queue, level, speaking, offerer }
  let mic = null, micTrack = null, state = 'off';      // off | on | muted
  let micLevel = 0, micAnalyser = null;
  const net = () => getNet();

  /* ── the button and the "someone is talking" chip ── */
  const btn = document.getElementById('btn-voice');
  const chip = document.createElement('div');
  chip.className = 'voice-chip'; chip.hidden = true; document.body.appendChild(chip);
  const paint = () => {
    if (!btn) return;
    btn.classList.toggle('live', state === 'on');
    btn.classList.toggle('muted', state === 'muted');
    btn.textContent = state === 'on' ? '\u{1F399}' : state === 'muted' ? '\u{1F507}' : '\u{1F399}';
    btn.title = state === 'off' ? 'Voice chat: tap to turn your microphone on (V)' : state === 'on' ? 'Microphone on: tap to mute (V)' : 'Muted: tap to talk (V)';
  };
  paint();

  /* ── levels (who is talking) ── */
  const ctx = () => (sound.unlock(), sound.ctx);
  function analyse(stream) {
    try {
      const c = ctx(); if (!c) return null;
      const src = c.createMediaStreamSource(stream), an = c.createAnalyser();
      an.fftSize = 512; src.connect(an);
      return an;
    } catch { return null; }
  }
  const buf = new Uint8Array(512);
  const level = an => {
    if (!an) return 0;
    an.getByteTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; }
    return Math.sqrt(s / buf.length);
  };

  /* ── one link per other person in the room ── */
  const send = (to, obj) => net()?.send({ t: 'rtc', to, d: JSON.stringify(obj) });

  function open(id) {
    if (links.has(id) || !net()?.id) return;
    const n = net();
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const link = { pc, tr, audio: null, an: null, queue: [], level: 0, speaking: false, offerer: n.id < id, tries: 0 };
    links.set(id, link);
    if (micTrack) tr.sender.replaceTrack(micTrack).catch(() => {});
    pc.onicecandidate = e => { if (e.candidate) send(id, { c: e.candidate }); };
    // the receiving end exists from the start (silent until they speak), so we can attach it to a speaker straight away
    const stream = new MediaStream([tr.receiver.track]);
    const a = new Audio(); a.autoplay = true; a.playsInline = true; a.srcObject = stream; a.style.display = 'none';
    document.body.appendChild(a); link.audio = a;
    link.an = analyse(stream);
    a.play?.().catch(() => {});
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && links.get(id) === link) {          // try again, as long as they are still here
        close(id);
        setTimeout(() => { const nn = net(); if (nn && (nn.peerIds.has(id) || nn.dogId === id)) open(id); }, 2500);
      }
    };
    if (link.offerer) {
      pc.createOffer().then(o => pc.setLocalDescription(o)).then(() => send(id, { sdp: pc.localDescription })).catch(() => {});
    }
  }

  function close(id) {
    const l = links.get(id); if (!l) return;
    links.delete(id);
    try { l.pc.close(); } catch { /* already closed */ }
    l.audio?.remove();
  }

  async function onSignal(from, d) {
    let msg; try { msg = JSON.parse(d); } catch { return; }
    open(from);
    const l = links.get(from); if (!l) return;
    try {
      if (msg.sdp) {
        await l.pc.setRemoteDescription(msg.sdp);
        if (msg.sdp.type === 'offer') {
          await l.pc.setLocalDescription(await l.pc.createAnswer());
          send(from, { sdp: l.pc.localDescription });
        }
        for (const c of l.queue.splice(0)) await l.pc.addIceCandidate(c).catch(() => {});
      } else if (msg.c) {
        if (l.pc.remoteDescription) await l.pc.addIceCandidate(msg.c).catch(() => {});
        else l.queue.push(msg.c);
      }
    } catch { /* a stale note from a link that was just replaced */ }
  }
  net()?.on?.('rtc', m => { if (m.to === net()?.id) onSignal(m.id, m.d); });

  /* ── the microphone ── */
  async function turnOn() {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) { showToast('This browser cannot do voice chat', 3500); return; }
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      showToast('The microphone is blocked. Allow it for this site in your browser settings, then tap again.', 5500);
      return;
    }
    micTrack = mic.getAudioTracks()[0];
    micAnalyser = analyse(mic);
    for (const l of links.values()) l.tr.sender.replaceTrack(micTrack).catch(() => {});
    state = 'on'; paint();
    for (const l of links.values()) l.audio?.play?.().catch(() => {});
    showToast(links.size ? 'Microphone on: they can hear you. Tap again to mute.' : 'Microphone on. Nobody else is here yet, but they will hear you when they arrive.', 3500);
  }
  function toggle() {
    if (state === 'off') { turnOn(); return; }
    state = state === 'on' ? 'muted' : 'on';
    if (micTrack) micTrack.enabled = state === 'on';
    paint();
    showToast(state === 'on' ? 'Microphone on' : 'Muted', 1600);
  }
  btn?.addEventListener('click', toggle);
  window.addEventListener('keydown', e => {
    if (e.code !== 'KeyV' || e.repeat || e.target?.closest?.('input,textarea')) return;
    toggle();
  });
  // phones only let a page start playing sound after a touch: nudge any that are waiting
  window.addEventListener('pointerdown', () => { for (const l of links.values()) if (l.audio?.paused) l.audio.play().catch(() => {}); }, { passive: true });

  let acc = 0, scan = 0;
  return {
    get state() { return state; },
    get links() { return links; },
    update(dt) {
      const n = net();
      // keep one link per person in the room
      scan -= dt;
      if (scan <= 0) {
        scan = 1.2;
        const want = new Set(n?.id ? [...n.peerIds, ...(n.dogId ? [n.dogId] : [])] : []);
        for (const id of want) if (!links.has(id)) open(id);
        for (const id of [...links.keys()]) if (!want.has(id)) close(id);
      }
      acc += dt;
      if (acc < 0.1) return;
      acc = 0;
      let talking = null;
      for (const [id, l] of links) { l.level = level(l.an); l.speaking = l.level > SPEAK; if (l.speaking && !talking) talking = id; }
      micLevel = state === 'on' ? level(micAnalyser) : 0;
      btn?.classList.toggle('speaking', micLevel > SPEAK);
      chip.hidden = !talking;
      if (talking) chip.textContent = `\u{1F399} ${getName(talking)} is talking`;
    },
  };
}
