import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const VRM_MODELS = {
  boy:  './models/person-a.vrm',
  girl: './models/person-b.vrm',
};

const ANIM_FILES = {
  idle:        './models/Idle.fbx',
  walk:        './models/Walk.fbx',
  run:         './models/Run.fbx',
  sitting:     './models/Sitting.fbx',
  sitDown:     './models/sit-down.fbx',
  standUp:     './models/stand-up.fbx',
  wave:        './models/Wave.fbx',
  blowKiss:    './models/Blow-a-Kiss.fbx',
  dance1:      './models/Dance1.fbx',
  dance2:      './models/Dance2.fbx',
  dance3:      './models/Dance3.fbx',
  jump:        './models/Idel-Jumping.fbx',
  runJump:     './models/Runing-Jump.fbx',
  sitFloor:    './models/Sitting%20Idle.fbx',      // sitting on the floor (loop)
  sitFloorUp:  './models/Standing%20Up.fbx',       // getting up from the floor (played backwards for sitting down)
};

const LOOP_ANIMS = new Set(['idle', 'walk', 'run', 'sitting', 'sitFloor']);
const EMOTE_ANIMS = new Set(['wave', 'blowKiss', 'dance1', 'dance2', 'dance3']);
const ONESHOT_ANIMS = new Set(['sitDown', 'standUp', 'sitFloorDown', 'sitFloorUp', 'jump', 'runJump', 'kiss']);

// Each character has their own half of the paired kiss animation
const KISS_FILES = { boy: './models/person-a-kiss.fbx', girl: './models/person-b-kiss.fbx' };

/* ═══════════════════════════════════════════════════ */
/*  MIXAMO → VRM BONE MAPPING                           */
/* ═══════════════════════════════════════════════════ */
const MIXAMO_TO_VRM_BONE = {
  mixamorigHips:             'hips',
  mixamorigSpine:            'spine',
  mixamorigSpine1:           'chest',
  mixamorigSpine2:           'upperChest',
  mixamorigNeck:             'neck',
  mixamorigHead:             'head',
  mixamorigLeftShoulder:     'leftShoulder',
  mixamorigLeftArm:          'leftUpperArm',
  mixamorigLeftForeArm:      'leftLowerArm',
  mixamorigLeftHand:         'leftHand',
  mixamorigLeftHandThumb1:   'leftThumbMetacarpal',
  mixamorigLeftHandThumb2:   'leftThumbProximal',
  mixamorigLeftHandThumb3:   'leftThumbDistal',
  mixamorigLeftHandIndex1:   'leftIndexProximal',
  mixamorigLeftHandIndex2:   'leftIndexIntermediate',
  mixamorigLeftHandIndex3:   'leftIndexDistal',
  mixamorigLeftHandMiddle1:  'leftMiddleProximal',
  mixamorigLeftHandMiddle2:  'leftMiddleIntermediate',
  mixamorigLeftHandMiddle3:  'leftMiddleDistal',
  mixamorigLeftHandRing1:    'leftRingProximal',
  mixamorigLeftHandRing2:    'leftRingIntermediate',
  mixamorigLeftHandRing3:    'leftRingDistal',
  mixamorigLeftHandPinky1:   'leftLittleProximal',
  mixamorigLeftHandPinky2:   'leftLittleIntermediate',
  mixamorigLeftHandPinky3:   'leftLittleDistal',
  mixamorigRightShoulder:    'rightShoulder',
  mixamorigRightArm:         'rightUpperArm',
  mixamorigRightForeArm:     'rightLowerArm',
  mixamorigRightHand:        'rightHand',
  mixamorigRightHandThumb1:  'rightThumbMetacarpal',
  mixamorigRightHandThumb2:  'rightThumbProximal',
  mixamorigRightHandThumb3:  'rightThumbDistal',
  mixamorigRightHandIndex1:  'rightIndexProximal',
  mixamorigRightHandIndex2:  'rightIndexIntermediate',
  mixamorigRightHandIndex3:  'rightIndexDistal',
  mixamorigRightHandMiddle1: 'rightMiddleProximal',
  mixamorigRightHandMiddle2: 'rightMiddleIntermediate',
  mixamorigRightHandMiddle3: 'rightMiddleDistal',
  mixamorigRightHandRing1:   'rightRingProximal',
  mixamorigRightHandRing2:   'rightRingIntermediate',
  mixamorigRightHandRing3:   'rightRingDistal',
  mixamorigRightHandPinky1:  'rightLittleProximal',
  mixamorigRightHandPinky2:  'rightLittleIntermediate',
  mixamorigRightHandPinky3:  'rightLittleDistal',
  mixamorigLeftUpLeg:        'leftUpperLeg',
  mixamorigLeftLeg:          'leftLowerLeg',
  mixamorigLeftFoot:         'leftFoot',
  mixamorigLeftToeBase:      'leftToes',
  mixamorigRightUpLeg:       'rightUpperLeg',
  mixamorigRightLeg:         'rightLowerLeg',
  mixamorigRightFoot:        'rightFoot',
  mixamorigRightToeBase:     'rightToes',
};

