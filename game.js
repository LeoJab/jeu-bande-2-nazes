/* Bande 2 Nazes — jeu en ligne pour le hub ChadGangGames
   Modèle : un état complet versionné, envoyé avec keep:true après chaque action.
   Le joueur dont c'est le tour (ou l'hôte pour un robot / un joueur parti) fait l'action. */
(() => {
'use strict';

/* =========================================================
   DONNÉES
   ========================================================= */
const CARDS = {
  B: { n: 'BAND',  e: '🎸', letter: true, d: 'Une des 3 cartes du message.' },
  D: { n: 'DE',    e: '🎲', letter: true, d: 'Une des 3 cartes du message.' },
  N: { n: 'NAZES', e: '🤡', letter: true, d: 'Une des 3 cartes du message.' },
  J: { n: 'JOKER NAZE', e: '🃏', letter: true, d: 'Se pose devant toi et remplace n\'importe quelle carte du message.' },
  V: { n: 'VOLEUR DE NAZES', e: '🦹', target: true, d: 'Vole au hasard une carte posée devant un adversaire.' },
  E: { n: 'ÉLÉPHANT ROSE',   e: '🐘', target: true, d: 'Échange tout ton message avec celui d\'un adversaire.' },
  G: { n: 'SAINTE GRENADE',  e: '💣', target: true, d: 'Détruit toutes les cartes posées devant un adversaire.' },
  Z: { n: 'SIESTE FORCÉE',   e: '😴', target: true, d: 'Un adversaire passe son prochain tour.' },
  T: { n: 'TORNADE',         e: '🌪️', d: 'Tout le monde passe sa main à son voisin.' },
  R: { n: 'ROUE DU DESTIN',  e: '🎡', d: 'Toutes les cartes posées sont mélangées et redistribuées.' },
  S: { n: 'BOUCLIER BIDON',  e: '🛡️', d: 'Annule la prochaine attaque contre toi.' },
  P: { n: 'PIOCHE FOLLE',    e: '🤪', d: 'Pioche 3 cartes d\'un coup.' },
  F: { n: 'DÉFI ABSURDE',    e: '🎭', d: 'Un défi débile pour tout le monde. Tu désignes le perdant : il perd une carte.' },
  I: { n: 'INVERSION',       e: '🔄', d: 'Le sens du jeu s\'inverse.' },
  X: { n: 'ENCORE !',        e: '⚡', d: 'Rejoue tout de suite.' },
};
const DECK = { B: 8, D: 8, N: 8, J: 3, V: 4, E: 2, G: 2, Z: 2, T: 2, R: 2, S: 3, P: 3, F: 3, I: 2, X: 2 };
const HAND_MAX = 6;
const START_HAND = 3;

const DEFIS = [
  'Imitez tous le cri de la poule. Le moins convaincant a perdu !',
  'Meilleure imitation de l\'éléphant rose ! Le juge désigne la plus nulle.',
  'Dites « Bande de nazes » avec l\'accent québécois, sans rire. Le premier qui craque perd.',
  'Tous : tirez la langue et essayez de toucher votre nez. Le dernier à y arriver perd.',
  'Concours de grimaces ! Le moins moche perd (oui, oui).',
  'Trouvez un mot qui rime avec « Nazes » en 3 secondes. Le plus lent perd.',
  'Faites un compliment absurde à votre voisin de gauche. Le plus nul perd.',
  'Imitez le bruit d\'un pet de licorne. Le juge désigne le moins crédible.',
  'Parlez comme un pirate pendant 10 secondes. Le premier qui rit perd.',
  'Récitez l\'alphabet à l\'envers à partir de M. Le premier qui bloque perd.',
  'Faites votre danse de la victoire ! Le plus raide perd.',
  'Citez 3 animaux qui commencent par B en 5 secondes. Le plus lent perd.',
  'Faites une pub pour un produit imaginaire (10 s). La moins convaincante perd.',
  'Trouvez le pire surnom possible pour un chat. Le moins drôle perd.',
  'Chantez « Joyeux anniversaire » en soprano. Le plus faux perd.',
];
const BOT_NAMES = ['Gégé le Robot', 'Roboto Nazo', 'Madame Grenade', 'Tonton Bug', 'DJ Naze', 'Sir Éléphant'];
const BOT_ICO = ['🤖', '👾', '🦾', '🧌', '👽', '🤡'];

/* =========================================================
   OUTILS
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clone = o => JSON.parse(JSON.stringify(o));
const wait = ms => new Promise(r => setTimeout(r, ms));
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
const params = new URLSearchParams(location.search);
const AUTOME = params.get('auto') === '1';          // mode démo/test : je joue en pilote automatique
const SPEED = params.get('fast') === '1' ? 0.04 : 1; // mode test : robots rapides
const SDK = (window.ChadGang && typeof window.ChadGang.join === 'function') ? window.ChadGang : null;

/* =========================================================
   ÉTAT LOCAL
   ========================================================= */
let me = null;          // { id, name, avatar }
let room = null, code = '', myId = null;
let roster = [];        // joueurs humains présents dans la salle [{id,name}]
const avatars = {};     // id -> url de photo
let S = null;           // état partagé de la partie
let lastFx = 0, sel = null, targeting = null, wasMyTurn = false, endDone = null, driverT = null;
let initialBots = 0;

const isHost = () => roster.length > 0 && roster[0].id === myId;
const present = id => roster.some(p => p.id === id);
const botOf = id => S && ((S.players || []).find(p => p.id === id && p.bot) || (S.bots || []).find(b => b.id === id));
const isAuto = id => !!botOf(id) || !present(id) || (AUTOME && id === myId);

/* =========================================================
   LOGIQUE DU JEU (fonctions pures sur un état cloné)
   ========================================================= */
function newDeck() { const d = []; for (const k in DECK) for (let i = 0; i < DECK[k]; i++) d.push(k); return shuffle(d); }
const pName = (N, id) => { const p = N.players.find(x => x.id === id); return p ? p.name : '?'; };
function say(N, t) { N.log.push(t); }
function setFx(N, k, by, to) { N.fx = { n: (N.fx ? N.fx.n : 0) + 1, k, by, to: to || null }; }

function drawCard(N, pid) {
  if (!N.deck.length) { N.deck = shuffle(N.discard); N.discard = []; }
  if (!N.deck.length) return null;
  const c = N.deck.pop(); N.hands[pid].push(c); return c;
}

function buildGame(lobby) {
  const humans = roster.map(p => ({ id: p.id, name: p.name, bot: false }));
  const bots = (lobby.bots || []).map(b => ({ id: b.id, name: b.name, bot: true, ico: b.ico }));
  const players = shuffle([...humans, ...bots]);
  const N = {
    phase: 'play', code, id: code + '-' + Date.now().toString(36), bots: lobby.bots || [],
    players, turn: 0, dir: 1, deck: newDeck(), discard: [], hands: {}, tables: {}, shield: {}, skip: {},
    log: ['🎉 La partie commence ! Forme BAND + DE + NAZES !'], pending: null, winner: null,
    fx: { n: (lobby.fx ? lobby.fx.n : 0) + 1, k: 'start', by: null, to: null },
  };
  players.forEach(p => { N.hands[p.id] = []; N.tables[p.id] = []; N.shield[p.id] = false; N.skip[p.id] = false; });
  for (let i = 0; i < START_HAND; i++) players.forEach(p => drawCard(N, p.id));
  return N;
}

function advance(N) {
  const n = N.players.length; let i = N.turn;
  for (let t = 0; t <= n; t++) {
    i = (i + N.dir + n) % n;
    const p = N.players[i];
    if (N.skip[p.id]) { N.skip[p.id] = false; say(N, `😴 ${p.name} fait la sieste et passe son tour.`); continue; }
    break;
  }
  N.turn = i;
}

function complete(t) {
  let b = 0, d = 0, n = 0, j = 0;
  for (const c of t) { if (c === 'B') b++; else if (c === 'D') d++; else if (c === 'N') n++; else if (c === 'J') j++; }
  return ((b ? 0 : 1) + (d ? 0 : 1) + (n ? 0 : 1)) <= j;
}
function checkWin(N, actorId) {
  const order = [actorId, ...N.players.map(p => p.id).filter(x => x !== actorId)];
  for (const id of order) {
    if (complete(N.tables[id])) {
      N.winner = id; N.phase = 'end'; N.pending = null;
      say(N, `🏆 ${pName(N, id)} a formé BANDE DE NAZES !`);
      setFx(N, 'win', id);
      return true;
    }
  }
  return false;
}

function blocked(N, pid, t) {
  if (N.shield[t]) {
    N.shield[t] = false;
    say(N, `🛡️ Le bouclier de ${pName(N, t)} encaisse l'attaque !`);
    setFx(N, 'shield', t, pid);
    return true;
  }
  return false;
}

const EFFECTS = {
  V(N, pid, t) {
    if (blocked(N, pid, t)) return;
    const tt = N.tables[t];
    if (!tt.length) { say(N, `🦗 ${pName(N, t)} n'a rien à voler…`); return; }
    const c = tt.splice(Math.floor(Math.random() * tt.length), 1)[0];
    N.tables[pid].push(c);
    say(N, `🦹 ${pName(N, pid)} vole ${CARDS[c].n} à ${pName(N, t)} !`);
  },
  E(N, pid, t) {
    if (blocked(N, pid, t)) return;
    const a = N.tables[pid]; N.tables[pid] = N.tables[t]; N.tables[t] = a;
    say(N, `🐘 ${pName(N, pid)} et ${pName(N, t)} échangent leur message !`);
  },
  G(N, pid, t) {
    if (blocked(N, pid, t)) return;
    const n = N.tables[t].length;
    N.discard.push(...N.tables[t]); N.tables[t] = [];
    say(N, `💥 BOUM ! ${n} carte(s) de ${pName(N, t)} partent en fumée.`);
  },
  Z(N, pid, t) {
    if (blocked(N, pid, t)) return;
    N.skip[t] = true;
    say(N, `😴 ${pName(N, t)} passera son prochain tour.`);
  },
  T(N) {
    const ids = N.players.map(p => p.id), old = clone(N.hands), n = ids.length;
    ids.forEach((id, i) => { N.hands[ids[(i + N.dir + n) % n]] = old[id]; });
    say(N, '🌪️ Tout le monde passe sa main à son voisin !');
  },
  R(N) {
    const pool = [];
    N.players.forEach(p => { pool.push(...N.tables[p.id]); N.tables[p.id] = []; });
    shuffle(pool);
    let i = Math.floor(Math.random() * N.players.length);
    pool.forEach(c => { N.tables[N.players[i % N.players.length].id].push(c); i++; });
    say(N, '🎡 La roue tourne : les cartes posées sont redistribuées !');
  },
  S(N, pid) { N.shield[pid] = true; say(N, `🛡️ ${pName(N, pid)} se protège de la prochaine attaque.`); },
  P(N, pid) { for (let i = 0; i < 3; i++) drawCard(N, pid); say(N, `🤪 ${pName(N, pid)} pioche 3 cartes !`); },
  F(N, pid) { N.pending = { type: 'defi', by: pid, text: pick(DEFIS) }; },
  I(N) { N.dir *= -1; say(N, '🔄 Le sens du jeu est inversé !'); },
  X() {},
};

function doPlay(N, pid, i, target) {
  const hand = N.hands[pid];
  if (i < 0 || i >= hand.length) return;
  const c = hand.splice(i, 1)[0], C = CARDS[c], who = pName(N, pid);
  if (C.letter) {
    N.tables[pid].push(c);
    say(N, `${C.e} ${who} pose ${C.n}`);
    setFx(N, 'letter', pid);
  } else {
    N.discard.push(c);
    if (C.target && (!target || target === pid || !N.tables[target])) target = pick(N.players.filter(p => p.id !== pid)).id;
    if (!C.target) target = null;
    setFx(N, c, pid, target);
    say(N, `${C.e} ${who} joue ${C.n}${target ? ' sur ' + pName(N, target) : ''} !`);
    EFFECTS[c](N, pid, target);
  }
  if (N.pending) return;
  if (checkWin(N, pid)) return;
  if (c === 'X') { say(N, `⚡ ${who} rejoue !`); return; }
  advance(N);
}

function doDraw(N, pid) {
  if (N.hands[pid].length >= HAND_MAX) return;
  drawCard(N, pid);
  say(N, `🂠 ${pName(N, pid)} pioche une carte.`);
  setFx(N, 'draw', pid);
  advance(N);
}

function doJudge(N, loser) {
  const by = N.pending.by; N.pending = null;
  if (loser && N.tables[loser]) {
    const t = N.tables[loser], h = N.hands[loser];
    if (t.length) { const c = t.splice(Math.floor(Math.random() * t.length), 1)[0]; N.discard.push(c); say(N, `🎭 ${pName(N, loser)} perd le défi et défausse ${CARDS[c].n} !`); }
    else if (h.length) { const c = h.splice(Math.floor(Math.random() * h.length), 1)[0]; N.discard.push(c); say(N, `🎭 ${pName(N, loser)} perd le défi et défausse une carte de sa main !`); }
    else say(N, `🎭 ${pName(N, loser)} perd le défi mais n'a plus rien à perdre.`);
  } else say(N, '🎭 Égalité parfaite : personne ne perd rien.');
  setFx(N, 'defiEnd', by, loser || null);
  advance(N);
}

/* ---------- robots ---------- */
function botMove(N, pid) {
  const hand = N.hands[pid], tab = N.tables[pid];
  const others = N.players.filter(p => p.id !== pid);
  const score = id => ['B', 'D', 'N'].filter(k => N.tables[id].includes(k)).length + N.tables[id].filter(c => c === 'J').length;
  const myScore = score(pid);
  const leader = [...others].sort((a, b) => score(b.id) - score(a.id))[0];
  // 1. lettre manquante
  let i = hand.findIndex(c => 'BDN'.includes(c) && !tab.includes(c));
  if (i >= 0) return { t: 'play', i };
  // 2. joker si on est proche
  i = hand.indexOf('J');
  if (i >= 0 && myScore >= 2) return { t: 'play', i };
  // 3. attaque le meneur
  if (score(leader.id) >= 2) {
    for (const k of ['G', 'E', 'V', 'Z']) {
      const j = hand.indexOf(k);
      if (j >= 0 && !(k === 'E' && myScore >= score(leader.id))) return { t: 'play', i: j, target: leader.id };
    }
  }
  // 4. bouclier si on mène
  i = hand.indexOf('S');
  if (i >= 0 && myScore >= 2 && !N.shield[pid]) return { t: 'play', i };
  // 5. pioche tant que la main est petite
  if (hand.length < 4 && Math.random() < .8) return { t: 'draw' };
  // 6. joue une carte utile au hasard
  const cand = hand.map((c, j) => j).filter(j => {
    const c = hand[j];
    if (c === 'E' && myScore >= 2) return false;
    if (c === 'G' && !others.some(p => N.tables[p.id].length)) return false;
    return true;
  });
  if (cand.length && (hand.length >= HAND_MAX || Math.random() < .7)) {
    const j = pick(cand); const k = hand[j];
    return { t: 'play', i: j, target: CARDS[k].target ? (Math.random() < .6 ? leader.id : pick(others).id) : null };
  }
  if (hand.length < HAND_MAX) return { t: 'draw' };
  return { t: 'play', i: 0, target: pick(others).id };
}

/* =========================================================
   RÉSEAU
   ========================================================= */
function localJoin() {   // secours quand le SDK du hub est absent (jeu ouvert hors hub)
  const h = {}; let last = null;
  const api = {
    on(e, f) { h[e] = f; return api; },
    send(d, o) { if (o && o.keep) last = d; setTimeout(() => h.message && h.message(d, { id: me.id, name: me.name }), 0); },
    leave() {},
  };
  setTimeout(() => h.ready && h.ready({ me: me.id, players: [{ id: me.id, name: me.name }], last }), 0);
  return api;
}

function connect(c, create, bots) {
  code = c; initialBots = bots || 0; S = null; lastFx = 0; endDone = null;
  room = SDK ? SDK.join(c, { create: !!create }) : localJoin();
  room.on('ready', info => {
    myId = info.me; roster = info.players || [];
    avatars[myId] = me.avatar || null;
    hello();
    if (info.last && info.last.t === 'state' && info.last.s) {
      S = info.last.s; lastFx = S.fx ? S.fx.n : 0; onState();
    } else if (isHost()) {
      const bs = [];
      for (let i = 0; i < initialBots; i++) bs.push(newBot(bs));
      commit({ phase: 'lobby', code, bots: bs, log: [], fx: { n: 0 } });
    } else { show('lobby'); renderLobby(); }
  });
  room.on('players', list => { roster = list || []; if (myId) hello(); if (S) onState(); else renderLobby(); });
  room.on('message', (d, from) => {
    if (!d) return;
    if (d.t === 'state' && d.s) { if (!S || d.s.v > S.v) { S = d.s; onState(); } }
    else if (d.t === 'hello' && from) { avatars[from.id] = d.avatar || null; if (S) { S.phase === 'lobby' ? renderLobby() : renderGame(); } }
    else if (d.t === 'react' && from) floatEmoji(d.e, from.name);
  });
  room.on('error', msg => { toast('⚠️ ' + (msg || 'Salle introuvable')); leaveRoom(); });
}
function hello() { room.send({ t: 'hello', avatar: me.avatar || null }); }
function publish() { room.send({ t: 'state', s: S }, { keep: true }); }
function commit(N) {
  N.v = (S ? S.v : 0) + 1; if (N.log) N.log = N.log.slice(-40);
  S = N; publish(); onState();
}
function act(fn) { if (!S) return; const N = clone(S); fn(N); commit(N); }
function leaveRoom() {
  try { room && room.leave(); } catch (e) {}
  room = null; S = null; roster = []; sel = null; targeting = null; clearTimeout(driverT);
  $('#btnQuit').classList.add('hide'); $('#btnHist').classList.add('hide');
  show('home');
}
function newBot(list) {
  const used = (list || []).map(b => b.name);
  const names = BOT_NAMES.filter(n => !used.includes(n));
  const name = pick(names.length ? names : BOT_NAMES);
  return { id: 'bot' + Math.random().toString(36).slice(2, 6), name, ico: pick(BOT_ICO) };
}

/* =========================================================
   ÉTAT -> INTERFACE
   ========================================================= */
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id));
  $('#btnQuit').classList.toggle('hide', id === 'home');
  $('#btnHist').classList.toggle('hide', id !== 'game');
}

