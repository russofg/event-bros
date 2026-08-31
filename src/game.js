import "./styles.css";
import { loadAssetMap } from "./core/assets.js";
import { clamp, rectanglesOverlap } from "./core/collision.js";
import { fitGame } from "./core/layout.js";
import { watchReducedMotion } from "./core/motion.js";
import { advanceTimer, decrementLives, transition } from "./core/state.js";

("use strict");
const cv = document.querySelector("#game"),
 ctx = cv.getContext("2d");
const loading = document.querySelector("#loading"),
 loadingLabel = document.querySelector("#loading-label");
const loadingProgress = document.querySelector("#loading-progress"),
 errorPanel = document.querySelector("#load-error");
const errorMessage = document.querySelector("#error-message"),
 statusEl = document.querySelector("#game-status");
const gameplayStateEl = document.querySelector("#gameplay-state"),
 retryButton = document.querySelector("#retry");
const pauseButton = document.querySelector("#bp"),
 muteButton = document.querySelector("#bm");
const gameShell = document.querySelector(".game-shell"),
 touchControls = document.querySelector("#touch");
const padMove = document.querySelector(".pad-move"),
 padAct = document.querySelector(".pad-act");
if (ctx) ctx.imageSmoothingEnabled = false;
let resizeFrame = 0,
 lastFit = "";
function fitRuntime() {
 resizeFrame = 0;
 const shellRect = gameShell.getBoundingClientRect(),
  shellStyle = getComputedStyle(gameShell);
 const touchRect = touchControls.getBoundingClientRect(),
  statusRect = statusEl.getBoundingClientRect();
 const gap = parseFloat(shellStyle.gap) || 0;
 // In short landscape the wrapper is display:contents, so every cluster is a
 // shell column and the reserved space must be measured on the clusters.
 const sideColumns = getComputedStyle(touchControls).display === "contents";
 const moveRect = padMove.getBoundingClientRect(),
  actRect = padAct.getBoundingClientRect();
 const touchVisible = moveRect.width > 0 && moveRect.height > 0;
 let reservedWidth = 0,
  reservedHeight = 0;
 if (sideColumns) {
  if (touchVisible) reservedWidth = moveRect.width + actRect.width + gap * 2;
 } else {
  if (touchVisible) reservedHeight += touchRect.height + gap;
  if (statusRect.height) reservedHeight += statusRect.height + gap;
 }
 const fitted = fitGame(
  shellRect.width - reservedWidth - 8,
  shellRect.height - 8,
  reservedHeight,
 );
 const signature = fitted.width + "x" + fitted.height;
 if (signature === lastFit) return;
 lastFit = signature;
 cv.style.inlineSize = fitted.width + "px";
 cv.style.blockSize = fitted.height + "px";
}
function scheduleFit() {
 if (!resizeFrame) resizeFrame = requestAnimationFrame(fitRuntime);
}
new ResizeObserver(scheduleFit).observe(gameShell);
window.visualViewport?.addEventListener("resize", scheduleFit);
addEventListener("orientationchange", scheduleFit);
scheduleFit();
let reducedMotion = false;
watchReducedMotion(undefined, (value) => {
 reducedMotion = value;
 document.documentElement.dataset.reducedMotion = String(value);
});

/* ========= ASSETS ========= */
const URLS = {
 bg: "/assets/bg.png",
 hero: "/assets/hero_4x4.png",
 foes: "/assets/enemigos.png",
 tiles: "/assets/tiles.png",
 items: "/assets/items.png",
 goal: "/assets/consola.png",
 boss: "/assets/boss.png",
};

const TILE = 48,
 ROWS = 12,
 LW = 176,
 G_UP = 0.34,
 G_DN = 0.95,
 MAXFALL = 16;
const STEP_MS = 1000 / 60,
 MAX_FRAME_MS = 100,
 IDLE_FRAMES = [0, 1, 2, 3, 2, 1];
const BOSS_MAX_HP = 3,
 BOSS_ATTACK_DELAY = 145,
 BOSS_TELEGRAPH_TICKS = 60,
 BOSS_STUN_TICKS = 150,
 BOSS_WAVE_SPEED = 2.7;
const RUN_MAX = 2.8,
 RUN_MAX_BOOST = 3.8,
 RUN_ACC_G = 0.3,
 RUN_ACC_A = 0.22,
 RUN_FRICTION_G = 0.84,
 RUN_FRICTION_A = 0.99;
const JUMP_VY = -11.9,
 JUMP_CUT = -4.6;
const SOLIDS = new Set(["#", "=", "T", "?", "x", "U", "S", "N"]);
const TILEMAP = { "#": 0, "=": 1, T: 2, "?": 3, x: 4, U: 5, S: 6, N: 7 };

let grid, items, foes, pops, floats, parts, goal, player;
let camX = 0,
 score = 0,
 mics = 0,
 lives = 3,
 timer = 400,
 tAcc = 0,
 tick = 0,
 stateTimer = 0,
 bonus = 0,
 shake = 0;
let state = "title",
 ready = false,
 muted = false,
 jHeld = false;
let boss = null,
 waves = [],
 bossActive = false,
 bossGone = false,
 checkpoint = null;
let lastFrame = 0,
 frameAcc = 0;
const input = { left: false, right: false, jump: false, down: false };
let bgC,
 heroCells = [],
 heroRefH = 66,
 foeCells,
 tileCells,
 tileSurfaceOffsets = [],
 itemCells,
 goalC,
 bossCells;

/* ========= CARGA + CHROMA + TRIM ROBUSTO ========= */
let pendingGameplayAnnouncement = "",
 lastGameplayAnnouncementTick = -60,
 lastAnnouncedBossState = "";
