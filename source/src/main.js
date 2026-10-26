import * as THREE from 'three';
import { buildGallery, canWalk, getCurrentRoom, SPAWN, SEAT_TOP, DOG_NAV } from './game/Gallery.js';
import { Dog, loadDogModel, loadCatModel, CAT_CFG } from './game/Dog.js';
import { SHOW_CAT } from './config/animals.js';
import { createLegend } from './game/Legend.js';
import { warmAssets } from './game/Preload.js';
import { sound } from './game/Sound.js';
import { ThirdPersonCamera } from './game/ThirdPersonCamera.js';
import { Controls } from './game/Controls.js';
import {
  loadVRMCharacter, loadAnimationsForVRM,
  createPlaceholderCharacter, animateCharacter,
  AnimationController,
} from './game/Character.js';
import { InteractionSystem } from './game/Interactions.js';
import { drapeSkirt } from './game/Skirt.js';
import { LOW_MEM } from './game/LowMem.js';
import { createVoice } from './game/Voice.js';
import { createDogMenu } from './game/DogMenu.js';
import { DEMO } from './game/Demo.js';
import { LobbyScene } from './game/Lobby.js';
import { RemotePlayers } from './game/Remote.js';
import { Network } from './net/Network.js';
import './styles/features.css';
import './styles/mobile.css';
import { createFeatures } from './game/Features.js';

let scene, renderer, camera, tpCamera, controls, interactions;
let player, playerWrapper, colliders, vrm;
let galleryData;
let animCtrl = null;
let animsReady = false;
let charType = 'boy';
let wasSitting = false;
let sitBench = null;
let wasViewing = false;
let focusT = 0;
let jumpSpeed = 0;
let faceTarget = 0;
THREE.Cache.enabled = true;
let net = null;
let remotes = null;
let dog = null;
let cat = null, lastCatSend = 0, legend = null;let features = null;
let voice = null;
let dogMenu = null;
let seatOff = 0;
let lieK = 0;               // 0 upright .. 1 lying on a blanket
let stepOut = null;               // where you slide to after standing up from a seat
const pendingPeers = [];
const clock = new THREE.Clock();
let gameRunning = false;

const titleScreen  = document.getElementById('title-screen');
const lobbyScreen  = document.getElementById('lobby-screen');
const galleryScreen = document.getElementById('gallery-screen');
const btnStart     = document.getElementById('btn-start');
const btnEnter     = document.getElementById('btn-enter');
const btnTeddy     = document.getElementById('btn-teddy');
const enterLabel   = () => (charType === 'dog' ? 'Enter as Teddy' : 'Enter the gallery');
const chkFS        = document.getElementById('chk-fullscreen');
const roomLabel    = document.getElementById('room-label');

/* ═══════════════════════════════════════════════════ */
/*  TITLE → LOBBY                                      */
/* ═══════════════════════════════════════════════════ */
btnStart.addEventListener('click', async () => {
  if (chkFS.checked) {
    const fs = document.documentElement.requestFullscreen?.();
    // Android lets a page in full screen pin the screen to landscape (iPhones do not; they get the "turn your phone" note)
    fs?.then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  }
  if (DEMO) {                                  // the demo skips the character picker and the relay: you are Teddy, on your own
    charType = 'dog';
    btnStart.disabled = true; btnStart.textContent = 'Building the gallery...';
    try { await startGame(); } catch (e) { console.error('[Game] failed to start', e); showToast('Something went wrong starting the gallery. Please reload.', 8000); }
    titleScreen.hidden = true;
    return;
  }
  titleScreen.hidden = true;
  showLobby();
});

let lobby = null;

async function showLobby() {
  lobbyScreen.hidden = false;

  lobby = new LobbyScene(document.getElementById('lobby-canvas'));
  lobby.selected = charType;
  lobby.load().then(() => { lobby?.start(); warmAssets(); });

  // Character toggle buttons
  document.querySelectorAll('.char-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.char-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      btnTeddy?.classList.remove('on');
      charType = btn.dataset.char;
      btnEnter.textContent = enterLabel();
      lobby?.setSelected(charType);
    });
  });
  // the small visitor door: come in as Teddy, the dog
  btnTeddy?.addEventListener('click', () => {
    charType = 'dog';
    document.querySelectorAll('.char-btn').forEach(b => b.classList.remove('active'));
    btnTeddy.classList.add('on');
    btnEnter.textContent = enterLabel();
    hideLobbyMsg();
  });
}

