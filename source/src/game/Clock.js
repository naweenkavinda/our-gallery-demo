/**
 * "Now", with two switches for trying things out: ?date=2026-11-09 pretends it is that day,
 * ?hour=21.5 pretends it is that time (half past nine at night). Without them it is the real time.
 */
const q = new URLSearchParams(location.search);

export function now() {
  const d = new Date();
  const date = q.get('date');
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) { const [y, m, day] = date.split('-').map(Number); d.setFullYear(y, m - 1, day); }
  const hour = q.get('hour');
  if (hour != null && hour !== '' && Number.isFinite(+hour)) d.setHours(Math.floor(+hour), Math.round((+hour % 1) * 60), 0, 0);
  return d;
}