function setStatus(message) {
 statusEl.textContent = message;
}
function queueGameplayAnnouncement(message) {
 pendingGameplayAnnouncement = message;
}
function directionAndDistance(fromX, targetX) {
 const blocks = Math.max(0, Math.round(Math.abs(targetX - fromX) / TILE));
 if (blocks === 0) return "en tu posición";
 return (
  (targetX > fromX ? "a la derecha" : "a la izquierda") +
  ", a " +
  blocks +
  (blocks === 1 ? " bloque" : " bloques")
 );
}
function bossInstruction() {
 if (!boss || boss.state === "dead") return "";
 const instructions = {
  hover: "esquivá y esperá su ataque",
  telegraph: "alejate del punto de impacto",
  scream: "saltá las ondas de feedback",
  slam: "alejate mientras cae",
  stun: "saltá sobre el jefe ahora",
  recover: "mantené distancia mientras se recupera",
 };
 return (
  "Jefe: El Feedback, fase " +
  boss.state +
  ", " +
  boss.hp +
  " impactos restantes; instrucción: " +
  (instructions[boss.state] || "mantenete alerta") +
  "."
 );
}
function updateGameplayState() {
 if (!gameplayStateEl) return;
 if (!player) {
  gameplayStateEl.textContent =
   state === "unsupported"
    ? "Estado: no compatible. El juego no puede iniciarse en este navegador."
    : "Estado: cargando. Los datos de juego aparecerán cuando el escenario esté listo.";
  return;
 }
 const stateNames = {
  title: "listo para empezar",
  play: "jugando",
  pause: "en pausa",
  dying: "perdiste una vida",
  respawn: "reanudando",
  gameover: "fin del juego",
  win: "partida ganada",
 };
 const progress = Math.round((player.x / (LW * TILE - player.w)) * 100);
 const zones = [
  [25, "montaje inicial"],
  [50, "recorrido técnico"],
  [75, "acceso al escenario"],
  [90, "camino a FOH"],
  [101, "zona del jefe"],
 ];
 const zone = zones.find(([limit]) => progress < limit)?.[1] || "consola FOH";
 const position = player.crouch
  ? "agachado"
  : player.onG
    ? "en el suelo"
    : "en el aire";
 const activeHazards = [
  ...(foes || []).filter((foe) => !foe.dead && !foe.fly),
  ...(waves || []),
 ];
 if (boss && boss.state !== "dead") activeHazards.push(boss);
 const nearestHazard = activeHazards.sort(
  (a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x),
 )[0];
 const nextMic = (items || [])
  .filter((item) => item.t === 0 && !item.taken)
  .sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0];
 const hazardText = nearestHazard
  ? "Peligro cercano: " + directionAndDistance(player.x, nearestHazard.x) + "."
  : "Peligro cercano: ninguno detectado.";
 const objectiveText = bossGone
  ? "Objetivo: entrá a la consola FOH " +
    directionAndDistance(player.x, goal.x) +
    "."
  : nextMic
    ? "Objetivo: micrófono " + directionAndDistance(player.x, nextMic.x) + "."
    : "Objetivo: avanzá hacia la consola FOH.";
 const bossText = bossInstruction();
 const summary = [
  "Estado: " + (stateNames[state] || state) + ".",
  "Avance: " + progress + "%, zona " + zone + ".",
  "Posición: " + position + ".",
  "Puntaje: " + score + ".",
  "Micrófonos: " + mics + ".",
  "Vidas: " + lives + ".",
  "Tiempo: " + timer + " segundos.",
  hazardText,
  objectiveText,
  bossText,
 ]
  .filter(Boolean)
  .join(" ");
 if (gameplayStateEl.textContent !== summary)
  gameplayStateEl.textContent = summary;
 if (boss && boss.state !== "dead" && boss.state !== lastAnnouncedBossState) {
  lastAnnouncedBossState = boss.state;
  queueGameplayAnnouncement(bossInstruction());
 } else if (!boss) lastAnnouncedBossState = "";
}
function syncState() {
 document.body.dataset.gameState = state;
 document.body.dataset.ready = String(ready);
 document.body.dataset.muted = String(muted);
 pauseButton.setAttribute("aria-pressed", String(state === "pause"));
 muteButton.setAttribute("aria-pressed", String(muted));
 updateGameplayState();
}
function showUnsupportedCanvas() {
 ready = false;
 state = "unsupported";
 loading.hidden = true;
 errorPanel.hidden = false;
 retryButton.hidden = true;
 errorMessage.textContent =
  "Tu navegador no admite el lienzo 2D necesario para jugar; actualizá el navegador o usá otro compatible.";
 setStatus("Juego no compatible. No se inició la partida.");
 syncState();
}
function chroma(img) {
 const c = document.createElement("canvas");
 c.width = img.naturalWidth;
 c.height = img.naturalHeight;
 const g = c.getContext("2d");
 g.drawImage(img, 0, 0);
 try {
  const d = g.getImageData(0, 0, c.width, c.height),
   p = d.data,
   w = c.width,
   h = c.height;
  for (let i = 0; i < p.length; i += 4) {
   const r = p[i],
    gg = p[i + 1],
    b = p[i + 2];
   if (r > 110 && b > 90 && gg < 115 && r - gg > 45 && b - gg > 35)
    p[i + 3] = 0;
  }
  for (let y = 0; y < h; y++)
   for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (!p[i + 3]) continue;
    const r = p[i],
     gg = p[i + 1],
     b = p[i + 2];
    if (r > 100 && b > 80 && gg < 130) {
     const nb =
      (x > 0 && !p[i - 4 + 3]) ||
      (x < w - 1 && !p[i + 4 + 3]) ||
      (y > 0 && !p[i - w * 4 + 3]) ||
      (y < h - 1 && !p[i + w * 4 + 3]);
     if (nb) p[i + 3] = 0;
    }
   }
  g.putImageData(d, 0, 0);
 } catch {
  // Canvas pixel access can be denied; retain the original artwork as a safe fallback.
 }
 return c;
}
function cleanCell(k) {
 /* borra la línea de piso si la hoja la trae */
 const g = k.getContext("2d");
 let d;
 try {
  d = g.getImageData(0, 0, k.width, k.height);
 } catch {
  return k;
 }
 const p = d.data;
 const count = (y) => {
  let n = 0;
  for (let x = 0; x < k.width; x++) if (p[(y * k.width + x) * 4 + 3] > 10) n++;
  return n;
 };
 const clear = (y) => {
  for (let x = 0; x < k.width; x++) p[(y * k.width + x) * 4 + 3] = 0;
 };
 let y = k.height - 1;
 while (y > k.height * 0.6 && count(y) < 2) y--;
 while (y > k.height * 0.6 && count(y) > k.width * 0.5) {
  clear(y);
  y--;
 }
 g.putImageData(d, 0, 0);
 return k;
}
function contentTrim(k) {
 /* recorta al bounding box real del sprite */
 const g = k.getContext("2d");
 let d;
 try {
  d = g.getImageData(0, 0, k.width, k.height).data;
 } catch {
  return k;
 }
 let x0 = 1e9,
  y0 = 1e9,
  x1 = -1,
  y1 = -1;
 for (let y = 0; y < k.height; y++)
  for (let x = 0; x < k.width; x++) {
   if (d[(y * k.width + x) * 4 + 3] > 10) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
   }
  }
 if (x1 < 0) return k;
 const w = x1 - x0 + 1,
  h = y1 - y0 + 1,
  c = document.createElement("canvas");
 c.width = w;
 c.height = h;
 c.getContext("2d").drawImage(k, x0, y0, w, h, 0, 0, w, h);
 return c;
}
function surfaceOffset(k) {
 /* alinea la física con el primer pixel visible del tile */
 const g = k.getContext("2d");
 let d;
 try {
  d = g.getImageData(0, 0, k.width, k.height).data;
 } catch {
  return 0;
 }
 for (let y = 0; y < k.height; y++)
  for (let x = 0; x < k.width; x++) {
   if (d[(y * k.width + x) * 4 + 3] > 10)
    return Math.round((y * TILE) / k.height);
  }
 return 0;
}
function slice(cn, cols, rows, trim) {
 const out = [],
  cw = cn.width / cols,
  ch = cn.height / rows;
 for (let r = 0; r < rows; r++)
  for (let c = 0; c < cols; c++) {
   const k = document.createElement("canvas");
   k.width = Math.round(cw);
   k.height = Math.round(ch);
   k.getContext("2d").drawImage(
    cn,
    Math.round(c * cw),
    Math.round(r * ch),
    Math.round(cw),
    Math.round(ch),
    0,
    0,
    k.width,
    k.height,
   );
   out.push(trim ? contentTrim(cleanCell(k)) : k);
  }
 return out;
}
function spr(cn, cx, cy, h) {
 const w = (h * cn.width) / cn.height;
 ctx.drawImage(cn, cx - w / 2, cy - h / 2, w, h);
 return w;
}
async function boot() {
 if (!ctx) {
  showUnsupportedCanvas();
  return;
 }
 ready = false;
 syncState();
 loading.hidden = false;
 errorPanel.hidden = true;
 loadingProgress.value = 0;
 setStatus("Cargando recursos del juego.");
 try {
  const loaded = await loadAssetMap(URLS, {
   onProgress: ({ percent }) => {
    loadingProgress.value = percent;
    loadingProgress.textContent = percent + "%";
    loadingLabel.textContent = "Preparando el escenario… " + percent + "%";
   },
  });
  const { bg, hero, foes, tiles, items: its, goal, boss: bossImg } = loaded;
  bgC = bg;
  heroCells = slice(hero, 4, 4, false);
  heroRefH = heroCells[0].height;
  foeCells = slice(chroma(foes), 4, 1, true);
  tileCells = slice(chroma(tiles), 4, 2, false);
  tileSurfaceOffsets = tileCells.map(surfaceOffset);
  itemCells = slice(chroma(its), 4, 1, true);
  goalC = chroma(goal);
  bossCells = slice(chroma(bossImg), 4, 1, true);
  buildLevel();
  ready = true;
  loading.hidden = true;
  setStatus("Juego listo. Presioná Enter o tocá el escenario para empezar.");
  syncState();
 } catch (error) {
  ready = false;
  loading.hidden = true;
  errorPanel.hidden = false;
  errorMessage.textContent = error.message;
  setStatus("La carga falló. Usá el botón Reintentar carga.");
  syncState();
 }
}