/* ═══════════════════════════════════════════════════ */
/*  LOBBY → GALLERY                                     */
/* ═══════════════════════════════════════════════════ */
let entering = false;
btnEnter.addEventListener('click', async () => {
  if (entering) return;
  entering = true;
  btnEnter.textContent = 'Joining...';
  hideLobbyMsg();

  // Join the shared room first: the server refuses if that character is already inside
  const room = new URLSearchParams(window.location.search).get('room') || 'our';
  net = new Network({ room, role: charType, name: charType === 'boy' ? 'Alex' : charType === 'girl' ? 'Sam' : 'Teddy' });
  net.onPeerJoin = p => { if (remotes) remotes.add(p); else pendingPeers.push(p); showToast(`${p.name} has entered the gallery`); };
  net.onPeerLeave = id => { remotes?.remove(id); showToast('Your partner left the gallery'); };
  net.onState = (id, s) => remotes?.apply(id, s);
  // one machine runs the dog: the host, or, while a visitor is playing Teddy, the visitor
  net.onDog = s => { if (dog && charType !== 'dog' && (net.dogId || !net.isDogHost)) dog.applyRemote(s); };
  net.onPet = p => { if (dog && (charType === 'dog' || (net.isDogHost && !net.dogId))) dog.interact(p.k || 'pet', p); };
  net.onDogVisitor = on => {
    if (charType !== 'dog') {
      showToast(on ? 'Someone is visiting as Teddy' : 'Teddy is wandering on his own again', 3500);
      if (!on && dog) { dog.remoteTarget = null; dog.state = 'idle'; dog.stateT = 1; dog.trick = null; }
    }
  };
  net.on('cat', s => { if (cat && !net.isDogHost) cat.applyRemote(s); });
  net.on('pet-cat', p => { if (cat && net.isDogHost) cat.pet(p); });
  net.onDisconnect = () => showToast('Connection lost. Trying to reconnect...', 4000);
  net.onReconnect = () => showToast('Back together: reconnected', 3500);
  net.on('error', m => { if (m.reason === 'slow-down') showToast('Easy there: wait a moment before saving another one', 3500); });
  const res = await net.connect();

  btnEnter.textContent = enterLabel();
  if (!res.ok && res.reason === 'bad-key') {
    net = null;
    entering = false;
    showLobbyMsg('This gallery needs its private link. Open the full link you were sent.');
    return;
  }
  if (!res.ok && res.reason === 'role-taken') {
    net = null;
    entering = false;
    showLobbyMsg(charType === 'dog' ? 'Teddy is already being played by someone else.' : `${charType === 'boy' ? 'Alex' : 'Sam'} is already inside. Pick the other character.`);
    return;
  }
  if (res.ok) pendingPeers.push(...res.peers);
  else { net = null; setTimeout(() => showToast('Relay offline: exploring on your own'), 1500); }

  // The lobby stays on screen, frozen on its last picture, while the gallery is built and its shaders compiled behind it.
  // The two screens swap in one go, with the gallery ready to move, instead of a long black screen.
  btnEnter.textContent = 'Preparing the gallery...';
  btnEnter.disabled = true;
  lobby?.freeze();
  lobby?.handOver();
  try { await startGame(); }
  catch (e) { console.error('[Game] failed to start', e); showToast('Something went wrong starting the gallery. Please reload.', 8000); }
  lobbyScreen.hidden = true;
  lobby?.dispose();
  lobby = null;
});

function showLobbyMsg(t) { const el = document.getElementById('lobby-msg'); if (el) { el.textContent = t; el.hidden = false; } }
function hideLobbyMsg() { const el = document.getElementById('lobby-msg'); if (el) el.hidden = true; }
// phones and small windows get the compact layout (see styles/mobile.css); `short` is a phone held sideways
function syncLayout() {
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || /[?&]touch=1\b/.test(location.search);   // ?touch=1 forces the phone layout (for testing)
  document.body.classList.toggle('touch', touch);
  document.body.classList.toggle('compact', touch || window.innerWidth <= 768);
  document.body.classList.toggle('short', window.innerHeight <= 480 && (touch || window.innerWidth <= 900));
  document.body.classList.toggle('portrait', touch && window.innerHeight > window.innerWidth);
  const hint = document.getElementById('rotate-hint');
  let skipped = false; try { skipped = !!sessionStorage.getItem('og-portrait-ok'); } catch { /* private mode */ }
  if (hint) hint.hidden = !(touch && window.innerHeight > window.innerWidth && !skipped);
  const pvClose = document.querySelector('.pv-close');
  if (pvClose) pvClose.textContent = touch ? '✕ Close' : '✕ Close · E';          // there is no E key on a phone
}
syncLayout();
document.getElementById('rotate-skip')?.addEventListener('click', () => { try { sessionStorage.setItem('og-portrait-ok', '1'); } catch { /* private mode */ } syncLayout(); });
window.addEventListener('resize', syncLayout);
window.addEventListener('orientationchange', syncLayout);
let toastTimer = 0;
function showToast(t, ms = 3500) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = t; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

window.addEventListener('keydown', e => {
  if (lobbyScreen.hidden) return;
  if (e.code === 'Enter') { e.preventDefault(); btnEnter.click(); }
  const dir = e.code === 'ArrowLeft' || e.code === 'ArrowUp' ? 'boy'
            : e.code === 'ArrowRight' || e.code === 'ArrowDown' ? 'girl' : null;
  if (dir) document.querySelector(`.char-btn[data-char="${dir}"]`)?.click();
});

