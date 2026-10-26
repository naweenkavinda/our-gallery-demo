import * as THREE from 'three';
import { loadVRMCharacter, loadAnimationsForVRM, AnimationController, stashVRM, preloadAnimations } from './Character.js';

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  return t;
}

const stoneTex = (rx, ry) => canvasTex(1024, 1024, (g, w, h) => {
  g.fillStyle = '#e6dccb'; g.fillRect(0, 0, w, h);
  const rows = 4, bw = w / 2, bh = h / rows;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bw / 2 : 0;
    for (let i = -1; i < 3; i++) {
      const x = i * bw + off;
      g.fillStyle = rand() < 0.5 ? `rgba(255,250,240,${0.05 + rand() * 0.07})` : `rgba(90,70,40,${0.03 + rand() * 0.05})`;
      g.fillRect(x, r * bh, bw, bh);
      g.strokeStyle = 'rgba(150,130,100,0.55)'; g.lineWidth = 3;
      g.strokeRect(x, r * bh, bw, bh);
    }
  }
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = `rgba(110,90,60,${rand() * 0.12})`;
    g.fillRect(rand() * w, rand() * h, 2, 2);
  }
}, rx, ry);

const floorTex = (rx, ry) => canvasTex(1024, 1024, (g, w, h) => {
  const t = w / 2;
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    g.fillStyle = `hsl(35, ${22 + rand() * 8}%, ${86 + rand() * 4}%)`;
    g.fillRect(c * t, r * t, t, t);
    for (let v = 0; v < 6; v++) {
      g.strokeStyle = `rgba(150,120,80,${0.05 + rand() * 0.08})`; g.lineWidth = 1 + rand() * 2;
      g.beginPath();
      const sx = c * t + rand() * t, sy = r * t + rand() * t;
      g.moveTo(sx, sy);
      g.bezierCurveTo(sx + rand() * 200 - 100, sy + rand() * 200 - 100, sx + rand() * 200 - 100, sy + rand() * 200 - 100, sx + rand() * 240 - 120, sy + rand() * 240 - 120);
      g.stroke();
    }
    g.strokeStyle = '#cdbda5'; g.lineWidth = 5;
    g.strokeRect(c * t, r * t, t, t);
  }
}, rx, ry);

const woodTex = () => canvasTex(512, 1024, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#b0622d'); grad.addColorStop(1, '#8c4a21');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 140; i++) {
    g.strokeStyle = `rgba(60,25,5,${0.05 + rand() * 0.12})`; g.lineWidth = 1 + rand() * 2;
    const x = rand() * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + rand() * 8 - 4, h); g.stroke();
  }
  for (const [y0, y1] of [[90, 470], [540, 960]]) {
    g.fillStyle = 'rgba(40,15,0,0.18)'; g.fillRect(60, y0, w - 120, y1 - y0);
    for (let x = 64; x < w - 60; x += 26) {
      g.fillStyle = 'rgba(40,15,0,0.4)'; g.fillRect(x, y0, 4, y1 - y0);
      g.fillStyle = 'rgba(255,200,140,0.14)'; g.fillRect(x + 4, y0, 3, y1 - y0);
    }
    g.strokeStyle = 'rgba(30,10,0,0.6)'; g.lineWidth = 6; g.strokeRect(60, y0, w - 120, y1 - y0);
  }
});

const signTex = () => canvasTex(1024, 140, (g, w, h) => {
  g.fillStyle = '#f2ebde'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(150,130,100,0.6)'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = '#2a2118'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '500 92px "Cormorant Garamond", Georgia, serif';
  g.fillText('Our Gallery', w / 2, h / 2 + 4);
});