/* ========= NIVEL ========= */
function tileSurfaceOffset(ch) {
 const i = TILEMAP[ch];
 return i == null ? 0 : tileSurfaceOffsets[i] || 0;
}
function floorSurfaceY() {
 return 10 * TILE + tileSurfaceOffset("#");
}
function resetPlayer(spawn) {
 const base = bossActive || bossGone ? 151 * TILE : 3 * TILE;
 const sx = spawn ? clamp(spawn.x, 0, LW * TILE - 26) : base;
 const sy = spawn ? spawn.y : floorSurfaceY() - 60;
 player = {
  x: sx,
  y: sy,
  w: 26,
  h: 60,
  vx: 0,
  vy: 0,
  onG: false,
  face: 1,
  anim: 0,
  inv: 0,
  boost: 0,
  star: 0,
  coyote: 0,
  jbuf: 0,
  crouch: false,
  skid: false,
 };
 camX = clamp(sx - 360, 0, LW * TILE - 960);
}
function buildLevel() {
 grid = Array.from({ length: ROWS }, () => Array(LW).fill(" "));
 const ground = (a, b) => {
  for (let c = a; c <= b; c++) {
   grid[10][c] = "#";
   grid[11][c] = "=";
  }
 };
 ground(0, 37);
 ground(41, 67);
 ground(72, 107);
 ground(112, LW - 1);
 const pipe = (c, h) => {
  for (let r = 10 - h; r <= 9; r++) grid[r][c] = "U";
 };
 pipe(18, 2);
 pipe(56, 3);
 pipe(94, 2);
 pipe(130, 3);
 const truss = (a, b, r) => {
  for (let c = a; c <= b; c++) grid[r][c] = "T";
 };
 truss(29, 34, 7);
 truss(44, 48, 6);
 truss(67, 68, 7);
 truss(71, 72, 7);
 truss(76, 78, 7);
 truss(80, 85, 5);
 truss(88, 91, 7);
 truss(107, 108, 7);
 truss(111, 112, 7);
 truss(122, 126, 6);
 const caseRow = (a, b, r, pat) => {
  for (let c = a; c <= b; c++) grid[r][c] = pat[(c - a) % pat.length];
 };
 caseRow(20, 24, 7, "?x?x?");
 caseRow(31, 33, 4, "?x?");
 caseRow(60, 64, 7, "x?x?x");
 caseRow(69, 72, 4, "?x??");
 caseRow(116, 120, 7, "?x?x?");
 grid[9][8] = "S";
 grid[9][9] = "S";
 grid[8][9] = "S";
 grid[9][102] = "S";
 grid[9][103] = "S";
 grid[9][42] = "N";
 for (let i = 0; i < 8; i++) {
  const c = 134 + i;
  for (let r = 9 - i; r <= 9; r++) grid[r][c] = "N";
 }
 items = [];
 const mic = (c, r) =>
  items.push({
   t: 0,
   x: c * TILE + 8,
   y: r * TILE + 8,
   w: 32,
   h: 32,
   bob: Math.random() * 6,
  });
 [
  [12, 9],
  [13, 9],
  [14, 9],
  [38, 7],
  [39, 6],
  [40, 7],
  [45, 5],
  [46, 5],
  [47, 5],
  [50, 9],
  [51, 9],
  [52, 9],
  [69, 5],
  [70, 5],
  [75, 9],
  [76, 9],
  [81, 4],
  [83, 4],
  [84, 4],
  [89, 6],
  [90, 6],
  [97, 9],
  [98, 9],
  [99, 9],
  [109, 6],
  [110, 6],
  [118, 6],
  [123, 4],
  [124, 4],
  [125, 4],
  [132, 9],
  [136, 6],
  [140, 4],
  [155, 9],
  [160, 9],
  [165, 9],
 ].forEach((a) => mic(a[0], a[1]));
 items.push({ t: 1, x: 62 * TILE + 6, y: 5 * TILE + 4, w: 36, h: 36, bob: 0 });
 items.push({ t: 2, x: 82 * TILE + 6, y: 3 * TILE + 4, w: 36, h: 36, bob: 2 });
 [
  [28, 9],
  [86, 9],
  [120, 6],
 ].forEach((a) =>
  items.push({
   t: 3,
   x: a[0] * TILE + 8,
   y: a[1] * TILE + 8,
   w: 32,
   h: 32,
   bob: 1,
  }),
 );
 foes = [];
 const foe = (t, c) =>
  foes.push({
   t,
   x: c * TILE + 6,
   y: floorSurfaceY() - 42,
   w: 36,
   h: 42,
   dir: -1,
   vy: 0,
   dead: 0,
   fly: false,
   fr: (Math.random() * 99) | 0,
  });
 foe("K", 15);
 foe("E", 25);
 foe("K", 33);
 foe("E", 47);
 foe("K", 63);
 foe("E", 75);
 foe("K", 90);
 foe("E", 99);
 foe("K", 103);
 foe("E", 118);
 foe("K", 127);
 pops = [];
 floats = [];
 parts = [];
 waves = [];
 boss = null;
 bossActive = false;
 bossGone = false;
 shake = 0;
 goal = { x: 170 * TILE, y: floorSurfaceY() - 100, w: 110, h: 100 };
 resetPlayer();
 checkpoint = { x: player.x, y: player.y };
}
function fullReset() {
 buildLevel();
 score = 0;
 mics = 0;
 lives = 3;
 timer = 400;
 tAcc = 0;
}

/* ========= FÍSICA ========= */
function tileAt2(c, r) {
 if (c < 0 || c >= LW) return "#";
 if (r < 0 || r >= ROWS) return " ";
 return grid[r][c];
}
function isSolid(ch) {
 return SOLIDS.has(ch);
}

