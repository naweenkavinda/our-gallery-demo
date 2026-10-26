import { sound } from './Sound.js';

/**
 * Interactions.js — Proximity-based interaction system
 *
 * Detects when the player is near a photo frame or bench,
 * shows prompt bubbles, and handles E (look closer) / F (sit) actions.
 */

import * as THREE from 'three';

const _v = new THREE.Vector3();

export class InteractionSystem {
  constructor() {
    this.photoFrames = [];
    this.benches = [];
    this.sitting = false;
    this.currentBench = null;
    this.promptEl = document.getElementById('prompt-bubble');
    this.viewerEl = document.getElementById('photo-viewer');
    this.viewerImg = document.getElementById('pv-img');
    this.viewerOpen = false;
    this.viewerFrame = null;
    this.openedAt = 0;
    this.closedAt = 0;
    this.pets = [];
    this.extras = [];        // notes, hearts, the photo booth, the record player...
    this.blocked = false;      // true while a full-screen overlay is open
    this.swallowE = false;
    this.dogMode = false;      // playing the dog: no sitting on benches, F stays the dog's own key
    this.lastE = false;        // was E pressed this frame, and did something take it?
    this.eHandled = false;

    // Close photo viewer
    document.getElementById('pv-close')?.addEventListener('click', () => this.closeViewer());
    window.addEventListener('keydown', e => {
      if (e.target?.closest?.('input,textarea') && e.code !== 'Escape') return;
      if (!this.viewerOpen || e.repeat || performance.now() - this.openedAt < 600) return;
      if (e.code === 'Escape' || e.code === 'KeyE') { this.swallowE = e.code === 'KeyE'; this.closeViewer(); }
    });
  }

  register(photoFrames, benches) {
    this.pets = [];                 // { animal, label, onPet } for each animal you can pet
    this.photoFrames = photoFrames;
    this.benches = benches;
  }

  update(playerPos, camera, controls) {
    if (this.blocked) {
      this._hidePrompt();
      controls.consumeE(); controls.consumeF();
      return { sitting: this.sitting, viewerOpen: this.viewerOpen };
    }
    if (this.viewerOpen) {
      this._hidePrompt();
      controls.consumeE(); controls.consumeF();
      return { sitting: this.sitting, viewerOpen: true };
    }

    let photo = null, photoD = Infinity;
    let bench = null, benchD = Infinity;

    for (const pf of this.photoFrames) {
      const d = playerPos.distanceTo(pf.group.position);
      if (d < 3.5 && d < photoD) { photoD = d; photo = pf; }
    }
    for (const bn of this.benches) {
      const d = playerPos.distanceTo(bn.group.position);
      if (d < 2.5 && d < benchD) { benchD = d; bench = bn; }
    }

    // The dog takes priority when you are close to it
    let dogNear = false, pet = null, petD = Infinity;
    if (!this.sitting) {
      const reach = document.body.classList.contains('touch') ? 3.3 : 2.4;          // a thumb is less exact than a mouse: reach a little further
      for (const p of this.pets) {
        const dx = playerPos.x - p.animal.root.position.x, dz = playerPos.z - p.animal.root.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < reach * reach && d2 < petD) { petD = d2; pet = p; }
      }
      dogNear = !!pet;
    }
    const dogBusy = !!pet?.animal.trick;

    let extra = null, extraD = Infinity;
    if (!this.sitting) {
      for (const ex of this.extras) {
        if (!ex.visible()) continue;
        const d = Math.hypot(playerPos.x - ex.pos.x, playerPos.z - ex.pos.z);
        if (d < ex.radius && d < extraD) { extraD = d; extra = ex; }
      }
    }
    if (dogNear && extra && extraD < Math.sqrt(petD)) dogNear = false;        // a heart, note or mailbox that is closer than the animal wins
    if (this.dogMode) bench = null;
    const target = photo || bench;                         // E opens a photo, F sits: each works whenever its thing is in reach
    const targetType = photo ? 'photo' : 'bench';

    // Show prompt
    if (this.sitting) {
      this._showStandPrompt(camera);
    } else if (dogNear) {
      if (dogBusy) this._hidePrompt();
      else this._showPrompt(pet.animal.root.position, camera, 'dog', !!bench, pet.label);
    } else if (extra) {
      this._showPrompt(extra.pos, camera, 'extra', false, extra.prompt);
    } else if (target) {
      this._showPrompt(target.group.position, camera, targetType, !!(photo && bench), target.label || '');
    } else {
      this._hidePrompt();
    }

