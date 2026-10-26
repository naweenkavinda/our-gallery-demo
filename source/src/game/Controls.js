/**
 * Controls.js — Keyboard + mouse + mobile touch input
 *
 * Desktop: WASD/arrows, Shift run, Space jump, E interact, F sit, mouse drag look, pointer lock
 * Mobile:  left joystick, right-area drag look, E/F buttons
 */

export class Controls {
  constructor() {
    this.keys = {};
    this.mouseDown = false;
    this.lookDelta = { x: 0, y: 0 };
    this.joystick = { x: 0, y: 0 };
    this.ePressed = false;
    this.fPressed = false;
    this.spacePressed = false;
    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || /[?&]touch=1\b/.test(location.search);
    this._locked = false;
    this.lookEnabled = true;
    this.zoomDelta = 0;

    this._initKeyboard();
    this._initMouse();
    if (this.isMobile) this._initTouch();
  }

  _initKeyboard() {
    window.addEventListener('keydown', e => {
      if (e.target?.closest?.('input,textarea')) return;   // typing a message, not walking
      this.keys[e.code] = true;
      if (e.repeat) return;                                  // holding a key is not pressing it again
      if (e.code === 'KeyE') this.ePressed = true;
      if (e.code === 'KeyF') this.fPressed = true;
      if (e.code === 'Space') this.spacePressed = true;
    });
    window.addEventListener('keyup', e => {
      this.keys[e.code] = false;
    });
    window.addEventListener('blur', () => { this.keys = {}; });    // alt-tab while walking must not leave a key "held"
  }

  _initMouse() {
    const canvas = document.getElementById('gallery-canvas');
    if (!canvas) return;

    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) this.mouseDown = true;
    });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });

    // Pointer lock for smoother look
    canvas.addEventListener('click', () => {
      if (!this.lookEnabled) return;                         // a viewer or panel is open: keep the cursor for it
      if (!this._locked && document.pointerLockElement !== canvas) {
        try { canvas.requestPointerLock(); } catch {}
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this._locked = document.pointerLockElement === canvas;
    });

    window.addEventListener('wheel', e => {
      if (!this.lookEnabled) return;
      this.zoomDelta += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    }, { passive: true });

    window.addEventListener('mousemove', e => {
      if (!this.lookEnabled) return;
      this.lookDelta.x += e.movementX;
      this.lookDelta.y += e.movementY;
    });
  }

  _initTouch() {
    // ── Joystick ──
    const joyZone = document.getElementById('joy-zone');
    const thumb = document.getElementById('joy-thumb');
    if (!joyZone || !thumb) return;

    let jid = null, sx = 0, sy = 0;
    const maxD = 46;

    joyZone.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.changedTouches[0];
      jid = t.identifier; sx = t.clientX; sy = t.clientY;
    }, { passive: false });

    joyZone.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== jid) continue;
        let dx = t.clientX - sx, dy = t.clientY - sy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > maxD) { dx *= maxD / d; dy *= maxD / d; }
        thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this.joystick.x = dx / maxD;
        this.joystick.y = dy / maxD;
      }
    }, { passive: false });

    const jend = e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== jid) continue;
        jid = null;
        this.joystick.x = 0; this.joystick.y = 0;
        thumb.style.transform = 'translate(-50%,-50%)';
      }
    };
    joyZone.addEventListener('touchend', jend);
    joyZone.addEventListener('touchcancel', jend);

    // ── Look zone ──
    const lookZone = document.getElementById('look-zone');
    if (!lookZone) return;
    let lid = null, lx = 0, ly = 0;

    // two fingers on the look area pinch to zoom the camera
    let pinch = 0;
    const spread = ts => Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
    lookZone.addEventListener('touchstart', e => {
      if (e.touches.length === 2) pinch = spread(e.touches);
      const t = e.changedTouches[0];
      lid = t.identifier; lx = t.clientX; ly = t.clientY;
    });
    lookZone.addEventListener('touchmove', e => {
      if (e.touches.length === 2 && pinch) {
        const d = spread(e.touches);
        if (this.lookEnabled) this.zoomDelta -= (d - pinch) * 2.2;       // fingers apart: closer
        pinch = d; lx = e.touches[0].clientX; ly = e.touches[0].clientY;
        return;
      }
      for (const t of e.changedTouches) {
        if (t.identifier !== lid) continue;
        if (this.lookEnabled) {                              // not while a kiss, the booth or a viewer has the camera
          this.lookDelta.x += t.clientX - lx;
          this.lookDelta.y += t.clientY - ly;
        }
        lx = t.clientX; ly = t.clientY;
      }
    });
    const lend = e => {
      if (e.touches.length < 2) pinch = 0;
      for (const t of e.changedTouches) { if (t.identifier === lid) lid = null; }
    };
    lookZone.addEventListener('touchend', lend);
    lookZone.addEventListener('touchcancel', lend);

    // ── Mobile action buttons ──
    const btnE = document.getElementById('mob-btn-e');
    const btnF = document.getElementById('mob-btn-f');
    if (btnE) btnE.addEventListener('touchstart', e => { e.preventDefault(); this.ePressed = true; }, { passive: false });
    if (btnF) btnF.addEventListener('touchstart', e => { e.preventDefault(); this.fPressed = true; }, { passive: false });
    const btnJ = document.getElementById('mob-btn-j');                    // jump (the space bar on a keyboard)
    if (btnJ) btnJ.addEventListener('touchstart', e => { e.preventDefault(); this.spacePressed = true; }, { passive: false });

    // K / H / N / G: the features listen for these keys, so the buttons send the same key press
    document.querySelectorAll('#mob-extras .mob-pill').forEach(b => {
      b.addEventListener('touchstart', e => {
        e.preventDefault();
        window.dispatchEvent(new KeyboardEvent('keydown', { code: b.dataset.code }));
      }, { passive: false });
    });

    // Show mobile controls
    const mc = document.getElementById('mobile-controls');
    if (mc) mc.hidden = false;
  }

  /** Mouse wheel, normalised to pixels. */
  consumeZoom() { const v = this.zoomDelta; this.zoomDelta = 0; return v; }

  requestLock() {
    const canvas = document.getElementById('gallery-canvas');
    if (canvas && !this.isMobile && document.pointerLockElement !== canvas) {
      try { canvas.requestPointerLock()?.catch?.(() => {}); } catch {}
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Returns normalised movement vector + run flag. */
  getMovement() {
    let x = 0, z = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp'])    z = -1;
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  z =  1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  x = -1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) x =  1;
    x += this.joystick.x;
    z += this.joystick.y;
    const len = Math.sqrt(x * x + z * z);
    if (len > 1) { x /= len; z /= len; }
    return {
      x, z,
      // on a phone, pushing the stick right to its edge runs
      run: !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']) || Math.hypot(this.joystick.x, this.joystick.y) > 0.93,
    };
  }

  /** Consume and return accumulated look delta. */
  consumeLook() {
    const v = { x: this.lookDelta.x, y: this.lookDelta.y };
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
    return v;
  }

  consumeE() { const v = this.ePressed; this.ePressed = false; return v; }
  consumeF() { const v = this.fPressed; this.fPressed = false; return v; }
  consumeSpace() { const v = this.spacePressed; this.spacePressed = false; return v; }
}