/* ═══════════════════════════════════════════════════ */
/*  RETARGET A MIXAMO CLIP TO A VRM MODEL               */
/* ═══════════════════════════════════════════════════ */
const _restInv = new THREE.Quaternion();
const _parentRest = new THREE.Quaternion();
const _q = new THREE.Quaternion();
const _v3 = new THREE.Vector3();

function retargetClip(clip, vrm, asset, keepRoot = false) {
  const humanoid = vrm.humanoid;
  if (!humanoid) return clip;

  asset.updateMatrixWorld(true);
  const isV0 = vrm.meta?.metaVersion === '0';
  // the hip height measured when the character was loaded (standing straight), not whatever pose it is in right now
  const vrmHipsY = vrm.scene?.userData?.hipsY || humanoid.getNormalizedBoneNode('hips').getWorldPosition(_v3).y;
  const mixHipsY = asset.getObjectByName('mixamorigHips')?.position.y || 1;
  const hipsScale = vrmHipsY / mixHipsY;

  const tracks = [];

  for (const track of clip.tracks) {
    const dotIdx = track.name.indexOf('.');
    if (dotIdx < 0) continue;
    const mixamoBone = track.name.substring(0, dotIdx);
    const property = track.name.substring(dotIdx + 1);

    const vrmBoneName = MIXAMO_TO_VRM_BONE[mixamoBone];
    const vrmNode = vrmBoneName && humanoid.getNormalizedBoneNode(vrmBoneName);
    const rig = asset.getObjectByName(mixamoBone);
    if (!vrmNode || !rig || !rig.parent) continue;

    rig.getWorldQuaternion(_restInv).invert();
    rig.parent.getWorldQuaternion(_parentRest);

    if (track instanceof THREE.QuaternionKeyframeTrack) {
      const values = Float32Array.from(track.values);
      for (let i = 0; i < values.length; i += 4) {
        _q.fromArray(values, i).premultiply(_parentRest).multiply(_restInv);
        _q.toArray(values, i);
        if (isV0) { values[i] = -values[i]; values[i + 2] = -values[i + 2]; }
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${vrmNode.name}.${property}`, track.times, values));
    } else if (track instanceof THREE.VectorKeyframeTrack && vrmBoneName === 'hips') {
      // Keep vertical hip motion only; horizontal travel is driven by the game.
      // (The kiss keeps it all: each half steps toward the other, so the pair must stay in step.)
      const values = Float32Array.from(track.values);
      for (let i = 0; i < values.length; i += 3) {
        values[i] = keepRoot ? values[i] * hipsScale : 0;
        values[i + 1] *= hipsScale;
        values[i + 2] = keepRoot ? values[i + 2] * hipsScale : 0;
      }
      tracks.push(new THREE.VectorKeyframeTrack(`${vrmNode.name}.${property}`, track.times, values));
    }
  }

  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/** the same clip played backwards (times flipped, values in reverse order) */
function reverseClip(clip) {
  const T = clip.duration;
  const tracks = clip.tracks.map(tr => {
    const n = tr.times.length, size = tr.values.length / n;
    const times = new Float32Array(n), values = new Float32Array(tr.values.length);
    for (let i = 0; i < n; i++) {
      times[i] = T - tr.times[n - 1 - i];
      for (let k = 0; k < size; k++) values[i * size + k] = tr.values[(n - 1 - i) * size + k];
    }
    return new tr.constructor(tr.name, times, values);
  });
  return new THREE.AnimationClip('sitFloorDown', T, tracks);
}

/* ═══════════════════════════════════════════════════ */
/*  LOAD VRM CHARACTER                                  */
/* ═══════════════════════════════════════════════════ */
// The lobby has already downloaded and built both characters. It hands them over here so the game does not do it twice.
const handedOver = {};
export function stashVRM(type, model) { handedOver[type] = model; }

export async function loadVRMCharacter(type = 'boy') {
  const url = VRM_MODELS[type];
  if (!url) return null;
  if (handedOver[type]) {
    const m = handedOver[type]; delete handedOver[type];
    m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
    return m;
  }

  const loader = new GLTFLoader();
  loader.register(parser => new VRMLoaderPlugin(parser));

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      gltf => {
        const vrm = gltf.userData.vrm;
        if (!vrm) {
          console.error('[VRM] No VRM data in', url);
          resolve(null);
          return;
        }

        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.removeUnnecessaryJoints(gltf.scene);

        const model = vrm.scene;
        model.traverse(obj => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            obj.frustumCulled = false;
          }
        });

        // Normalise VRM0 models to face +Z; the wrapper rotates toward movement
        VRMUtils.rotateVRM0(vrm);

        model.updateMatrixWorld(true);
        const hv = new THREE.Vector3();
        vrm.humanoid.getRawBoneNode('hips').getWorldPosition(hv);
        model.userData = { type: 'vrm', vrm, state: 'idle', hipsY: hv.y };
        console.log(`[VRM] Loaded ${type}: ${url}`);
        resolve(model);
      },
      progress => {
        if (progress.total > 0) {
          const pct = Math.round((progress.loaded / progress.total) * 100);
          console.log(`[VRM] Loading ${type}... ${pct}%`);
        }
      },
      err => {
        console.error(`[VRM] Failed to load ${type}:`, err);
        resolve(null);
      }
    );
  });
}

/* ═══════════════════════════════════════════════════ */
/*  LOAD & RETARGET ANIMATIONS FOR A VRM                */
/* ═══════════════════════════════════════════════════ */
// Each animation file is downloaded and parsed once, and shared by every character (you, your partner, the lobby).
const fbxLoader = new FBXLoader();
const fbxCache = new Map();
export function loadFBX(url) {
  if (!fbxCache.has(url)) {
    fbxCache.set(url, new Promise(resolve => fbxLoader.load(url, fbx => resolve(fbx), undefined, err => { console.warn('[Anim] Failed to load', url, err); resolve(null); })));
  }
  return fbxCache.get(url);
}
/** Parse them all in the background (the lobby is idle anyway), one at a time so nothing stutters. */
export async function preloadAnimations() {
  for (const url of [...Object.values(ANIM_FILES), ...Object.values(KISS_FILES)]) {
    await loadFBX(url);
    await new Promise(r => setTimeout(r, 30));
  }
}

export async function loadAnimationsForVRM(controller, vrm, only = null, type = null) {
  const entries = Object.entries(ANIM_FILES).filter(([name]) => !only || only.includes(name));
  if (type && KISS_FILES[type] && (!only || only.includes('kiss'))) entries.push(['kiss', KISS_FILES[type]]);
  let loaded = 0;

  await Promise.all(entries.map(async ([name, url]) => {
    const fbx = await loadFBX(url);
    if (fbx?.animations?.length > 0) {
      const rawClip = fbx.animations[0];
      rawClip.name = name;
      const retargeted = retargetClip(rawClip, vrm, fbx, name === 'kiss');
      controller.addClip(name, retargeted);
      if (name === 'sitFloorUp') controller.addClip('sitFloorDown', reverseClip(retargeted));   // sitting down is standing up in reverse
      loaded++;
    }
  }));
  console.log(`[Anim] ${loaded}/${entries.length} animations retargeted to VRM`);
}
/* ═══════════════════════════════════════════════════ */
/*  ANIMATION CONTROLLER                                */
/* ═══════════════════════════════════════════════════ */
export class AnimationController {
  constructor() {
    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.currentName = '';
    this.emoting = false;
    this._pendingReturn = 'idle';
  }

  init(model) {
    this.mixer = new THREE.AnimationMixer(model);
  }

  addClip(name, clip) {
    if (!this.mixer || !clip) return;
    const action = this.mixer.clipAction(clip);

    if (LOOP_ANIMS.has(name)) {
      action.setLoop(THREE.LoopRepeat);
    } else {
      action.setLoop(THREE.LoopOnce);
      action.clampWhenFinished = true;
    }

    if (name === 'sitFloorUp' || name === 'sitFloorDown') action.timeScale = 1.5;      // the clip is 6 s: a little brisker
    this.actions[name] = action;
  }

  play(name, force = false) {
    if (!this.actions[name]) return;
    if (this.currentName === name && !force) return;

    if (this.emoting && !EMOTE_ANIMS.has(name) && !ONESHOT_ANIMS.has(name)) {
      this._pendingReturn = name;
      return;
    }

    const next = this.actions[name];
    if (this.current) {
      this.current.fadeOut(0.25);
    }
    next.reset().fadeIn(0.25).play();
    this.current = next;
    this.currentName = name;
  }

  playEmote(name) {
    if (!this.actions[name]) return;
    this.emoting = true;
    this._pendingReturn = this.currentName || 'idle';

    const action = this.actions[name];
    if (this.current) this.current.fadeOut(0.2);
    action.reset().fadeIn(0.2).play();
    this.current = action;
    this.currentName = name;

    this.mixer.addEventListener('finished', this._onEmoteEnd);
  }

  _onEmoteEnd = () => {
    this.mixer.removeEventListener('finished', this._onEmoteEnd);
    this.emoting = false;
    this.play(this._pendingReturn, true);
  };

  /** Interrupt a wave/kiss/dance (e.g. the player starts walking). Returns true if cancelled. */
  cancelEmote() {
    if (!this.emoting || !EMOTE_ANIMS.has(this.currentName)) return false;
    this.mixer.removeEventListener('finished', this._onEmoteEnd);
    this.emoting = false;
    this.play(this._pendingReturn || 'idle', true);
    return true;
  }

  update(dt) {
    if (this.mixer) this.mixer.update(dt);
  }

  isEmoting() {
    return this.emoting;
  }
}

/* ═══════════════════════════════════════════════════ */
/*  PLACEHOLDER CHARACTER (fallback if VRM fails)       */
/* ═══════════════════════════════════════════════════ */
export function createPlaceholderCharacter(type = 'boy') {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xDEA882 });
  const eye  = new THREE.MeshBasicMaterial({ color: 0x1a1a2e });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), skin);
  head.position.y = 1.58;
  head.castShadow = true;
  group.add(head);

  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), eye);
    e.position.set(s * 0.08, 1.61, 0.18);
    group.add(e);
  }

  let bodyColor, legColor;
  if (type === 'boy') {
    bodyColor = 0x2D6B7A; legColor = 0x2B3A4E;
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x2e1a06 });
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 16), hairMat);
    hair.position.y = 1.65; hair.scale.set(1, 0.7, 1);
    group.add(hair);
  } else {
    bodyColor = 0xC75060; legColor = 0xDEA882;
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x110800 });
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 16), hairMat);
    hair.position.y = 1.65; hair.scale.set(1, 0.8, 1);
    group.add(hair);
    const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.12), hairMat);
    hairBack.position.set(0, 1.35, -0.18);
    group.add(hairBack);
  }

  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.5, 0.24),
    new THREE.MeshLambertMaterial({ color: bodyColor })
  );
  torso.position.y = 1.08; torso.castShadow = true;
  group.add(torso);

  const armPivots = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(s * 0.3, 1.28, 0);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.45, 8), skin);
    arm.position.y = -0.22; arm.castShadow = true;
    piv.add(arm); group.add(piv); armPivots.push(piv);
  }

  const legMat = new THREE.MeshLambertMaterial({ color: legColor });
  const legPivots = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(s * 0.1, 0.72, 0);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.52, 8), legMat);
    leg.position.y = -0.26; leg.castShadow = true;
    piv.add(leg); group.add(piv); legPivots.push(piv);
  }

  const shoeMat = new THREE.MeshLambertMaterial({ color: 0x3A2010 });
  for (const s of [-1, 1]) {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.14), shoeMat);
    shoe.position.set(s * 0.1, 0.03, 0.02);
    group.add(shoe);
  }

  group.userData = {
    type: 'placeholder',
    la: armPivots[0], ra: armPivots[1],
    ll: legPivots[0], rl: legPivots[1],
    time: 0, state: 'idle',
  };
  return group;
}

export function animateCharacter(ch, dt) {
  const d = ch.userData;
  if (d.type !== 'placeholder') return;
  d.time += dt;
  const t = d.time;
  switch (d.state) {
    case 'walk': {
      const sp = 7, sw = 0.5;
      d.la.rotation.x = Math.sin(t * sp) * sw;
      d.ra.rotation.x = -Math.sin(t * sp) * sw;
      d.ll.rotation.x = -Math.sin(t * sp) * sw * 0.8;
      d.rl.rotation.x = Math.sin(t * sp) * sw * 0.8;
      break;
    }
    case 'run': {
      const sp = 11, sw = 0.75;
      d.la.rotation.x = Math.sin(t * sp) * sw;
      d.ra.rotation.x = -Math.sin(t * sp) * sw;
      d.ll.rotation.x = -Math.sin(t * sp) * sw * 0.9;
      d.rl.rotation.x = Math.sin(t * sp) * sw * 0.9;
      break;
    }
    default: {
      d.la.rotation.x = Math.sin(t * 1.8) * 0.04;
      d.ra.rotation.x = Math.sin(t * 1.8 + 0.5) * 0.04;
      d.ll.rotation.x = 0; d.rl.rotation.x = 0;
    }
  }
}


