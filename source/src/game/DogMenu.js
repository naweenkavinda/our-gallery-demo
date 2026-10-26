/**
 * What you can do with Teddy. Walk up to him and press E (or tap him) and a small menu opens: pet him, give him a treat,
 * tell him to sit, tell him to sleep, or just say hi. Click or tap one, or press 1 to 5. It closes by itself when you walk away.
 */

const ITEMS = [
  ['pet', '\u{1F43E}', 'Pet Teddy'],
  ['treat', '\u{1F9B4}', 'Give a treat'],
  ['sit', '\u{1F415}', 'Teddy, sit!'],
  ['sleep', '\u{1F634}', 'Teddy, sleep'],
  ['hi', '\u{1F44B}', 'Hi Teddy!'],
];

export function createDogMenu({ getDog, getNet, getPlayerPos }) {
  const el = document.createElement('div');
  el.className = 'dog-menu'; el.hidden = true;
  el.innerHTML = '<div class="dm-title">Teddy</div>' + ITEMS.map(([k, e, l], i) => `<button type="button" data-k="${k}"><span class="dm-ic">${e}</span><span class="dm-l">${l}</span><kbd>${i + 1}</kbd></button>`).join('');
  document.body.appendChild(el);

  const close = () => { if (el.hidden) return; el.classList.remove('open'); setTimeout(() => { if (!el.classList.contains('open')) el.hidden = true; }, 220); };
  const open = () => { el.hidden = false; requestAnimationFrame(() => el.classList.add('open')); };

  function perform(kind) {
    const dog = getDog(), net = getNet(), pos = getPlayerPos();
    if (!dog) return;
    if (net?.dogId) net.sendPet(pos, kind);                       // someone is playing Teddy: it happens on their screen
    else if (!net || net.isDogHost) dog.interact(kind, pos);
    else net.sendPet(pos, kind);                                  // the other player's computer runs the dog
    close();
  }

  el.addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b) perform(b.dataset.k); });
  el.addEventListener('touchstart', e => { const b = e.target.closest('button[data-k]'); if (b) { e.preventDefault(); perform(b.dataset.k); } }, { passive: false });
  // 1 to 5 pick from the menu while it is open (the same keys are emotes otherwise), Escape closes it
  window.addEventListener('keydown', e => {
    if (el.hidden || e.repeat) return;
    const i = parseInt(e.key) - 1;
    if (e.code.startsWith('Digit') && i >= 0 && i < ITEMS.length) { e.stopImmediatePropagation(); e.preventDefault(); perform(ITEMS[i][0]); }
    else if (e.code === 'Escape') close();
  }, true);

  return {
    toggle() { if (el.hidden) open(); else close(); },
    get open() { return !el.hidden; },
    close,
    update() {
      if (el.hidden) return;
      const dog = getDog(), p = getPlayerPos();
      if (!dog || Math.hypot(p.x - dog.root.position.x, p.z - dog.root.position.z) > 4.6) close();
    },
  };
}