// Any click on the gallery re-captures the mouse for free look
galleryScreen.addEventListener('click', e => {
  if (controls && controls.lookEnabled && !e.target.closest('button, #photo-viewer')) controls.requestLock();
});
// a clicked button must not stay "pressed": Space (jump) would click it again
document.addEventListener('click', e => { e.target?.closest?.('button')?.blur(); });

/* ═══════════════════════════════════════════════════ */
/*  INIT                                                */
/* ═══════════════════════════════════════════════════ */
async function startGame() {
  galleryScreen.hidden = false;

  const canvas = document.getElementById('gallery-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;      // cheaper than the soft variant, looks nearly the same here
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);

  galleryData = buildGallery(scene, renderer);
  colliders = collectColliders(scene);

  remotes = new RemotePlayers(scene);
  const dogPromise = loadDogModel();
  for (const p of pendingPeers.splice(0)) remotes.add(p);

  // Wrapper group so we can rotate the wrapper for movement
  // while the VRM model keeps its own orientation inside
  playerWrapper = new THREE.Group();
  playerWrapper.position.set(SPAWN.x, 0, SPAWN.z);
  scene.add(playerWrapper);

  // Load VRM character (a visitor who comes in as Teddy has no person to load: they are the dog)
  const isDog = charType === 'dog';
  const vrmModel = isDog ? null : await loadVRMCharacter(charType);

  if (vrmModel) {
    player = vrmModel;
    vrm = vrmModel.userData.vrm;
    console.log('[Game] VRM character loaded');
  } else if (!isDog) {
    player = createPlaceholderCharacter(charType);
    console.log('[Game] Using placeholder character');
  }

  if (player) playerWrapper.add(player);
  if (isDog) {
    const loaded = await dogPromise;
    if (loaded) {
      dog = new Dog(scene, loaded, DOG_NAV);
      dog.root.position.set(SPAWN.x, 0, SPAWN.z);
      scene.remove(playerWrapper);
      playerWrapper = dog.root;                                  // the camera, the footsteps and the features follow the dog
    }
    // a visitor is only the dog: the people's keys (kiss, hold hands, dance...) do nothing
    window.addEventListener('keydown', e => { if (['KeyK', 'KeyH', 'KeyL', 'KeyT', 'KeyR', 'KeyN', 'KeyG'].includes(e.code)) e.stopImmediatePropagation(); }, true);
  }

  tpCamera = new ThirdPersonCamera(camera);
  if (isDog) { tpCamera.lookY = 0.5; tpCamera.heightBase = 0.45; tpCamera.distance = tpCamera.zoomTarget = 3.2; tpCamera.maxZoom = 7; tpCamera.rotY = 0.12; }   // a dog's-eye view: low and close
  tpCamera.snap(playerWrapper);
  controls = new Controls();
  controls.requestLock();

  interactions = new InteractionSystem();
  interactions.register(galleryData.photoFrames, galleryData.benchMeshes);
  features = createFeatures({
    scene, galleryData, interactions, controls, tpCamera, showToast,
    role: charType,
    getNet: () => net,
    getRemotes: () => [...(remotes?.players.values() ?? [])],
    getDog: () => dog,
    myName: () => (charType === 'boy' ? 'Alex' : 'Sam'),
    renderer,
    getLocal: () => ({ wrapper: playerWrapper, vrm, type: charType, id: net?.id ?? 'me', sitting: !!interactions.sitting, anim: animCtrl?.currentName || 'idle', hipsY: player?.userData?.hipsY || 0.95 }),
    playLocal: (name, emote = false) => {
      if (!animsReady) return;
      animCtrl.cancelEmote();
      if (emote) animCtrl.playEmote(name); else animCtrl.play(name, true);
    },
  });
  // on a phone you can also tap the dog (or cat) itself to pet it
  {
    let tap = null;
    window.addEventListener('touchstart', e => {
      const t = e.touches[0];
      tap = e.touches.length === 1 && t.target?.closest?.('#look-zone, #joy-zone, #gallery-canvas') ? { x: t.clientX, y: t.clientY, at: performance.now() } : null;
    }, { passive: true });
    window.addEventListener('touchend', e => {
      const t = e.changedTouches[0];
      const tp = tap; tap = null;
      if (!tp || performance.now() - tp.at > 400 || Math.hypot(t.clientX - tp.x, t.clientY - tp.y) > 14) return;
      if (features?.modalOpen || interactions.viewerOpen || interactions.sitting || camera == null) return;
      const v = new THREE.Vector3();
      for (const p of interactions.pets) {
        v.set(p.animal.root.position.x, 0.4, p.animal.root.position.z).project(camera);
        if (v.z > 1) continue;
        const sx = (v.x * 0.5 + 0.5) * window.innerWidth, sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
        if (Math.hypot(tp.x - sx, tp.y - sy) > 70) continue;
        const d = Math.hypot(playerWrapper.position.x - p.animal.root.position.x, playerWrapper.position.z - p.animal.root.position.z);
        if (p.animal.trick) return;
        if (d > 3.6) showToast(`Walk a little closer to ${p.label}`, 2200);
        else p.onPet();
        return;
      }
    }, { passive: true });
  }
  // voice chat: a direct audio link to whoever else is in the room (needs the relay to pass the set-up notes)
  const btnVoice = document.getElementById('btn-voice');
  if (net && window.RTCPeerConnection) voice = createVoice({ getNet: () => net, getName: id => remotes?.players.get(id)?.name || (id === net?.dogId ? 'Teddy' : 'Someone'), showToast });
  else if (btnVoice) btnVoice.hidden = true;
  // the demo has no photo booth, mailbox or record player (they need a partner, a server or a song)
  if (DEMO) interactions.extras = interactions.extras.filter(x => !/photo together|mail|song|knock/i.test(String(x.prompt)));
  remotes.onPose = e => { features.social.poseRemote(e); features.together.poseRemote(e); };
  legend = createLegend(isDog);
  legend.show(document.body.classList.contains('touch') ? 8000 : 5000);

  // the gentle background music, and one switch (button or M) for all sound
  sound.unlock(); sound.startMusic();
  // the smiley opens the reactions on a phone (on a computer they are always there); the corner button goes full screen
  const emoteBar = document.getElementById('emote-bar');
  document.getElementById('btn-emoji')?.addEventListener('click', () => emoteBar?.classList.toggle('open'));
  emoteBar?.addEventListener('click', () => emoteBar.classList.remove('open'));
  const btnFs = document.getElementById('btn-fullscreen');
  if (document.documentElement.requestFullscreen) {
    btnFs?.addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen().catch(() => {}); });
  } else if (btnFs) btnFs.hidden = true;                      // iPhones cannot go full screen from a web page
  const btnAudio = document.getElementById('btn-audio');
  const syncAudioBtn = () => { if (btnAudio) { btnAudio.textContent = sound.muted ? '🔇' : '🔊'; btnAudio.title = sound.muted ? 'Sound off (M)' : 'Sound on (M)'; } };
  syncAudioBtn();
  btnAudio?.addEventListener('click', () => { sound.toggleMute(); syncAudioBtn(); });
  window.addEventListener('keydown', e => {
    if (e.code !== 'KeyM' || e.repeat || e.target?.closest?.('input,textarea')) return;
    sound.toggleMute(); syncAudioBtn(); showToast(sound.muted ? 'Sound off' : 'Sound on', 1600);
  });
  dogPromise.then(loaded => {
    if (!loaded || isDog) return;
    dog = new Dog(scene, loaded, DOG_NAV);
    dogMenu = createDogMenu({ getDog: () => dog, getNet: () => net, getPlayerPos: () => playerWrapper.position });
    interactions.pets.push({
      animal: dog, label: 'Teddy',
      onPet: () => dogMenu.toggle(),                                       // pet, treat, sit, sleep, hi
    });
  });
  (SHOW_CAT ? loadCatModel() : Promise.resolve(null)).then(loaded => {
    if (!loaded) return;
    cat = new Dog(scene, loaded, DOG_NAV, CAT_CFG);
    interactions.pets.push({
      animal: cat, label: 'cat',
      onPet: () => {
        if (!net || net.isDogHost) cat.pet(playerWrapper.position);
        else net.send({ t: 'pet-cat', x: playerWrapper.position.x, z: playerWrapper.position.z });
      },
    });
  });

  // Load + retarget animations
  animCtrl = new AnimationController();
  if (player) animCtrl.init(player);

  // The animation files were already parsed in the lobby, so this is only the retargeting. The game never waits
  // more than a moment for it: the character just starts moving as soon as it is done.
  const animsDone = vrm
    ? loadAnimationsForVRM(animCtrl, vrm, null, charType).then(() => {
      animsReady = Object.keys(animCtrl.actions).length > 0;
      if (animsReady) { animCtrl.play('idle'); console.log('[Game] Animations active'); }
    })
    : Promise.resolve();
  await Promise.race([animsDone, new Promise(r => setTimeout(r, 2500))]);

  if (import.meta.env.DEV) window.__gallery = { renderer, camera, scene, get playerWrapper() { return playerWrapper; }, tpCamera, vrm, animCtrl, net, remotes, get dog() { return dog; }, get voice() { return voice; }, get cat() { return cat; }, sound, get features() { return features; }, get interactions() { return interactions; } };
  if (isDog) initDogControls(); else initEmoteBar();
  window.addEventListener('resize', onResize);

  // Compile every shader now (in parallel, without freezing the page) so the first moments inside are smooth
  try { await Promise.race([renderer.compileAsync(scene, camera), new Promise(r => setTimeout(r, 5000))]); } catch { /* it compiles on first use instead */ }

  gameRunning = true;
  animate();
  // let the first frame reach the screen before the lobby is taken away
  await Promise.race([new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))), new Promise(r => setTimeout(r, 400))]);
}