function onState() {
  if (!S) return;
  if (S.phase === 'lobby') { sel = null; targeting = null; endDone = null; show('lobby'); renderLobby(); }
  else { show('game'); renderGame(); }
  if (S.fx && S.fx.n > lastFx) { lastFx = S.fx.n; playFx(S.fx); }
  if (S.phase === 'end') handleEnd();
  driver();
}

/* ---------- avatars ---------- */
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
function av(id, name, cls = '', ico = '') {
  const url = avatars[id];
  if (url) return `<img class="av ${cls}" data-chadgang-id="${esc(id)}" src="${esc(url)}" alt="${esc(name)}">`;
  const letter = ico || (String(name || '?').trim()[0] || '?').toUpperCase();
  return `<div class="av ${cls}" data-chadgang-id="${esc(id)}" style="background:hsl(${hash(id) % 360} 85% 70%)">${esc(letter)}</div>`;
}
function icoOf(id) { const b = botOf(id); return b && b.ico ? b.ico : ''; }

/* ---------- salle d'attente ---------- */
function renderLobby() {
  $('#lobCode').textContent = code || '----';
  const bots = (S && S.bots) || [];
  const all = [...roster.map(p => ({ ...p, bot: false })), ...bots.map(b => ({ ...b, bot: true }))];
  const host = isHost();
  $('#lobList').innerHTML = all.map((p, i) => `<li>${av(p.id, p.name, '', p.bot ? p.ico : '')}<span>${esc(p.name)}${p.id === myId ? ' (toi)' : ''}</span>${i === 0 ? '<em>👑 hôte</em>' : ''}${p.bot ? '<em>🤖 robot</em>' : ''}${p.bot && host ? `<button data-rm="${esc(p.id)}">✖</button>` : ''}</li>`).join('');
  $('#btnAddBot').classList.toggle('hide', !(host && S && all.length < 5));
  $('#btnStart').classList.toggle('hide', !(host && S));
  $('#btnStart').disabled = all.length < 2;
  $('#lobMsg').textContent = !S ? 'Connexion à la salle…'
    : all.length < 2 ? (host ? 'Il faut au moins 2 joueurs : invite des potes ou ajoute un robot !' : 'En attente de l\'hôte…')
    : host ? 'Tout le monde est là ? Lance la partie !' : 'En attente que l\'hôte lance la partie…';
}