export class LobbyScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe9dfce);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 80);
    this.clock = new THREE.Clock();
    this.people = {};
    this.selected = 'boy';
    this.running = false;
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    const narrow = aspect < 1;
    this.camera.fov = narrow ? 56 : 48;
    const cx = narrow ? 0 : 0.7;
    this.camera.position.set(cx, narrow ? 1.5 : 1.45, narrow ? 6.2 : 4.4);
    this.camera.lookAt(cx, narrow ? 1.5 : 1.15, 0);
    this.camera.updateProjectionMatrix();
  }

  buildFacade() {
    const s = this.scene;
    const add = (geo, mat, x, y, z, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = shadow; m.receiveShadow = true;
      s.add(m);
      return m;
    };
    const stone = new THREE.MeshStandardMaterial({ color: 0xefe7d8, roughness: 0.8 });
    const stoneLight = new THREE.MeshStandardMaterial({ color: 0xf4eee2, roughness: 0.55 });
    const B = 0.36;

    const wall = add(new THREE.PlaneGeometry(26, 14), new THREE.MeshStandardMaterial({ map: stoneTex(26 / 2.4, 14 / 2.4), roughness: 0.9 }), 0, 5.5, -2.4, false);
    wall.castShadow = false;
    const floor = add(new THREE.PlaneGeometry(26, 18), new THREE.MeshStandardMaterial({ map: floorTex(26 / 2.4, 18 / 2.4), roughness: 0.38, metalness: 0.04 }), 0, 0, 6.6, false);
    floor.rotation.x = -Math.PI / 2; floor.castShadow = false;

    add(new THREE.BoxGeometry(7.2, 0.12, 2.4), stoneLight, 0, 0.06, -1.2);
    add(new THREE.BoxGeometry(6.8, 0.24, 2.0), stoneLight, 0, 0.12, -1.4);
    add(new THREE.BoxGeometry(6.4, 0.36, 1.6), stoneLight, 0, 0.18, -1.6);

    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.8, 2.5, 0.5), stone, sx * 2.3, B + 1.25, -2.1);
      add(new THREE.BoxGeometry(1.0, 0.2, 0.62), stone, sx * 2.3, B + 0.1, -2.1);
      add(new THREE.BoxGeometry(1.0, 0.22, 0.62), stone, sx * 2.3, B + 2.61, -2.1);
    }
    add(new THREE.BoxGeometry(5.4, 0.7, 0.5), stone, 0, 3.41, -2.1);
    add(new THREE.BoxGeometry(6.0, 0.2, 0.8), stone, 0, 3.87, -2.0);
    add(new THREE.BoxGeometry(6.3, 0.1, 0.9), stone, 0, 4.02, -1.95);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.5), new THREE.MeshStandardMaterial({ map: signTex(), roughness: 0.7 }));
    sign.position.set(0, 3.41, -1.845);
    s.add(sign);

    add(new THREE.BoxGeometry(2.9, 2.5, 0.1), new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 }), 0, B + 1.25, -2.3);
    const wood = new THREE.MeshStandardMaterial({ map: woodTex(), roughness: 0.55 });
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(1.2, 2.4, 0.08), wood, sx * 0.61, B + 1.2, -2.2);
    const bronze = new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 0.4, metalness: 0.5 });
    const ring = add(new THREE.TorusGeometry(0.12, 0.022, 12, 32), bronze, 0.95, 1.55, -2.14);
    ring.rotation.y = 0;
    add(new THREE.BoxGeometry(0.04, 0.9, 0.04), bronze, -0.12, 1.4, -2.14);

    s.add(new THREE.AmbientLight(0xfff1dd, 1.0));
    s.add(new THREE.HemisphereLight(0xfff6e8, 0xcdb89a, 0.9));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    sun.position.set(-5, 7, 5.5);
    sun.target.position.set(0, 1, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 25 });
    sun.shadow.bias = -0.0004;
    s.add(sun); s.add(sun.target);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.46, 0.54, 56),
      new THREE.MeshBasicMaterial({ color: 0xc79a55, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.012;
    s.add(this.ring);
  }

  async load() {
    try { await document.fonts?.load('500 90px "Cormorant Garamond"'); } catch {}
    this.buildFacade();

    const [boy, girl] = await Promise.all([loadVRMCharacter('boy'), loadVRMCharacter('girl')]);
    for (const [type, model] of [['boy', boy], ['girl', girl]]) {
      if (!model) continue;
      const vrm = model.userData.vrm;
      const ctrl = new AnimationController();
      ctrl.init(model);
      await loadAnimationsForVRM(ctrl, vrm, ['idle']);
      ctrl.play('idle');
      this.scene.add(model);
      this.people[type] = { model, vrm, ctrl };
    }
    this.placePeople();
    this.setSelected(this.selected);
    preloadAnimations();                          // while you choose, the game's animations are downloaded and parsed in the background
  }

  // Arms hang at the sides; the inner arms reach toward each other and meet in the middle
  poseArms(type, inner) {
    const p = this.people[type];
    if (!p) return;
    const h = p.vrm.humanoid;
    const set = (name, x, y, z) => {
      const n = h.getNormalizedBoneNode(name);
      if (!n) return;
      n.rotation.order = 'ZYX';
      n.rotation.set(x, y, z);
    };
    const side = type === 'boy' ? 1 : -1;
    const [innerSide, outerSide] = type === 'boy' ? ['left', 'right'] : ['right', 'left'];
    const dir = innerSide === 'left' ? 1 : -1;
    set(`${innerSide}UpperArm`, 0, -0.22 * dir, -1.22 * dir);
    set(`${innerSide}LowerArm`, 0, -0.35 * dir, 0);
    set(`${outerSide}UpperArm`, 0, 0.05 * dir, 1.3 * dir);
    set(`${outerSide}LowerArm`, 0, 0.2 * dir, 0);
    void side;
  }

  placePeople() {
    const { boy, girl } = this.people;
    if (boy) { boy.model.position.set(-0.3, 0, 1.0); boy.model.rotation.y = 0.18; }
    if (girl) { girl.model.position.set(0.3, 0, 1.0); girl.model.rotation.y = -0.18; }
    this.poseArms('boy'); this.poseArms('girl');
    this.scene.updateMatrixWorld(true);
    this.syncHands();
  }

  handPos(type) {
    const p = this.people[type];
    const n = p.vrm.humanoid.getNormalizedBoneNode(type === 'boy' ? 'leftHand' : 'rightHand');
    return n.getWorldPosition(new THREE.Vector3());
  }

  // Slide Sam so both inner hands land on the same spot
  syncHands() {
    const { boy, girl } = this.people;
    if (!boy || !girl) return;
    for (let i = 0; i < 3; i++) {
      this.poseArms('boy'); this.poseArms('girl');
      this.scene.updateMatrixWorld(true);
      const a = this.handPos('boy'), b = this.handPos('girl');
      girl.model.position.x += (a.x - b.x);
      girl.model.position.z += (a.z - b.z);
      this.scene.updateMatrixWorld(true);
    }
    this.handGap = this.handPos('boy').distanceTo(this.handPos('girl'));
  }

  setSelected(type) {
    this.selected = type;
    const p = this.people[type];
    if (p && this.ring) this.ring.position.set(p.model.position.x, 0.012, p.model.position.z);
  }

  start() {
    this.running = true;
    this.clock.start();
    const tick = () => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(tick);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      for (const type of ['boy', 'girl']) {
        const p = this.people[type];
        if (!p) continue;
        p.ctrl.update(dt);
        this.poseArms(type);
        p.vrm.update(dt);
      }
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  /** stop animating but keep the last picture on screen */
  freeze() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  /** give both loaded characters to the game, so it does not download and build them a second time */
  handOver() {
    for (const type of ['boy', 'girl']) {
      const p = this.people[type];
      if (!p) continue;
      this.scene.remove(p.model);
      p.ctrl.mixer?.stopAllAction();
      p.ctrl.mixer?.uncacheRoot(p.model);
      stashVRM(type, p.model);
      delete this.people[type];
    }
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this.scene.traverse(o => {
      o.geometry?.dispose?.();
      const m = o.material;
      if (m) (Array.isArray(m) ? m : [m]).forEach(x => { x.map?.dispose?.(); x.dispose?.(); });
    });
    this.renderer.dispose();
  }
}

