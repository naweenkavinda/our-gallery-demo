// Locally the relay is a separate process on :8787; once deployed the same address serves both
const LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || /^(192\.168|10)\./.test(location.hostname);
const RELAY_URL = import.meta.env.VITE_RELAY_URL
  || (LOCAL ? `ws://${location.hostname}:8787` : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);

/** The optional shared key: open the page once with ?key=... and this browser remembers it. */
function sharedKey() {
  try {
    const k = new URLSearchParams(location.search).get('key');
    if (k) { localStorage.setItem('og-key', k); return k; }
    return localStorage.getItem('og-key') || '';
  } catch { return ''; }
}

export class Network {
  constructor({ room, role, name }) {
    this.room = room;
    this.role = role;
    this.name = name;
    this.key = sharedKey();
    this.ws = null;
    this.id = null;
    this.data = { guest: [], booth: [], mail: [] };      // saved guestbook notes, booth photos and postcards from the relay
    this.lastSend = 0;
    this.lastDog = 0;
    this.peerIds = new Set();                          // the two of them (never the dog visitor)
    this.dogId = null;                                 // someone visiting as the dog, if anyone is
    this.onDogVisitor = () => {};
    this.handlers = {};
    this.onPeerJoin = () => {};
    this.onPeerLeave = () => {};
    this.onState = () => {};
    this.onDisconnect = () => {};
    this.onReconnect = () => {};
    this.onDog = () => {};
    this.onPet = () => {};
    this._tries = 0;
    this._retry = 0;
    this._fatal = false;                                // a refusal that retrying will not fix (wrong key)
  }

  /** Listen for any message type the relay forwards (bird, hold, guest, booth, ...). */
  on(type, fn) {
    this.handlers[type] = fn;
    if (this._queue?.length) {                          // deliver anything that arrived before this feature was ready
      const mine = this._queue.filter(m => m.t === type);
      this._queue = this._queue.filter(m => m.t !== type);
      for (const m of mine) { try { fn(m); } catch (e) { console.warn('[net] handler failed for', m.t, e); } }
    }
  }

  /** Resolves { ok:true, peers } once welcomed, or { ok:false, reason } (role-taken / bad-key / offline). */
  connect(timeoutMs = 3500) {
    return new Promise(resolve => {
      let settled = false;
      const done = r => { if (!settled) { settled = true; clearTimeout(timer); resolve(r); } };
      const timer = setTimeout(() => { done({ ok: false, reason: 'offline' }); try { this.ws?.close(); } catch { /* ignore */ } }, timeoutMs);
      try { this.ws = new WebSocket(`${RELAY_URL}/ws?room=${encodeURIComponent(this.room)}`); }
      catch { done({ ok: false, reason: 'offline' }); return; }
      this._wire(this.ws, done);
      setInterval(() => this.send({ t: 'ping' }), 5000);       // keeps the relay from thinking a quiet tab has gone
    });
  }

  _wire(ws, done) {
    const rejoin = !done;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', role: this.role, name: this.name, key: this.key }));
    ws.onerror = () => done?.({ ok: false, reason: 'offline' });
    ws.onclose = () => {
      done?.({ ok: false, reason: 'offline' });
      if (ws !== this.ws) return;
      if (this.id) {
        this.id = null;
        for (const pid of [...this.peerIds]) this.onPeerLeave(pid);          // no ghost partner while we are cut off
        this.peerIds.clear();
        this.dogId = null;
        this.onDisconnect();
      }
      if (!this._fatal && (this._wasIn || rejoin)) this._scheduleReconnect();
    };
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      try { this._handle(m, done); } catch (e) { console.warn('[net] handler failed for', m?.t, e); }
    };
  }

  _handle(m, done) {
    if (m.t === 'welcome') {
      const before = new Set(this.peerIds);
      this.id = m.id;
      this.data = { guest: m.data?.guest || [], booth: m.data?.booth || [], mail: m.data?.mail || [] };
      const people = m.peers.filter(p => p.role !== 'dog');
      this.dogId = m.peers.find(p => p.role === 'dog')?.id ?? null;
      this.peerIds = new Set(people.map(p => p.id));
      this._wasIn = true; this._tries = 0;
      if (done) { done({ ok: true, peers: people }); return; }
      // we were away and came back: catch up on who is here now
      for (const p of people) if (!before.has(p.id)) this.onPeerJoin(p);
      for (const id of before) if (!this.peerIds.has(id)) this.onPeerLeave(id);
      this.onReconnect();
    }
    else if (m.t === 'error') {
      if (!this.id) {                                   // refused while joining
        if (m.reason === 'bad-key') this._fatal = true;
        done?.({ ok: false, reason: m.reason });
        try { this.ws.close(); } catch { /* ignore */ }
      } else this.handlers.error?.(m);                  // e.g. "slow-down" after a burst of saves
    }
    else if (m.t === 'peer-join') {
      if (m.role === 'dog') { this.dogId = m.id; this.onDogVisitor(true, m); }
      else { this.peerIds.add(m.id); this.onPeerJoin(m); }
    }
    else if (m.t === 'peer-leave') {
      if (m.id === this.dogId) { this.dogId = null; this.onDogVisitor(false, m); }
      else { this.peerIds.delete(m.id); this.onPeerLeave(m.id); }
    }
    else if (m.t === 'dog') this.onDog(m);
    else if (m.t === 'pet') this.onPet(m);
    else if (m.t === 's') this.onState(m.id, m);
    else this.handlers[m.t]?.(m);
  }

  _scheduleReconnect() {
    if (this._retry) return;
    const wait = Math.min(15000, 1500 * 2 ** this._tries++);
    this._retry = setTimeout(() => {
      this._retry = 0;
      try { this.ws = new WebSocket(`${RELAY_URL}/ws?room=${encodeURIComponent(this.room)}`); } catch { this._scheduleReconnect(); return; }
      this._wire(this.ws, null);
    }, wait);
  }

  get connected() {
    return !!this.id && this.ws?.readyState === 1;
  }

  /** One machine simulates the shared dog and bird: the one with the lowest id. */
  get isDogHost() {
    if (!this.connected) return true;
    for (const id of this.peerIds) if (id < this.id) return false;
    return true;
  }

  /** true when the message was handed to the connection, false when there is no connection right now */
  send(obj) {
    if (!this.connected) return false;
    this.ws.send(JSON.stringify(obj));
    return true;
  }

  sendDog(s, now = performance.now()) {
    if (!this.connected || now - this.lastDog < 100) return;
    this.lastDog = now;
    this.ws.send(JSON.stringify({ t: 'dog', ...s }));
  }

  sendPet(p, kind = 'pet') {
    this.send({ t: 'pet', x: p.x, z: p.z, k: kind });
  }

  /** Sends at most ~15 updates per second. */
  sendState(s, now = performance.now()) {
    if (!this.connected || now - this.lastSend < 66) return;
    this.lastSend = now;
    this.ws.send(JSON.stringify({ t: 's', ...s }));
  }
}