function collideX(e) {
 if (e.vx > 0) {
  const c = Math.floor((e.x + e.w) / TILE);
  for (const yo of [2, e.h / 2, Math.max(2, e.h - 12)]) {
   const r = Math.floor((e.y + yo) / TILE);
   if (isSolid(tileAt2(c, r))) {
    e.x = c * TILE - e.w - 0.01;
    e.vx = 0;
    return;
   }
  }
 } else if (e.vx < 0) {
  const c = Math.floor(e.x / TILE);
  for (const yo of [2, e.h / 2, Math.max(2, e.h - 12)]) {
   const r = Math.floor((e.y + yo) / TILE);
   if (isSolid(tileAt2(c, r))) {
    e.x = (c + 1) * TILE + 0.01;
    e.vx = 0;
    return;
   }
  }
 }
}
function collideY(e) {
 if (e.vy > 0) {
  const r = Math.floor((e.y + e.h) / TILE);
  for (const xo of [2, e.w / 2, e.w - 2]) {
   const c = Math.floor((e.x + xo) / TILE);
   const ch = tileAt2(c, r),
    surface = r * TILE + tileSurfaceOffset(ch);
   if (isSolid(ch) && e.y + e.h >= surface) {
    e.y = surface - e.h;
    e.vy = 0;
    e.onG = true;
    return;
   }
  }
 } else if (e.vy < 0) {
  const r = Math.floor(e.y / TILE);
  let hc = -1,
   best = 1e9;
  for (const xo of [2, e.w / 2, e.w - 2]) {
   const c = Math.floor((e.x + xo) / TILE);
   if (isSolid(tileAt2(c, r))) {
    const d = Math.abs((c + 0.5) * TILE - (e.x + e.w / 2));
    if (d < best) {
     best = d;
     hc = c;
    }
   }
  }
  if (hc >= 0) {
   e.y = (r + 1) * TILE + 0.01;
   e.vy = 0;
   if (e === player) bump(hc, r);
  }
 }
}
function bump(c, r) {
 if (grid[r][c] === "?") {
  grid[r][c] = "x";
  pops.push({ x: c * TILE + 8, y: r * TILE - 34, vy: -4.2, life: 45 });
  score += 200;
  addFloat(c * TILE + 8, r * TILE - 40, "+200");
  SFX.coin();
 } else SFX.bump();
}
function setH(nh) {
 const d = player.h - nh;
 player.h = nh;
 player.y += d;
}
function headBlocked() {
 const r = Math.floor((player.y - 20 + 2) / TILE);
 for (const xo of [2, player.w / 2, player.w - 2]) {
  const c = Math.floor((player.x + xo) / TILE);
  if (isSolid(tileAt2(c, r))) return true;
 }
 return false;
}
function saveCheckpoint() {
 if (!player.onG || bossActive) return;
 checkpoint = { x: player.x, y: player.y };
}
function dust(x, y, n) {
 if (reducedMotion) return;
 for (let i = 0; i < (n || 4); i++)
  parts.push({
   x: x + (Math.random() - 0.5) * 10,
   y: y - 2,
   vx: (Math.random() - 0.5) * 2.4,
   vy: -Math.random() * 1.6,
   life: 18 + Math.random() * 12,
   col: "#cfd6e4",
  });
}

function updPlayer() {
 const max = player.boost > 0 ? RUN_MAX_BOOST : RUN_MAX;
 player.crouch = false;
 player.skid = false;
 if (input.down && player.onG) {
  if (Math.abs(player.vx) > 2.0) {
   player.skid = true;
   player.vx *= 0.88;
   player.face = player.vx > 0 ? -1 : 1;
   if (tick % 3 === 0) dust(player.x + player.w / 2, player.y + player.h, 2);
  } else player.crouch = true;
 }
 if (player.crouch && player.h === 60) setH(40);
 else if (!player.crouch && player.h === 40) {
  if (headBlocked()) player.crouch = true;
  else setH(60);
 }
 const acc = player.onG ? RUN_ACC_G : RUN_ACC_A;
 if (!player.crouch) {
  if (input.left && !input.right) {
   player.vx -= acc;
   player.face = -1;
  } else if (input.right && !input.left) {
   player.vx += acc;
   player.face = 1;
  } else player.vx *= player.onG ? RUN_FRICTION_G : RUN_FRICTION_A;
 } else player.vx *= 0.7;
 player.vx = clamp(player.vx, -max, max);
 if (Math.abs(player.vx) < 0.05) player.vx = 0;
 if (input.jump && !jHeld) player.jbuf = 8;
 jHeld = input.jump;
 if (player.jbuf > 0) player.jbuf--;
 if (player.onG) player.coyote = 8;
 else if (player.coyote > 0) player.coyote--;
 if (player.jbuf > 0 && player.coyote > 0) {
  player.vy = JUMP_VY;
  player.jbuf = 0;
  player.coyote = 0;
  SFX.jump();
  dust(player.x + player.w / 2, player.y + player.h, 3);
 }
 if (!input.jump && player.vy < JUMP_CUT) player.vy = JUMP_CUT;
 player.vy += player.vy < 0 && input.jump ? G_UP : G_DN;
 if (player.vy > MAXFALL) player.vy = MAXFALL;
 player.x += player.vx;
 if (bossActive && !bossGone && player.x < 150 * TILE + 6)
  player.x = 150 * TILE + 6;
 if (player.x < 0) {
  player.x = 0;
  player.vx = 0;
 }
 if (player.x > LW * TILE - player.w) player.x = LW * TILE - player.w;
 collideX(player);
 player.onG = false;
 const pv = player.vy;
 player.y += player.vy;
 collideY(player);
 saveCheckpoint();
 if (player.onG && pv > 9)
  dust(player.x + player.w / 2, player.y + player.h, 6);
 if (player.inv > 0) player.inv--;
 if (player.boost > 0) player.boost--;
 if (player.star > 0) player.star--;
 player.anim++;
 if (player.y > ROWS * TILE + 60) kill();
 if (!boss && !bossGone && player.x > 151 * TILE) spawnBoss();
}
function updFoes() {
 for (const f of foes) {
  if (f.dead) {
   f.dead++;
   continue;
  }
  if (f.fly) {
   f.vy += G_DN;
   f.y += f.vy;
   f.x += f.dir * 2;
   continue;
  }
  f.vy += G_DN;
  if (f.vy > MAXFALL) f.vy = MAXFALL;
  f.x += f.dir * 0.9;
  const cx =
   f.dir > 0 ? Math.floor((f.x + f.w) / TILE) : Math.floor(f.x / TILE);
  if (isSolid(tileAt2(cx, Math.floor((f.y + f.h * 0.5) / TILE)))) {
   f.dir *= -1;
   f.x += f.dir * 2;
  }
  f.y += f.vy;
  let onG = false;
  if (f.vy > 0) {
   const r = Math.floor((f.y + f.h) / TILE);
   for (const xo of [2, f.w - 2]) {
    const c = Math.floor((f.x + xo) / TILE);
    const ch = tileAt2(c, r),
     surface = r * TILE + tileSurfaceOffset(ch);
    if (isSolid(ch) && f.y + f.h >= surface) {
     f.y = surface - f.h;
     f.vy = 0;
     onG = true;
     break;
    }
   }
  }
  if (onG) {
   const ahead =
    f.dir > 0
     ? Math.floor((f.x + f.w + 3) / TILE)
     : Math.floor((f.x - 3) / TILE);
   if (!isSolid(tileAt2(ahead, Math.floor((f.y + f.h + 6) / TILE))))
    f.dir *= -1;
  }
  f.fr++;
  if (state === "play" && rectanglesOverlap(player, f)) {
   if (
    player.vy > 0.5 &&
    !player.onG &&
    player.y + player.h - f.y < f.h * 0.6
   ) {
    f.dead = 1;
    player.vy = input.jump ? -12.5 : -9;
    score += 100;
    addFloat(f.x, f.y - 10, "+100");
    SFX.stomp();
   } else if (player.star > 0) {
    f.fly = true;
    f.vy = -7;
    score += 200;
    addFloat(f.x, f.y - 10, "+200");
    SFX.stomp();
   } else if (player.inv <= 0) kill();
  }
 }
 foes = foes.filter((f) => !(f.dead > 45) && f.y < ROWS * TILE + 240);
}
function updItems() {
 for (const it of items) {
  if (it.taken) continue;
  if (!reducedMotion) it.bob += 0.07;
  const yy = it.y + (reducedMotion ? 0 : Math.sin(it.bob) * 4);
  if (rectanglesOverlap(player, { x: it.x, y: yy, w: it.w, h: it.h })) {
   it.taken = true;
   if (it.t === 0) {
    mics++;
    score += 200;
    addFloat(it.x, yy, "+200");
    queueGameplayAnnouncement(
     "Micrófono reunido. Total: " + mics + ". Puntaje: " + score + ".",
    );
    SFX.coin();
   } else if (it.t === 3) {
    score += 100;
    addFloat(it.x, yy, "+100");
    SFX.coin();
   } else if (it.t === 1) {
    score += 1000;
    player.boost = 600;
    addFloat(it.x, yy, "¡ENERGIA!");
    SFX.power();
   } else {
    score += 1000;
    player.star = 480;
    addFloat(it.x, yy, "¡INVENCIBLE!");
    SFX.power();
   }
  }
 }
}
function updPops() {
 for (const p of pops) {
  p.y += p.vy;
  p.vy += 0.22;
  p.life--;
 }
 pops = pops.filter((p) => p.life > 0);
}
function updFloats() {
 for (const f of floats) {
  f.y -= 0.6;
  f.life--;
 }
 floats = floats.filter((f) => f.life > 0);
}
function updParts() {
 for (const p of parts) {
  p.x += p.vx;
  p.y += p.vy;
  p.vy += 0.12;
  p.life--;
 }
 parts = parts.filter((p) => p.life > 0);
}
function addFloat(x, y, txt) {
 floats.push({ x, y, txt, life: 60 });
}
function kill() {
 if (state !== "play") return;
 state = transition(state, "die");
 stateTimer = 0;
 player.vy = -11;
 stopMusic();
 SFX.die();
 setStatus("Perdiste una vida.");
 syncState();
}
function resetBossEncounter() {
 if (!boss || boss.state === "dead") return;
 waves = [];
 boss.x = 162 * TILE;
 boss.y = 240;
 boss.vy = 0;
 boss.t = 0;
 boss.st = 0;
 boss.state = "hover";
 boss.flash = 0;
 boss.hint = Math.max(boss.hint, 180);
}
function afterDeath() {
 const lifeResult = decrementLives(lives);
 lives = lifeResult.lives;
 if (lifeResult.gameOver) {
  state = transition(state, "gameover");
  setStatus("Fin del juego. Presioná Enter para reintentar.");
  syncState();
  return;
 }
 if (bossActive && !bossGone) resetBossEncounter();
 resetPlayer(checkpoint);
 player.inv = 120;
 timer = 400;
 tAcc = 0;
 state = transition(state, "respawn");
 startMusic();
 setStatus("Continuás con " + lives + " vidas.");
 syncState();
}
function checkWin() {
 if (bossGone && rectanglesOverlap(player, goal)) {
  state = transition(state, "win");
  bonus = timer * 10;
  score += bonus;
  stopMusic();
  SFX.win();
  setStatus("Show salvado. Puntaje final: " + score + ".");
  syncState();
 }
}
function camFollow() {
 let lo = 0;
 const hi = LW * TILE - 960;
 if (bossActive && !bossGone) lo = 150 * TILE;
 const t = clamp(player.x - 360, lo, hi);
 camX += (t - camX) * 0.12;
}

