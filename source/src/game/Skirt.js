/**
 * A skirt hangs from the thighs, so when the thighs swing up to sit the whole front of it is carried up with them.
 * While sitting we let gravity win over the skirt's stiffness, so it settles down over the lap instead.
 */
const SITTING = { stiffness: 0.3, gravityPower: 0.5, dragForce: 0.3 };
const RATE = 4;      // how quickly it settles (and springs back when she stands)

export function drapeSkirt(vrm, sitting, dt) {
  const mgr = vrm?.springBoneManager;
  if (!mgr) return;
  const ud = vrm.scene.userData;
  if (!ud.skirt) {
    ud.skirt = [...mgr.joints].filter(j => /Skirt/i.test(j.bone.name))
      .map(j => ({ s: j.settings, stiffness: j.settings.stiffness, gravityPower: j.settings.gravityPower, dragForce: j.settings.dragForce }));
    ud.drape = 0;
  }
  if (!ud.skirt.length) return;
  const target = sitting ? 1 : 0;
  if (ud.drape === target) return;
  ud.drape += (target - ud.drape) * (1 - Math.exp(-RATE * dt));
  if (Math.abs(target - ud.drape) < 0.002) ud.drape = target;
  const k = ud.drape;
  for (const j of ud.skirt) {
    j.s.stiffness = j.stiffness + (SITTING.stiffness - j.stiffness) * k;
    j.s.gravityPower = j.gravityPower + (SITTING.gravityPower - j.gravityPower) * k;
    j.s.dragForce = j.dragForce + (SITTING.dragForce - j.dragForce) * k;
  }
}
