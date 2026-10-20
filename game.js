'use strict';
(() => {
  // =========================================================
  //  A ÚLTIMA P1 — soulslike de faculdade
  // =========================================================
  const TAU = Math.PI * 2;
  const W = 640;
  const H = 360;
  const BOUNDS = { x0: 38, y0: 46, x1: 602, y1: 330 };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };
  const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
  const angleDiff = (a, b) => {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const segDist = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = clamp(t, 0, 1);
    return dist(px, py, x1 + dx * t, y1 + dy * t);
  };

  // ---------------- DOM ----------------
  const $ = id => document.getElementById(id);
  const stage = $('stage');
  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;

  const hud = $('hud');
  const playerHpFill = $('playerHpFill');
  const playerHpGhost = $('playerHpGhost');
  const bossHpFill = $('bossHpFill');
  const bossHpGhost = $('bossHpGhost');
  const bossHud = $('bossHud');
  const flaskRow = $('flaskRow');
  const damageFlash = $('damageFlash');
  const lowHpEl = $('lowHp');
  const titleScreen = $('titleScreen');
  const deathScreen = $('deathScreen');
  const winScreen = $('winScreen');
  const pauseScreen = $('pauseScreen');
  const deathStats = $('deathStats');
  const winStats = $('winStats');
  const toastEl = $('toast');
  const stickZone = $('stickZone');
  const stickKnob = $('stickKnob');
  const healBtn = $('btnHeal');
  const healCountEl = $('healCount');
  const btnPause = $('btnPause');

  const isTouch =
    /[?&]touch=1/.test(location.search) ||
    window.matchMedia('(pointer: coarse)').matches ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (isTouch) document.body.classList.add('touch');

  function fitStage() {
    stage.style.fontSize = (stage.clientWidth / 64) + 'px';
  }
  window.addEventListener('resize', fitStage);
  fitStage();

  let fsPending = false;
  function tryFullscreen() {
    if (!isTouch) return;
    try {
      const isFs = document.fullscreenElement || document.webkitFullscreenElement;
      if (!isFs && !fsPending) {
        const el = document.documentElement;
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        if (req) {
          fsPending = true;
          const isWebkit = !el.requestFullscreen && !!el.webkitRequestFullscreen;
          const p = isWebkit ? req.call(el) : req.call(el, { navigationUI: 'hide' });
          if (p && p.catch) p.catch(() => { fsPending = false; });
          else fsPending = false;
        }
      }
      if (screen.orientation && screen.orientation.lock) {
        const lp = screen.orientation.lock('landscape');
        if (lp && lp.catch) lp.catch(() => {});
      }
    } catch (e) {
      fsPending = false;
    }
  }
  const onFullscreenChange = () => {
    fsPending = false;
    setTimeout(fitStage, 120);
  };
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  // ---------------- Áudio ----------------
  const AudioSys = (() => {
    let ac = null, master = null, drone = null, muted = false, noiseBuf = null;

    function init() {
      if (ac) {
        if (ac.state === 'suspended') ac.resume();
        return;
      }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        master = ac.createGain();
        master.gain.value = muted ? 0 : 0.5;
        master.connect(ac.destination);
        buildNoise();
        startDrone();
      } catch (e) { /* sem áudio, segue o jogo */ }
    }

    function buildNoise() {
      noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 1.2), ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }

    function startDrone() {
      const g = ac.createGain();
      g.gain.value = 0.03;
      g.connect(master);
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 200;
      lp.connect(g);
      const o1 = ac.createOscillator();
      const o2 = ac.createOscillator();
      o1.type = 'sine'; o1.frequency.value = 55;
      o2.type = 'triangle'; o2.frequency.value = 82.4;
      o1.connect(lp); o2.connect(lp);
      o1.start(); o2.start();
      drone = { o1, o2, g };
    }

    function tone(freq, dur, type, vol, slide, delay) {
      if (!ac) return;
      const t0 = ac.currentTime + (delay || 0);
      const o = ac.createOscillator();
      o.type = type || 'square';
      o.frequency.setValueAtTime(Math.max(20, freq), t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol || 0.15), t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + dur + 0.03);
    }

    function noise(dur, vol, freq, type, delay, slide) {
      if (!ac || !noiseBuf) return;
      const t0 = ac.currentTime + (delay || 0);
      const s = ac.createBufferSource();
      s.buffer = noiseBuf;
      const f = ac.createBiquadFilter();
      f.type = type || 'lowpass';
      f.frequency.setValueAtTime(freq || 1200, t0);
      if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t0 + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol || 0.15), t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t0); s.stop(t0 + dur + 0.02);
    }

    const api = {
      init,
      toggleMute() {
        muted = !muted;
        if (master) master.gain.value = muted ? 0 : 0.5;
        showToast(muted ? 'SOM DESLIGADO' : 'SOM LIGADO', 900);
      },
      playerSwing() { noise(0.13, 0.14, 2600, 'bandpass', 0, 700); tone(220, 0.08, 'triangle', 0.05, 90); },
      hitBoss() { tone(150, 0.1, 'square', 0.16, 55); noise(0.09, 0.22, 1000, 'lowpass'); },
      playerHurt() { tone(95, 0.28, 'sawtooth', 0.18, 38); noise(0.16, 0.2, 520, 'lowpass'); },
      roll() { noise(0.2, 0.1, 900, 'lowpass', 0, 260); },
      heal() { tone(392, 0.16, 'sine', 0.12); tone(523, 0.22, 'sine', 0.1, null, 0.12); tone(784, 0.3, 'sine', 0.08, null, 0.24); },
      telegraph(kind) {
        if (kind === 'charge') { tone(70, 0.5, 'sawtooth', 0.1, 110); noise(0.4, 0.08, 400, 'lowpass'); }
        else if (kind === 'slam') { tone(60, 0.4, 'square', 0.12, 90); }
        else if (kind === 'spin') { tone(90, 0.6, 'sawtooth', 0.09, 160); }
        else { tone(110, 0.35, 'square', 0.07, 180); }
      },
      slam() { tone(55, 0.4, 'square', 0.24, 30); noise(0.35, 0.3, 380, 'lowpass'); },
      charge() { noise(0.5, 0.16, 700, 'lowpass', 0, 200); },
      phase2() {
        tone(80, 1.1, 'sawtooth', 0.2, 40);
        tone(120, 1.3, 'square', 0.08, 60, 0.1);
        if (drone) {
          drone.o1.frequency.linearRampToValueAtTime(66, ac.currentTime + 2);
          drone.o2.frequency.linearRampToValueAtTime(99, ac.currentTime + 2);
          drone.g.gain.linearRampToValueAtTime(0.05, ac.currentTime + 2);
        }
      },
      playerDeath() { tone(140, 1.6, 'sawtooth', 0.2, 30); noise(1.2, 0.2, 300, 'lowpass'); },
      bossDeath() { tone(220, 1.8, 'triangle', 0.16, 40); noise(1.4, 0.25, 500, 'lowpass'); tone(70, 2.4, 'sine', 0.18, 30, 0.2); },
      win() { [392, 494, 587, 784].forEach((f, i) => tone(f, 0.6, 'triangle', 0.09, null, i * 0.16)); }
    };
    return api;
  })();

  // ---------------- Estado ----------------
  const game = {
    mode: 'title', // title | playing | dead | win
    paused: false,
    time: 0,
    fightTime: 0,
    attempts: 0,
    shake: 0,
    hitstop: 0,
    flash: 0,
    deathTimer: 0,
    winTimer: 0
  };

  let player, boss;
  let particles, slashes, rings, decals;
  let bossHpGhostVal = 0, playerHpGhostVal = 0;
  let decalSeed = 1;

  const keys = Object.create(null);
  const key = c => !!keys[c];
  const touchVec = { x: 0, y: 0, active: false };

  // ---------------- Textos ----------------
  let toastTimer = null;
  function showToast(text, ms) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 1900);
  }

  // ---------------- Reset ----------------
  function resetGame() {
    player = {
      x: 320, y: 288, r: 7,
      hp: 100, maxHp: 100, flasks: 5,
      facing: -Math.PI / 2,
      state: 'free', stateT: 0,
      invuln: 0, rollCd: 0, rollDir: -Math.PI / 2,
      atkStage: 0, atkT: 0, atkHit: false, atkDir: -Math.PI / 2,
      atkQueued: false, slashSpawned: false, comboT: 0,
      anim: 0, moving: false, flash: 0,
      healDone: false, vx: 0, vy: 0,
      dead: false, deathT: 0
    };

    boss = {
      x: 320, y: 118, r: 16,
      hp: 560, maxHp: 560,
      facing: Math.PI / 2,
      state: 'idle', stateT: 0, cool: 1.4,
      atk: null, flash: 0, poise: 0, poiseMax: 112,
      phase2: false, roarT: 0, anim: 0, walk: 0,
      boardAng: Math.PI / 2 + 1.4,
      strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 0,
      lastAttack: '', dead: false, deathT: 0
    };

    particles = [];
    slashes = [];
    rings = [];
    decals = [];
    decalSeed = 7;
    bossHpGhostVal = boss.hp;
    playerHpGhostVal = player.hp;
    game.shake = 0;
    game.hitstop = 0;
    game.flash = 0;
    game.fightTime = 0;
    game.deathTimer = 0;
    game.winTimer = 0;
    game.paused = false;
    updateFlasks();
    setHudVisible(false);
  }

  function setHudVisible(v) {
    hud.classList.toggle('hidden', !v);
  }

  function startGame() {
    resetGame();
    game.mode = 'playing';
    game.attempts++;
    stage.classList.remove('low-hp');
    document.body.classList.add('in-game');
    resetTouchInput();
    titleScreen.classList.add('hidden');
    deathScreen.classList.add('hidden');
    winScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    setHudVisible(true);
    bossHud.classList.remove('phase2');
    AudioSys.init();
    tryFullscreen();
    showToast('PROFESSOR DABOIT BLOQUEIA A SAÍDA', 2200);
  }

  function togglePause() {
    if (game.mode !== 'playing') return;
    game.paused = !game.paused;
    if (game.paused) resetTouchInput();
    pauseScreen.classList.toggle('hidden', !game.paused);
  }

  function onPlayerDeath() {
    game.deathTimer = 1.9;
    game.flash = 1;
    AudioSys.playerDeath();
  }

  function finishDeath() {
    game.mode = 'dead';
    setHudVisible(false);
    document.body.classList.remove('in-game');
    const pct = Math.round((boss.hp / boss.maxHp) * 100);
    deathStats.textContent =
      `Daboit ainda tinha ${pct}% de vida · ${Math.floor(game.fightTime)}s de aula · tentativa ${game.attempts}`;
    deathScreen.classList.remove('hidden');
  }

  function onBossDeath() {
    boss.dead = true;
    boss.deathT = 0;
    game.winTimer = 3.0;
    game.hitstop = 0.12;
    game.shake = 12;
    AudioSys.bossDeath();
    for (let i = 0; i < 50; i++) {
      spawnParticle(boss.x + rand(-16, 16), boss.y - rand(0, 34), {
        vx: rand(-90, 90), vy: rand(-140, 30), life: rand(0.6, 1.6),
        size: randi(1, 3), color: Math.random() < 0.5 ? '#e9e3d2' : '#c9b995',
        gravity: 60, drag: 1.5
      });
    }
    addRing(boss.x, boss.y - 10, 10, 130, 0.9, 'rgba(240,230,200,0.5)', 2);
  }

  function finishWin() {
    game.mode = 'win';
    setHudVisible(false);
    document.body.classList.remove('in-game');
    winStats.textContent =
      `${Math.floor(game.fightTime)}s de luta · ${game.attempts} tentativa${game.attempts > 1 ? 's' : ''} · ${player.flasks} cura${player.flasks === 1 ? '' : 's'} restante${player.flasks === 1 ? '' : 's'}`;
    winScreen.classList.remove('hidden');
    AudioSys.win();
  }

  function updateFlasks() {
    flaskRow.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const d = document.createElement('div');
      d.className = 'flask' + (i < player.flasks ? '' : ' empty');
      d.innerHTML = `<svg viewBox="0 0 10 14" shape-rendering="crispEdges">
        <path d="M3 0h4v1H3zM3 1h4v3l2 3v6H1V7l2-3z" fill="#171310" stroke="#6b5b3e" stroke-width="1"/>
        <path d="M1 8h8v4H1z" fill="#d89a2c"/>
        <path d="M2 9h3v1H2z" fill="#f3c76b"/>
        <path d="M3 2h4v2H3z" fill="#8d7a55"/>
      </svg>`;
      flaskRow.appendChild(d);
    }
    if (healCountEl) healCountEl.textContent = player.flasks;
    if (healBtn) healBtn.classList.toggle('spent', player.flasks <= 0);
  }

  // ---------------- Partículas ----------------
  function spawnParticle(x, y, o) {
    particles.push({
      x, y,
      vx: o.vx || 0, vy: o.vy || 0,
      life: o.life || 0.5, maxLife: o.life || 0.5,
      size: o.size || 2, color: o.color || '#fff',
      gravity: o.gravity || 0, drag: o.drag || 0,
      shrink: o.shrink !== false
    });
  }

  function spawnDust(x, y, n, strong) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(10, strong ? 90 : 35);
      spawnParticle(x + rand(-4, 4), y + rand(-2, 2), {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 12,
        life: rand(0.25, 0.6), size: randi(1, 2),
        color: Math.random() < 0.5 ? '#7d8278' : '#5d625a',
        gravity: 12, drag: 3
      });
    }
  }

  function spawnSparks(x, y, dir, n, color) {
    for (let i = 0; i < n; i++) {
      const a = dir + rand(-0.9, 0.9);
      const s = rand(60, 190);
      spawnParticle(x, y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(0.15, 0.4), size: randi(1, 2),
        color: color || '#f2ecd8', gravity: 90, drag: 2
      });
    }
  }

  function spawnBlood(x, y, dir) {
    for (let i = 0; i < 14; i++) {
      const a = dir + rand(-1.1, 1.1);
      const s = rand(40, 150);
      spawnParticle(x, y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(0.25, 0.7), size: randi(1, 3),
        color: Math.random() < 0.6 ? '#7d1713' : '#a8271e',
        gravity: 120, drag: 1.5
      });
    }
  }

  function spawnPaper(x, y, n) {
    for (let i = 0; i < n; i++) {
      spawnParticle(x + rand(-10, 10), y + rand(-10, 6), {
        vx: rand(-70, 70), vy: rand(-120, -20),
        life: rand(0.6, 1.4), size: randi(2, 4),
        color: Math.random() < 0.5 ? '#d9d2bf' : '#bdb49c',
        gravity: 40, drag: 1.2
      });
    }
  }

  function addRing(x, y, r0, r1, life, color, width) {
    rings.push({ x, y, r0, r1, life, maxLife: life, color, width: width || 2 });
  }

  function addDecal(x, y, seedOffset) {
    decals.push({ x, y, seed: decalSeed += (seedOffset || 13) });
    if (decals.length > 26) decals.shift();
  }

  function resolveBodies() {
    const dx = player.x - boss.x;
    const dy = player.y - boss.y;
    const d = Math.hypot(dx, dy) || 1;
    const min = player.r + boss.r + 2;
    if (d < min) {
      const push = (min - d);
      const nx = dx / d, ny = dy / d;
      player.x += nx * push * 0.75;
      player.y += ny * push * 0.75;
      boss.x -= nx * push * 0.25;
      boss.y -= ny * push * 0.25;
      player.x = clamp(player.x, BOUNDS.x0, BOUNDS.x1);
      player.y = clamp(player.y, BOUNDS.y0, BOUNDS.y1);
      boss.x = clamp(boss.x, BOUNDS.x0 + 8, BOUNDS.x1 - 8);
      boss.y = clamp(boss.y, BOUNDS.y0 + 8, BOUNDS.y1 - 8);
    }
  }

  // ---------------- Cenário ----------------
  let floorCanvas;
  function buildArena() {
    floorCanvas = document.createElement('canvas');
    floorCanvas.width = W;
    floorCanvas.height = H;
    const g = floorCanvas.getContext('2d');
    g.imageSmoothingEnabled = false;

    // vazio
    g.fillStyle = '#080b0d';
    g.fillRect(0, 0, W, H);

    // piso
    const fx = 26, fy = 26, fw = W - 52, fh = H - 52;
    g.fillStyle = '#2a322e';
    g.fillRect(fx, fy, fw, fh);

    const T = 24;
    for (let y = fy; y < fy + fh; y += T) {
      for (let x = fx; x < fx + fw; x += T) {
        const odd = ((x - fx) / T + (y - fy) / T) % 2 === 0;
        g.fillStyle = odd ? '#2c3430' : '#272e2b';
        g.fillRect(x, y, T, T);
        g.fillStyle = 'rgba(255,255,255,0.022)';
        g.fillRect(x, y, T, 1);
        g.fillStyle = 'rgba(0,0,0,0.08)';
        g.fillRect(x, y + T - 1, T, 1);
      }
    }

    // rejunte
    g.strokeStyle = 'rgba(10,12,12,0.5)';
    g.lineWidth = 1;
    for (let x = fx; x <= fx + fw; x += T) {
      g.beginPath(); g.moveTo(x + 0.5, fy); g.lineTo(x + 0.5, fy + fh); g.stroke();
    }
    for (let y = fy; y <= fy + fh; y += T) {
      g.beginPath(); g.moveTo(fx, y + 0.5); g.lineTo(fx + fw, y + 0.5); g.stroke();
    }

    // manchas, riscos e speckles
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 260; i++) {
      const x = fx + rnd() * fw;
      const y = fy + rnd() * fh;
      g.fillStyle = rnd() < 0.5 ? 'rgba(10,14,12,0.16)' : 'rgba(150,160,150,0.035)';
      g.fillRect(Math.floor(x), Math.floor(y), 1 + Math.floor(rnd() * 3), 1 + Math.floor(rnd() * 2));
    }
    for (let i = 0; i < 7; i++) {
      let x = fx + 40 + rnd() * (fw - 80);
      let y = fy + 40 + rnd() * (fh - 80);
      g.strokeStyle = 'rgba(8,10,9,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        x += rnd() * 16 - 8;
        y += rnd() * 12 - 4;
        g.lineTo(x, y);
      }
      g.stroke();
    }

    // papéis espalhados
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(fx + 24 + rnd() * (fw - 48));
      const y = Math.floor(fy + 24 + rnd() * (fh - 48));
      g.fillStyle = 'rgba(220,214,196,0.5)';
      g.fillRect(x, y, 4, 5);
      g.fillStyle = 'rgba(160,155,140,0.4)';
      g.fillRect(x + 1, y + 1, 2, 1);
      g.fillRect(x + 1, y + 3, 3, 1);
    }

    // poças de luz
    const lights = [
      { x: 150, y: 90, r: 96 },
      { x: 490, y: 100, r: 88 },
      { x: 320, y: 280, r: 120 }
    ];
    for (const l of lights) {
      const grad = g.createRadialGradient(l.x, l.y, 4, l.x, l.y, l.r);
      grad.addColorStop(0, 'rgba(255, 228, 170, 0.11)');
      grad.addColorStop(1, 'rgba(255, 228, 170, 0)');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(l.x, l.y, l.r, l.r * 0.7, 0, 0, TAU);
      g.fill();
    }

    // paredes
    g.fillStyle = '#12181c';
    g.fillRect(0, 0, W, 26);
    g.fillRect(0, H - 26, W, 26);
    g.fillRect(0, 0, 26, H);
    g.fillRect(W - 26, 0, 26, H);

    // bordas internas / rodapé
    g.fillStyle = '#1d252a';
    g.fillRect(26, 26, W - 52, 2);
    g.fillRect(26, 26, 2, H - 52);
    g.fillRect(W - 28, 26, 2, H - 52);
    g.fillRect(26, H - 28, W - 52, 2);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(26, 28, W - 52, 2);
    g.fillRect(28, 26, 2, H - 52);
    g.fillRect(W - 30, 26, 2, H - 52);

    // tijolos das paredes
    g.fillStyle = 'rgba(255,255,255,0.025)';
    for (let x = 26; x < W - 26; x += 32) {
      g.fillRect(x, 2, 1, 20);
      g.fillRect(x + 14, H - 22, 1, 18);
    }
    for (let y = 0; y < H; y += 16) {
      g.fillRect(2, y, 20, 1);
      g.fillRect(W - 22, y + 8, 20, 1);
    }

    // lousa
    g.fillStyle = '#4b3a28';
    g.fillRect(168, 1, 304, 25);
    g.fillStyle = '#22312b';
    g.fillRect(173, 4, 294, 18);
    g.fillStyle = 'rgba(190,210,195,0.16)';
    g.fillRect(173, 4, 294, 1);
    // giz
    g.fillStyle = 'rgba(214,226,212,0.55)';
    g.fillRect(184, 8, 3, 11);
    g.fillRect(187, 8, 5, 2);
    g.fillRect(187, 12, 4, 2);
    g.fillRect(192, 8, 2, 11);
    g.fillRect(198, 8, 7, 1);
    g.fillRect(210, 8, 1, 10);
    g.fillRect(213, 16, 7, 1);
    // rabiscos de aula
    g.fillStyle = 'rgba(206,220,206,0.28)';
    for (let i = 0; i < 9; i++) {
      const yy = 8 + Math.floor(rnd() * 11);
      const ww = 8 + Math.floor(rnd() * 30);
      g.fillRect(240 + Math.floor(rnd() * 130), yy, ww, 1);
    }
    g.strokeStyle = 'rgba(206,220,206,0.30)';
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(432, 12, 13, 5, 0, 0, TAU);
    g.stroke();
    g.beginPath();
    g.moveTo(426, 16); g.lineTo(438, 8);
    g.stroke();

    // porta no rodapé
    g.fillStyle = '#2a2118';
    g.fillRect(292, H - 27, 56, 27);
    g.fillStyle = '#3a2d20';
    g.fillRect(295, H - 24, 24, 22);
    g.fillRect(321, H - 24, 24, 22);
    g.fillStyle = '#17110c';
    g.fillRect(319, H - 24, 2, 22);
    g.fillStyle = '#c9b071';
    g.fillRect(313, H - 14, 2, 2);
    g.fillRect(325, H - 14, 2, 2);
    g.fillStyle = 'rgba(110,200,140,0.5)';
    g.fillRect(308, H - 9, 24, 4);
    g.fillStyle = 'rgba(10,18,12,0.8)';
    g.fillRect(311, H - 8, 3, 2);
    g.fillRect(316, H - 8, 2, 2);
    g.fillRect(321, H - 8, 3, 2);
    g.fillRect(326, H - 8, 2, 2);

    // cadeira caída no canto
    g.fillStyle = '#3b3f44';
    g.fillRect(548, 54, 30, 3);
    g.fillRect(548, 62, 30, 2);
    g.fillRect(548, 54, 2, 10);
    g.fillRect(576, 54, 2, 10);
    g.fillStyle = '#2b2e31';
    g.fillRect(552, 57, 22, 5);
    g.fillRect(556, 66, 3, 9);
    g.fillRect(570, 66, 3, 9);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(556, 75, 22, 2);

    // marcas de giz no chão
    g.strokeStyle = 'rgba(210,220,205,0.10)';
    g.beginPath();
    g.ellipse(320, 180, 150, 92, 0, 0, TAU);
    g.stroke();
    g.beginPath();
    g.ellipse(320, 180, 150 - 5, 92 - 4, 0, 0.3, 2.2);
    g.stroke();
  }

  // ---------------- Entrada ----------------
  window.addEventListener('keydown', e => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
      e.preventDefault();
    }
    AudioSys.init();
    if (e.repeat) { keys[e.code] = true; return; }
    keys[e.code] = true;

    if (e.code === 'Enter') {
      if (game.mode === 'title') { startGame(); return; }
      if (game.mode === 'dead' || game.mode === 'win') { startGame(); return; }
    }
    if (e.code === 'KeyR' && (game.mode === 'dead' || game.mode === 'win')) {
      startGame();
      return;
    }
    if ((e.code === 'KeyP' || e.code === 'Escape') && game.mode === 'playing') {
      togglePause();
      return;
    }
    if (e.code === 'KeyM') {
      AudioSys.toggleMute();
      return;
    }
    if (game.mode !== 'playing' || game.paused || !player || player.dead) return;
    if (e.code === 'KeyJ' || e.code === 'KeyK') tryPlayerAttack();
    if (e.code === 'Space') tryPlayerRoll();
    if (e.code === 'KeyE' || e.code === 'KeyQ') tryPlayerHeal();
  });

  window.addEventListener('keyup', e => {
    keys[e.code] = false;
  });

  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
  });

  canvas.addEventListener('pointerdown', e => {
    AudioSys.init();
    if (game.mode === 'playing' && !game.paused && player && !player.dead) {
      if (e.button === 0) tryPlayerAttack();
      if (e.button === 2) tryPlayerRoll();
    }
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  stage.addEventListener('pointerdown', () => {
    if (isTouch) tryFullscreen();
  }, { passive: true });

  // ---------------- Touch ----------------
  let stickId = null;
  let stickCenter = { x: 0, y: 0 };
  let stickMax = 1;

  function resetTouchInput() {
    touchVec.x = 0;
    touchVec.y = 0;
    touchVec.active = false;
    stickId = null;
    if (stickKnob) stickKnob.style.transform = 'translate(0px, 0px)';
  }

  function stickMove(e) {
    const dx = e.clientX - stickCenter.x;
    const dy = e.clientY - stickCenter.y;
    const d = Math.hypot(dx, dy);
    if (d < 4) {
      touchVec.x = 0;
      touchVec.y = 0;
      stickKnob.style.transform = 'translate(0px, 0px)';
      return;
    }
    const ux = dx / d, uy = dy / d;
    const clamped = Math.min(d, stickMax);
    const mag = clamp((d - 4) / (stickMax - 4), 0, 1);
    touchVec.x = ux * mag;
    touchVec.y = uy * mag;
    stickKnob.style.transform = `translate(${Math.round(ux * clamped)}px, ${Math.round(uy * clamped)}px)`;
  }

  function onStickDown(e) {
    if (stickId !== null) return;
    if (game.mode !== 'playing' || game.paused || !player || player.dead) return;
    e.preventDefault();
    AudioSys.init();
    stickId = e.pointerId;
    const base = stickZone.querySelector('.stick-base').getBoundingClientRect();
    stickCenter = { x: base.left + base.width / 2, y: base.top + base.height / 2 };
    stickMax = Math.max(16, base.width * 0.30);
    touchVec.active = true;
    try { stickZone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    stickMove(e);
  }

  if (isTouch) {
    stickZone.addEventListener('pointerdown', onStickDown);
    stickZone.addEventListener('pointermove', e => {
      if (e.pointerId !== stickId) return;
      e.preventDefault();
      stickMove(e);
    });
    const endStick = e => {
      if (e.pointerId !== stickId) return;
      e.preventDefault();
      resetTouchInput();
    };
    stickZone.addEventListener('pointerup', endStick);
    stickZone.addEventListener('pointercancel', endStick);
    window.addEventListener('pointerup', e => { if (e.pointerId === stickId) resetTouchInput(); });
    window.addEventListener('pointercancel', e => { if (e.pointerId === stickId) resetTouchInput(); });

    const bindTouchButton = (el, fn) => {
      if (!el) return;
      el.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        if (game.mode !== 'playing' || game.paused || !player || player.dead) return;
        AudioSys.init();
        fn();
        el.classList.add('press');
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      });
      const release = () => el.classList.remove('press');
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', release);
      el.addEventListener('contextmenu', e => e.preventDefault());
    };

    bindTouchButton($('btnAttack'), tryPlayerAttack);
    bindTouchButton($('btnRoll'), tryPlayerRoll);
    bindTouchButton($('btnHeal'), tryPlayerHeal);

    btnPause.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      if (game.mode === 'playing') togglePause();
    });

    const portraitMQ = window.matchMedia('(orientation: portrait)');
    const onOrient = () => {
      resetTouchInput();
      if (portraitMQ.matches && game.mode === 'playing' && !game.paused) togglePause();
      setTimeout(() => {
        tryFullscreen();
        fitStage();
      }, 260);
    };
    if (portraitMQ.addEventListener) portraitMQ.addEventListener('change', onOrient);
    else if (portraitMQ.addListener) portraitMQ.addListener(onOrient);
    window.addEventListener('orientationchange', onOrient);
  }

  window.addEventListener('blur', resetTouchInput);

  // ---------------- Jogador: golpes ----------------
  const ATK = [
    { windup: 0.09, active: 0.10, recover: 0.19, dmg: 14, reach: 42, arc: 2.25, lunge: 26 },
    { windup: 0.09, active: 0.10, recover: 0.21, dmg: 15, reach: 44, arc: 2.35, lunge: 28 },
    { windup: 0.17, active: 0.12, recover: 0.33, dmg: 26, reach: 52, arc: 2.6, lunge: 52 }
  ];
  ATK.forEach(a => { a.total = a.windup + a.active + a.recover; });
  player = {};

  function tryPlayerAttack() {
    const p = player;
    if (!p || p.dead) return;
    if (p.state === 'attack') {
      if (p.atkStage < 2) p.atkQueued = true;
      return;
    }
    if (p.state !== 'free') return;
    let stage = 0;
    if (p.comboT > 0 && p.lastStage !== undefined && p.lastStage < 2) stage = p.lastStage + 1;
    startPlayerAttack(stage);
  }

  function startPlayerAttack(stage) {
    const p = player;
    const b = boss;
    p.state = 'attack';
    p.stateT = 0;
    p.atkT = 0;
    p.atkStage = stage;
    p.atkHit = false;
    p.slashSpawned = false;
    p.atkQueued = false;
    p.comboT = 0;

    // mira macia
    let dir = p.facing;
    if (b && !b.dead) {
      const d = dist(p.x, p.y, b.x, b.y);
      const toBoss = Math.atan2(b.y - p.y, b.x - p.x);
      if (d < 100 && Math.abs(angleDiff(toBoss, p.facing)) < 1.6) dir = toBoss;
    }
    p.atkDir = dir;
    p.facing = dir;

    // pequeno passo à frente
    const a = ATK[stage];
    p.x += Math.cos(dir) * 3;
    p.y += Math.sin(dir) * 3;
    AudioSys.playerSwing();
  }

  function updatePlayerAttack(dt) {
    const p = player;
    const a = ATK[p.atkStage];
    p.atkT += dt;

    if (p.atkT < a.windup + a.active) {
      p.x += Math.cos(p.atkDir) * a.lunge * dt;
      p.y += Math.sin(p.atkDir) * a.lunge * dt;
    }

    if (!p.slashSpawned && p.atkT >= a.windup) {
      p.slashSpawned = true;
      slashes.push({
        x: p.x, y: p.y - 10, dir: p.atkDir, life: 0.2, maxLife: 0.2,
        radius: a.reach * 0.72, stage: p.atkStage
      });
    }

    if (!p.atkHit && p.atkT >= a.windup && p.atkT <= a.windup + a.active) {
      const b = boss;
      if (b && !b.dead) {
        const d = dist(p.x, p.y, b.x, b.y);
        const ang = Math.atan2(b.y - p.y, b.x - p.x);
        if (d < a.reach + b.r && Math.abs(angleDiff(ang, p.atkDir)) < a.arc / 2) {
          p.atkHit = true;
          damageBoss(a.dmg, p.atkDir);
        }
      }
    }

    if (p.atkT >= a.total) {
      if (p.atkQueued && p.atkStage < 2) {
        startPlayerAttack(p.atkStage + 1);
      } else {
        p.state = 'free';
        p.stateT = 0;
        p.lastStage = p.atkStage;
        p.comboT = 0.34;
        p.atkStage = 0;
        p.atkQueued = false;
      }
    }
  }

  function tryPlayerRoll() {
    const p = player;
    if (!p || p.dead) return;
    if (p.state !== 'free' || p.rollCd > 0) return;

    let dir = p.facing;
    let ix = (key('KeyA') || key('ArrowLeft') ? -1 : 0) + (key('KeyD') || key('ArrowRight') ? 1 : 0);
    let iy = (key('KeyW') || key('ArrowUp') ? -1 : 0) + (key('KeyS') || key('ArrowDown') ? 1 : 0);
    if (touchVec.active && (Math.abs(touchVec.x) > 0.1 || Math.abs(touchVec.y) > 0.1)) {
      ix = touchVec.x;
      iy = touchVec.y;
    }
    if (ix || iy) dir = Math.atan2(iy, ix);

    p.state = 'roll';
    p.stateT = 0;
    p.rollDir = dir;
    p.facing = dir;
    p.rollCd = 0.5;
    p.invuln = Math.max(p.invuln, 0.25);
    AudioSys.roll();
    spawnDust(p.x, p.y, 5, false);
  }

  function tryPlayerHeal() {
    const p = player;
    if (!p || p.dead) return;
    if (p.state !== 'free' || p.flasks <= 0 || p.hp >= p.maxHp) return;
    p.state = 'heal';
    p.stateT = 0;
    p.healDone = false;
    p.flasks--;
    updateFlasks();
    AudioSys.heal();
  }

  // ---------------- Jogador: update ----------------
  function updatePlayer(dt) {
    const p = player;
    p.anim += dt;
    p.flash = Math.max(0, p.flash - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.rollCd = Math.max(0, p.rollCd - dt);
    if (p.comboT > 0) p.comboT -= dt;
    if (p.dead) { p.deathT += dt; return; }

    let ix = 0, iy = 0;
    if (key('KeyA') || key('ArrowLeft')) ix--;
    if (key('KeyD') || key('ArrowRight')) ix++;
    if (key('KeyW') || key('ArrowUp')) iy--;
    if (key('KeyS') || key('ArrowDown')) iy++;
    let ilen = Math.hypot(ix, iy);
    if (ilen > 1) { ix /= ilen; iy /= ilen; ilen = 1; }
    if (touchVec.active) {
      ix = touchVec.x;
      iy = touchVec.y;
      ilen = Math.hypot(ix, iy);
    }

    switch (p.state) {
      case 'free': {
        const spd = 104;
        if (ilen > 0.12) {
          p.facing = Math.atan2(iy, ix);
          p.moving = true;
        } else {
          p.moving = false;
        }
        p.x += ix * spd * dt;
        p.y += iy * spd * dt;
        break;
      }
      case 'roll': {
        p.stateT += dt;
        const t = clamp(p.stateT / 0.34, 0, 1);
        const spd = 320 * (1 - t * 0.7);
        p.x += Math.cos(p.rollDir) * spd * dt;
        p.y += Math.sin(p.rollDir) * spd * dt;
        if (Math.random() < 0.55) spawnDust(p.x, p.y + rand(-2, 2), 1, false);
        if (p.stateT >= 0.34) {
          p.state = 'free';
          p.stateT = 0;
        }
        break;
      }
      case 'attack': {
        updatePlayerAttack(dt);
        break;
      }
      case 'heal': {
        p.stateT += dt;
        if (ix || iy) p.facing = Math.atan2(iy, ix);
        p.x += ix * 28 * dt;
        p.y += iy * 28 * dt;
        if (!p.healDone && p.stateT >= 0.38) {
          p.healDone = true;
          p.hp = Math.min(p.maxHp, p.hp + 45);
          spawnSparks(p.x, p.y - 8, -Math.PI / 2, 14, '#e8c66a');
          addRing(p.x, p.y - 6, 4, 26, 0.5, 'rgba(232,198,106,0.55)', 2);
        }
        if (p.stateT >= 0.72) {
          p.state = 'free';
          p.stateT = 0;
        }
        break;
      }
      case 'hurt': {
        p.stateT += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const fr = Math.max(0, 1 - dt * 10);
        p.vx *= fr;
        p.vy *= fr;
        if (p.stateT >= 0.3) {
          p.state = 'free';
          p.stateT = 0;
        }
        break;
      }
    }

    p.x = clamp(p.x, BOUNDS.x0, BOUNDS.x1);
    p.y = clamp(p.y, BOUNDS.y0, BOUNDS.y1);
    resolveBodies();
  }

  // ---------------- Boss: ataques ----------------
  const BOSS_ATTACKS = {
    sweep: { telegraph: 0.62, total: 1.42 },
    slam: { telegraph: 0.78, total: 1.72 },
    charge: { telegraph: 0.55, total: 1.78 },
    spin: { telegraph: 0.7, total: 2.35 },
    combo: { telegraph: 0.55, total: 2.9 }
  };

  function facePlayerSmooth(dt, k) {
    const b = boss;
    const ang = Math.atan2(player.y - b.y, player.x - b.x);
    b.facing += angleDiff(ang, b.facing) * Math.min(1, dt * k);
  }

  function chooseAttack(d) {
    const p2 = boss.phase2;
    let opts;
    if (d < 100) {
      opts = [['sweep', 5], ['slam', 4]];
      if (p2) opts.push(['spin', 3], ['combo', 4]);
    } else if (d < 190) {
      opts = [['charge', 4], ['slam', 2], ['sweep', 2]];
      if (p2) opts.push(['combo', 3], ['spin', 1]);
    } else {
      opts = [['charge', 7]];
      if (p2) opts.push(['charge', 2], ['slam', 1]);
    }
    opts = opts.map(([n, w]) => [n, boss.lastAttack === n ? w * 0.4 : w]);
    const total = opts.reduce((s, o) => s + o[1], 0);
    let roll = Math.random() * total;
    for (const [n, w] of opts) {
      roll -= w;
      if (roll <= 0) return n;
    }
    return opts[0][0];
  }

  function startBossAttack(name) {
    const b = boss;
    const toP = Math.atan2(player.y - b.y, player.x - b.x);
    b.state = 'attack';
    b.stateT = 0;
    b.lastAttack = name;
    b.facing = toP;
    b.atk = {
      name, t: 0,
      hit1: false, hit2: false, hit3: false,
      hitCd: 0, wall: false,
      dir: toP,
      target: { x: player.x, y: player.y }
    };
    AudioSys.telegraph(name);
  }

  function startPhase2() {
    const b = boss;
    b.phase2 = true;
    b.roarT = 1.15;
    b.atk = null;
    b.state = 'idle';
    b.poise = 0;
    bossHud.classList.add('phase2');
    game.shake = Math.max(game.shake, 14);
    showToast('PROFESSOR DABOIT SE IRRITA', 2000);
    AudioSys.phase2();
    addRing(b.x, b.y - 12, 8, 150, 1.1, 'rgba(200,60,40,0.55)', 3);
    for (let i = 0; i < 30; i++) {
      spawnParticle(b.x + rand(-12, 12), b.y - rand(0, 34), {
        vx: rand(-80, 80), vy: rand(-100, 20),
        life: rand(0.4, 1.1), size: randi(1, 2),
        color: Math.random() < 0.5 ? '#c94a32' : '#e8a26a',
        gravity: 30, drag: 1.4
      });
    }
  }

  // ---------------- Boss: update ----------------
  function approachAngle(cur, target, k) {
    return cur + angleDiff(target, cur) * k;
  }

  function updateBoss(dt) {
    const b = boss;
    b.anim += dt;
    b.flash = Math.max(0, b.flash - dt);
    b.poise = Math.max(0, b.poise - 9 * dt);

    if (b.dead) {
      b.deathT += dt;
      return;
    }

    if (b.roarT > 0) {
      b.roarT -= dt;
      b.boardAng = approachAngle(b.boardAng, b.facing - 1.57, Math.min(1, dt * 7));
      if (Math.random() < 0.4) {
        spawnParticle(b.x + rand(-20, 20), b.y - 6, {
          vx: rand(-20, 20), vy: rand(-50, -10), life: rand(0.4, 0.9),
          size: randi(1, 2), color: '#b8432e', drag: 1, gravity: -6
        });
      }
      return;
    }

    if (player.dead) {
      b.facing = approachAngle(b.facing, Math.atan2(player.y - b.y, player.x - b.x), Math.min(1, dt * 1.5));
      b.boardAng = approachAngle(b.boardAng, b.facing + 2.1, Math.min(1, dt * 3));
      return;
    }

    if (b.state === 'stagger') {
      b.stateT += dt;
      b.boardAng = approachAngle(b.boardAng, b.facing + 1.2, Math.min(1, dt * 4));
      if (b.stateT > (b.phase2 ? 0.85 : 1.15)) {
        b.state = 'idle';
        b.stateT = 0;
        b.cool = 0.5;
      }
      return;
    }

    if (!b.phase2 && b.hp <= b.maxHp * 0.5) {
      startPhase2();
      return;
    }

    if (b.state === 'attack' && b.atk) {
      updateBossAttack(dt);
    } else {
      b.state = 'idle';
      b.cool -= dt;
      const dx = player.x - b.x;
      const dy = player.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      const toP = Math.atan2(dy, dx);
      b.facing += angleDiff(toP, b.facing) * Math.min(1, dt * 6);

      if (b.cool <= 0) {
        startBossAttack(chooseAttack(d));
        return;
      }

      const spd = b.phase2 ? 72 : 56;
      let mx = 0, my = 0;
      if (d > 68) {
        mx = dx / d; my = dy / d;
      } else if (d < 44) {
        mx = -dx / d * 0.6; my = -dy / d * 0.6;
      }
      b.strafeT += dt;
      if (b.strafeT > 2.4) { b.strafeT = 0; b.strafe *= -1; }
      const strafeAmt = b.phase2 ? 0.62 : 0.4;
      mx += Math.cos(toP + Math.PI / 2) * b.strafe * strafeAmt;
      my += Math.sin(toP + Math.PI / 2) * b.strafe * strafeAmt;
      const ml = Math.hypot(mx, my) || 1;
      b.x += mx / ml * spd * dt;
      b.y += my / ml * spd * dt;
      b.walk += dt * spd * 0.05;
      b.boardAng = approachAngle(b.boardAng, b.facing + 2.1, Math.min(1, dt * 4));
    }

    b.x = clamp(b.x, BOUNDS.x0 + 8, BOUNDS.x1 - 8);
    b.y = clamp(b.y, BOUNDS.y0 + 8, BOUNDS.y1 - 8);
    resolveBodies();
  }

  function boardHitsPlayer(angle, reach, width) {
    const b = boss, p = player;
    const x1 = b.x + Math.cos(angle) * 8;
    const y1 = b.y + Math.sin(angle) * 8;
    const x2 = b.x + Math.cos(angle) * reach;
    const y2 = b.y + Math.sin(angle) * reach;
    return segDist(p.x, p.y, x1, y1, x2, y2) < width + p.r;
  }

  function updateBossAttack(dt) {
    const b = boss;
    const a = b.atk;
    const cfg = BOSS_ATTACKS[a.name];
    a.t += dt;

    if (a.name === 'sweep') {
      if (a.t < cfg.telegraph) {
        if (a.t < cfg.telegraph - 0.16) facePlayerSmooth(dt, 9);
        b.boardAng = approachAngle(b.boardAng, b.facing - 1.9, Math.min(1, dt * 14));
      } else if (a.t < cfg.telegraph + 0.22) {
        const prog = clamp((a.t - cfg.telegraph) / 0.22, 0, 1);
        b.boardAng = b.facing - 1.9 + 3.8 * easeOut(prog);
        if (!a.hit1 && boardHitsPlayer(b.boardAng, 60, 7)) {
          a.hit1 = true;
          damagePlayer(24, b.x, b.y);
        }
        if (Math.random() < 0.6) {
          spawnParticle(b.x + Math.cos(b.boardAng) * rand(20, 55), b.y + Math.sin(b.boardAng) * rand(20, 55), {
            vx: rand(-20, 20), vy: rand(-30, 0), life: 0.25, size: 1, color: '#d8cfae', drag: 2
          });
        }
      } else {
        b.boardAng = approachAngle(b.boardAng, b.facing + 1.6, Math.min(1, dt * 5));
      }
    }

    else if (a.name === 'slam') {
      if (a.t < 0.36) {
        a.target.x = player.x;
        a.target.y = player.y;
        facePlayerSmooth(dt, 8);
      }
      if (a.t < cfg.telegraph) {
        b.boardAng = approachAngle(b.boardAng, b.facing - 1.57, Math.min(1, dt * 10));
      } else if (!a.hit1) {
        a.hit1 = true;
        b.boardAng = b.facing;
        const ix = a.target.x, iy = a.target.y;
        addRing(ix, iy, 6, 96, 0.55, 'rgba(220,110,80,0.6)', 3);
        addRing(ix, iy, 4, 56, 0.4, 'rgba(255,235,200,0.4)', 2);
        addDecal(ix, iy, 31);
        spawnDust(ix, iy, 26, true);
        spawnSparks(ix, iy, -Math.PI / 2, 18, '#e3d6b4');
        game.shake = Math.max(game.shake, 13);
        AudioSys.slam();
        if (dist(player.x, player.y, ix, iy) < 60 + player.r) {
          damagePlayer(30, ix, iy);
        }
      }
    }

    else if (a.name === 'charge') {
      if (a.t < 0.2) {
        a.dir = Math.atan2(player.y - b.y, player.x - b.x);
      }
      if (a.t < cfg.telegraph) {
        b.facing = a.dir;
        b.boardAng = approachAngle(b.boardAng, a.dir, Math.min(1, dt * 12));
        if (Math.random() < 0.5) {
          spawnParticle(b.x - Math.cos(a.dir) * 18, b.y - Math.sin(a.dir) * 18, {
            vx: rand(-30, 30), vy: rand(-30, 10), life: 0.3, size: 1,
            color: '#8f7a58', drag: 3
          });
        }
      } else if (a.t < cfg.telegraph + 0.55) {
        if (!a.hit1 && Math.random() < 0.9) {
          spawnDust(b.x, b.y, 1, true);
          spawnDust(b.x, b.y, 1, false);
        }
        if (!a.wall) {
          b.x += Math.cos(a.dir) * 440 * dt;
          b.y += Math.sin(a.dir) * 440 * dt;
          if (b.x <= BOUNDS.x0 + 9 || b.x >= BOUNDS.x1 - 9 || b.y <= BOUNDS.y0 + 9 || b.y >= BOUNDS.y1 - 9) {
            a.wall = true;
            game.shake = Math.max(game.shake, 8);
            spawnDust(b.x, b.y, 14, true);
            addRing(b.x, b.y, 6, 60, 0.4, 'rgba(180,170,150,0.35)', 2);
          }
        }
        if (!a.hit1 && dist(player.x, player.y, b.x, b.y) < b.r + player.r + 5) {
          a.hit1 = true;
          damagePlayer(24, b.x, b.y);
        }
        b.facing = a.dir;
        b.boardAng = a.dir;
      } else {
        b.boardAng = approachAngle(b.boardAng, b.facing + 2.1, Math.min(1, dt * 4));
      }
    }

    else if (a.name === 'spin') {
      if (a.t < cfg.telegraph) {
        if (a.t < cfg.telegraph - 0.18) facePlayerSmooth(dt, 8);
        b.boardAng = approachAngle(b.boardAng, b.facing - 1.9, Math.min(1, dt * 12));
      } else {
        const spinning = a.t - cfg.telegraph;
        b.boardAng += dt * 11 * (b.phase2 ? 1.15 : 1);
        const dx = player.x - b.x, dy = player.y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > 30) {
          b.x += dx / d * 32 * dt;
          b.y += dy / d * 32 * dt;
        }
        a.hitCd -= dt;
        if (a.hitCd <= 0 && boardHitsPlayer(b.boardAng, 58, 8)) {
          a.hitCd = 0.42;
          damagePlayer(16, b.x, b.y);
        }
        if (Math.floor(spinning * 5) !== Math.floor((spinning - dt) * 5)) {
          addRing(b.x, b.y - 10, 14, 72, 0.35, 'rgba(210,150,90,0.25)', 1);
        }
        if (Math.random() < 0.35) {
          spawnParticle(b.x + rand(-20, 20), b.y - rand(0, 26), {
            vx: rand(-30, 30), vy: rand(-40, 0), life: 0.4,
            size: randi(1, 2), color: '#cfa96c', drag: 2
          });
        }
      }
    }

    else if (a.name === 'combo') {
      if (a.t < cfg.telegraph) {
        if (a.t < cfg.telegraph - 0.14) facePlayerSmooth(dt, 9);
        b.boardAng = approachAngle(b.boardAng, b.facing - 1.9, Math.min(1, dt * 14));
      } else if (a.t < 0.77) {
        const prog = clamp((a.t - cfg.telegraph) / 0.22, 0, 1);
        b.boardAng = b.facing - 1.9 + 3.8 * easeOut(prog);
        if (!a.hit1 && boardHitsPlayer(b.boardAng, 58, 7)) {
          a.hit1 = true;
          damagePlayer(20, b.x, b.y);
        }
      } else if (a.t < 1.04) {
        b.boardAng = approachAngle(b.boardAng, b.facing + 1.9, Math.min(1, dt * 10));
        facePlayerSmooth(dt, 5);
      } else if (a.t < 1.26) {
        const prog = clamp((a.t - 1.04) / 0.22, 0, 1);
        b.boardAng = b.facing + 1.9 - 3.8 * easeOut(prog);
        if (!a.hit2 && boardHitsPlayer(b.boardAng, 58, 7)) {
          a.hit2 = true;
          damagePlayer(20, b.x, b.y);
        }
        const dx = player.x - b.x, dy = player.y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > 26) { b.x += dx / d * 34 * dt; b.y += dy / d * 34 * dt; }
      } else if (a.t < 1.55) {
        if (a.t < 1.52) {
          a.target.x = player.x;
          a.target.y = player.y;
        }
        facePlayerSmooth(dt, 7);
        b.boardAng = approachAngle(b.boardAng, b.facing - 1.57, Math.min(1, dt * 8));
      } else if (!a.hit3) {
        a.hit3 = true;
        b.boardAng = b.facing;
        const ix = a.target.x, iy = a.target.y;
        addRing(ix, iy, 6, 96, 0.55, 'rgba(220,110,80,0.6)', 3);
        addDecal(ix, iy, 47);
        spawnDust(ix, iy, 24, true);
        game.shake = Math.max(game.shake, 12);
        AudioSys.slam();
        if (dist(player.x, player.y, ix, iy) < 58 + player.r) {
          damagePlayer(26, ix, iy);
        }
      }
    }

    if (a.t >= cfg.total) {
      b.state = 'idle';
      b.stateT = 0;
      b.atk = null;
      b.cool = b.phase2 ? rand(0.3, 0.62) : rand(0.58, 0.98);
      b.boardAng = b.facing + 2.1;
    }
  }

  // ---------------- Dano ----------------
  function damageBoss(dmg, dir) {
    const b = boss;
    if (b.dead) return;
    const mult = b.state === 'stagger' ? 1.35 : 1;
    const final = Math.round(dmg * mult);
    b.hp = Math.max(0, b.hp - final);
    b.flash = 0.13;
    b.poise += final;
    game.hitstop = 0.055;
    game.shake = Math.max(game.shake, 4.5);

    const hx = (player.x + b.x) / 2;
    const hy = (player.y + b.y) / 2 - 6;
    spawnSparks(hx, hy, dir, 12, '#f7efd8');
    spawnPaper(b.x, b.y - 8, 4);
    AudioSys.hitBoss();

    if (b.hp <= 0) {
      onBossDeath();
      return;
    }
    if (b.poise >= b.poiseMax) {
      b.poise = 0;
      b.state = 'stagger';
      b.stateT = 0;
      b.atk = null;
      b.cool = 0.3;
      b.boardAng = b.facing + 1.4;
      addRing(b.x, b.y - 10, 6, 50, 0.45, 'rgba(240,220,170,0.5)', 2);
      game.hitstop = 0.09;
      game.shake = Math.max(game.shake, 7);
      showToast('DABOIT CAMBALEIA', 900);
    }
  }

  function damagePlayer(dmg, fromX, fromY) {
    const p = player;
    if (!p || p.dead) return;

    const rolling = p.state === 'roll' && p.stateT < 0.24;
    if (p.invuln > 0 || rolling) {
      if (rolling) {
        spawnSparks(p.x, p.y - 8, Math.atan2(p.y - fromY, p.x - fromX), 6, '#cfd8e0');
      }
      return;
    }

    p.hp = Math.max(0, p.hp - dmg);
    p.flash = 0.16;
    p.invuln = 0.7;
    p.state = 'hurt';
    p.stateT = 0;
    p.healDone = false;
    p.atkQueued = false;

    const ang = Math.atan2(p.y - fromY, p.x - fromX);
    p.vx = Math.cos(ang) * 230;
    p.vy = Math.sin(ang) * 230;

    game.shake = Math.max(game.shake, 10);
    game.hitstop = 0.09;
    game.flash = 1;
    spawnBlood(p.x, p.y - 8, ang);
    spawnPaper(p.x, p.y, 3);
    AudioSys.playerHurt();

    if (p.hp <= 0) {
      p.dead = true;
      p.state = 'dead';
      p.stateT = 0;
      p.deathT = 0;
      onPlayerDeath();
    }
  }

  // ---------------- Partículas / HUD ----------------
  function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      if (p.gravity) p.vy += p.gravity * dt;
      if (p.drag) {
        const f = Math.max(0, 1 - p.drag * dt);
        p.vx *= f; p.vy *= f;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      rings[i].life -= dt;
      if (rings[i].life <= 0) rings.splice(i, 1);
    }
    for (let i = slashes.length - 1; i >= 0; i--) {
      slashes[i].life -= dt;
      if (slashes[i].life <= 0) slashes.splice(i, 1);
    }

    if (Math.random() < dt * 8) {
      spawnParticle(rand(40, 600), rand(40, 320), {
        vx: rand(-4, 4), vy: rand(-10, -3), life: rand(2, 5),
        size: 1, color: 'rgba(220,215,200,0.35)', drag: 0
      });
    }
  }

  function updateHud() {
    const php = clamp(player.hp / player.maxHp, 0, 1) * 100;
    const bhp = clamp(boss.hp / boss.maxHp, 0, 1) * 100;
    playerHpFill.style.width = php + '%';
    playerHpGhost.style.width = clamp(playerHpGhostVal / player.maxHp, 0, 1) * 100 + '%';
    bossHpFill.style.width = bhp + '%';
    bossHpGhost.style.width = clamp(bossHpGhostVal / boss.maxHp, 0, 1) * 100 + '%';
    damageFlash.style.opacity = (game.flash * 0.55).toFixed(2);
    stage.classList.toggle('low-hp', game.mode === 'playing' && player.hp > 0 && player.hp / player.maxHp < 0.3);
  }

  // =========================================================
  //  DESENHO
  // =========================================================
  function rect(x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function shadow(x, y, rx, ry) {
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y), rx, ry, 0, 0, TAU);
    ctx.fill();
  }

  function drawBar(cx, cy, ang, len, thick, c1, c2, flash, stripe) {
    const steps = Math.max(3, Math.round(len / 2));
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const mid1 = Math.floor(steps * 0.44);
    const mid2 = Math.floor(steps * 0.56);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1) - 0.5;
        const px = Math.round(cx + dx * len * t);
        const py = Math.round(cy + dy * len * t);
        let col;
        if (pass === 0) col = flash ? '#ffffff' : '#090b0d';
        else if (flash) col = '#ffffff';
        else if (stripe && (i === mid1 || i === mid2)) col = c2;
        else col = c1;
        const th = pass === 0 ? thick + 2 : thick;
        ctx.fillStyle = col;
        ctx.fillRect(px - (th >> 1), py - (th >> 1), th, th);
      }
    }
  }

  function drawDecals() {
    for (const d of decals) {
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, 22, 12, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(8,10,9,0.45)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const a = (d.seed % 628) / 100 + i * 1.31;
        const l = 5 + ((d.seed >> (i + 1)) % 8);
        ctx.beginPath();
        ctx.moveTo(d.x + Math.cos(a) * 4, d.y + Math.sin(a) * 3);
        ctx.lineTo(d.x + Math.cos(a) * (4 + l), d.y + Math.sin(a) * (3 + l * 0.7));
        ctx.stroke();
      }
    }
  }

  // ---------------- Avisos de ataque ----------------
  function drawHazards() {
    const b = boss;
    if (!b || b.dead || b.state !== 'attack' || !b.atk) return;
    const a = b.atk;
    const cfg = BOSS_ATTACKS[a.name];
    const t = a.t;

    ctx.save();
    if (a.name === 'sweep') {
      if (t < cfg.telegraph) {
        const k = clamp(t / cfg.telegraph, 0, 1);
        const alpha = 0.06 + k * 0.13;
        ctx.fillStyle = `rgba(190,58,44,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.arc(b.x, b.y, 80, b.facing - 1.9, b.facing + 1.9);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = `rgba(225,110,85,${0.25 + k * 0.45})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 80, b.facing - 1.9, b.facing + 1.9);
        ctx.stroke();
      }
    } else if (a.name === 'slam') {
      const tx = a.target.x, ty = a.target.y;
      if (t < cfg.telegraph) {
        const k = clamp(t / cfg.telegraph, 0, 1);
        ctx.fillStyle = `rgba(190,55,42,${0.05 + k * 0.13})`;
        ctx.beginPath();
        ctx.arc(tx, ty, 60, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(230,120,90,${0.3 + k * 0.5})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(tx, ty, 60, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = `rgba(240,190,150,${0.15 + k * 0.25})`;
        ctx.beginPath();
        ctx.arc(tx, ty, 20 + k * 38, 0, TAU);
        ctx.stroke();
      }
    } else if (a.name === 'charge') {
      if (t < cfg.telegraph) {
        const k = clamp(t / cfg.telegraph, 0, 1);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(a.dir);
        ctx.fillStyle = `rgba(190,50,38,${0.05 + k * 0.12})`;
        ctx.fillRect(10, -18, 330, 36);
        ctx.strokeStyle = `rgba(230,110,85,${0.25 + k * 0.45})`;
        ctx.strokeRect(10, -18, 330, 36);
        ctx.fillStyle = `rgba(240,190,150,${0.1 + k * 0.25})`;
        ctx.fillRect(10, 14, 330, 2);
        ctx.fillRect(10, -16, 330, 2);
        ctx.restore();
        // risco central
        ctx.strokeStyle = `rgba(230,90,70,${0.12 + k * 0.25})`;
        ctx.beginPath();
        ctx.moveTo(b.x + Math.cos(a.dir) * 16, b.y + Math.sin(a.dir) * 16);
        ctx.lineTo(b.x + Math.cos(a.dir) * 320, b.y + Math.sin(a.dir) * 320);
        ctx.stroke();
      }
    } else if (a.name === 'spin') {
      if (t < cfg.telegraph) {
        const k = clamp(t / cfg.telegraph, 0, 1);
        ctx.fillStyle = `rgba(190,55,42,${0.04 + k * 0.1})`;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 74, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(225,110,85,${0.22 + k * 0.4})`;
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.arc(b.x, b.y, 74, game.time * 2, game.time * 2 + TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        // setores
        for (let i = 0; i < 4; i++) {
          const aa = game.time * 2 + i * Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(b.x + Math.cos(aa) * 74, b.y + Math.sin(aa) * 74);
          ctx.stroke();
        }
      }
    } else if (a.name === 'combo') {
      if (t < cfg.telegraph) {
        const k = clamp(t / cfg.telegraph, 0, 1);
        ctx.fillStyle = `rgba(190,58,44,${0.06 + k * 0.13})`;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.arc(b.x, b.y, 78, b.facing - 1.9, b.facing + 1.9);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = `rgba(225,110,85,${0.25 + k * 0.45})`;
        ctx.stroke();
      } else if (t > 1.26 && t < 1.85) {
        const k = clamp((t - 1.26) / 0.59, 0, 1);
        const tx = a.target.x, ty = a.target.y;
        ctx.fillStyle = `rgba(190,55,42,${0.05 + k * 0.14})`;
        ctx.beginPath();
        ctx.arc(tx, ty, 58, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(230,120,90,${0.3 + k * 0.5})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(tx, ty, 58, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---------------- Pedro ----------------
  function drawPedro() {
    const p = player;
    if (!p) return;
    const x = Math.round(p.x), y = Math.round(p.y);
    const flash = p.flash > 0;
    const C = c => (flash ? '#ffffff' : c);

    if (p.dead) {
      shadow(x, y, 11, 4);
      rect(x - 11, y - 5, 22, 5, C('#3f4f66'));
      rect(x - 11, y - 7, 7, 4, C('#33415a'));
      rect(x - 13, y - 8, 5, 5, C('#dfae84'));
      rect(x - 13, y - 9, 5, 2, C('#2a1c16'));
      drawBar(x + 13, y - 2, 0.12, 24, 2, '#c8d2da', '#eef3f6', flash, false);
      return;
    }

    shadow(x, y, p.state === 'roll' ? 9 : 7, p.state === 'roll' ? 4.5 : 3.4);

    if (p.state === 'roll') {
      const t = clamp(p.stateT / 0.34, 0, 1);
      const off = Math.sin(t * Math.PI) * 4;
      rect(x - 6, y - 12 - off, 12, 10, C('#3e4e67'));
      rect(x - 7, y - 10 - off, 14, 5, C('#2f3d52'));
      rect(x - 3, y - 15 - off, 6, 4, C('#dfae84'));
      rect(x - 4, y - 15 - off, 8, 1, C('#8a6b4a'));
      rect(x - 6, y - 7 - off, 2, 3, C('#232e3b'));
      rect(x + 4, y - 8 - off, 2, 3, C('#232e3b'));
      return;
    }

    const moving = p.moving && p.state === 'free';
    const step = moving ? Math.sin(p.anim * 13) : 0;
    const bob = moving ? Math.abs(Math.round(Math.sin(p.anim * 13))) : 0;
    const s = Math.round(step * 2);

    // pernas
    rect(x - 4 + s, y - 7, 3, 7, C('#1d2632'));
    rect(x + 1 - s, y - 7, 3, 7, C('#232e3b'));
    rect(x - 4 + s, y - 1, 4, 2, C('#121820'));
    rect(x + 1 - s, y - 1, 4, 2, C('#121820'));

    // torso / moletom
    rect(x - 5, y - 17 - bob, 10, 10, C('#46566f'));
    rect(x - 5, y - 17 - bob, 10, 2, C('#566982'));
    rect(x - 5, y - 8 - bob, 10, 1, C('#2a3543'));
    rect(x - 6, y - 16 - bob, 1, 7, C('#3a4a61'));
    // capuz
    rect(x - 5, y - 18 - bob, 4, 3, C('#3b4a60'));

    // braços
    const arm = moving ? Math.round(step * 1.6) : 0;
    rect(x - 7, y - 15 - bob + arm, 2, 6, C('#3d4d64'));
    rect(x + 5, y - 15 - bob - arm, 2, 6, C('#3d4d64'));
    rect(x - 7, y - 9 - bob + arm, 2, 2, C('#dfae84'));
    rect(x + 5, y - 9 - bob - arm, 2, 2, C('#dfae84'));

    // cabeça
    rect(x - 4, y - 24 - bob, 8, 7, C('#e2b086'));
    rect(x - 4, y - 25 - bob, 8, 2, C('#2a1c16'));
    rect(x - 4, y - 24 - bob, 1, 3, C('#2a1c16'));
    rect(x + 3, y - 24 - bob, 1, 3, C('#2a1c16'));

    const dx = Math.cos(p.facing);
    const dy = Math.sin(p.facing);
    const ex = Math.round(clamp(dx, -1, 1));
    if (dy < -0.55) {
      rect(x - 4, y - 23 - bob, 8, 4, C('#2a1c16'));
    } else {
      rect(x - 2 + ex, y - 21 - bob, 1, 1, C('#1c130f'));
      rect(x + 1 + ex, y - 21 - bob, 1, 1, C('#1c130f'));
      rect(x - 1 + ex, y - 19 - bob, 2, 1, C('#b97a58'));
    }

    // claymore
    let ang = p.facing + 2.3;
    if (p.state === 'attack') {
      const a = ATK[p.atkStage];
      const prog = clamp((p.atkT - a.windup * 0.5) / (a.windup * 0.5 + a.active), 0, 1);
      ang = p.atkDir - 1.9 + 3.8 * easeOut(prog);
    } else if (p.state === 'heal') {
      ang = p.facing - 0.9;
    }
    const hx = x + Math.cos(ang) * 4;
    const hy = y - 10 - bob + Math.sin(ang) * 4;
    drawBar(hx + Math.cos(ang) * 13, hy + Math.sin(ang) * 13, ang, 26, 2, '#c8d2da', '#eef3f6', flash, false);
    drawBar(hx + Math.cos(ang) * 4, hy + Math.sin(ang) * 4, ang + Math.PI / 2, 6, 2, '#8a6a3a', '#b08a4a', flash, false);
    drawBar(hx + Math.cos(ang) * 1, hy + Math.sin(ang) * 1, ang, 7, 2, '#6d4a28', '#8d6438', flash, false);

    // frasco durante cura
    if (p.state === 'heal') {
      const fx = x + Math.round(dx * 4) + 4;
      const fy = y - 20 - bob;
      rect(fx + 1, fy, 2, 2, C('#b58a45'));
      rect(fx, fy + 2, 4, 5, C('#8a6a3a'));
      rect(fx + 1, fy + 4, 2, 3, C('#e6b13e'));
      ctx.globalAlpha = 0.35 + Math.sin(game.time * 22) * 0.15;
      ctx.fillStyle = '#f0cf78';
      ctx.beginPath();
      ctx.arc(fx + 2, fy + 4, 7, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ---------------- Surfboard / Daboit ----------------
  function drawSurfboard(b, C, flash) {
    let ang = b.boardAng;
    if (b.dead) ang += Math.min(1.4, b.deathT * 1.5);
    const cx = b.x + Math.cos(ang) * 30;
    const cy = b.y - 14 + Math.sin(ang) * 30;
    drawBar(cx, cy, ang, 48, 6, '#2d999f', '#e8d9ae', flash, true);
    // quilha
    const tx = cx + Math.cos(ang) * 25;
    const ty = cy + Math.sin(ang) * 25;
    rect(tx - 1, ty - 1, 2, 2, flash ? '#fff' : '#1c5f64');
  }

  function drawBoss() {
    const b = boss;
    if (!b) return;
    const x = Math.round(b.x), y = Math.round(b.y);
    const flash = b.flash > 0;
    const C = c => (flash ? '#ffffff' : c);
    const fade = b.dead ? clamp(1 - (b.deathT - 0.7) / 1.2, 0, 1) : 1;
    if (fade <= 0) return;

    const wob = b.state === 'stagger' ? Math.round(Math.sin(b.stateT * 26) * 2) : 0;
    const bob = b.roarT > 0 ? Math.round(Math.sin(game.time * 20) * 2) : 0;
    const x2 = x + wob;
    const sink = b.dead ? Math.min(14, b.deathT * 18) : 0;
    const yy = y + sink;

    ctx.save();
    ctx.globalAlpha = fade;

    // aura fase 2
    if (b.phase2 && !b.dead) {
      const pulse = 0.16 + Math.sin(game.time * 6) * 0.05;
      ctx.fillStyle = `rgba(180,35,25,${pulse})`;
      ctx.beginPath();
      ctx.ellipse(x2, y + 1, 24, 11, 0, 0, TAU);
      ctx.fill();
      if (Math.random() < 0.4) {
        spawnParticle(x2 + rand(-14, 14), y - rand(0, 30), {
          vx: rand(-8, 8), vy: rand(-30, -8), life: rand(0.4, 0.9),
          size: 1, color: Math.random() < 0.5 ? '#a73527' : '#d07a48', drag: 0.5
        });
      }
    }

    shadow(x2, y, 16, 6);

    const boardBehind = Math.sin(b.boardAng) < -0.15;
    if (boardBehind) drawSurfboard(b, C, flash);

    const walk = Math.sin(b.walk * 2) * 2;
    // pernas
    rect(x2 - 8 + Math.round(walk), yy - 12, 6, 12, C('#3a2a1c'));
    rect(x2 + 2 - Math.round(walk), yy - 12, 6, 12, C('#332417'));
    rect(x2 - 9 + Math.round(walk), yy - 2, 8, 3, C('#1c1510'));
    rect(x2 + 1 - Math.round(walk), yy - 2, 8, 3, C('#1c1510'));

    // torso: cardigã
    rect(x2 - 10, yy - 28 - bob, 20, 18, C('#7c5430'));
    rect(x2 - 10, yy - 28 - bob, 20, 3, C('#95683e'));
    rect(x2 - 10, yy - 11 - bob, 20, 2, C('#4e341e'));
    rect(x2 - 11, yy - 25 - bob, 1, 12, C('#694522'));
    // camisa
    rect(x2 - 4, yy - 28 - bob, 8, 10, C('#d6ccb4'));
    // gravata
    rect(x2 - 1, yy - 26 - bob, 2, 8, C('#7d2a20'));
    rect(x2 - 2, yy - 27 - bob, 4, 2, C('#7d2a20'));

    // braços
    rect(x2 - 13, yy - 25 - bob, 4, 11, C('#6c4828'));
    rect(x2 + 9, yy - 25 - bob, 4, 11, C('#6c4828'));
    rect(x2 - 13, yy - 15 - bob, 4, 3, C('#d39a6c'));
    rect(x2 + 9, yy - 15 - bob, 4, 3, C('#d39a6c'));

    // cabeça
    rect(x2 - 6, yy - 38 - bob, 12, 10, C('#d79e70'));
    rect(x2 - 6, yy - 39 - bob, 12, 2, C('#e6b183'));
    rect(x2 - 7, yy - 37 - bob, 1, 4, C('#c78e62'));
    rect(x2 + 6, yy - 37 - bob, 1, 4, C('#c78e62'));
    // barba
    rect(x2 - 5, yy - 30 - bob, 10, 2, C('#8b6a4c'));
    rect(x2 - 3, yy - 29 - bob, 6, 1, C('#6b4c33'));

    const dx = Math.cos(b.facing);
    const dy = Math.sin(b.facing);
    const ex = Math.round(clamp(dx, -1, 1) * 1.5);
    if (dy > -0.5) {
      // óculos
      rect(x2 - 4 + ex, yy - 35 - bob, 3, 2, C('#dfeef2'));
      rect(x2 + 2 + ex, yy - 35 - bob, 3, 2, C('#dfeef2'));
      rect(x2 - 1 + ex, yy - 35 - bob, 3, 1, C('#8b6a4c'));
      rect(x2 - 2 + ex, yy - 34 - bob, 1, 1, C('#2a1a12'));
      rect(x2 + 3 + ex, yy - 34 - bob, 1, 1, C('#2a1a12'));
      // sobrancelhas
      rect(x2 - 4 + ex, yy - 36 - bob, 3, 1, C('#6b4a33'));
      rect(x2 + 2 + ex, yy - 36 - bob, 3, 1, C('#6b4a33'));
    } else {
      rect(x2 - 7, yy - 36 - bob, 1, 3, C('#c78e62'));
      rect(x2 + 6, yy - 36 - bob, 1, 3, C('#c78e62'));
    }

    if (!boardBehind) drawSurfboard(b, C, flash);
    ctx.restore();

    // rastro do board
    if (!b.dead && b.state === 'attack' && b.atk) {
      const a = b.atk;
      let active = false;
      if ((a.name === 'sweep' || a.name === 'combo') && a.t > BOSS_ATTACKS[a.name].telegraph && a.t < BOSS_ATTACKS[a.name].telegraph + 0.24) active = true;
      if (a.name === 'spin' && a.t > 0.7) active = true;
      if (active) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = '#e9dfbd';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(b.x, b.y - 6, 46, b.boardAng - 1.1, b.boardAng + 0.12);
        ctx.stroke();
        ctx.globalAlpha = 0.18;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(b.x, b.y - 6, 43, b.boardAng - 1.2, b.boardAng + 0.15);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // ---------------- Efeitos ----------------
  function drawParticles() {
    for (const p of particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      const s = p.shrink ? Math.max(1, Math.round(p.size * a)) : p.size;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), s, s);
    }
    ctx.globalAlpha = 1;
  }

  function drawRings() {
    for (const r of rings) {
      const k = 1 - r.life / r.maxLife;
      const rad = lerp(r.r0, r.r1, easeOut(k));
      ctx.globalAlpha = clamp(r.life / r.maxLife, 0, 1);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawSlashes() {
    for (const s of slashes) {
      const k = 1 - s.life / s.maxLife;
      const a = s.dir - 1.7 + k * 3.4;
      const alpha = 1 - k;
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = s.stage === 2 ? '#ffe6b0' : '#eef4f7';
      ctx.lineWidth = s.stage === 2 ? 4 : 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, a - 0.75, a + 0.1);
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.3;
      ctx.lineWidth = s.stage === 2 ? 9 : 7;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius - 2, a - 0.85, a + 0.15);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---------------- Frame ----------------
  function render() {
    ctx.save();
    const sh = game.shake;
    if (sh > 0.2) {
      ctx.translate(Math.round(rand(-sh, sh)), Math.round(rand(-sh, sh)));
    }
    ctx.drawImage(floorCanvas, 0, 0);
    drawDecals();
    drawHazards();

    const ents = [
      { y: boss.y, fn: drawBoss },
      { y: player.y, fn: drawPedro }
    ];
    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) e.fn();

    drawRings();
    drawSlashes();
    drawParticles();
    ctx.restore();
  }

  function update(dt) {
    game.time += dt;
    if (game.mode === 'playing') game.fightTime += dt;
    game.shake = Math.max(0, game.shake - dt * 48);
    game.flash = Math.max(0, game.flash - dt * 3.2);

    updatePlayer(dt);
    updateBoss(dt);
    updateEffects(dt);

    // barras com atraso
    if (bossHpGhostVal > boss.hp) bossHpGhostVal = Math.max(boss.hp, bossHpGhostVal - dt * 70);
    else bossHpGhostVal = boss.hp;
    if (playerHpGhostVal > player.hp) playerHpGhostVal = Math.max(player.hp, playerHpGhostVal - dt * 55);
    else playerHpGhostVal = player.hp;

    if (player.dead && game.deathTimer > 0) {
      game.deathTimer -= dt;
      if (game.deathTimer <= 0) finishDeath();
    }
    if (boss.dead && game.winTimer > 0) {
      game.winTimer -= dt;
      if (game.winTimer <= 0) finishWin();
    }
  }

  let lastT = performance.now();
  function frame(now) {
    let dt = (now - lastT) / 1000;
    lastT = now;
    dt = clamp(dt, 0, 0.05);

    if (game.mode === 'playing' && !game.paused) {
      if (game.hitstop > 0) {
        game.hitstop -= dt;
        game.shake = Math.max(0, game.shake - dt * 50);
        game.flash = Math.max(0, game.flash - dt * 4);
      } else {
        update(dt);
      }
    } else if (game.mode !== 'playing') {
      game.time += dt;
      updateEffects(dt);
    }

    render();
    updateHud();
    requestAnimationFrame(frame);
  }

  // ---------------- Boot ----------------
  resetGame();
  buildArena();

  titleScreen.addEventListener('click', () => { if (game.mode === 'title') startGame(); });
  deathScreen.addEventListener('click', () => { if (game.mode === 'dead') startGame(); });
  winScreen.addEventListener('click', () => { if (game.mode === 'win') startGame(); });
  pauseScreen.addEventListener('click', () => { if (game.paused) togglePause(); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.mode === 'playing' && !game.paused) togglePause();
  });

  requestAnimationFrame(frame);
})();