/* ═══════════════════════════════════════════════════ */
/*  EMOTE BAR                                           */
/* ═══════════════════════════════════════════════════ */
function initEmoteBar() {
  const bar = document.getElementById('emote-bar');
  if (!bar) return;
  bar.addEventListener('click', e => {
    const btn = e.target.closest('[data-emote]');
    if (!btn || !animsReady) return;
    if (animCtrl.isEmoting()) return;
    animCtrl.playEmote(btn.dataset.emote);
  });

  const emoteKeys = ['wave', 'blowKiss', 'dance1', 'dance2', 'dance3'];
  window.addEventListener('keydown', e => {
    if (e.target?.closest?.('input,textarea')) return;
    if (!animsReady || animCtrl.isEmoting()) return;
    if (interactions?.sitting || features?.modalOpen || interactions?.viewerOpen) return;       // no dancing on the bench or behind a panel
    const idx = parseInt(e.key) - 1;
    if (idx >= 0 && idx < emoteKeys.length) {
      animCtrl.playEmote(emoteKeys[idx]);
    }
  });
}

/* ═══════════════════════════════════════════════════ */
/*  PLAYING TEDDY (the visitor login)                   */
/* ═══════════════════════════════════════════════════ */
// 1-5 are Teddy's tricks; E barks, F sits or gets up, Space hops, W A S D / the stick walks, Shift / the stick's edge runs
const DOG_TRICK_INFO = { spin: ['🌀', 'Spin'], bark: ['🐶', 'Bark'], roll: ['🤸', 'Roll over'], beg: ['🥺', 'Beg'], playdead: ['💀', 'Play dead'], shake: ['🤝', 'Shake a paw'], lie: ['😴', 'Lie down'] };
let DOG_TRICKS = [];
function initDogControls() {
  // the tricks this dog can actually do: the first five get the keys 1 to 5 and the buttons
  DOG_TRICKS = Object.keys(DOG_TRICK_INFO).filter(n => dog?.tricks.includes(n)).slice(0, 5).map(n => [n, ...DOG_TRICK_INFO[n]]);
  const doTrick = name => { if (dog && !features?.modalOpen) dog.act(name); };
  const bar = document.getElementById('emote-bar');
  bar?.querySelectorAll('.emote-btn').forEach((b, i) => {
    const info = DOG_TRICKS[i];
    if (!info) { b.style.display = 'none'; return; }
    b.textContent = info[1]; b.title = info[2]; b.dataset.trick = info[0]; delete b.dataset.emote;
  });
  bar?.addEventListener('click', e => { const b = e.target.closest('[data-trick]'); if (b) doTrick(b.dataset.trick); });
  window.addEventListener('keydown', e => {
    if (e.repeat || e.target?.closest?.('input,textarea')) return;
    const i = parseInt(e.key) - 1;
    if (i >= 0 && i < DOG_TRICKS.length) doTrick(DOG_TRICKS[i][0]);
  });
  const extras = document.getElementById('mob-extras');
  if (extras) extras.style.display = 'none';                       // kiss, hold hands, dance... are for the two of them
  showToast('You are Teddy! Walk with W A S D, run with Shift, bark with E, hop with Space. F sits or sniffs the floor. Keys 1 to ' + DOG_TRICKS.length + ' are tricks.', 7000);
}