/* ---------- cartes ---------- */
function cardHTML(k, attrs = '', cls = '') {
  const c = CARDS[k];
  return `<button class="card ${c.letter ? 'letter' : 'act'} k-${k} ${cls}" ${attrs}><span class="e">${c.e}</span><b class="w">${c.n}</b>${k === 'J' ? '<small>remplace tout</small>' : c.letter ? '' : `<small>${c.d}</small>`}</button>`;
}

/* ---------- partie ---------- */
let prevHandLen = -1;
function renderGame() {
  const P = S.players, n = P.length;
  const idx = P.findIndex(p => p.id === myId);
  const cur = P[S.turn];
  const playing = S.phase === 'play';
  const myTurn = playing && !S.pending && idx >= 0 && cur.id === myId;
  const hand = idx >= 0 ? S.hands[myId] : [];
  if (!myTurn) { sel = null; targeting = null; }
  if (sel !== null && sel >= hand.length) sel = null;

  // adversaires, dans l'ordre à partir de moi
  const opps = [];
  if (idx >= 0) for (let k = 1; k < n; k++) opps.push(P[(idx + k) % n]);
  else opps.push(...P);
  $('#opps').innerHTML = opps.map(p => {
    const t = S.tables[p.id];
    const chips = ['B', 'D', 'N'].map(k => { const c = t.filter(x => x === k).length; return `<span class="chip c${k} ${c ? 'on' : ''}">${k}${c > 1 ? '×' + c : ''}</span>`; }).join('');
    const j = t.filter(x => x === 'J').length;
    const turn = playing && !S.pending && cur.id === p.id;
    const gone = !p.bot && !present(p.id);
    return `<div class="seat ${turn ? 'turn' : ''} ${targeting !== null ? 'tgt' : ''} ${gone ? 'gone' : ''}" data-seat="${esc(p.id)}" data-id="${esc(p.id)}">
      ${S.shield[p.id] ? '<span class="shield">🛡️</span>' : ''}
      ${av(p.id, p.name, '', p.bot ? p.ico : '')}
      <div class="nm">${esc(p.name)}${gone ? ' 💤' : ''}</div>
      <div class="cnt">🂠 ${S.hands[p.id].length}</div>
      <div class="chips">${chips}${j ? `<span class="chip cJ on">🃏${j > 1 ? '×' + j : ''}</span>` : ''}</div>
    </div>`;
  }).join('');

  // pioche / défausse
  $('#deckN').textContent = S.deck.length;
  const canDraw = myTurn && hand.length < HAND_MAX && targeting === null;
  $('#deck').classList.toggle('glow', canDraw);
  const top = S.discard[S.discard.length - 1];
  $('#discard').innerHTML = top ? cardHTML(top, 'tabindex="-1" disabled') : '<span class="small">défausse</span>';

  // statut
  const st = $('#status'); st.className = myTurn ? 'me' : '';
  const dirI = S.dir === 1 ? '↻' : '↺';
  if (!playing) st.innerHTML = '🏁 Partie terminée';
  else if (S.pending) st.innerHTML = '🎭 Défi absurde en cours !';
  else if (targeting !== null) st.innerHTML = `🎯 <b>Choisis ta victime</b> en touchant un joueur<div class="btns"><button data-a="cancel">Annuler</button></div>`;
  else if (myTurn && sel !== null) {
    const k = hand[sel], C = CARDS[k];
    st.innerHTML = `${C.e} <b>${C.n}</b><div class="desc">${C.d}</div><div class="btns"><button class="go" data-a="play">Jouer ▶</button><button data-a="cancel">Annuler</button></div>`;
  }
  else if (myTurn) st.innerHTML = `🎯 <b>À toi de jouer !</b><div class="desc">Pioche une carte ou joue une carte de ta main. ${dirI}</div>`;
  else if (idx < 0) st.innerHTML = `👀 Tu regardes la partie.<div class="desc">Tour de ${esc(cur.name)} ${dirI}</div>`;
  else st.innerHTML = `⏳ Tour de <b>${esc(cur.name)}</b>${isAuto(cur.id) ? ' 🤖' : ''}<div class="desc">${dirI}</div>`;

  // historique
  $('#logbox').innerHTML = S.log.slice(-3).map(l => `<div>${esc(l)}</div>`).join('');

  // moi
  $('#me').classList.toggle('hide', idx < 0);
  if (idx >= 0) {
    const mp = P[idx], t = S.tables[myId];
    $('#meinfo').className = playing && myTurn ? 'turn' : '';
    $('#meinfo').dataset.seat = myId;
    $('#meinfo').innerHTML = `${S.shield[myId] ? '<span class="shield" style="position:absolute;top:-10px;right:-6px;font-size:18px">🛡️</span>' : ''}${av(myId, mp.name)}<span>${esc(mp.name)} · ton message</span>`;
    const slot = k => { const c = t.filter(x => x === k).length; return `<div class="slot k-${k} ${c ? 'full' : ''}"><span class="e">${CARDS[k].e}</span><b>${CARDS[k].n}</b>${c > 1 ? `<i class="x">×${c}</i>` : ''}</div>`; };
    const j = t.filter(x => x === 'J').length;
    $('#mytable').innerHTML = slot('B') + slot('D') + slot('N') + (j ? `<div class="slot k-J full"><span class="e">🃏</span><b>×${j}</b></div>` : '');
    const deal = hand.length > prevHandLen && prevHandLen >= 0 ? hand.length - prevHandLen : 0;
    $('#hand').className = myTurn ? '' : 'wait';
    $('#hand').innerHTML = hand.map((k, i) => cardHTML(k, `data-i="${i}"`, (sel === i ? 'sel ' : '') + (i >= hand.length - deal ? 'deal' : ''))).join('');
    prevHandLen = hand.length;
  }
  $('#reacts').classList.toggle('hide', idx < 0 && false);

  // défi
  const df = $('#defi');
  if (S.pending && playing) {
    const judge = S.pending.by === myId;
    df.classList.add('on');
    df.innerHTML = `<div class="panel defiBox"><h2>🎭 DÉFI ABSURDE !</h2><div>lancé par <b>${esc(pName(S, S.pending.by))}</b></div><div class="txt">${esc(S.pending.text)}</div>` +
      (judge ? `<div>Qui a perdu ? (il perd une carte)</div><div class="judges">${P.map(p => `<button data-judge="${esc(p.id)}">${av(p.id, p.name, 'sm', p.bot ? p.ico : '')}${esc(p.name)}</button>`).join('')}<button data-judge="">🤝 Personne</button></div>`
        : `<div class="small">${esc(pName(S, S.pending.by))} désigne le perdant…</div>`) + '</div>';
  } else { df.classList.remove('on'); df.innerHTML = ''; }

  // notification de tour
  if (myTurn && !wasMyTurn && playing) snd('ding');
  wasMyTurn = myTurn;

  // fin
  const en = $('#end');
  if (S.phase !== 'end') { en.classList.remove('on'); en.innerHTML = ''; }
}