/* ========= JEFE: EL FEEDBACK ========= */
function spawnBoss() {
 boss = {
  x: 162 * TILE,
  y: 240,
  w: 96,
  h: 100,
  vy: 0,
  hp: BOSS_MAX_HP,
  maxHp: BOSS_MAX_HP,
  t: 0,
  st: 0,
  state: "hover",
  flash: 0,
  deadT: 0,
  attack: 0,
  hint: 360,
  hintCooldown: 0,
 };
 bossActive = true;
 waves = [];
 checkpoint = { x: 151 * TILE + 12, y: floorSurfaceY() - 60 };
 shake = 10;
 SFX.power();
 addFloat(player.x, player.y - 40, "¡EL FEEDBACK!");
}
function spawnWave(dir) {
 waves.push({
  x: boss.x + 48 + dir * 44,
  y: floorSurfaceY() - 38,
  vx: dir * BOSS_WAVE_SPEED,
  w: 36,
  h: 38,
  life: 260,
  ph: Math.random() * 6,
 });
}
function updBoss() {
 if (!boss) return;
 const b = boss;
 if (b.flash > 0) b.flash--;
 if (b.hint > 0) b.hint--;
 if (b.hintCooldown > 0) b.hintCooldown--;
 if (b.state === "dead") {
  b.deadT++;
  b.y += 3;
  b.x += 1.2;
  if (b.deadT % 6 === 0)
   parts.push({
    x: b.x + 48 + (Math.random() - 0.5) * 60,
    y: b.y + 40,
    vx: (Math.random() - 0.5) * 3,
    vy: -Math.random() * 3,
    life: 30,
    col: "#ffd23f",
   });
  if (b.deadT > 140) {
   bossGone = true;
   bossActive = false;
   boss = null;
   addFloat(goal.x, goal.y - 30, "¡CONSOLA LIBRE!");
  }
  return;
 }
 b.t++;
 const groundY = floorSurfaceY() - b.h;
 if (b.state === "hover") {
  b.y = reducedMotion ? 240 : 240 + Math.sin(b.t * 0.05) * 46;
  const target = clamp(player.x - 48, 152 * TILE, 168 * TILE);
  b.x += (target - b.x) * 0.012;
  if (b.t >= BOSS_ATTACK_DELAY) {
   b.state = b.attack % 2 === 0 ? "telegraph" : "scream";
   b.attack++;
   b.st = 0;
   b.vy = 0;
   b.t = 0;
  }
 } else if (b.state === "telegraph") {
  b.st++;
  if (b.st === 1) addFloat(b.x + 6, b.y - 16, "¡VA A CAER!");
  if (b.st > BOSS_TELEGRAPH_TICKS) {
   b.state = "slam";
   b.st = 0;
   b.vy = 0;
  }
 } else if (b.state === "scream") {
  b.st++;
  if (b.st === 25 || b.st === 45) spawnWave(player.x > b.x ? 1 : -1);
  if (b.st > 70) {
   b.state = "hover";
   b.t = 0;
  }
 } else if (b.state === "slam") {
  b.st++;
  if (b.st < 18) b.y -= 4;
  else {
   b.vy += 0.9;
   b.y += b.vy;
   if (b.y >= groundY) {
    b.y = groundY;
    b.vy = 0;
    b.state = "stun";
    b.st = 0;
    shake = 14;
    SFX.stomp();
    spawnWave(1);
    spawnWave(-1);
   }
  }
 } else if (b.state === "stun") {
  b.st++;
  if (b.st > BOSS_STUN_TICKS) {
   b.state = "recover";
   b.st = 0;
  }
 } else if (b.state === "recover") {
  b.st++;
  b.y += (240 - b.y) * 0.08;
  if (b.st > 35) {
   b.state = "hover";
   b.t = 0;
  }
 }
 if (state === "play" && rectanglesOverlap(player, b)) {
  const stomp = player.vy > 0.5 && player.y + player.h < b.y + b.h * 0.55;
  if (stomp) {
   player.y = b.y - player.h - 2;
   if (b.state === "stun" && b.flash <= 0) {
    b.hp--;
    b.flash = 25;
    player.vy = -13.5;
    score += 500;
    SFX.stomp();
    addFloat(b.x + 8, b.y - 14, b.hp > 0 ? "¡QUEDAN " + b.hp + "!" : "¡FUERA!");
    b.hint = 0;
    if (b.hp <= 0) {
     b.state = "dead";
     b.deadT = 0;
     waves = [];
     score += 2000;
     stopMusic();
     SFX.win();
    } else {
     b.state = "recover";
     b.st = 0;
    }
   } else {
    player.vy = -9.5;
    SFX.bump();
    if (b.hintCooldown <= 0) {
     addFloat(b.x - 18, b.y - 14, "¡ESPERA QUE CAIGA!");
     b.hintCooldown = 90;
    }
   }
  } else if (player.inv <= 0 && player.star <= 0) kill();
  else if (player.star > 0) {
   player.vx = player.x < b.x ? -5 : 5;
   player.vy = -6;
  }
 }
}
function updWaves() {
 for (const w of waves) {
  w.x += w.vx;
  w.ph += 0.2;
  w.life--;
  if (state === "play" && rectanglesOverlap(player, w)) {
   if (player.star > 0) {
    w.life = 0;
    score += 50;
    SFX.stomp();
   } else if (player.inv <= 0) kill();
  }
 }
 waves = waves.filter(
  (w) => w.life > 0 && w.x > 149 * TILE && w.x < 176 * TILE,
 );
}

