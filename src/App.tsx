import { useEffect, useRef, useState, useCallback } from "react";
import {
  GRID_W,
  GRID_H,
  CELL,
  TOTAL,
  idx,
  inBounds,
  isBorderCell,
  isEmptyForTrail,
  isSparkWalkable,
  computeSurface,
  tryCapture,
  findNearestWalkable,
  findLargestEmptyZoneCenter,
  spawnParticles,
  updateParticles,
  getLevelData,
  winPercentForLevel,
  type Qix,
  type Spark,
  type Particle,
  type PowerUp,
  type Status,
  type LevelData,
} from "./game";
import { render, drawTitleScreen, flashCapturedArea, setLevelBitmap, pushPlayerTrail } from "./renderer";
import { generateLevelBitmap, getThemeName } from "./bitmap";
import { preloadAllImages, getHDImageForLevel, UI_IMAGES } from "./imageLoader";
import {
  sfxMove,
  sfxCapture,
  sfxDeath,
  sfxWin,
  sfxLevelUp,
  sfxPowerUp,
  sfxStart,
  startMusic as startMusicBase,
  stopMusic,
  toggleMute,
} from "./audio";

const startMusic = (lvl: number) => startMusicBase(lvl - 1);

const COLOR_QIX_YELLOW = "#facc15";
const COLOR_QIX_CYAN = "#22d3ee";