/* ---------- fin de partie ---------- */
function handleEnd() {
  const w = S.players.find(p => p.id === S.winner);
  const en = $('#end'); en.classList.add('on');
  const host = isHost(), iWon = S.winner === myId;
  en.innerHTML = `<div class="panel winBox"><div class="crown">👑</div>${w ? av(w.id, w.name, 'big', w.bot ? w.ico : '') : ''}
    <h2>${w ? esc(w.name) : '?'} remporte la partie !</h2>
    <p>${iWon ? '🎉 Tu es le roi des nazes, bravo !' : 'Il a réussi à former <b>BAND DE NAZES</b>… et toi tu restes une bande de nazes. 😏'}</p>
    <div class="row center">${host ? '<button class="btn big" data-a="again">🔁 Rejouer</button>' : '<div class="small">L\'hôte peut relancer une partie…</div>'}<button class="btn alt" data-a="quit">🚪 Quitter</button></div></div>`;
  if (endDone === S.id) return;
  endDone = S.id;
  // classement du hub : seulement pour les parties entre vrais joueurs
  const humans = S.players.filter(p => !p.bot);
  if (SDK && typeof SDK.finPartie === 'function' && S.players.some(p => p.id === myId) && humans.length >= 2) {
    try { Promise.resolve(SDK.finPartie({ gagne: iWon, partie: S.id })).catch(() => {}); } catch (e) {}
  }
}