/* ========= AUDIO ========= */
let AC = null,
 musicTimer = null,
 nextT = 0,
 step = 0;
function audio() {
 try {
  const safariWindow =
   /** @type {Window & typeof globalThis & {webkitAudioContext?: typeof AudioContext}} */ (
    window
   );
  const AudioContextConstructor =
   window.AudioContext || safariWindow.webkitAudioContext;
  if (!AC && AudioContextConstructor) AC = new AudioContextConstructor();
  if (AC?.state === "suspended") AC.resume();
 } catch {
  // Audio is progressive enhancement; gameplay remains available when it is blocked.
 }
 return AC;
}
function tone(f, d, type, v, t0) {
 const a = AC;
 if (!a || muted) return;
 t0 = t0 || a.currentTime;
 const o = a.createOscillator(),
  g = a.createGain();
 o.type = type;
 o.frequency.setValueAtTime(f, t0);
 g.gain.setValueAtTime(v, t0);
 g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
 o.connect(g);
 g.connect(a.destination);
 o.start(t0);
 o.stop(t0 + d + 0.02);
}
function beep(f, d, type, v, slide) {
 const a = audio();
 if (!a || muted) return;
 type = type || "square";
 v = v || 0.05;
 const o = a.createOscillator(),
  g = a.createGain(),
  t0 = a.currentTime;
 o.type = type;
 o.frequency.setValueAtTime(f, t0);
 if (slide)
  o.frequency.linearRampToValueAtTime(Math.max(30, f + slide), t0 + d);
 g.gain.setValueAtTime(v, t0);
 g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
 o.connect(g);
 g.connect(a.destination);
 o.start(t0);
 o.stop(t0 + d + 0.02);
}
const SFX = {
 jump: () => beep(250, 0.2, "square", 0.05, 520),
 coin: () => {
  beep(988, 0.08);
  setTimeout(() => beep(1319, 0.22), 70);
 },
 stomp: () => beep(200, 0.14, "square", 0.08, -140),
 bump: () => beep(110, 0.09, "square", 0.08),
 power: () =>
  [523, 659, 784, 1047].forEach((f, i) =>
   setTimeout(() => beep(f, 0.12), i * 70),
  ),
 die: () =>
  [494, 440, 392, 330, 262, 196, 147].forEach((f, i) =>
   setTimeout(() => beep(f, 0.13, "triangle", 0.06), i * 100),
  ),
 win: () =>
  [523, 523, 659, 784, 1047, 784, 1047].forEach((f, i) =>
   setTimeout(() => beep(f, 0.14, "square", 0.055), i * 110),
  ),
};
const BASS = [110, 0, 110, 0, 131, 0, 147, 0, 110, 0, 110, 0, 165, 0, 147, 131];
const LEAD = [
 440, 523, 659, 523, 587, 659, 880, 659, 523, 587, 659, 587, 523, 440, 392, 440,
];
function startMusic() {
 stopMusic();
 if (muted) return;
 const a = audio();
 if (!a) return;
 nextT = a.currentTime + 0.06;
 step = 0;
 musicTimer = setInterval(() => {
  const a2 = AC;
  if (!a2) return;
  while (nextT < a2.currentTime + 0.15) {
   const s = step % 16;
   if (LEAD[s]) tone(LEAD[s], 0.13, "square", 0.03, nextT);
   if (BASS[s]) tone(BASS[s], 0.22, "triangle", 0.05, nextT);
   nextT += 0.145;
   step++;
  }
 }, 60);
}
function stopMusic() {
 if (musicTimer) {
  clearInterval(musicTimer);
  musicTimer = null;
 }
}
function toggleMute() {
 muted = !muted;
 if (muted) stopMusic();
 else if (state === "play") startMusic();
 setStatus(muted ? "Sonido silenciado." : "Sonido activado.");
 syncState();
}

