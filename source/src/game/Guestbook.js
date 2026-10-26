import * as THREE from 'three';

/**
 * Notes left under each photo. While you look at a photo, a panel shows what has been written and
 * lets you add a line. Notes are kept by the relay (shared with your partner and still there next
 * time); with no relay they are kept in this browser.
 */

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('og-' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('og-' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

function badge(n) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 80;
  const g = c.getContext('2d');
  g.fillStyle = '#d8566e';
  g.beginPath(); g.roundRect(8, 6, 112, 56, 28); g.fill();
  g.beginPath(); g.moveTo(34, 60); g.lineTo(26, 76); g.lineTo(54, 62); g.fill();
  g.fillStyle = '#fff'; g.font = '700 34px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), 64, 35);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createGuestbook({ getNet, photoFrames, showToast, myName, role = 'girl' }) {
  const panel = document.createElement('div');
  panel.className = 'guest-panel'; panel.hidden = true;
  panel.innerHTML = `<h3>Notes on this photo</h3><div class="guest-list"></div>
    <div class="guest-rec" hidden><i></i><span>Recording... 0:00</span><button type="button" class="guest-rec-stop">Send</button><button type="button" class="guest-rec-cancel">Cancel</button></div>
    <form class="guest-form"><input maxlength="160" placeholder="${document.body.classList.contains('compact') ? 'A note...' : 'Leave a note or a voice note...'}" autocomplete="off"><button type="button" class="guest-mic" title="Record a voice note" aria-label="Record a voice note">&#127897;</button><button type="submit">Leave</button></form>`;
  document.body.appendChild(panel);
  const list = panel.querySelector('.guest-list'), form = panel.querySelector('form'), input = panel.querySelector('input');
  const recBar = panel.querySelector('.guest-rec'), micBtn = panel.querySelector('.guest-mic');

  let messages = [];
  let current = -1;
  const sprites = new Map();

  const roomKey = () => 'guest-' + (new URLSearchParams(location.search).get('room') || 'our');
  const net = () => getNet();

  function refreshBadges() {
    const counts = new Map();
    for (const m of messages) counts.set(m.photo, (counts.get(m.photo) || 0) + 1);
    for (const [idx, n] of counts) {
      const f = photoFrames[idx];
      if (!f) continue;
      let s = sprites.get(idx);
      if (!s) {
        s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
        s.scale.set(0.34, 0.21, 1);
        s.position.set(f.size.w / 2 - 0.04, f.size.h / 2 + 0.14, 0.1);
        f.group.add(s); sprites.set(idx, s);
      }
      s.material.map?.dispose();
      s.material.map = badge(n); s.material.needsUpdate = true;
    }
  }

  const stopVoices = () => list.querySelectorAll('.guest-play').forEach(b => { if (b._audio && !b._audio.paused) { b._audio.pause(); b.textContent = b.dataset.label; } });

  /* ── recording a voice note (up to 25 seconds, kept small so the relay can hold it) ── */
  let rec = null;
  const MAXS = 25;
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
  let starting = false;
  async function startRecording() {
    if (rec || starting || current < 0) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { showToast('Voice notes are not supported in this browser', 3500); return; }
    const photo = current;                                   // the photo this note belongs to, even if the viewer changes meanwhile
    let stream;
    starting = true;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { showToast('Allow the microphone to leave a voice note', 3500); return; }
    finally { starting = false; }
    if (current !== photo || panel.hidden) { stream.getTracks().forEach(t => t.stop()); return; }   // closed while the permission prompt was up
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
    const mr = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 16000 });
    const chunks = [];
    rec = { mr, stream, chunks, t0: performance.now(), send: false, timer: 0 };
    mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      clearInterval(rec.timer); stream.getTracks().forEach(t => t.stop());
      const { send, t0 } = rec, secs = Math.max(1, Math.round((performance.now() - t0) / 1000));
      rec = null; recBar.hidden = true; micBtn.classList.remove('on');
      if (!send) return;
      const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
      const url = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(blob); });
      if (url.length > 100000) { showToast('That voice note is too long. Try a shorter one.', 3500); return; }
      const text = input.value.trim(); input.value = '';
      const n = net();
      if (n?.connected) n.send({ t: 'guest-add', photo, text, voice: url, secs });
      else add({ id: 'l' + Date.now().toString(36), photo, text: text || 'A voice note', voice: url, secs, from: myName(), role, ts: Date.now() });
    };
    mr.start();
    micBtn.classList.add('on'); recBar.hidden = false;
    const label = recBar.querySelector('span');
    rec.timer = setInterval(() => {
      const s = (performance.now() - rec.t0) / 1000;
      label.textContent = `Recording... ${fmt(s)}`;
      if (s >= MAXS) stopRecording(true);
    }, 250);
  }
  function stopRecording(send) { if (!rec) return; rec.send = send; try { rec.mr.stop(); } catch { /* already stopped */ } }
  micBtn.addEventListener('click', () => (rec ? stopRecording(true) : startRecording()));
  recBar.querySelector('.guest-rec-stop').addEventListener('click', () => stopRecording(true));
  recBar.querySelector('.guest-rec-cancel').addEventListener('click', () => stopRecording(false));

  function render() {
    const mine = messages.filter(m => m.photo === current);
    list.innerHTML = '';
    if (!mine.length) {
      const e = document.createElement('div'); e.className = 'guest-empty';
      e.textContent = 'Nothing here yet. Be the first to leave a note for the other one.'; list.appendChild(e);
    }
    for (const m of mine) {
      const d = document.createElement('div');
      d.className = `guest-msg ${m.role === 'boy' ? 'boy' : 'girl'}`;
      const when = new Date(m.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const b = document.createElement('b'); b.textContent = `${m.from}  ·  ${when}`;
      const t = document.createElement('span'); t.textContent = m.text;
      d.append(b, t);
      if (m.voice) {                                   // a voice note: tap to listen
        const play = document.createElement('button'); play.type = 'button'; play.className = 'guest-play';
        const label = `▶  ${Math.floor((m.secs || 0) / 60)}:${String((m.secs || 0) % 60).padStart(2, '0')}`;
        play.textContent = label; play.dataset.label = label;
        play.addEventListener('click', () => {
          if (!play._audio) { play._audio = new Audio(m.voice); play._audio.addEventListener('ended', () => { play.textContent = label; }); }
          if (play._audio.paused) { stopVoices(); play._audio.play().catch(() => showToast('Could not play that voice note', 2500)); play.textContent = '❚❚  playing'; }
          else { play._audio.pause(); play.textContent = label; }
        });
        d.appendChild(play);
      }
      list.appendChild(d);
    }
    list.scrollTop = list.scrollHeight;
  }

  function add(rec) {
    if (messages.some(m => m.id === rec.id)) return;
    messages.push(rec);
    if (!net()?.connected) store.set(roomKey(), messages);
    refreshBadges();
    if (current === rec.photo && !panel.hidden) render();
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || current < 0) return;
    input.value = '';
    const n = net();
    if (n?.connected) n.send({ t: 'guest-add', photo: current, text });
    else add({ id: 'l' + Date.now().toString(36), photo: current, text, from: myName(), role, ts: Date.now() });
  });

  function load() {
    const n = net();
    messages = n?.connected ? [...(n.data?.guest || [])] : store.get(roomKey(), []);
    refreshBadges();
    n?.on?.('guest', m => {
      add(m.rec);
      if (m.rec.from !== myName()) showToast(`${m.rec.from} left a note on photo ${m.rec.photo + 1}`, 4000);
    });
  }
  load();

  return {
    open(frame) {
      current = frame?.index ?? -1;
      if (current < 0) return;
      render(); panel.hidden = false;
    },
    close() { stopRecording(false); stopVoices(); panel.hidden = true; current = -1; input.blur(); },
  };
}