/* =========================================================
   ACTIONS DU JOUEUR
   ========================================================= */
function myTurnNow() {
  if (!S || S.phase !== 'play' || S.pending) return false;
  return S.players[S.turn].id === myId;
}
function onCardClick(i) {
  if (!myTurnNow()) { toast('Ce n\'est pas ton tour !'); return; }
  if (targeting !== null) return;
  if (sel === i) return startPlay();
  sel = i; renderGame(); snd('pop');
}
function startPlay() {
  const hand = S.hands[myId], k = hand[sel];
  if (k === undefined) return;
  if (CARDS[k].target) {
    const others = S.players.filter(p => p.id !== myId);
    if (others.length === 1) return doIt(sel, others[0].id);
    targeting = sel; renderGame();
  } else doIt(sel, null);
}
function doIt(i, target) { sel = null; targeting = null; act(N => doPlay(N, myId, i, target)); }
function drawClick() {
  if (!myTurnNow()) { toast('Ce n\'est pas ton tour !'); return; }
  if (S.hands[myId].length >= HAND_MAX) { toast('Main pleine (6 cartes) : joue une carte !'); return; }
  sel = null; targeting = null; act(N => doDraw(N, myId));
}

/* =========================================================
   PILOTE AUTOMATIQUE (robots, joueurs partis) — côté hôte uniquement
   ========================================================= */