function animateDog(dt) {
  const move = controls.getMovement();
  // E opens a picture, collects a heart or note, changes the sky at the projector...; when it has nothing to do, Teddy barks
  interactions.dogMode = true;
  interactions.blocked = !!features?.modalOpen;
  const state = interactions.update(playerWrapper.position, camera, controls);
  const viewing = !!state?.viewerOpen;
  if (viewing && !wasViewing) beginPhotoFocus(interactions.viewerFrame);               // (no notes panel: the demo has no server to keep them)
  if (!viewing && wasViewing) { tpCamera.setFocus(null); controls.requestLock(); }
  wasViewing = viewing;
  document.body.classList.toggle('viewing', viewing);
  if (viewing && controls.lookEnabled) controls.releaseLock();
  const ui = !!features?.modalOpen || viewing;
  controls.lookEnabled = !ui;
  const e = interactions.lastE && !interactions.eHandled, f = controls.consumeF(), sp = controls.consumeSpace();
  let ix = 0, iz = 0;
  if (dog && !ui) {
    if (e && !dog.act('bark')) dog.sound();
    if (f) dog.toggleSit();
    if (sp) dog.act('jump');
    const fwd = tpCamera.forward(), rgt = tpCamera.right();
    ix = fwd.x * (-move.z) + rgt.x * (-move.x);
    iz = fwd.z * (-move.z) + rgt.z * (-move.x);
  }
  dog?.drive(dt, { x: ix, z: iz, run: move.run, canWalk });
  voice?.update(dt);

  const wheel = controls.consumeZoom();
  if (wheel) tpCamera.zoom(wheel);
  const look = controls.consumeLook();
  tpCamera.rotate(look.x, look.y);
  tpCamera.update(playerWrapper, colliders, dt);

  sound.listener.x = playerWrapper.position.x; sound.listener.z = playerWrapper.position.z;
  galleryData.update(dt, playerWrapper.position);
  features?.update(dt);
  remotes?.update(dt);
  if (dog) net?.sendDog(dog.getSyncState());
  const room = getCurrentRoom(playerWrapper.position.x, playerWrapper.position.z);
  if (roomLabel && room) roomLabel.textContent = room.label;
}
/* ═══════════════════════════════════════════════════ */
/*  GAME LOOP                                           */
/* ═══════════════════════════════════════════════════ */
// Keeps the frame rate smooth on any machine: if frames run slow the picture is rendered a little less sharp,
// and if there is plenty of room it climbs back up to the screen's native sharpness.
let avgFrame = 1 / 60, qualityCooldown = 3;
const MAX_RATIO = Math.min(window.devicePixelRatio || 1, 2), MIN_RATIO = 0.75;
function adaptQuality(rawDt) {
  if (rawDt > 0.25) return;                                   // a tab switch or hitch, not a real measurement
  avgFrame += (rawDt - avgFrame) * 0.05;
  qualityCooldown -= rawDt;
  if (qualityCooldown > 0) return;
  const ratio = renderer.getPixelRatio();
  let next = ratio;
  if (avgFrame > 1 / 40) next = Math.max(MIN_RATIO, ratio - 0.25);
  else if (avgFrame < 1 / 58 && ratio < MAX_RATIO) next = Math.min(MAX_RATIO, ratio + 0.25);
  if (next !== ratio) {
    renderer.setPixelRatio(next);
    renderer.setSize(window.innerWidth, window.innerHeight);
    avgFrame = 1 / 50;
  }
  qualityCooldown = 2.5;
}