    // Handle E: pet the dog, or look closer at a photo
    if (this.swallowE) { controls.consumeE(); this.swallowE = false; }
    const pressedE = controls.consumeE();
    this.lastE = pressedE; this.eHandled = false;
    if (pressedE && dogNear && !dogBusy) {
      pet.onPet(); this.eHandled = true;
    } else if (pressedE && !dogNear && extra) {
      extra.onUse(); this.eHandled = true;
    } else if (pressedE && !dogNear && performance.now() - this.closedAt > 500 && target && targetType === 'photo' && !this.sitting) {
      this.openViewer(target); this.eHandled = true;
    }

    // E while seated can belong to the seat (the cinema sofa starts the film)
    if (pressedE && this.sitting && this.currentBench?.onE) this.currentBench.onE();

    // Handle F: sit / stand (works even with the dog next to you)
    if (!this.dogMode && controls.consumeF()) {
      if (this.sitting) this.stand();
      else if (bench) this.sit(bench);
    }

    return { sitting: this.sitting, viewerOpen: this.viewerOpen };
  }

  sit(bench) {
    sound.sit();
    this.sitting = true;
    this.currentBench = bench;
    return bench;
  }

  stand() {
    this.sitting = false;
    this.currentBench = null;
  }

  openViewer(photoFrame) {
    this.viewerOpen = true;
    this.viewerFrame = photoFrame;
    this.openedAt = performance.now();
    // For now show placeholder; when real photos are loaded the texture URL goes here
    if (this.viewerImg) {
      this.viewerImg.src = photoFrame.getViewerURL?.() || '';
      this.viewerImg.alt = photoFrame.caption || 'Photo';
    }
    const label = this.viewerEl?.querySelector('.pv-label');
    if (label) label.textContent = photoFrame.caption ? `Viewing · ${photoFrame.caption}` : 'Viewing';
    if (this.viewerEl) this.viewerEl.hidden = false;
  }

  closeViewer() {
    this.viewerOpen = false;
    this.viewerFrame = null;
    this.closedAt = performance.now();
    if (this.viewerEl) this.viewerEl.hidden = true;
  }

  _showPrompt(worldPos, camera, type, alsoSit = false, html = '') {
    if (!this.promptEl) return;
    _v.copy(worldPos);
    _v.y += type === 'dog' ? 1.5 : type === 'extra' ? 0.5 : 2.2;
    _v.project(camera);
    if (_v.z > 1) { this._hidePrompt(); return; }
    const hw = window.innerWidth / 2;
    const hh = window.innerHeight / 2;
    this.promptEl.style.left = (_v.x * hw + hw) + 'px';
    this.promptEl.style.top = (-_v.y * hh + hh) + 'px';

    if (type === 'extra') {
      this.promptEl.innerHTML = html;
    } else if (type === 'dog') {
      const who = html ? html[0].toUpperCase() + html.slice(1) : 'The dog';
      this.promptEl.innerHTML = `Play with ${who} <kbd>E</kbd> &nbsp;&middot;&nbsp; pet &middot; treat &middot; sit &middot; sleep &middot; hi` + (alsoSit ? ' &nbsp;&middot;&nbsp; Sit <kbd>F</kbd>' : '');
    } else if (type === 'photo') {
      this.promptEl.innerHTML = 'Look closer <kbd>E</kbd>' + (alsoSit ? ' &nbsp;&middot;&nbsp; Sit <kbd>F</kbd>' : '');
    } else {
      this.promptEl.innerHTML = `${html || 'Sit down'} <kbd>F</kbd>`;
    }
    this.promptEl.hidden = false;
  }

  _showStandPrompt(camera) {
    if (!this.promptEl || !this.currentBench) return;
    _v.copy(this.currentBench.group.position);
    _v.y += 2;
    _v.project(camera);
    const hw = window.innerWidth / 2;
    const hh = window.innerHeight / 2;
    this.promptEl.style.left = (_v.x * hw + hw) + 'px';
    this.promptEl.style.top = (-_v.y * hh + hh) + 'px';
    this.promptEl.innerHTML = 'Stand up <kbd>F</kbd>';
    this.promptEl.hidden = false;
  }

  _hidePrompt() {
    if (this.promptEl) this.promptEl.hidden = true;
  }
}