function driver() {
  clearTimeout(driverT);
  if (!S || S.phase !== 'play' || !isHost()) return;
  const actor = S.pending ? S.pending.by : S.players[S.turn].id;
  if (!isAuto(actor)) return;
  const bot = !!botOf(actor);
  const delay = (bot || actor === myId ? 1500 + Math.random() * 900 : 5000) * SPEED;
  const v = S.v;
  driverT = setTimeout(() => {
    if (!S || S.v !== v || S.phase !== 'play') return;
    if (S.pending) {
      const r = Math.random() < .15 ? null : pick(S.players).id;
      act(N => doJudge(N, r));
    } else {
      const m = botMove(S, actor);
      act(N => m.t === 'draw' ? doDraw(N, actor) : doPlay(N, actor, m.i, m.target));
    }
  }, delay);
}

/* =========================================================
   EFFETS : bannières, particules, sons, secousses
   ========================================================= */
const cv = $('#fx'), ctx = cv.getContext('2d');
let parts = [], raf = 0;
function sizeCanvas() { cv.width = innerWidth; cv.height = innerHeight; }
addEventListener('resize', sizeCanvas); sizeCanvas();

function spawn(x, y, n, o) {
  o = Object.assign({ colors: ['#ffd426', '#ff5fa2', '#6ee7ff', '#a8f56b', '#fff'], speed: 9, g: .28, life: 70, size: 8, shape: 'rect', spread: Math.PI * 2, dir: -Math.PI / 2, emoji: '' }, o || {});
  for (let i = 0; i < n; i++) {
    const a = o.dir + (Math.random() - .5) * o.spread, s = o.speed * (.35 + Math.random() * .8);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: o.g, life: o.life * (.6 + Math.random() * .6), max: o.life, c: pick(o.colors), s: o.size * (.6 + Math.random() * .8), r: Math.random() * 6, vr: (Math.random() - .5) * .4, sh: o.shape, em: o.emoji });
  }
  if (!raf) raf = requestAnimationFrame(loop);
}
function loop() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  parts = parts.filter(p => p.life > 0);
  for (const p of parts) {
    p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= .99; p.r += p.vr; p.life--;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / (p.max * .5)));
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
    if (p.sh === 'emoji') { ctx.font = `${p.s * 2.4}px serif`; ctx.textAlign = 'center'; ctx.fillText(p.em, 0, 0); }
    else if (p.sh === 'circle') { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(0, 0, p.s / 2, 0, 7); ctx.fill(); }
    else { ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * .6); }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  raf = parts.length ? requestAnimationFrame(loop) : 0;
  if (!raf) ctx.clearRect(0, 0, cv.width, cv.height);
}
function seatPos(id) {
  const el = id && document.querySelector(`[data-seat="${CSS.escape(id)}"]`);
  if (el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  return { x: innerWidth / 2, y: innerHeight / 2 };
}
const confetti = (p, n = 60, o) => spawn(p.x, p.y, n, Object.assign({ speed: 12, shape: 'rect', life: 90 }, o));
const sparks = (p, n = 40, colors, o) => spawn(p.x, p.y, n, Object.assign({ colors, speed: 11, g: .12, shape: 'circle', life: 45, size: 7 }, o));
const emojiBurst = (p, e, n = 12) => spawn(p.x, p.y, n, { shape: 'emoji', emoji: e, speed: 9, g: .2, life: 70, size: 14 });
function banner(e, t, s) {
  const b = $('#banner');
  b.innerHTML = `<div class="be">${e}</div><div class="bt">${esc(t)}</div>${s ? `<div class="bs">${esc(s)}</div>` : ''}`;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
function shake(long) { const c = long ? 'shake' : 'shake2'; document.body.classList.remove('shake', 'shake2'); void document.body.offsetWidth; document.body.classList.add(c); setTimeout(() => document.body.classList.remove(c), 700); }
function flash() { const f = $('#flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
function fireworks(ms) {
  const t0 = Date.now();
  const iv = setInterval(() => {
    if (Date.now() - t0 > ms) return clearInterval(iv);
    const p = { x: innerWidth * (.15 + Math.random() * .7), y: innerHeight * (.12 + Math.random() * .4) };
    const col = [['#ffd426', '#fff'], ['#ff5fa2', '#fff'], ['#6ee7ff', '#fff'], ['#a8f56b', '#ffd426']][Math.floor(Math.random() * 4)];
    sparks(p, 50, col, { speed: 10, life: 60 }); snd('pop');
  }, 280);
  confetti({ x: innerWidth / 2, y: innerHeight * .3 }, 140, { speed: 16, spread: Math.PI * 2 });
}

const FX = {
  start:  { e: '🎸', t: 'C\'EST PARTI !', snd: 'fanfare', run: () => confetti({ x: innerWidth / 2, y: innerHeight * .5 }, 90) },
  letter: { snd: 'letter', run: (A) => sparks(A, 18, ['#ffd426', '#fff']) },
  draw:   { snd: 'pop' },
  V: { e: '🦹', t: 'VOLEUR DE NAZES !', snd: 'zip',   run: (A, B) => { sparks(B, 30, ['#8b5cf6', '#fff']); sparks(A, 30, ['#8b5cf6', '#ffd426']); } },
  E: { e: '🐘', t: 'ÉLÉPHANT ROSE !',   snd: 'magic', shake: 0, run: (A, B) => { emojiBurst(A, '🐘', 8); emojiBurst(B, '🌸', 10); confetti(B, 50, { colors: ['#ff5fa2', '#fff', '#ffd426'] }); } },
  G: { e: '💣', t: 'SAINTE GRENADE !',  snd: 'boom',  shake: 1, flash: 1, run: (A, B) => { sparks(B, 90, ['#ff5a36', '#ffd426', '#fff'], { speed: 16, life: 55, size: 10 }); emojiBurst(B, '💥', 8); emojiBurst(B, '🔥', 10); } },
  Z: { e: '😴', t: 'SIESTE FORCÉE !',   snd: 'down',  run: (A, B) => emojiBurst(B, '💤', 12) },
  T: { e: '🌪️', t: 'TORNADE !',        snd: 'whoosh', shake: 0, run: () => emojiBurst({ x: innerWidth / 2, y: innerHeight / 2 }, '🍃', 24) },
  R: { e: '🎡', t: 'ROUE DU DESTIN !',  snd: 'magic', run: () => confetti({ x: innerWidth / 2, y: innerHeight / 2 }, 100) },
  S: { e: '🛡️', t: 'BOUCLIER !',       snd: 'ding',  run: (A) => sparks(A, 30, ['#2ec4b6', '#fff']) },
  P: { e: '🤪', t: 'PIOCHE FOLLE !',    snd: 'silly', run: (A) => emojiBurst(A, '🃏', 10) },
  F: { e: '🎭', t: 'DÉFI ABSURDE !',    snd: 'drum',  run: () => confetti({ x: innerWidth / 2, y: innerHeight * .4 }, 40) },
  I: { e: '🔄', t: 'INVERSION !',       snd: 'whoosh', run: () => emojiBurst({ x: innerWidth / 2, y: innerHeight / 2 }, '🔄', 10) },
  X: { e: '⚡', t: 'ENCORE !',          snd: 'zip',   run: (A) => sparks(A, 40, ['#fee440', '#fff']) },
  shield: { e: '🛡️', t: 'BLOQUÉ !',     snd: 'ding', shake: 0, run: (A) => sparks(A, 50, ['#2ec4b6', '#fff', '#6ee7ff']) },
  defiEnd: { snd: 'down', run: (A, B) => { if (B && B.x) emojiBurst(B, '😭', 6); } },
  win: { e: '🏆', t: 'BANDE DE NAZES !', snd: 'fanfare', run: () => fireworks(6000) },
};
function playFx(f) {
  const K = FX[f.k]; if (!K) return;
  const by = S.players.find(p => p.id === f.by), to = f.to && S.players.find(p => p.id === f.to);
  if (K.e) banner(K.e, K.t, by ? esc2(by.name) + (to ? ' → ' + esc2(to.name) : '') : '');
  snd(K.snd);
  const A = seatPos(f.by), B = f.to ? seatPos(f.to) : A;
  if (K.run) K.run(A, B);
  if (K.shake !== undefined) shake(!!K.shake);
  if (K.flash) flash();
}
const esc2 = s => s; // banner() échappe déjà le texte

/* ---------- sons (WebAudio, sans fichier) ---------- */
let AC = null, muted = store.get('b2n_mute') === '1';
function audio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
function tone(f, d, type = 'square', v = .06, at = 0, to) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + .02);
}
function noise(d, v = .15, at = 0) {
  const a = audio(); if (!a) return;
  const len = Math.floor(a.sampleRate * d), buf = a.createBuffer(1, len, a.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = a.createBufferSource(), g = a.createGain(); s.buffer = buf; g.gain.value = v; s.connect(g).connect(a.destination); s.start(a.currentTime + at);
}
const SND = {
  pop: () => tone(520, .08, 'sine', .08, 0, 760),
  ding: () => { tone(880, .15, 'sine', .08); tone(1320, .25, 'sine', .06, .08); },
  letter: () => { tone(523, .08); tone(659, .08, 'square', .06, .07); tone(784, .14, 'square', .06, .14); },
  zip: () => tone(300, .22, 'sawtooth', .05, 0, 1400),
  magic: () => { [660, 880, 1100, 1320].forEach((f, i) => tone(f, .18, 'triangle', .07, i * .07)); },
  boom: () => { noise(.6, .3); tone(140, .5, 'sawtooth', .12, 0, 35); },
  down: () => { tone(500, .15, 'triangle', .07); tone(330, .2, 'triangle', .07, .12); tone(220, .3, 'triangle', .07, .26); },
  whoosh: () => { noise(.5, .1); tone(200, .5, 'sine', .05, 0, 900); },
  silly: () => { tone(400, .1, 'square', .05); tone(700, .1, 'square', .05, .1); tone(300, .2, 'square', .05, .2); },
  drum: () => { tone(120, .12, 'sine', .15, 0, 60); tone(120, .12, 'sine', .15, .18, 60); noise(.12, .1, .36); },
  fanfare: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, .22, 'square', .06, i * .13)); tone(1047, .5, 'square', .06, .55); },
};
function snd(k) { if (muted || !k) return; try { SND[k] && SND[k](); } catch (e) {} }

