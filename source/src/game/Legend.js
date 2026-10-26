/**
 * The key legend. It opens by itself when you walk in (and fades after a while),
 * and 9 (or the ? button) brings it back any time.
 */

const ROWS = [
  ['W A S D', 'Walk'],
  ['Shift', 'Run'],
  ['Space', 'Jump'],
  ['E', 'Look closer, pet, take a photo'],
  ['F', 'Sit on a bench, sofa or cushion, or lie back in the planetarium'],
  ['K', 'Kiss'],
  ['H', 'Hold hands (press H again to let go)'],
  ['L', 'Listen to our song together (sitting side by side)'],
  ['R', 'Rest your head on their shoulder (sitting side by side)'],
  ['T', 'Dance together'],
  ['N', 'Clue to the next love note'],
  ['G', 'Ask the dog to show a hidden heart'],
  ['1 - 5', 'Wave, blow a kiss, dance'],
  ['Scroll', 'Zoom the camera'],
  ['V', 'Voice chat: microphone on or off'],
  ['M', 'Sound on or off'],
  ['9', 'Show or hide this'],
];

// on a phone or tablet there is no keyboard: the same things, as the buttons you actually have
const TOUCH_ROWS = [
  ['Left stick', 'Walk (push it right to the edge to run)'],
  ['Drag', 'Look around (the right side of the screen)'],
  ['Pinch', 'Zoom the camera'],
  ['⇧', 'Jump'],
  ['E', 'Look closer, pet, take a photo, start the film'],
  ['F', 'Sit on a bench, sofa or cushion, or lie back in the planetarium'],
  ['Kiss', 'Ask for a kiss (your partner taps it too)'],
  ['Hold hands', 'Hold hands'],
  ['Listen', 'Listen to our song together (sitting side by side)'],
  ['Lean', 'Rest your head on their shoulder (sitting side by side)'],
  ['Dance', 'Dance together'],
  ['Clue', 'Clue to the next love note'],
  ['Dog hint', 'Ask the dog to show a hidden heart'],
  ['☺', 'Wave, blow a kiss, dance'],
  ['\u{1F50A}', 'Sound on or off'],
];

// a visitor who comes in as Teddy, the dog
const DOG_ROWS = [
  ['W A S D', 'Walk'],
  ['Shift', 'Run'],
  ['Space', 'Hop'],
  ['E', 'Bark'],
  ['F', 'Sit (or sniff the floor), or get up'],
  ['1 - 5', 'Tricks: spin, bark, play dead...'],
  ['Scroll', 'Zoom the camera'],
  ['V', 'Voice chat: microphone on or off'],
  ['M', 'Sound on or off'],
  ['9', 'Show or hide this'],
];
const DOG_TOUCH_ROWS = [
  ['Left stick', 'Walk (push it right to the edge to run)'],
  ['Drag', 'Look around (the right side of the screen)'],
  ['Pinch', 'Zoom the camera'],
  ['\u21E7', 'Hop'],
  ['E', 'Bark'],
  ['F', 'Sit (or sniff the floor), or get up'],
  ['\u263A', 'Tricks: spin, bark, play dead...'],
  ['\u{1F399}', 'Voice chat: microphone on or off'],
  ['\u{1F50A}', 'Sound on or off'],
];

export function createLegend(dogMode = false) {
  const touch = document.body.classList.contains('touch');
  const rows = dogMode ? (touch ? DOG_TOUCH_ROWS : DOG_ROWS) : touch ? TOUCH_ROWS : ROWS;
  const panel = document.createElement('div');
  panel.className = 'legend'; panel.hidden = true;
  panel.innerHTML = `<div class="legend-title">Controls</div>` +
    rows.map(([k, d]) => `<div class="legend-row"><span class="legend-keys">${touch ? `<kbd>${k}</kbd>` : k.split(' ').map(x => (x === '-' ? '–' : `<kbd>${x}</kbd>`)).join('')}</span><span>${d}</span></div>`).join('') +
    `<div class="legend-foot">${touch ? 'Tap anywhere on this to close' : 'Press <kbd>9</kbd> to close'}</div>`;
  document.body.appendChild(panel);

  const btn = document.createElement('button');
  btn.className = 'legend-btn'; btn.textContent = '?'; btn.dataset.key = '9'; btn.title = 'Controls (9)'; btn.setAttribute('aria-label', 'Show controls');
  document.body.appendChild(btn);

  let timer = 0;
  const show = (ms = 0) => {
    panel.hidden = false; requestAnimationFrame(() => panel.classList.add('open'));
    clearTimeout(timer);
    if (ms) timer = setTimeout(hide, ms);
  };
  const hide = () => {
    clearTimeout(timer);
    panel.classList.remove('open');
    setTimeout(() => { if (!panel.classList.contains('open')) panel.hidden = true; }, 480);
  };
  // pressing 9 (or the ? button) slides the full legend up out of the bar, and five seconds later it slides back in
  const toggle = () => (panel.classList.contains('open') ? hide() : show(document.body.classList.contains('touch') ? 8000 : 5000));

  window.addEventListener('keydown', e => {
    if (e.code !== 'Digit9' && e.code !== 'Numpad9') return;
    if (e.repeat || e.target?.closest?.('input,textarea')) return;
    toggle();
  });
  btn.addEventListener('click', toggle);
  btn.addEventListener('touchstart', e => { e.preventDefault(); toggle(); }, { passive: false });
  panel.addEventListener('click', hide);

  return { show, hide, toggle };
}