/* ========= DIBUJO ========= */
function draw() {
 ctx.fillStyle = "#07070f";
 ctx.fillRect(0, 0, 960, 576);
 if (!ready) {
  ctx.fillStyle = "#fff";
  ctx.font = '14px "Press Start 2P",monospace';
  ctx.textAlign = "center";
  ctx.fillText("CARGANDO ASSETS...", 480, 288);
  return;
 }
 if (bgC) {
  const bw = bgC.width * (576 / bgC.height);
  let off = -((camX * 0.35) % bw);
  if (off > 0) off -= bw;
  for (let x = off; x < 960; x += bw) ctx.drawImage(bgC, x, 0, bw, 576);
 }
 ctx.save();
 if (shake > 0 && !reducedMotion)
  ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
 ctx.translate(-Math.round(camX), 0);
 const c0 = Math.max(0, Math.floor(camX / TILE) - 1),
  c1 = Math.min(LW - 1, Math.floor((camX + 960) / TILE) + 1);
 for (let r = 0; r < ROWS; r++)
  for (let c = c0; c <= c1; c++) {
   const ch = grid[r][c];
   if (ch === " ") continue;
   const idx = TILEMAP[ch];
   if (idx == null) continue;
   if (ch === "?") {
    const s = reducedMotion ? 1 : 1 + 0.04 * Math.sin(tick * 0.15),
     o = (TILE * (s - 1)) / 2;
    ctx.drawImage(
     tileCells[idx],
     c * TILE - o,
     r * TILE - o,
     TILE * s,
     TILE * s,
    );
   } else ctx.drawImage(tileCells[idx], c * TILE, r * TILE, TILE, TILE);
  }
 if (goalC) {
  ctx.drawImage(goalC, goal.x, goal.y, goal.w, goal.h);
  if (!bossGone && (reducedMotion || (tick >> 4) & 1)) {
   ctx.fillStyle = "#ff2222";
   ctx.fillRect(goal.x + 52, goal.y - 14, 8, 8);
  }
  if (bossGone) {
   const gy = reducedMotion
    ? goal.y - 18
    : goal.y - 18 + Math.sin(tick * 0.1) * 3;
   ctx.textAlign = "center";
   ctx.font = '8px "Press Start 2P",monospace';
   ctx.fillStyle = "#7ef0ff";
   ctx.fillText("▼ ENTRA A LA CONSOLA", goal.x + goal.w / 2, gy);
   ctx.textAlign = "left";
  }
 }
 for (const p of pops) spr(itemCells[0], p.x + 16, p.y + 16, 36);
 for (const it of items) {
  if (it.taken) continue;
  const yy = it.y + (reducedMotion ? 0 : Math.sin(it.bob) * 4);
  const hgt = [36, 42, 42, 34][it.t];
  spr(itemCells[it.t], it.x + 16, yy + 18, hgt);
 }
 if (bossCells)
  for (const w of waves)
   spr(
    bossCells[3],
    w.x + 18,
    w.y + 19,
    reducedMotion ? 40 : 40 + Math.sin(w.ph) * 6,
   );
 for (const f of foes) {
  const cell = foeCells[(f.t === "E" ? 0 : 2) + ((f.fr >> 4) & 1)];
  ctx.save();
  if (f.fly) {
   ctx.translate(f.x + 18, f.y + 21);
   ctx.scale(1, -1);
   ctx.drawImage(cell, -24, -24, 48, 48);
  } else if (f.dead) {
   ctx.globalAlpha = Math.max(0, 1 - f.dead / 45);
   ctx.drawImage(cell, f.x - 6, f.y + f.h * 0.5, 48, 24);
  } else ctx.drawImage(cell, f.x - 6, f.y - 4, 48, 48);
  ctx.restore();
 }
 if (boss && bossCells) {
  const b = boss;
  let f = 0;
  if (b.state === "scream" || b.state === "telegraph") f = 1;
  if (b.flash > 0 || b.state === "stun") f = 2;
  ctx.save();
  ctx.translate(b.x + 48, b.y + 44);
  if (b.state === "dead") {
   ctx.rotate(b.deadT * 0.04);
   ctx.globalAlpha = Math.max(0, 1 - b.deadT / 140);
   ctx.drawImage(bossCells[2], -62, -62, 124, 124);
  } else {
   if (b.flash > 0 && !reducedMotion && (tick >> 1) % 2) ctx.globalAlpha = 0.5;
   const cn = bossCells[f],
    pulse =
     b.state === "telegraph" && !reducedMotion
      ? 1 + 0.05 * Math.sin(tick * 0.45)
      : 1;
   const hh = 128 * pulse,
    ww = (hh * cn.width) / cn.height;
   ctx.drawImage(cn, -ww / 2, -hh / 2, ww, hh);
  }
  ctx.restore();
 }
 drawPlayer();
 for (const p of parts) {
  ctx.globalAlpha = Math.min(1, p.life / 20);
  ctx.fillStyle = p.col;
  ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
 }
 ctx.globalAlpha = 1;
 ctx.font = '8px "Press Start 2P",monospace';
 ctx.textAlign = "left";
 for (const f of floats) {
  ctx.globalAlpha = Math.min(1, f.life / 30);
  ctx.fillStyle = "#ffd23f";
  ctx.fillText(f.txt, f.x, f.y);
 }
 ctx.globalAlpha = 1;
 ctx.restore();
 drawHUD();
 if (state === "title") drawTitle();
 if (state === "pause") overlay("PAUSA", "P PARA CONTINUAR", "#7ef0ff");
 if (state === "gameover")
  overlay(
   "GAME OVER",
   "EL SHOW SE QUEDO SIN SONIDO - ENTER PARA REINTENTAR",
   "#ff5566",
  );
 if (state === "win") drawWin();
}
function drawPlayer() {
 const px = Math.round(player.x + player.w / 2),
  py = Math.round(player.y + player.h / 2);
 // Shadow: find closest solid tile below player
 if (state !== "dying") {
  let sy = player.y + player.h;
  for (let i = 0; i < 20; i++) {
   const r = Math.floor(sy / TILE);
   const c = Math.floor((player.x + player.w / 2) / TILE);
   if (isSolid(tileAt2(c, r))) break;
   sy += TILE;
  }
  const dist = Math.max(0, sy - (player.y + player.h));
  const alpha = Math.max(0.15, 0.55 - dist / 200);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0," + alpha.toFixed(2) + ")";
  ctx.beginPath();
  ctx.ellipse(
   px,
   sy,
   Math.max(0.5, 14 - dist / 30),
   Math.max(0.5, 4 - dist / 60),
   0,
   0,
   Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();
 }
 if (player.boost > 0) {
  ctx.save();
  ctx.globalAlpha = reducedMotion ? 0.25 : 0.22 + 0.1 * Math.sin(tick * 0.3);
  ctx.fillStyle = "#ffd23f";
  ctx.beginPath();
  ctx.arc(px, py, 32, 0, 7);
  ctx.fill();
  ctx.restore();
 }
 let fr = 0,
  row = 0,
  col = 0;
 if (state === "dying") {
  row = 3;
  col = 3;
 } else if (!player.onG) {
  if (player.vy < -1) {
   row = 3;
   col = 1;
  } else {
   row = 3;
   col = 2;
  }
 } else if (player.skid) {
  row = 3;
  col = 0;
 } else if (player.crouch) {
  row = 3;
  col = 0;
 } else if (Math.abs(player.vx) > 2.9) {
  row = 2;
  col = (player.anim >> 2) & 3;
 } else if (Math.abs(player.vx) > 0.3) {
  row = 1;
  col = (player.anim >> 3) & 3;
 } else {
  row = 0;
  col = reducedMotion
   ? 0
   : IDLE_FRAMES[Math.floor(player.anim / 24) % IDLE_FRAMES.length];
 }
 fr = row * 4 + col;
 const cn = heroCells[fr] || heroCells[0];
 if (!cn) return;
 const sc = 66 / heroRefH,
  w = cn.width * sc,
  h = cn.height * sc;
 ctx.save();
 if (player.inv > 0 && !reducedMotion && (tick >> 2) % 2 === 0)
  ctx.globalAlpha = 0.35;
 ctx.translate(px, py);
 ctx.scale(player.face, 1);
 ctx.drawImage(
  cn,
  Math.round(-w / 2),
  Math.round(30 - h),
  Math.round(w),
  Math.round(h),
 );
 ctx.restore();
 if (player.star > 0)
  for (let i = 0; i < 3; i++) {
   const a = (reducedMotion ? 0 : tick * 0.15) + i * 2.09;
   ctx.fillStyle = ["#ffd23f", "#7ef0ff", "#ff7edb"][i];
   ctx.fillRect(px + Math.cos(a) * 30 - 3, py + Math.sin(a) * 30 - 3, 6, 6);
  }
}
function drawHUD() {
 ctx.font = '12px "Press Start 2P",monospace';
 ctx.textAlign = "left";
 ctx.fillStyle = "#fff";
 ctx.fillText("SCORE " + String(score).padStart(6, "0"), 16, 26);
 if (itemCells) spr(itemCells[0], 310, 16, 20);
 ctx.fillText("x" + String(mics).padStart(2, "0"), 328, 26);
 if (heroCells[0]) spr(heroCells[0], 480, 15, 26);
 ctx.fillText("x" + lives, 502, 26);
 ctx.textAlign = "right";
 ctx.fillText("TIME " + timer, 944, 26);
 ctx.textAlign = "left";
 if (boss && boss.state !== "dead") {
  ctx.textAlign = "center";
  ctx.fillStyle = "#ff5566";
  ctx.font = '10px "Press Start 2P",monospace';
  ctx.fillText("EL FEEDBACK · PISADAS RESTANTES", 480, 54);
  const hpWidth = boss.maxHp * 18 + (boss.maxHp - 1) * 4,
   hpX = 480 - hpWidth / 2;
  for (let i = 0; i < boss.maxHp; i++) {
   ctx.fillStyle = i < boss.hp ? "#ff2222" : "#3a3a4a";
   ctx.fillRect(hpX + i * 22, 60, 18, 8);
  }
  let msg = "ESQUIVA Y ESPERA EL GOLPE AL PISO",
   col = "#fff";
  if (boss.state === "telegraph" || boss.state === "slam") {
   msg = "¡VA A CAER! SALI DEL IMPACTO";
   col = "#ffd23f";
  } else if (boss.state === "stun") {
   msg = "¡AHORA: PISALO!";
   col = "#7ef0ff";
  } else if (boss.state === "recover") {
   msg = "SE ESTA RECUPERANDO";
   col = "#9aa0b5";
  } else if (boss.state === "scream") {
   msg = "SALTA LAS ONDAS DE FEEDBACK";
   col = "#ffd23f";
  }
  ctx.fillStyle = col;
  ctx.font = '8px "Press Start 2P",monospace';
  ctx.fillText(msg, 480, 84);
  if (boss.hint > 0) {
   ctx.fillStyle = "rgba(5,5,15,0.82)";
   ctx.fillRect(220, 100, 520, 48);
   ctx.fillStyle = "#fff";
   ctx.font = '9px "Press Start 2P",monospace';
   ctx.fillText(
    "ESQUIVA → ESPERA QUE CAIGA → PISALO " + boss.maxHp + " VECES",
    480,
    129,
   );
  }
  ctx.textAlign = "left";
 }
}
function drawTitle() {
 ctx.fillStyle = "rgba(5,5,15,0.6)";
 ctx.fillRect(0, 0, 960, 576);
 ctx.textAlign = "center";
 ctx.fillStyle = "#000";
 ctx.font = '44px "Press Start 2P",monospace';
 ctx.fillText("EVENT BROS", 484, 154);
 ctx.fillStyle = "#ffd23f";
 ctx.fillText("EVENT BROS", 480, 150);
 ctx.fillStyle = "#7ef0ff";
 ctx.font = '13px "Press Start 2P",monospace';
 ctx.fillText("SUPER TECNICO DE EVENTOS", 480, 190);
 if (heroCells[0]) spr(heroCells[0], 300, 300, 110);
 if (foeCells) {
  spr(foeCells[0], 440, 305, 90);
  spr(foeCells[2], 560, 305, 90);
 }
 if (bossCells) spr(bossCells[0], 690, 300, 110);
 if (reducedMotion || (tick >> 5) & 1) {
  ctx.fillStyle = "#fff";
  ctx.font = '14px "Press Start 2P",monospace';
  ctx.fillText("PRESIONA ENTER O TOCA PARA EMPEZAR", 480, 422);
 }
 ctx.fillStyle = "#9aa0b5";
 ctx.font = '9px "Press Start 2P",monospace';
 ctx.fillText(
  "FLECHAS/A-D MOVER · ESPACIO SALTAR · S/ABAJO AGACHARSE · P PAUSA · M SONIDO",
  480,
  458,
 );
 ctx.fillText("JUNTA MICROS Y LLEGA A LA CONSOLA FOH", 480, 482);
 ctx.fillText(
  "JEFE: ESQUIVA · ESPERA QUE CAIGA · PISALO " + BOSS_MAX_HP + " VECES",
  480,
  506,
 );
}
function overlay(t1, t2, col) {
 ctx.fillStyle = "rgba(5,5,15,0.72)";
 ctx.fillRect(0, 0, 960, 576);
 ctx.textAlign = "center";
 ctx.fillStyle = col;
 ctx.font = '34px "Press Start 2P",monospace';
 ctx.fillText(t1, 480, 250);
 ctx.fillStyle = "#fff";
 ctx.font = '11px "Press Start 2P",monospace';
 if (reducedMotion || (tick >> 5) & 1) ctx.fillText(t2, 480, 310);
}
function drawWin() {
 ctx.fillStyle = "rgba(5,5,15,0.72)";
 ctx.fillRect(0, 0, 960, 576);
 ctx.textAlign = "center";
 ctx.fillStyle = "#ffd23f";
 ctx.font = '34px "Press Start 2P",monospace';
 ctx.fillText("¡SHOW SALVADO!", 480, 210);
 ctx.fillStyle = "#7ef0ff";
 ctx.font = '13px "Press Start 2P",monospace';
 ctx.fillText("BONUS TIEMPO: " + bonus, 480, 270);
 ctx.fillStyle = "#fff";
 ctx.fillText("SCORE FINAL: " + score, 480, 300);
 if (reducedMotion || (tick >> 5) & 1)
  ctx.fillText("ENTER PARA TOCAR DE NUEVO", 480, 360);
}