/* ---------- petits utilitaires d'interface ---------- */
let toastT = 0;
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1800); }
function floatEmoji(e, name) {
  const d = document.createElement('div'); d.className = 'float';
  d.style.left = (10 + Math.random() * 75) + '%';
  d.innerHTML = `${esc(e)}<small>${esc(name)}</small>`;
  $('#floats').appendChild(d); setTimeout(() => d.remove(), 2300);
}
function openModal(id) { $('#' + id).classList.add('on'); }
function closeModals() { document.querySelectorAll('.modal').forEach(m => m.classList.remove('on')); }

/* =========================================================
   ÉVÉNEMENTS
   ========================================================= */
function randCode() { const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let s = ''; for (let i = 0; i < 4; i++) s += L[Math.floor(Math.random() * L.length)]; return s; }
function startConnect(c, create, bots) {
  if (!SDK) me.name = ($('#pseudo').value || '').trim() || 'Joueur';
  connect(c, create, bots);
}

$('#btnCreate').onclick = () => { audio(); startConnect(randCode(), true, 0); };
$('#btnBots').onclick = () => { audio(); startConnect(randCode(), true, 2); };
$('#btnJoin').onclick = () => {
  audio();
  const c = ($('#code').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length < 4) return toast('Entre le code de la salle (4 à 12 caractères)');
  startConnect(c, false, 0);
};
$('#code').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnJoin').click(); });
$('#btnRules').onclick = () => openModal('rules');
$('#btnHist').onclick = $('#logbox').onclick = () => {
  if (!S) return;
  $('#histList').innerHTML = S.log.slice().reverse().map(l => `<li>${esc(l)}</li>`).join('');
  openModal('hist');
};
$('#btnQuit').onclick = () => { if (S && S.phase === 'play' && !confirm('Quitter la partie en cours ? Un robot jouera à ta place.')) return; leaveRoom(); };
$('#btnSnd').onclick = () => { muted = !muted; store.set('b2n_mute', muted ? '1' : '0'); $('#btnSnd').textContent = muted ? '🔇' : '🔊'; if (!muted) snd('pop'); };
document.addEventListener('click', e => {
  if (e.target.closest('[data-close]') || e.target.classList.contains('modal')) closeModals();
});