function animate() {
  if (!gameRunning) return;
  requestAnimationFrame(animate);

  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  adaptQuality(rawDt);
  if (charType === 'dog') {                                     // a visitor playing Teddy has a much simpler loop
    animateDog(dt);
    renderer.render(scene, camera);
    features?.afterRender(renderer, scene);
    return;
  }
  const move = controls.getMovement();
  interactions.blocked = !!features?.modalOpen;
  const state = interactions.update(playerWrapper.position, camera, controls);
  const isSitting = state?.sitting;
  const uiBlocked = !!state?.viewerOpen || !!features?.modalOpen;

  // Free look only while no overlay is open; free the cursor for the photo viewer
  if (state?.viewerOpen && controls.lookEnabled) controls.releaseLock();
  controls.lookEnabled = !uiBlocked;

  // E on a photo: the camera glides from the 3rd-person view to a close-up, and back on close
  const viewing = !!state?.viewerOpen;
  if (viewing && !wasViewing) { beginPhotoFocus(interactions.viewerFrame); features?.viewing(interactions.viewerFrame); }
  if (!viewing && wasViewing) { tpCamera.setFocus(null); controls.requestLock(); features?.viewing(null); }
  wasViewing = viewing;
  document.body.classList.toggle('viewing', viewing);
  focusT = viewing ? focusT + dt : 0;
  playerWrapper.visible = !(viewing && focusT > 0.45) && !tpCamera.eye;          // lying back you look out through your own eyes

  const lying = !!(isSitting && interactions.currentBench?.lie);                // on a blanket, looking up at the stars
  if (isSitting !== wasSitting && animsReady) {
    const onFloor = isSitting ? !!interactions.currentBench?.floor : !!sitBench?.floor;       // cushions on the floor vs a bench or sofa
    if (isSitting ? lying : sitBench?.lie) animCtrl.play('idle', true);
    else {
      animCtrl.playEmote(isSitting ? (onFloor ? 'sitFloorDown' : 'sitDown') : (onFloor ? 'sitFloorUp' : 'standUp'));
      animCtrl._pendingReturn = isSitting ? (onFloor ? 'sitFloor' : 'sitting') : 'idle';
    }
  }
  lieK += ((lying ? 1 : 0) - lieK) * (1 - Math.exp(-(lying ? 2.5 : 7) * dt));
  playerWrapper.rotation.order = 'YXZ';
  playerWrapper.rotation.x = -lieK * Math.PI / 2;                              // flat on the back (head to the north)
  if (isSitting) sitBench = interactions.currentBench;
  if (wasSitting && !isSitting && sitBench) {
    // Step out to the front of the bench so the player is not left inside it
    const f = sitBench.spot.face ?? sitBench.spot.ry;
    const ex = sitBench.exit;                                      // a seat can name its own way out (the planetarium loungers: off the side)
    stepOut = ex ? { x: sitBench.group.position.x + ex.x, z: sitBench.group.position.z + ex.z }
      : { x: sitBench.group.position.x + Math.sin(f) * 1.0, z: sitBench.group.position.z + Math.cos(f) * 1.0 };   // glide there while standing up
    playerWrapper.position.y = 0;
    sitBench = null;
    seatOff = 0;
  }
  wasSitting = !!isSitting;

  // never stay stuck inside something solid (a seat, a plant): slide to the nearest free spot
  if (!isSitting && !stepOut && !canWalk(playerWrapper.position.x, playerWrapper.position.z)) {
    const { x, z } = playerWrapper.position;
    search: for (let r = 0.25; r <= 3; r += 0.25) {
      for (let a = 0; a < 16; a++) {
        const nx = x + Math.cos(a * Math.PI / 8) * r, nz = z + Math.sin(a * Math.PI / 8) * r;
        if (canWalk(nx, nz)) { playerWrapper.position.x = nx; playerWrapper.position.z = nz; break search; }
      }
    }
  }

  if (stepOut) {
    const k = 1 - Math.exp(-4 * dt);
    playerWrapper.position.x += (stepOut.x - playerWrapper.position.x) * k;
    playerWrapper.position.z += (stepOut.z - playerWrapper.position.z) * k;
    if (Math.hypot(stepOut.x - playerWrapper.position.x, stepOut.z - playerWrapper.position.z) < 0.03 || isSitting) stepOut = null;
  }

  // Any movement input interrupts a dance / wave / kiss
  if (animCtrl?.isEmoting() && (Math.abs(move.x) > 0.1 || Math.abs(move.z) > 0.1)) animCtrl.cancelEmote();

  if (!animCtrl?.isEmoting()) jumpSpeed = 0;
  else if (jumpSpeed > 0 && !isSitting && !uiBlocked) {
    const ry = playerWrapper.rotation.y;
    const nx = playerWrapper.position.x + Math.sin(ry) * jumpSpeed * dt;
    const nz = playerWrapper.position.z + Math.cos(ry) * jumpSpeed * dt;
    if (canWalk(nx, playerWrapper.position.z)) playerWrapper.position.x = nx;
    if (canWalk(playerWrapper.position.x, nz)) playerWrapper.position.z = nz;
  }

  // Holding hands: the one who follows walks alongside the leader instead of using the keys
  const follow = features?.social.followTarget();
  if (follow && !isSitting && !uiBlocked) {
    const dx = follow.x - playerWrapper.position.x, dz = follow.z - playerWrapper.position.z, dist = Math.hypot(dx, dz);
    const sp = Math.min(6.5, dist * 4.5);
    if (dist > 0.06) {
      const nx = playerWrapper.position.x + (dx / dist) * sp * dt, nz = playerWrapper.position.z + (dz / dist) * sp * dt;
      if (canWalk(nx, playerWrapper.position.z)) playerWrapper.position.x = nx;
      if (canWalk(playerWrapper.position.x, nz)) playerWrapper.position.z = nz;
    }
    faceTarget = dist > 0.35 ? Math.atan2(dx, dz) : follow.yaw;
    const turn = ((faceTarget - playerWrapper.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    playerWrapper.rotation.y += turn * (1 - Math.exp(-9 * dt));
    if (animsReady) animCtrl.play(dist > 0.35 ? (sp > 4.2 ? 'run' : 'walk') : 'idle');
  } else if (!isSitting && !uiBlocked && !animCtrl?.isEmoting()) {
    const speed = move.run ? 6.5 : 3.2;
    const fwd = tpCamera.forward();
    const rgt = tpCamera.right();

    // Camera-relative movement (forward = into screen = -Z world)
    const dx = (fwd.x * (-move.z) + rgt.x * (-move.x)) * speed * dt;
    const dz = (fwd.z * (-move.z) + rgt.z * (-move.x)) * speed * dt;

    const nx = playerWrapper.position.x + dx;
    const nz = playerWrapper.position.z + dz;
    if (canWalk(nx, playerWrapper.position.z)) playerWrapper.position.x = nx;
    if (canWalk(playerWrapper.position.x, nz)) playerWrapper.position.z = nz;

    // Turn smoothly toward the direction of travel (shortest way round) instead of snapping
    if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) faceTarget = Math.atan2(dx, dz);
    else faceTarget = playerWrapper.rotation.y;
    const turn = ((faceTarget - playerWrapper.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    playerWrapper.rotation.y += turn * (1 - Math.exp(-9 * dt));

    const moving = Math.abs(move.x) > 0.1 || Math.abs(move.z) > 0.1;
    const animState = moving ? (move.run ? 'run' : 'walk') : 'idle';
    player.userData.state = animState;
    if (animsReady) animCtrl.play(animState);

    if (controls.consumeSpace() && animsReady && !animCtrl.isEmoting()) {
      // Jumping while moving carries the player forward at their current speed
      jumpSpeed = moving ? speed : 0;
      animCtrl.playEmote(moving ? 'runJump' : 'jump');       // walking or running: the running jump; standing still: the standing one
    }
  } else if (isSitting) {
    player.userData.state = 'sit';
    if (animsReady) animCtrl.play(lying ? 'idle' : interactions.currentBench?.floor ? 'sitFloor' : 'sitting');
    if (lying) {
      const b = interactions.currentBench;
      playerWrapper.position.set(b.group.position.x, (b.lieY ?? 0.1) * lieK, b.group.position.z);
      playerWrapper.rotation.y = 0;
    } else if (interactions.currentBench) {
      const b = interactions.currentBench;
      // Hips sit at the bench centre; the seat is only 0.5 deep so the shins hang clear of the front edge.
      // Height is matched to this character's proportions so thighs rest on the seat top.
      // shuffle along the bench when your partner sits down next to you
      seatOff += ((features?.social.seatOffset(b) ?? 0) - seatOff) * (1 - Math.exp(-3 * dt));
      const fwdOff = b.forward || 0, fa = b.spot.face ?? b.spot.ry;              // a seat can ask you to sit a little forward
      playerWrapper.position.x = b.group.position.x + Math.cos(b.spot.ry) * seatOff + Math.sin(fa) * fwdOff;
      playerWrapper.position.z = b.group.position.z - Math.sin(b.spot.ry) * seatOff + Math.cos(fa) * fwdOff;
      playerWrapper.position.y = (b.seatTop ?? SEAT_TOP + 0.09) - (b.hipsFrac ?? 0.54) * (player.userData.hipsY || 0.95);
      playerWrapper.rotation.y = b.spot.face ?? b.spot.ry;
    }
  }

  if (animsReady) {
    animCtrl.update(dt);
  } else {
    animateCharacter(player, dt);
  }

  features?.social.applyPose();
  features?.together.applyPose();
  drapeSkirt(vrm, !!isSitting && !lying, dt);
  if (vrm) vrm.update(dt);

  const wheel = controls.consumeZoom();
  if (wheel && !tpCamera.focus) tpCamera.zoom(wheel);
  const look = controls.consumeLook();
  tpCamera.rotate(look.x, look.y);
  tpCamera.update(playerWrapper, colliders, dt);

  sound.listener.x = playerWrapper.position.x; sound.listener.z = playerWrapper.position.z;   // for distance-based volume

  galleryData.update(dt, playerWrapper.position);
  features?.update(dt);
  voice?.update(dt);
  dogMenu?.update();
  remotes?.update(dt);
  if (dog) {
    const others = remotes ? [...remotes.players.values()].map(e => e.wrapper.position) : [];
    const host = !net || net.isDogHost;
    dog.update(dt, [playerWrapper.position, ...others], host);
    if (host) net?.sendDog(dog.getSyncState());
  }
  if (cat) {
    const others = remotes ? [...remotes.players.values()].map(e => e.wrapper.position) : [];
    const host = !net || net.isDogHost;
    cat.update(dt, [playerWrapper.position, ...others], host);
    const now = performance.now();
    if (host && net?.connected && now - lastCatSend > 100) { lastCatSend = now; net.send({ t: 'cat', ...cat.getSyncState() }); }
  }
  net?.sendState({
    x: playerWrapper.position.x, y: playerWrapper.position.y, z: playerWrapper.position.z,
    ry: playerWrapper.rotation.y, a: animCtrl?.currentName || 'idle', h: features?.social.holding ? 1 : 0, l: features?.together.leaning ? 1 : 0, g: lieK > 0.5 ? 1 : 0,
  });
  const room = getCurrentRoom(playerWrapper.position.x, playerWrapper.position.z);
  if (roomLabel && room) roomLabel.textContent = room.label;

  renderer.render(scene, camera);
  features?.afterRender(renderer, scene);
}

/* ═══════════════════════════════════════════════════ */
/*  HELPERS                                             */
/* ═══════════════════════════════════════════════════ */
function beginPhotoFocus(frame) {
  if (!frame) return;
  const { group, size, spot } = frame;
  const nx = Math.sin(spot.ry), nz = Math.cos(spot.ry);
  const vHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  // held sideways on a phone the notes take the right-hand side: keep the picture in the left half
  const sideways = document.body.classList.contains('short');
  const dist = Math.max(
    (size.h / 0.72) / (2 * vHalf),
    (size.w / (sideways ? 0.40 : 0.62)) / (2 * vHalf * camera.aspect),
  );
  const shift = sideways ? 0.15 * 2 * dist * vHalf * camera.aspect : 0;
  const tx = Math.cos(spot.ry) * shift, tz = -Math.sin(spot.ry) * shift;
  const pos = new THREE.Vector3(group.position.x + nx * dist + tx, group.position.y, group.position.z + nz * dist + tz);
  // on a phone held upright the notes sheet covers the lower part of the screen: aim a little below the photo so it rides high
  const look = group.position.clone();
  look.x += tx; look.z += tz;
  if (document.body.classList.contains('compact') && camera.aspect < 1) look.y -= dist * vHalf * 0.38;
  tpCamera.setFocus(pos, look);
  // Face the photo, and leave the orbit behind the player so the glide back is natural
  playerWrapper.rotation.y = spot.ry + Math.PI;
  tpCamera.rotX = spot.ry;
}

function collectColliders(scene) {
  const list = [];
  scene.traverse(obj => { if (obj.userData.wall) list.push(obj); });
  return list;
}

function onResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Coming back from "knock on the big door": go straight to the character selection screen
try {
  if (sessionStorage.getItem('og-to-lobby')) {
    sessionStorage.removeItem('og-to-lobby');
    titleScreen.hidden = true;
    showLobby();
  }
} catch { /* storage unavailable */ }
