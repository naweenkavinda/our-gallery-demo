import * as THREE from 'three';
import config from '../config/gallery.json';
import { ROOM_DEFS, DOG_NAV, WALL_H, getCurrentRoom } from './Gallery.js';
import { createAtmosphere } from './Atmosphere.js';
import { ParticleField } from './Particles.js';
import { Bird } from './Bird.js';
import { SHOW_BIRD } from '../config/animals.js';
import { createCollectibles } from './Collectibles.js';
import { createSongRoom } from './SongRoom.js';
import { createAnniversary } from './Anniversary.js';
import { createSocial } from './Social.js';
import { createGuestbook } from './Guestbook.js';
import { createBooth } from './Booth.js';
import { createExitDoor } from './ExitDoor.js';
import { createKiss } from './Kiss.js';
import { createBubbles } from './Bubbles.js';
import { createMonthiversary } from './Monthiversary.js';
import { createCinema } from './Cinema.js';
import { createMailbox } from './Mailbox.js';
import { sound } from './Sound.js';
import { createBlowKiss } from './BlowKiss.js';
import { createTogether } from './Together.js';
import { createSurpriseRoom } from './SurpriseRoom.js';
import { createPlanetarium } from './Planetarium.js';
import { describeSpot } from './Hints.js';

/**
 * Everything that makes the gallery more than rooms and pictures: the day and night sky, the
 * seasons in each room, the little bird, love notes and the heart hunt, our song, the
 * anniversary wall, holding hands, the guestbook, the photo booth and the way back.
 */