/* ========= LOOP ========= */
function update() {
 tick++;
 if (shake > 0) shake--;
 if (state === "play") {
  updPlayer();
  updFoes();
  updBoss();
  updWaves();
  updItems();
  updPops();
  updFloats();
  updParts();
  camFollow();
  const timerResult = advanceTimer(timer, tAcc);
  timer = timerResult.timer;
  tAcc = timerResult.timerTicks;
  if (timerResult.expired) kill();
  if (state === "play") checkWin();
 } else if (state === "dying") {
  player.vy += G_DN;
  player.y += player.vy;
  stateTimer++;
  updFloats();
  updParts();
  if (stateTimer > 110) afterDeath();
 } else if (state === "title") {
  camX = reducedMotion ? 0 : (tick * 0.6) % (LW * TILE - 960);
 }
 if (tick % 30 === 0) updateGameplayState();
 if (pendingGameplayAnnouncement && tick - lastGameplayAnnouncementTick >= 60) {
  setStatus(pendingGameplayAnnouncement);
  pendingGameplayAnnouncement = "";
  lastGameplayAnnouncementTick = tick;
 }
}
function loop(now) {
 requestAnimationFrame(loop);
 if (!lastFrame) lastFrame = now;
 frameAcc += Math.min(MAX_FRAME_MS, Math.max(0, now - lastFrame));
 lastFrame = now;
 while (frameAcc >= STEP_MS) {
  update();
  frameAcc -= STEP_MS;
 }
 draw();
}

/* ========= INPUT ========= */
function clearInput() {
 input.left = false;
 input.right = false;
 input.jump = false;
 input.down = false;
 jHeld = false;
}
function startNow() {
 if (!ready) return;
 clearInput();
 fullReset();
 state = transition(state, "start");
 lastFrame = performance.now();
 frameAcc = 0;
 startMusic();
 setStatus("Partida iniciada. Tres vidas y 400 segundos.");
 syncState();
}
function togglePause() {
 if (state === "play") {
  state = transition(state, "pause");
  stopMusic();
  setStatus("Juego en pausa.");
 } else if (state === "pause") {
  state = transition(state, "pause");
  startMusic();
  setStatus("Juego reanudado.");
 }
 syncState();
}
addEventListener("keydown", (e) => {
 if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key))
  e.preventDefault();
 audio();
 if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") input.left = true;
 if (e.key === "ArrowRight" || e.key === "d" || e.key === "D")
  input.right = true;
 if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") input.down = true;
 if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W")
  input.jump = true;
 if (e.key === "m" || e.key === "M") toggleMute();
 if (e.key === "p" || e.key === "P") togglePause();
 if (
  (e.key === "Enter" || e.key === " ") &&
  (state === "title" || state === "gameover" || state === "win")
 )
  startNow();
});
addEventListener("keyup", (e) => {
 if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A")
  input.left = false;
 if (e.key === "ArrowRight" || e.key === "d" || e.key === "D")
  input.right = false;
 if (e.key === "ArrowDown" || e.key === "s" || e.key === "S")
  input.down = false;
 if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W")
  input.jump = false;
});
function bindBtn(id, k) {
 const el = document.querySelector("#" + id);
 if (!el) return;
 const release = (e) => {
  e.preventDefault();
  input[k] = false;
  el.setAttribute("aria-pressed", "false");
 };
 el.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  audio();
  el.setPointerCapture?.(e.pointerId);
  input[k] = true;
  el.setAttribute("aria-pressed", "true");
  if (state === "title" || state === "gameover" || state === "win") startNow();
 });
 ["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) =>
  el.addEventListener(ev, release),
 );
}
bindBtn("bl", "left");
bindBtn("br", "right");
bindBtn("bj", "jump");
bindBtn("bd", "down");
pauseButton.addEventListener("click", () => {
 audio();
 togglePause();
});
muteButton.addEventListener("click", () => {
 audio();
 toggleMute();
});
retryButton.addEventListener("click", boot);
cv.addEventListener("pointerdown", () => {
 audio();
 if (state === "title" || state === "gameover" || state === "win") startNow();
});
addEventListener("blur", () => {
 clearInput();
 if (state === "play") togglePause();
});
document.addEventListener("visibilitychange", () => {
 if (document.hidden) {
  clearInput();
  if (state === "play") togglePause();
 }
 lastFrame = performance.now();
 frameAcc = 0;
});
if (document.fonts) document.fonts.load('12px "Press Start 2P"');
syncState();
if (ctx) {
 requestAnimationFrame(loop);
 boot();
} else showUnsupportedCanvas();