$('#btnAddBot').onclick = () => act(N => { if (N.bots.length + roster.length < 5) N.bots.push(newBot(N.bots)); });
$('#lobList').addEventListener('click', e => {
  const b = e.target.closest('[data-rm]'); if (!b) return;
  act(N => { N.bots = N.bots.filter(x => x.id !== b.dataset.rm); });
});
$('#btnStart').onclick = () => {
  const total = roster.length + ((S && S.bots) || []).length;
  if (total < 2) return toast('Il faut au moins 2 joueurs');
  audio(); commit(buildGame(S));
};

$('#hand').addEventListener('click', e => { const c = e.target.closest('.card'); if (c) onCardClick(+c.dataset.i); });
$('#deck').onclick = drawClick;
$('#opps').addEventListener('click', e => {
  const s = e.target.closest('.seat'); if (!s || targeting === null) return;
  doIt(targeting, s.dataset.id);
});
$('#status').addEventListener('click', e => {
  const a = e.target.closest('[data-a]'); if (!a) return;
  if (a.dataset.a === 'cancel') { sel = null; targeting = null; renderGame(); }
  if (a.dataset.a === 'play') startPlay();
});
$('#defi').addEventListener('click', e => {
  const b = e.target.closest('[data-judge]'); if (!b || !S.pending || S.pending.by !== myId) return;
  const id = b.dataset.judge || null; act(N => doJudge(N, id));
});
$('#end').addEventListener('click', e => {
  const a = e.target.closest('[data-a]'); if (!a) return;
  if (a.dataset.a === 'quit') leaveRoom();
  if (a.dataset.a === 'again' && isHost()) commit({ phase: 'lobby', code, bots: S.bots || [], log: [], fx: S.fx });
});
$('#reacts').innerHTML = ['😂', '😱', '🔥', '💀', '🤡', '👏'].map(e => `<button data-e="${e}">${e}</button>`).join('');
let lastReact = 0;
$('#reacts').addEventListener('click', e => {
  const b = e.target.closest('[data-e]'); if (!b || !room || Date.now() - lastReact < 400) return;
  lastReact = Date.now(); room.send({ t: 'react', e: b.dataset.e }); snd('pop');
});

/* =========================================================
   DÉMARRAGE
   ========================================================= */
$('#rulesCards').innerHTML = Object.keys(CARDS).filter(k => !CARDS[k].letter).map(k => `<li>${CARDS[k].e} <b>${CARDS[k].n}</b> : ${CARDS[k].d}</li>`).join('');
$('#btnSnd').textContent = muted ? '🔇' : '🔊';

(async function init() {
  try { me = SDK ? await SDK.me() : null; } catch (e) { me = null; }
  if (!me) me = { id: 'local-' + Math.random().toString(36).slice(2, 8), name: 'Joueur', avatar: null };
  if (!SDK) $('#pseudoWrap').classList.remove('hide');
  // règles à la première partie
  if (!store.get('b2n_rules_seen')) { store.set('b2n_rules_seen', '1'); openModal('rules'); }
  // arrivée par invitation
  const inv = SDK && typeof SDK.room === 'function' ? SDK.room() : null;
  if (inv) connect(String(inv).toUpperCase(), true, 0);
})();

})();