export function createFeatures(ctx) {
  const { scene, galleryData, interactions, controls, tpCamera, showToast, getNet, getRemotes, getLocal, getDog, myName } = ctx;
  const env = galleryData.env;
  const room = id => ROOM_DEFS.find(r => r.id === id);
  const inset = (r, d) => ({ x1: r.x1 + d, x2: r.x2 - d, z1: r.z1 + d, z2: r.z2 - d });

  const dark = room('dark');
  const atmosphere = createAtmosphere(scene, env, WALL_H, env.gardenCenter, { x1: dark.x1, x2: dark.x2, z1: dark.z1, z2: dark.z2 });
  // after dark, fireflies come out in the Quiet Place
  const nightFlies = new ParticleField(scene, { kind: 'firefly', count: 70, rect: inset(dark, 0.8), y0: 0.4, y1: 3.2, size: 0.2, color: 0xfff0a0, reach: 8 });
  nightFlies.setAlpha(0);

  // each room has its own weather, matching its memories
  const seasons = [
    new ParticleField(scene, { kind: 'petal', count: 150, rect: inset(room('hello'), 0.6), y1: 5.4, size: 0.14, color: 0xffb3c6, reach: 7 }),
    new ParticleField(scene, { kind: 'snow', count: 220, rect: inset(room('moments'), 0.6), y1: 5.4, size: 0.08, color: 0xffffff, reach: 7 }),
    new ParticleField(scene, { kind: 'firefly', count: 90, rect: inset(room('adventures'), 0.8), y0: 0.5, y1: 3.2, size: 0.22, color: 0xffe9a0, reach: 7 }),
    new ParticleField(scene, { kind: 'sparkle', count: 120, rect: inset(room('celebrations'), 0.6), y1: 5.4, size: 0.1, color: 0xffd98a, reach: 7 }),
  ];

  // The bird and the cat are parked until realistic models are ready (set SHOW_BIRD / SHOW_CAT in config/animals.js)
  const bird = SHOW_BIRD ? new Bird(scene, DOG_NAV, galleryData.perches, (x, z) => getCurrentRoom(x, z).id) : null;

  let collectibles = null;
  const requestGuide = () => {
    const dog = getDog(), me = getLocal(), net = getNet();
    if (!dog) { showToast('The dog is still waking up...', 2500); return; }
    if (net?.dogId) { showToast('Someone is playing Teddy right now, so he cannot lead the way.', 3500); return; }
    const spot = collectibles.nextHeartSpot(me.wrapper.position);
    if (!spot) { showToast('You have already found every heart.', 3000); return; }
    const d = Math.hypot(dog.root.position.x - me.wrapper.position.x, dog.root.position.z - me.wrapper.position.z);
    if (d > 6) { showToast('Walk up to the dog first, then press G.', 3000); return; }
    if (!net || net.isDogHost) dog.guideTo(spot.x, spot.z); else net.send({ t: 'guide', x: spot.x, z: spot.z });
    showToast(`The dog knows where one is hiding, ${describeSpot(spot)}. Follow!`, 8000);
  };
  collectibles = createCollectibles({
    scene, interactions, controls, showToast, requestGuide,
    onYes: () => { getNet()?.send({ t: 'yes' }); showToast('You said yes.', 4000); sound.fanfare(); },
  });

  const song = createSongRoom({ scene, interactions, config, showToast });
  interactions.benches.push(...song.seats);                  // the two floor cushions are seats too
  const cinema = createCinema({ scene, interactions, tpCamera, getNet, getLocal, showToast });
  const mailbox = createMailbox({ scene, interactions, controls, getNet, getLocal, showToast, myName, role: ctx.role });
  const anniversary = createAnniversary({ scene });
  const monthiversary = createMonthiversary({ scene, carpet: galleryData.carpet, anniversary, collectibles, getLocal, showToast });
  const planetarium = createPlanetarium({ scene, interactions, tpCamera, renderer: ctx.renderer, getLocal, getRemotes, showToast });
  const surprise = createSurpriseRoom({ scene, interactions, collectibles, anniversary, getLocal, showToast });
  // is something else already taking over the screen? (a kiss, a photo, a letter, the mailbox, a photo viewer)
  const isBusy = () => !!(kiss?.busy || together?.busy || booth?.busy || mailbox?.busy || collectibles?.modalOpen || interactions.viewerOpen);
  const social = createSocial({ scene, atmosphere, tpCamera, getLocal, getRemotes, getNet, showToast, isBusy });
  const kiss = createKiss({ scene, THREE, tpCamera, getLocal, getRemotes, getNet, social, showToast, playLocal: ctx.playLocal, isBusy });
  const together = createTogether({ scene, tpCamera, getLocal, getRemotes, getNet, social, showToast, playLocal: ctx.playLocal, isBusy });
  social.setLeanProbe(() => together.leaning || getRemotes().some(e => e.lean));
  const guestbook = createGuestbook({ getNet, photoFrames: galleryData.photoFrames, showToast, myName, role: ctx.role });
  const bubbles = createBubbles(scene);
  const blowKiss = createBlowKiss({
    scene,
    getPlayers: () => [
      { id: getNet()?.id ?? 'me', wrapper: getLocal().wrapper, anim: getLocal().anim },
      ...getRemotes().map(e => ({ id: e.id, wrapper: e.wrapper, anim: e.wantAnim })),
    ],
  });
  const booth = createBooth({ scene, interactions, tpCamera, controls, getNet, getLocal, getRemotes, showToast, myName, playLocal: ctx.playLocal, social, bubbles, fx: blowKiss });
  const exitDoor = createExitDoor({
    scene, interactions, showToast,
    onLeave: () => {
      try { sessionStorage.setItem('og-to-lobby', '1'); } catch { /* ignore */ }
      try { getNet()?.ws?.close(); } catch { /* ignore */ }
      location.reload();
    },
  });

  // messages from the partner
  const net0 = getNet();
  net0?.on?.('bird', m => { if (bird && !net0.isDogHost) bird.applyRemote(m); });
  net0?.on?.('guide', m => { const dog = getDog(); if (dog && net0.isDogHost) dog.guideTo(m.x, m.z); });
  net0?.on?.('yes', () => { showToast('She said yes!', 6000); sound.fanfare(); });

  let lastBird = 0;
  return {
    atmosphere, bird, social, kiss, together, planetarium, guestbook, booth, collectibles, song, exitDoor,
    get modalOpen() { return collectibles.modalOpen || booth.busy || exitDoor.busy || kiss.busy || together.busy || mailbox.busy; },
    /** the photo viewer opened or closed */
    viewing(frame) { frame ? guestbook.open(frame) : guestbook.close(); },
    afterRender(renderer, rScene) { booth.afterRender(renderer, rScene); },
    update(dt) {
      const me = getLocal(), net = getNet(), remotes = getRemotes();
      const t = performance.now() / 1000;
      interactions.blocked = this.modalOpen;

      atmosphere.update(dt);
      nightFlies.setAlpha(Math.min(1, Math.max(0, (atmosphere.night - 0.4) * 1.8)));
      nightFlies.update(dt, me.wrapper.position);
      monthiversary.update(dt);
      surprise.update(dt);
      planetarium.update(dt);
      cinema.update(dt);
      mailbox.update(dt);
      for (const f of seasons) f.update(dt, me.wrapper.position);
      collectibles.update(dt, t);
      anniversary.update(dt);
      social.update(dt);
      atmosphere.dim *= 1 - 0.6 * planetarium.dark;                 // the rest of the gallery falls dark while you are in the planetarium
      kiss.update(dt);
      together.update(dt);
      exitDoor.update(dt);
      booth.update(dt);
      blowKiss.update(dt);

      const partner = remotes[0];
      // speech bubbles for requests that are waiting for a yes
      bubbles.set('kiss-me', me.wrapper, kiss.asking && !kiss.asked && !kiss.busy ? '💋 Kiss?' : null);
      bubbles.set('kiss-them', partner?.wrapper, kiss.asked && !kiss.asking && !kiss.busy ? '💋 Kiss?' : null);
      bubbles.set('listen-me', me.wrapper, social.listenAsking && !social.listening ? '🎵 Listen together?' : null);
      bubbles.set('listen-them', partner?.wrapper, social.listenAsked && !social.listenAsking && !social.listening ? '🎵 Listen together?' : null);
      bubbles.update(dt);
      const pd = partner ? Math.hypot(partner.wrapper.position.x - me.wrapper.position.x, partner.wrapper.position.z - me.wrapper.position.z) : null;
      // sit on a cushion by the record player, or listen together on a bench, and our song plays just for you
      song.forced = !!(interactions.sitting && interactions.currentBench?.listen) || social.listening;
      song.update(dt, me.wrapper.position, pd);

      const players = [{ id: net?.id ?? 'me', wrapper: me.wrapper, hipsY: me.hipsY }, ...remotes.map(e => ({ id: e.id, wrapper: e.wrapper, hipsY: e.hipsY }))];
      const host = !net || net.isDogHost;
      if (bird) bird.update(dt, players, host);
      if (bird && host && net?.connected && t - lastBird > 0.1) { lastBird = t; net.send({ t: 'bird', ...bird.getSyncState() }); }
    },
  };
}