// ============================================================
// HOOK PRINCIPAL
// ============================================================
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>("ready");
  const [surface, setSurface] = useState(0);
  const [lives, setLives] = useState(5);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [combo, setCombo] = useState(0);
  const [captureMsg, setCaptureMsg] = useState<{ text: string; sub: string } | null>(null);
  const [revealActive, setRevealActive] = useState(false);

  // Refs mutables (pas besoin de re-render à chaque tick)
  const statusRef = useRef<Status>("ready");
  const cellsRef = useRef<Uint8Array>(new Uint8Array(TOTAL));
  const playerRef = useRef({ x: 0, y: Math.floor(GRID_H / 2) });
  const qixRef = useRef<Qix>({
    x: GRID_W / 2,
    y: GRID_H / 2,
    vx: 0.1,
    vy: 0.08,
    angle: 0,
    angVel: 0.03,
    size: 1.0,
    pulse: 0,
  });
  const sparksRef = useRef<Spark[]>([]);
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const drawingRef = useRef(false);
  const keysRef = useRef<Set<string>>(new Set());
  const moveTimerRef = useRef(0);
  const frameRef = useRef(0);
  const livesRef = useRef(5);
  const scoreRef = useRef(0);
  const levelRef = useRef(1);
  const particlesRef = useRef<Particle[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const playerShieldRef = useRef(0);
  const playerSpeedBoostRef = useRef(0);
  const playerBombRef = useRef(0);
  const freezeTimerRef = useRef(0);
  const slowTimerRef = useRef(0);
  const themeNameRef = useRef("");
  const currentBitmapRef = useRef<ImageData | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchDirRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastMoveSoundRef = useRef(0);
  const deathAnimRef = useRef(0);
  const levelDataRef = useRef<LevelData>(getLevelData(1));
  const comboCountRef = useRef(0);
  const invincibleFramesRef = useRef(0);
  const lastCaptureFrameRef = useRef(0);

  // Sync state → refs
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { livesRef.current = lives; }, [lives]);
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { levelRef.current = level; }, [level]);
  useEffect(() => { comboCountRef.current = combo; }, [combo]);

  useEffect(() => {
    preloadAllImages();
  }, []);

  const handleMute = useCallback(() => {
    const m = toggleMute();
    setMuted(m);
  }, []);

  // ============================================================
  // BOUCLE DE JEU
  // ============================================================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    // -------- HELPERS --------
    const resetQix = (_quiet = false) => {
      const qix = qixRef.current;
      const ld = levelDataRef.current;
      // Placer le Qix au centre de la zone vide
      qix.x = GRID_W / 2;
      qix.y = GRID_H / 2;
      const a = Math.random() * Math.PI * 2;
      const sp = ld.qixSpeed;
      qix.vx = Math.cos(a) * sp;
      qix.vy = Math.sin(a) * sp;
      qix.angle = Math.random() * Math.PI * 2;
      qix.angVel = 0.02 + Math.random() * 0.03;
      qix.size = 0.9 + levelRef.current * 0.06;
    };

    const resetSparks = () => {
      const ld = levelDataRef.current;
      const sparks: Spark[] = [];
      const count = ld.sparkCount;

      const spawnPositions = [
        { x: Math.floor(GRID_W * 0.75), y: Math.floor(GRID_H * 0.5), px: Math.floor(GRID_W * 0.75), py: Math.floor(GRID_H * 0.5) + 1 },
        { x: Math.floor(GRID_W * 0.5), y: Math.floor(GRID_H * 0.25), px: Math.floor(GRID_W * 0.5), py: Math.floor(GRID_H * 0.25) + 1 },
        { x: Math.floor(GRID_W * 0.25), y: Math.floor(GRID_H * 0.5), px: Math.floor(GRID_W * 0.25), py: Math.floor(GRID_H * 0.5) - 1 },
        { x: Math.floor(GRID_W * 0.5), y: Math.floor(GRID_H * 0.75), px: Math.floor(GRID_W * 0.5), py: Math.floor(GRID_H * 0.75) - 1 },
        { x: Math.floor(GRID_W * 0.6), y: Math.floor(GRID_H * 0.4), px: Math.floor(GRID_W * 0.6), py: Math.floor(GRID_H * 0.4) + 1 },
      ];

      for (let i = 0; i < count; i++) {
        const pos = spawnPositions[i % spawnPositions.length];
        sparks.push({
          x: pos.x,
          y: pos.y,
          px: pos.px,
          py: pos.py,
          dir: i % 4,
          timer: i * 3,
          speed: ld.sparkType === "aggressive" ? 2 : ld.sparkType === "mixed" && i % 2 === 0 ? 4 : 5,
          type: ld.sparkType === "aggressive" ? (i % 2 === 0 ? "hunter" : "fast") : ld.sparkType === "mixed" && i % 2 === 0 ? "fast" : "normal",
        });
      }
      sparksRef.current = sparks;
    };

    const spawnPowerUp = (cells: Uint8Array) => {
      const ld = levelDataRef.current;
      if (Math.random() > ld.powerUpChance) return;

      // Trouver une case vide adjacente à une zone capturée
      const candidates: { x: number; y: number }[] = [];
      for (let y = 1; y < GRID_H - 1; y++) {
        for (let x = 1; x < GRID_W - 1; x++) {
          if (cells[idx(x, y)] === 0 && isAdjacentToCaptureSimple(x, y, cells)) {
            candidates.push({ x, y });
          }
        }
      }
      if (candidates.length === 0) return;

      const pos = candidates[Math.floor(Math.random() * candidates.length)];
      const r = Math.random();
      let type: PowerUp["type"];
      if (r < 0.22) type = "speed";
      else if (r < 0.42) type = "shield";
      else if (r < 0.55) type = "bomb";
      else if (r < 0.70) type = "freeze";
      else if (r < 0.85) type = "slow";
      else type = "life";
      powerUpsRef.current.push({ x: pos.x, y: pos.y, type, life: 600 });
    };

    function isAdjacentToCaptureSimple(x: number, y: number, cells: Uint8Array): boolean {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny) || cells[idx(nx, ny)] === 1) return true;
      }
      return false;
    }

    const resetRound = () => {
      for (const t of trailRef.current) {
        cellsRef.current[idx(t.x, t.y)] = 0;
      }
      trailRef.current = [];
      drawingRef.current = false;
      const near = findNearestWalkable(cellsRef.current, 0, Math.floor(GRID_H / 2));
      playerRef.current = near ?? { x: 0, y: Math.floor(GRID_H / 2) };
      playerShieldRef.current = 0;
      playerSpeedBoostRef.current = 0;
      playerBombRef.current = 0;
      resetQix(true);
      resetSparks();
      powerUpsRef.current = [];
      moveTimerRef.current = 0;
      deathAnimRef.current = 0;
      invincibleFramesRef.current = 0;
      setCombo(0);
    };

    const newGame = () => {
      const ld = getLevelData(1);
      levelDataRef.current = ld;
      cellsRef.current = new Uint8Array(TOTAL);
      trailRef.current = [];
      drawingRef.current = false;
      playerRef.current = { x: 0, y: Math.floor(GRID_H / 2) };
      resetQix(true);
      resetSparks();
      livesRef.current = 5;
      setLives(5);
      scoreRef.current = 0;
      setScore(0);
      levelRef.current = 1;
      setLevel(1);
      setSurface(0);
      setCombo(0);
      particlesRef.current = [];
      powerUpsRef.current = [];
      playerShieldRef.current = 0;
      playerSpeedBoostRef.current = 0;
      playerBombRef.current = 0;
      freezeTimerRef.current = 0;
      slowTimerRef.current = 0;
      moveTimerRef.current = 0;
      deathAnimRef.current = 0;
      invincibleFramesRef.current = 0;
      lastCaptureFrameRef.current = 0;
      const bmp1 = generateLevelBitmap(1);
      setLevelBitmap(bmp1);
      currentBitmapRef.current = bmp1;
      themeNameRef.current = getThemeName(1);
      setStatus("playing");
      sfxStart();
      startMusic(levelRef.current);
    };

    const nextLevel = () => {
      const nl = levelRef.current + 1;
      levelRef.current = nl;
      setLevel(nl);
      const ld = getLevelData(nl);
      levelDataRef.current = ld;
      cellsRef.current = new Uint8Array(TOTAL);
      trailRef.current = [];
      drawingRef.current = false;
      playerRef.current = { x: 0, y: Math.floor(GRID_H / 2) };
      resetQix(true);
      resetSparks();
      particlesRef.current = [];
      powerUpsRef.current = [];
      playerShieldRef.current = 0;
      playerSpeedBoostRef.current = 0;
      playerBombRef.current = 0;
      freezeTimerRef.current = 0;
      slowTimerRef.current = 0;
      moveTimerRef.current = 0;
      deathAnimRef.current = 0;
      invincibleFramesRef.current = 0;
      lastCaptureFrameRef.current = 0;
      const bmpN = generateLevelBitmap(nl);
      setLevelBitmap(bmpN);
      currentBitmapRef.current = bmpN;
      themeNameRef.current = getThemeName(nl);
      setSurface(0);
      setCombo(0);
      setStatus("playing");
      sfxLevelUp();
      startMusic(levelRef.current);
    };

    const killPlayer = () => {
      if (statusRef.current !== "playing") return;
      if (invincibleFramesRef.current > 0) return;

      // Bouclier
      if (playerShieldRef.current > 0) {
        playerShieldRef.current = 0;
        invincibleFramesRef.current = 30;
        spawnParticles(particlesRef.current, (playerRef.current.x + 0.5) * CELL, (playerRef.current.y + 0.5) * CELL, "#00d4ff", 8, 2);
        return;
      }

      const p = playerRef.current;
      spawnParticles(particlesRef.current, (p.x + 0.5) * CELL, (p.y + 0.5) * CELL, "#ff003c", 25, 4);
      sfxDeath();
      stopMusic();
      setCombo(0);

      if (livesRef.current > 1) {
        livesRef.current -= 1;
        setLives(livesRef.current);
        deathAnimRef.current = 50;
      } else {
        livesRef.current = 0;
        setLives(0);
        setStatus("gameover");
      }
    };

    const completeCapture = () => {
      const cells = cellsRef.current;
      const trail = trailRef.current;

      // Snapshot avant capture pour le flash visuel
      const previousCells = new Uint8Array(cells);

      // Particules sur la ligne
      for (const t of trail) {
        if (Math.random() > 0.65) {
          spawnParticles(particlesRef.current, (t.x + 0.5) * CELL, (t.y + 0.5) * CELL, "#00ff41", 2, 2);
        }
      }

      const capturedCount = tryCapture(cells, trail, qixRef.current);
      flashCapturedArea(cells, previousCells, frameRef.current);

      // Si le Qix est coincé dans une toute petite zone, le relocaliser
      const newCenter = findLargestEmptyZoneCenter(cells);
      if (newCenter) {
        const qx = Math.floor(qixRef.current.x);
        const qy = Math.floor(qixRef.current.y);
        // Vérifier la taille de la zone du Qix via BFS simple
        const zoneSize = getQixZoneSize(cells, qx, qy);
        if (zoneSize < 40) {
          qixRef.current.x = newCenter.x;
          qixRef.current.y = newCenter.y;
          spawnParticles(particlesRef.current, newCenter.x * CELL, newCenter.y * CELL, COLOR_QIX_CYAN, 10, 2);
        }
      }

      trailRef.current = [];
      drawingRef.current = false;

      // Replacer le joueur
      const p = playerRef.current;
      const near = findNearestWalkable(cells, Math.floor(p.x), Math.floor(p.y));
      if (near) {
        playerRef.current = { x: near.x, y: near.y };
      } else {
        playerRef.current = { x: 0, y: Math.floor(GRID_H / 2) };
      }

      const pct = computeSurface(cells);
      setSurface(pct);

      // Score : combo si captures rapprochées
      const frame = frameRef.current;
      if (frame - lastCaptureFrameRef.current < 80) {
        comboCountRef.current += 1;
        setCombo(comboCountRef.current);
      } else {
        comboCountRef.current = 1;
        setCombo(1);
      }
      lastCaptureFrameRef.current = frame;

      const comboBonus = Math.min(comboCountRef.current - 1, 5) * 20;
      const areaBonus = capturedCount > 0 ? capturedCount * 3 : 0;
      scoreRef.current += 100 + areaBonus + comboBonus;
      setScore(scoreRef.current);

      if (capturedCount > 0) {
        sfxCapture();
        spawnPowerUp(cells);
        const pctGain = ((capturedCount / TOTAL) * 100).toFixed(1);
        setCaptureMsg({
          text: comboCountRef.current > 1 ? `COMBO x${comboCountRef.current} !` : "CAPTURE !",
          sub: `+${capturedCount} cases (+${pctGain}%)`,
        });
        window.setTimeout(() => setCaptureMsg(null), 1500);
      }

      // Victoire ?
      const winPct = winPercentForLevel(levelRef.current);
      if (pct >= winPct) {
        setRevealActive(true);
        sfxWin();
        stopMusic();
        window.setTimeout(() => {
          setStatus("won");
          setRevealActive(false);
        }, 1600);
      }
    };

    // -------- BOMBE --------
    const useBomb = () => {
      if (playerBombRef.current <= 0) return;
      playerBombRef.current = 0;

      const cells = cellsRef.current;
      const player = playerRef.current;
      const px = Math.floor(player.x);
      const py = Math.floor(player.y);
      const radius = 6;

      let cleared = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = px + dx;
          const ny = py + dy;
          if (!inBounds(nx, ny)) continue;
          if (Math.abs(dx) + Math.abs(dy) > radius) continue;
          if (cells[idx(nx, ny)] === 1) {
            cells[idx(nx, ny)] = 0;
            cleared++;
          }
        }
      }

      if (cleared > 0) {
        spawnParticles(particlesRef.current, (px + 0.5) * CELL, (py + 0.5) * CELL, "#ffdd00", 20, 5);
        const pct = computeSurface(cells);
        setSurface(pct);
        scoreRef.current += cleared * 5;
        setScore(scoreRef.current);
        sfxPowerUp();
      }
    };

    // -------- MOUVEMENT --------
    const attemptMove = (dx: number, dy: number) => {
      if (statusRef.current !== "playing") return;
      if (deathAnimRef.current > 0) return;

      const p = playerRef.current;
      const cells = cellsRef.current;
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (!inBounds(nx, ny)) return;
      const nidx = idx(nx, ny);

      // Ramasser power-up
      for (let i = powerUpsRef.current.length - 1; i >= 0; i--) {
        const pu = powerUpsRef.current[i];
        if (pu.x === nx && pu.y === ny) {
          switch (pu.type) {
            case "speed": playerSpeedBoostRef.current = 350; break;
            case "shield": playerShieldRef.current = 350; break;
            case "bomb": playerBombRef.current = 1; break;
            case "life": livesRef.current = Math.min(livesRef.current + 1, 7); setLives(livesRef.current); break;
            case "freeze": freezeTimerRef.current = 200; break;
            case "slow": slowTimerRef.current = 300; break;
          }
          sfxPowerUp();
          powerUpsRef.current.splice(i, 1);
        }
      }

      if (drawingRef.current) {
        // ----- EN TRAIN DE TRACER -----

        const isReturningToStart = trailRef.current.length > 0 && trailRef.current[0].x === nx && trailRef.current[0].y === ny;

        // 1) Retour à la case de départ : capture en boucle fermée
        if (isReturningToStart) {
          cells[nidx] = 2;
          trailRef.current.push({ x: nx, y: ny });
          playerRef.current = { x: nx, y: ny };
          completeCapture();
          postMoveSound();
          return;
        }

        // 2) Retour sur la trail existante : marche arrière
        if (cells[nidx] === 2) {
          // On efface toutes les cases de trail depuis la fin jusqu'à cette case
          while (trailRef.current.length > 0) {
            const last = trailRef.current.pop()!;
            cells[idx(last.x, last.y)] = 0;
            if (last.x === nx && last.y === ny) break;
          }
          playerRef.current = { x: nx, y: ny };
          if (trailRef.current.length === 0) drawingRef.current = false;
          postMoveSound();
          return;
        }

        // 3) Retour sur une bordure capturée/bord écran : capture
        if (isBorderCell(nx, ny, cells)) {
          cells[nidx] = 2;
          trailRef.current.push({ x: nx, y: ny });
          playerRef.current = { x: nx, y: ny };
          completeCapture();
          postMoveSound();
          return;
        }

        // 4) Continuer à tracer dans le vide
        if (isEmptyForTrail(nx, ny, cells)) {
          cells[nidx] = 2;
          trailRef.current.push({ x: nx, y: ny });
          playerRef.current = { x: nx, y: ny };
          postMoveSound();
          return;
        }
      } else {
        // ----- PAS EN TRAIN DE TRACER -----

        // On entre dans la zone vide depuis une case bord → début traçage
        if (isEmptyForTrail(nx, ny, cells) && !isBorderCell(nx, ny, cells)) {
          cells[idx(p.x, p.y)] = 2;
          trailRef.current.push({ x: p.x, y: p.y });
          cells[nidx] = 2;
          trailRef.current.push({ x: nx, y: ny });
          playerRef.current = { x: nx, y: ny };
          drawingRef.current = true;
          postMoveSound();
          return;
        }

        // Déplacement normal le long d'une bordure
        if (isBorderCell(nx, ny, cells)) {
          playerRef.current = { x: nx, y: ny };
          postMoveSound();
          return;
        }
      }
    };

    const postMoveSound = () => {
      const now = frameRef.current;
      if (now - lastMoveSoundRef.current > 5) {
        sfxMove();
        lastMoveSoundRef.current = now;
      }
    };

    const getQixZoneSize = (cells: Uint8Array, qx: number, qy: number): number => {
      if (!inBounds(qx, qy) || cells[idx(qx, qy)] !== 0) return 0;
      const visited = new Uint8Array(TOTAL);
      const stack: number[] = [];
      let size = 0;
      stack.push(idx(qx, qy));
      visited[idx(qx, qy)] = 1;
      while (stack.length) {
        const cur = stack.pop()!;
        size++;
        const cx = cur % GRID_W;
        const cy = Math.floor(cur / GRID_W);
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of dirs) {
          const nx = cx + dx, ny = cy + dy;
          if (!inBounds(nx, ny)) continue;
          const nidx = idx(nx, ny);
          if (cells[nidx] !== 0 || visited[nidx]) continue;
          visited[nidx] = 1;
          stack.push(nidx);
        }
      }
      return size;
    };

    // -------- UPDATE QIX --------
    const updateQix = () => {
      const qix = qixRef.current;
      const cells = cellsRef.current;
      const R = qix.size;
      const ld = levelDataRef.current;

      // Rebond sur les murs capturés
      const hits = [
        { dx: R, dy: 0, flipX: true },
        { dx: -R, dy: 0, flipX: true },
        { dx: 0, dy: R, flipY: true },
        { dx: 0, dy: -R, flipY: true },
      ];

      let hitX = false, hitY = false;
      for (const h of hits) {
        const ix = Math.floor(qix.x + h.dx);
        const iy = Math.floor(qix.y + h.dy);
        if (!inBounds(ix, iy) || cells[idx(ix, iy)] === 1) {
          if (h.flipX) hitX = true;
          if (h.flipY) hitY = true;
        }
      }
      if (hitX) qix.vx *= -1;
      if (hitY) qix.vy *= -1;

      // Perturbation chaotique proportionnelle au niveau
      const chaos = 0.04 + ld.qixSpeed * 0.3;
      const ang = Math.atan2(qix.vy, qix.vx) + (Math.random() - 0.5) * chaos;
      const sp = ld.qixSpeed * (0.85 + Math.random() * 0.3);
      qix.vx = Math.cos(ang) * sp;
      qix.vy = Math.sin(ang) * sp;

      qix.x += qix.vx;
      qix.y += qix.vy;
      qix.angle += qix.angVel;
      qix.pulse = Math.sin(frameRef.current * 0.08) * 0.12;

      // Clamp
      qix.x = Math.max(R, Math.min(GRID_W - R, qix.x));
      qix.y = Math.max(R, Math.min(GRID_H - R, qix.y));

      // Particules
      if (frameRef.current % 5 === 0) {
        spawnParticles(particlesRef.current, qix.x * CELL, qix.y * CELL, Math.random() > 0.5 ? COLOR_QIX_YELLOW : COLOR_QIX_CYAN, 1, 0.8);
      }

      // Collision joueur (avec invincibilité après bouclier)
      if (invincibleFramesRef.current <= 0) {
        const player = playerRef.current;
        const dPlayer = Math.hypot(qix.x - (player.x + 0.5), qix.y - (player.y + 0.5));
        if (dPlayer < R + 0.6) { killPlayer(); return; }

        // Collision trail
        if (drawingRef.current) {
          for (const t of trailRef.current) {
            const d = Math.hypot(qix.x - (t.x + 0.5), qix.y - (t.y + 0.5));
            if (d < R + 0.5) { killPlayer(); return; }
          }
        }
      }
    };

    // -------- UPDATE SPARKS --------
    const updateSparks = () => {
      const cells = cellsRef.current;
      const sparks = sparksRef.current;
      const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];

      for (const s of sparks) {
        s.timer--;
        if (s.timer > 0) continue;
        s.timer = s.speed;

        // Mode hunter : se dirige vers le joueur avec probabilité
        let preferred: number | null = null;
        if (s.type === "hunter" && Math.random() < 0.4) {
          const player = playerRef.current;
          const dx = player.x - s.x;
          const dy = player.y - s.y;
          if (Math.abs(dx) > Math.abs(dy)) {
            preferred = dx > 0 ? 1 : 3;
          } else {
            preferred = dy > 0 ? 2 : 0;
          }
        }

        const candidates: number[] = [];
        const preferredCandidates: number[] = [];
        for (let d = 0; d < 4; d++) {
          const [dx, dy] = dirs[d];
          const nx = s.x + dx, ny = s.y + dy;
          if (nx === s.px && ny === s.py) continue;
          if (isSparkWalkable(nx, ny, cells)) {
            candidates.push(d);
            if (d === preferred) preferredCandidates.push(d);
          }
        }

        let chosen: number;
        if (preferredCandidates.length > 0) {
          chosen = preferredCandidates[Math.floor(Math.random() * preferredCandidates.length)];
        } else if (candidates.length === 0) {
          chosen = (s.dir + 2) % 4;
        } else if (candidates.includes(s.dir)) {
          chosen = s.dir;
        } else {
          chosen = candidates[Math.floor(Math.random() * candidates.length)];
        }

        const [dx, dy] = dirs[chosen];
        s.px = s.x; s.py = s.y;
        s.x += dx; s.y += dy;
        s.dir = chosen;

        if (invincibleFramesRef.current <= 0) {
          const player = playerRef.current;
          if (s.x === player.x && s.y === player.y) { killPlayer(); return; }
          if (drawingRef.current) {
            for (const t of trailRef.current) {
              if (s.x === t.x && s.y === t.y) { killPlayer(); return; }
            }
          }
        }
      }
    };

    // -------- UPDATE POWERUPS --------
    const updatePowerUps = () => {
      const pus = powerUpsRef.current;
      for (let i = pus.length - 1; i >= 0; i--) {
        pus[i].life--;
        if (pus[i].life <= 0) pus.splice(i, 1);
      }
    };

    // -------- UPDATE TIMERS --------
    const updateTimers = () => {
      if (playerShieldRef.current > 0) playerShieldRef.current--;
      if (playerSpeedBoostRef.current > 0) playerSpeedBoostRef.current--;
      if (invincibleFramesRef.current > 0) invincibleFramesRef.current--;
      if (freezeTimerRef.current > 0) freezeTimerRef.current--;
      if (slowTimerRef.current > 0) slowTimerRef.current--;
    };

    // -------- DIRECTION --------
    const getDirFromKeys = (): { x: number; y: number } => {
      const keys = keysRef.current;
      if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) return { x: 0, y: -1 };
      if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) return { x: 0, y: 1 };
      if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) return { x: -1, y: 0 };
      if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) return { x: 1, y: 0 };
      return touchDirRef.current;
    };

    // -------- LOOP --------
    let raf = 0;
    const loop = () => {
      frameRef.current++;
      const st = statusRef.current;

      if (st === "playing") {
        if (deathAnimRef.current > 0) {
          deathAnimRef.current--;
          if (deathAnimRef.current === 0) {
            resetRound();
            startMusic(levelRef.current);
          }
        } else {
          const moveDelay = playerSpeedBoostRef.current > 0 ? 2 : 5;
          moveTimerRef.current--;
          if (moveTimerRef.current <= 0) {
            const dir = getDirFromKeys();
            if (dir.x !== 0 || dir.y !== 0) {
              attemptMove(dir.x, dir.y);
              moveTimerRef.current = moveDelay;
            }
            // Mémoriser la position pour la traînée
            pushPlayerTrail(playerRef.current);
          }
          if (freezeTimerRef.current <= 0) {
            if (slowTimerRef.current > 0 && frameRef.current % 2 === 0) {
              updateQix();
            } else if (slowTimerRef.current <= 0) {
              updateQix();
            }
          }
          if (statusRef.current === "playing") {
            if (freezeTimerRef.current <= 0) {
              updateSparks();
            }
            updateParticles(particlesRef.current);
            updatePowerUps();
            updateTimers();
          }
        }
      }

      if (st === "ready") {
        drawTitleScreen(ctx, frameRef.current);
      } else {
        render(
          ctx,
          cellsRef.current,
          qixRef.current,
          sparksRef.current,
          trailRef.current,
          playerRef.current,
          particlesRef.current,
          powerUpsRef.current,
          frameRef.current,
          playerShieldRef.current,
          playerSpeedBoostRef.current,
          levelDataRef.current,
          invincibleFramesRef.current > 0,
          freezeTimerRef.current > 0,
        );
      }

      raf = requestAnimationFrame(loop);
    };

    // -------- INPUT --------
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "w", "a", "s", "d", "W", "A", "S", "D", "b", "B"].includes(key)) {
        e.preventDefault();
      }

      if (key === "b" || key === "B") {
        useBomb();
        return;
      }

      if (key === "Escape" || key === "p" || key === "P") {
        if (statusRef.current === "playing") { setStatus("paused"); stopMusic(); }
        else if (statusRef.current === "paused") { setStatus("playing"); startMusic(levelRef.current); }
        return;
      }
      if (key === "m" || key === "M") { handleMute(); return; }

      if (key === " " || key === "Enter") {
        if (statusRef.current === "ready" || statusRef.current === "gameover") newGame();
        else if (statusRef.current === "won") nextLevel();
        else if (statusRef.current === "paused") { setStatus("playing"); startMusic(levelRef.current); }
        return;
      }
      keysRef.current.add(key);
    };

    const onKeyUp = (e: KeyboardEvent) => { keysRef.current.delete(e.key); };

    // Touch
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      touchStartRef.current = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!touchStartRef.current) return;
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const dx = touch.clientX - rect.left - touchStartRef.current.x;
      const dy = touch.clientY - rect.top - touchStartRef.current.y;
      const th = 15;
      if (Math.abs(dx) > Math.abs(dy)) {
        touchDirRef.current = { x: dx > th ? 1 : dx < -th ? -1 : 0, y: 0 };
      } else {
        touchDirRef.current = { x: 0, y: dy > th ? 1 : dy < -th ? -1 : 0 };
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      touchStartRef.current = null;
      touchDirRef.current = { x: 0, y: 0 };
      const st = statusRef.current;
      if (st === "ready" || st === "gameover") newGame();
      else if (st === "won") nextLevel();
      else if (st === "paused") { setStatus("playing"); startMusic(levelRef.current); }
    };

    // Init
    resetQix(true);
    resetSparks();
    drawTitleScreen(ctx, 0);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      cancelAnimationFrame(raf);
      stopMusic();
    };
  }, [handleMute]);

  // ============================================================
  // RENDU HUD
  // ============================================================
  const renderLives = () => (
    <div className="flex items-center gap-1">
      {Array.from({ length: Math.max(0, lives) }).map((_, i) => (
        <div key={i} className="h-2.5 w-2.5 bg-green-500 shadow-[0_0_8px_#00ff41]" />
      ))}
    </div>
  );

  const statusText: Record<Status, string> = {
    ready: "PRÊT ?",
    playing: "EN COURS",
    paused: "PAUSE",
    gameover: "GAME OVER",
    won: "NIVEAU RÉUSSI !",
  };
  const statusColor: Record<Status, string> = {
    ready: "text-yellow-400",
    playing: "text-green-400",
    paused: "text-cyan-400",
    gameover: "text-red-500",
    won: "text-cyan-400",
  };

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-black select-none">
      {/* Splendide fond d'armoire d'arcade HD avec effet de flou pour sublimer l'ambiance */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center opacity-30 blur-[8px]"
        style={{ backgroundImage: `url('${UI_IMAGES.arcadeCabinet.src}')` }}
      />
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-black via-transparent to-black opacity-80" />

      {/* Rendu principal arène/CRT */}
      <div className="crt-screen relative z-20 h-full w-full max-w-[1280px] shadow-[0_0_80px_rgba(0,0,0,0.9)]">
        <canvas
          ref={canvasRef}
          width={GRID_W * CELL}
          height={GRID_H * CELL}
          className="pixelated h-full w-full object-contain"
        />
      </div>

      {/* HUD */}
      <div className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-between p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="font-['Press_Start_2P'] text-[7px] leading-relaxed tracking-widest text-green-400 drop-shadow-[0_0_6px_rgba(74,222,128,0.8)] sm:text-[10px] md:text-xs">
              GRID EVADER (QIX STYLE)
            </h1>
            <p className="mt-0.5 font-['VT323'] text-xs text-cyan-300 opacity-70 sm:text-sm">
              Capturez la grille · Évitez le Qix
            </p>
          </div>
          <div className="flex flex-col items-end gap-0.5 font-['VT323'] text-sm text-green-300 sm:text-base">
            <div className="flex items-center gap-2">
              <span className="text-yellow-400">N.{level}</span>
              <span>SC:{score.toString().padStart(6, "0")}</span>
            </div>
            {themeNameRef.current && status === "playing" && (
              <div className="text-[10px] text-purple-300 opacity-60">🖼 {themeNameRef.current}</div>
            )}
            {combo > 1 && (
              <span className="text-orange-400 text-xs animate-pulse">COMBO x{combo}!</span>
            )}
            <div>SURF: {surface.toFixed(0)}% / {winPercentForLevel(level)}%</div>
            <div className="flex items-center gap-2">
              <span>VIES :</span>
              {renderLives()}
            </div>
            <div className="flex flex-wrap items-center gap-1 text-xs">
              {playerShieldRef.current > 0 && <span className="text-cyan-400">☆{Math.ceil(playerShieldRef.current / 60)}s</span>}
              {playerSpeedBoostRef.current > 0 && <span className="text-yellow-400">⚡{Math.ceil(playerSpeedBoostRef.current / 60)}s</span>}
              {playerBombRef.current > 0 && <span className="text-orange-400">💣B</span>}
              {freezeTimerRef.current > 0 && <span className="text-blue-300">❄{Math.ceil(freezeTimerRef.current / 60)}s</span>}
              {slowTimerRef.current > 0 && <span className="text-purple-300">◎{Math.ceil(slowTimerRef.current / 60)}s</span>}
            </div>
          </div>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="font-['VT323'] text-[10px] text-cyan-300 opacity-50 sm:text-xs">
            <div>FLÈCHES/WASD · ESPACE · ÉCHAP:pause · M:son · B:bombe</div>
            <div className="mt-0.5">Créateur : Hylst - Geoffroy avec l&apos;aide d&apos;une IA</div>
          </div>
          <button
            onClick={handleMute}
            className="pointer-events-auto rounded border border-cyan-700 bg-black/60 px-2 py-0.5 font-['VT323'] text-xs text-cyan-300 hover:bg-cyan-900/40"
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
      </div>

      {/* Message CAPTURE flottant */}
      {captureMsg && status === "playing" && (
        <div className="pointer-events-none absolute left-1/2 top-1/3 z-35 -translate-x-1/2 text-center">
          <div className="animate-bounce font-['Press_Start_2P'] text-sm text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.8)] sm:text-base">
            {captureMsg.text}
          </div>
          <div className="font-['VT323'] text-base text-green-300">
            {captureMsg.sub}
          </div>
        </div>
      )}

      {/* Animation de révélation complète de la magnifique illustration HD */}
      {revealActive && (
        <div className="pointer-events-none absolute inset-0 z-45 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-500">
          <div className="relative flex flex-col items-center">
            <img
              src={getHDImageForLevel(level).src}
              alt="Level Complete"
              className="max-h-[70vh] max-w-[85vw] rounded-lg border-2 border-cyan-400 object-contain animate-pulse shadow-[0_0_60px_rgba(34,211,238,0.7)] transition-transform"
            />
            <div className="absolute -bottom-8 font-['Press_Start_2P'] text-base text-yellow-300 drop-shadow-[0_0_12px_rgba(255,200,0,1)] animate-bounce sm:text-xl">
              ILLUSTRATION DÉVERROUILLÉE !
            </div>
          </div>
        </div>
      )}

      {/* Overlays */}
      {(status === "ready" || status === "gameover" || status === "won" || status === "paused") && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80">
          <div className="flicker text-center px-4 max-w-md">
            <h2 className={`font-['Press_Start_2P'] text-base leading-relaxed drop-shadow-[0_0_12px_rgba(255,255,255,0.5)] sm:text-xl md:text-2xl ${statusColor[status]}`}>
              {statusText[status]}
            </h2>

            {status === "ready" && (
              <div className="mt-4 space-y-3">
                <p className="font-['VT323'] text-lg text-green-300 sm:text-xl">
                  Appuyez sur ESPACE ou TAPEZ pour jouer
                </p>
                <button onClick={() => setShowControls(!showControls)}
                  className="pointer-events-auto font-['VT323'] text-sm text-cyan-400 underline hover:text-cyan-300">
                  {showControls ? "Masquer les règles" : "📖 Comment jouer"}
                </button>
                {showControls && (
                  <div className="mt-2 rounded border border-cyan-800 bg-black/80 p-3 text-left font-['VT323'] text-xs sm:text-sm text-cyan-200 space-y-1">
                    <p>🎯 <b>But :</b> Capturez {winPercentForLevel(level)}% de la grille</p>
                    <p>🟢 Déplacez-vous le long des bords violets</p>
                    <p>✏️ Entrez dans la zone noire pour tracer</p>
                    <p>🔙 Revenez sur un bord violet pour capturer</p>
                    <p>💡 La plus petite zone découpée est capturée</p>
                    <p>🟡 Évitez le Qix (forme géométrique)</p>
                    <p>🔴 Évitez les étincelles sur les lignes</p>
                    <p>⭐ Bonus : ⚡=vitesse ★=bouclier 💣=bombe ❄=gel ◎=ralenti ♥=vie</p>
                    <p>⌨️ B = utiliser une bombe · Chaque pièce dévoile l&apos;image !</p>
                    <p>🔄 Marche arrière possible en traçant</p>
                  </div>
                )}
              </div>
            )}

            {status === "paused" && (
              <p className="mt-4 font-['VT323'] text-lg text-green-300 sm:text-xl">
                ESPACE ou ÉCHAP pour reprendre
              </p>
            )}

            {(status === "gameover" || status === "won") && (
              <div className="mt-4 space-y-2">
                <p className="font-['VT323'] text-lg text-green-300 sm:text-xl">
                  {status === "won" ? `🖼 "${themeNameRef.current}" dévoilé ! Niveau ${level} terminé !` : "Partie terminée"}
                </p>
                <p className="font-['VT323'] text-base text-cyan-300">
                  Score : {score.toString().padStart(6, "0")} · Surface : {surface.toFixed(0)}%
                </p>
                <p className="mt-2 font-['VT323'] text-base text-yellow-300">
                  {status === "won" ? "ESPACE pour le niveau suivant" : "ESPACE pour rejouer"}
                </p>
              </div>
            )}

            <p className="mt-6 font-['VT323'] text-[10px] text-gray-500">
              Créateur : Hylst - Geoffroy avec l&apos;aide d&apos;une IA
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
