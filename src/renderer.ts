import {
  GRID_W,
  GRID_H,
  CELL,
  TOTAL,
  idx,
  inBounds,
  type Qix,
  type Spark,
  type Particle,
  type PowerUp,
  type LevelData,
} from "./game";

const COLOR_BG = "#000000";
const COLOR_GRID = "#0a0510";
const COLOR_SPARK = "#ff003c";
const COLOR_SPARK_FAST = "#ff6600";
const COLOR_SPARK_HUNTER = "#ff4400";
const COLOR_QIX_YELLOW = "#facc15";
const COLOR_QIX_CYAN = "#22d3ee";
const COLOR_QIX_MAGENTA = "#e879f9";
const COLOR_QIX_WIRE = "#f1f5f9";

let scanlineOffset = 0;

const flashCells = new Map<number, number>();
let currentBitmap: ImageData | null = null;

export function setLevelBitmap(bitmap: ImageData | null) { currentBitmap = bitmap; }

export function flashCapturedArea(cells: Uint8Array, previousCells: Uint8Array | null, frame: number) {
  if (!previousCells) return;
  for (let i = 0; i < TOTAL; i++) {
    if (cells[i] === 1 && previousCells[i] !== 1) flashCells.set(i, frame + 20);
  }
}

// Pulsing trail history for sparks and player
const sparkTrails: { x: number; y: number; life: number }[][] = [];
const playerTrail: { x: number; y: number; life: number }[] = [];

export function pushSparkTrail(s: Spark) {
  const arr = sparkTrails[s.x + s.y * 1000] ?? [];
  arr.push({ x: s.x, y: s.y, life: 10 });
  if (arr.length > 8) arr.shift();
  sparkTrails[s.x + s.y * 1000] = arr;
}

export function pushPlayerTrail(p: { x: number; y: number }) {
  playerTrail.push({ x: p.x, y: p.y, life: 8 });
  if (playerTrail.length > 6) playerTrail.shift();
}

export function render(
  ctx: CanvasRenderingContext2D,
  cells: Uint8Array,
  qix: Qix,
  sparks: Spark[],
  trail: { x: number; y: number }[],
  player: { x: number; y: number },
  particles: Particle[],
  powerUps: PowerUp[],
  frame: number,
  playerShield: number,
  playerSpeedBoost: number,
  levelData: LevelData,
  invincible: boolean,
  frozen: boolean,
) {
  const w = GRID_W * CELL, h = GRID_H * CELL;

  // Fond avec gradient subtil
  const bgGrad = ctx.createRadialGradient(w/2, h/2, 50, w/2, h/2, w * 0.7);
  bgGrad.addColorStop(0, "#08041a");
  bgGrad.addColorStop(1, COLOR_BG);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  drawCaptured(ctx, cells, frame, levelData);
  drawGrid(ctx);

  // Trail du joueur (pulse)
  drawPlayerTrail(ctx, frame);

  drawTrail(ctx, trail, frame);
  drawWalkableBorders(ctx, cells, levelData);
  drawPowerUps(ctx, powerUps, frame);
  if (frozen) drawQixFrozen(ctx, qix, frame);
  else drawQix(ctx, qix, frame, frame);
  drawPlayer(ctx, player, frame, playerShield, playerSpeedBoost, invincible);
  drawSparks(ctx, sparks, frame, frozen);
  drawParticles(ctx, particles);
  drawScanlines(ctx);

  // Vignette
  const vig = ctx.createRadialGradient(w/2, h/2, w * 0.3, w/2, h/2, w * 0.75);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

function drawCaptured(ctx: CanvasRenderingContext2D, cells: Uint8Array, frame: number, ld: LevelData) {
  const w = GRID_W * CELL;
  const h = GRID_H * CELL;
  const hdImg = ld.hdImage.loaded && ld.hdImage.img ? ld.hdImage.img : null;
  const hasBmp = currentBitmap !== null;
  const bmpData = currentBitmap?.data;

  // 1) Dessiner l'image HD sous un clip de toutes les cases capturées !
  if (hdImg) {
    ctx.save();
    ctx.beginPath();
    let capCount = 0;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (cells[idx(x, y)] === 1) {
          ctx.rect(x * CELL, y * CELL, CELL, CELL);
          capCount++;
        }
      }
    }
    if (capCount > 0) {
      ctx.clip();
      ctx.drawImage(hdImg, 0, 0, w, h);
      // Léger overlay coloré du niveau
      ctx.fillStyle = ld.colors.cap;
      ctx.globalAlpha = 0.15;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  // 2) Boucle pour dessiner les effets : fallback si pas HD, animations, flash, contour
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const i = idx(x, y);
      if (cells[i] !== 1) continue;
      const px = x * CELL, py = y * CELL;

      const flashEnd = flashCells.get(i);
      const flashing = flashEnd !== undefined && flashEnd >= frame;
      const flashInt = flashing ? (flashEnd! - frame) / 20 : 0;

      // Dessiner le fallback si l'image HD n'est pas disponible
      if (!hdImg) {
        if (hasBmp && bmpData) {
          const bi = (y * GRID_W + x) * 4;
          const r = bmpData[bi], g = bmpData[bi + 1], b = bmpData[bi + 2];
          ctx.fillStyle = `rgb(${r|0},${g|0},${b|0})`;
          ctx.fillRect(px, py, CELL, CELL);
          ctx.globalAlpha = 0.15;
          ctx.fillStyle = ld.colors.cap;
          ctx.fillRect(px, py, CELL, CELL);
          ctx.globalAlpha = 1;
        } else {
          const t = (frame / 30) | 0;
          const noise = (x * 13 + y * 7 + t) % 7;
          ctx.fillStyle = noise === 0 ? ld.colors.capLight : noise === 1 ? ld.colors.capDark : ld.colors.cap;
          ctx.fillRect(px, py, CELL, CELL);
        }
      }

      // Contour brillant
      const dirs: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H || cells[idx(nx, ny)] !== 1) {
          ctx.fillStyle = ld.colors.capEdge;
          ctx.globalAlpha = 0.6 + Math.sin(frame * 0.1 + x + y) * 0.3;
          if (dx === 1) ctx.fillRect(px + CELL - 1, py, 1, CELL);
          if (dx === -1) ctx.fillRect(px, py, 1, CELL);
          if (dy === 1) ctx.fillRect(px, py + CELL - 1, CELL, 1);
          if (dy === -1) ctx.fillRect(px, py, CELL, 1);
          ctx.globalAlpha = 1;
        }
      }

      // Flash sur la case capturée
      if (flashing) {
        ctx.globalAlpha = flashInt * 0.7;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(px, py, CELL, CELL);
        ctx.globalAlpha = 1;
      }
    }
  }

  for (const [i, end] of flashCells) if (end < frame) flashCells.delete(i);
}

function drawPlayerTrail(ctx: CanvasRenderingContext2D, _frame: number) {
  for (let i = 0; i < playerTrail.length; i++) {
    const t = playerTrail[i];
    if (t.life <= 0) continue;
    const px = t.x * CELL + CELL / 2;
    const py = t.y * CELL + CELL / 2;
    const a = (t.life / 8) * 0.4;
    ctx.fillStyle = `rgba(0, 255, 136, ${a})`;
    ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
  }
}

function drawGrid(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = COLOR_GRID;
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  // Lignes principales (toutes les 4)
  for (let x = 0; x <= GRID_W; x += 4) {
    ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, GRID_H * CELL);
  }
  // Lignes secondaires
  ctx.strokeStyle = "rgba(20,10,30,0.5)";
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  for (let x = 0; x <= GRID_W; x++) {
    if (x % 4 === 0) continue;
    ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, GRID_H * CELL);
  }
  for (let y = 0; y <= GRID_H; y++) {
    if (y % 4 === 0) continue;
    ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(GRID_W * CELL, y * CELL + 0.5);
  }
  ctx.stroke();

  // Lignes principales par-dessus
  ctx.strokeStyle = COLOR_GRID;
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  for (let y = 0; y <= GRID_H; y += 4) {
    ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(GRID_W * CELL, y * CELL + 0.5);
  }
  ctx.stroke();
}

function drawWalkableBorders(ctx: CanvasRenderingContext2D, cells: Uint8Array, ld: LevelData) {
  ctx.globalAlpha = 0.04;
  ctx.fillStyle = ld.colors.capEdge;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (cells[idx(x, y)] !== 0) continue;
      let isBorder = x === 0 || x === GRID_W - 1 || y === 0 || y === GRID_H - 1;
      if (!isBorder) {
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of dirs) {
          const nx = x + dx, ny = y + dy;
          if (!inBounds(nx, ny) || cells[idx(nx, ny)] === 1) { isBorder = true; break; }
        }
      }
      if (isBorder) ctx.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4);
    }
  }
  ctx.globalAlpha = 1;
}

function drawTrail(ctx: CanvasRenderingContext2D, trail: { x: number; y: number }[], frame: number) {
  if (trail.length === 0) return;
  for (let i = 0; i < trail.length; i++) {
    const t = trail[i];
    const px = t.x * CELL, py = t.y * CELL;
    const pulse = Math.sin(frame * 0.2 + i * 0.5) * 0.3 + 0.7;
    // Glow externe
    ctx.fillStyle = `rgba(0, 255, 122, ${pulse * 0.3})`;
    ctx.fillRect(px, py, CELL, CELL);
    // Cœur
    ctx.fillStyle = `rgba(0, 255, 122, ${pulse})`;
    ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
    ctx.fillStyle = `rgba(200, 255, 200, ${pulse * 0.6})`;
    ctx.fillRect(px + 3, py + 3, CELL - 6, CELL - 6);
  }
}

function drawQix(ctx: CanvasRenderingContext2D, qix: Qix, _frame: number, frame: number) {
  const cx = qix.x * CELL, cy = qix.y * CELL;
  const baseSize = qix.size * CELL;
  const pulse = Math.sin(frame * 0.08) * 0.12 + 1;
  const sz = baseSize * pulse;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(qix.angle);

  // Aura multiple
  ctx.shadowColor = COLOR_QIX_YELLOW;
  ctx.shadowBlur = 25;
  for (let r = 3; r > 1.5; r -= 0.3) {
    ctx.globalAlpha = (3 - r) * 0.08;
    ctx.strokeStyle = COLOR_QIX_MAGENTA;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(0, 0, sz * r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Étoile à 8 branches (jaune)
  ctx.strokeStyle = COLOR_QIX_YELLOW;
  ctx.shadowColor = COLOR_QIX_YELLOW;
  ctx.shadowBlur = 16;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI * 2) / 8 + frame * 0.05;
    const r = i % 2 === 0 ? sz * 2.2 : sz * 1.0;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.stroke();

  // Hexagone (cyan)
  ctx.strokeStyle = COLOR_QIX_CYAN;
  ctx.shadowColor = COLOR_QIX_CYAN;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const a = (i * Math.PI * 2) / 6 - frame * 0.04;
    const r = sz * 1.5 + Math.sin(frame * 0.12 + i) * 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Carré magenta (rotation inverse)
  ctx.strokeStyle = COLOR_QIX_MAGENTA;
  ctx.shadowColor = COLOR_QIX_MAGENTA;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const a = (i * Math.PI) / 2 + frame * 0.06;
    const r = sz * 1.2 + Math.cos(frame * 0.1 + i) * 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.stroke();

  // Filaments
  ctx.strokeStyle = COLOR_QIX_WIRE;
  ctx.shadowColor = COLOR_QIX_WIRE;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const a1 = i * 0.7 + frame * 0.1;
    const r1 = sz * (1.4 + Math.sin(frame * 0.13 + i * 1.3) * 0.6);
    const a2 = a1 + Math.PI + Math.sin(frame * 0.07 + i) * 0.5;
    const r2 = sz * (0.2 + Math.cos(frame * 0.11 + i) * 0.3);
    ctx.moveTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
    ctx.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2);
  }
  ctx.stroke();

  // Noyau (3 cercles concentriques)
  for (let i = 3; i >= 1; i--) {
    ctx.fillStyle = i === 1 ? COLOR_QIX_CYAN : i === 2 ? COLOR_QIX_YELLOW : COLOR_QIX_MAGENTA;
    ctx.shadowColor = i === 1 ? COLOR_QIX_CYAN : i === 2 ? COLOR_QIX_YELLOW : COLOR_QIX_MAGENTA;
    ctx.shadowBlur = 18 - i * 4;
    ctx.beginPath();
    ctx.arc(0, 0, sz * (0.3 - i * 0.08), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  ctx.shadowBlur = 0;
}

function drawQixFrozen(ctx: CanvasRenderingContext2D, qix: Qix, frame: number) {
  const cx = qix.x * CELL, cy = qix.y * CELL;
  const sz = qix.size * CELL;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(qix.angle);
  ctx.globalAlpha = 0.3 + Math.sin(frame * 0.08) * 0.15;
  ctx.strokeStyle = "#88ccff";
  ctx.shadowColor = "#88ccff";
  ctx.shadowBlur = 14;
  ctx.lineWidth = 2;
  for (let i = 0; i <= 6; i++) {
    const a = (i * Math.PI * 2) / 6;
    const r = sz * 2;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath(); ctx.stroke();
  ctx.fillStyle = "#88ccff";
  ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(0, 0, sz * 0.5, 0, Math.PI * 2); ctx.fill();
  // Cristaux
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + frame * 0.02;
    const r = sz * 0.8;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.shadowBlur = 0;
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  player: { x: number; y: number },
  frame: number,
  shield: number,
  speedBoost: number,
  invincible: boolean,
) {
  const px = player.x * CELL + CELL / 2;
  const py = player.y * CELL + CELL / 2;

  // Aura active
  if (shield > 0) {
    const a = (shield / 60);
    ctx.strokeStyle = `rgba(0, 212, 255, ${a * 0.7})`;
    ctx.shadowColor = "#00d4ff";
    ctx.shadowBlur = 12;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, 6 + Math.sin(frame * 0.3) * 1, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (speedBoost > 0) {
    const a = (speedBoost / 60);
    ctx.strokeStyle = `rgba(255, 221, 0, ${a * 0.6})`;
    ctx.shadowColor = "#ffdd00";
    ctx.shadowBlur = 12;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, 7 + Math.sin(frame * 0.4) * 1, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  // Clignotement invincible
  if (invincible && Math.floor(frame / 4) % 2 === 0) ctx.globalAlpha = 0.3;

  // Corps principal
  const c1 = "#00ff88";
  const c2 = "#aaffdd";
  ctx.fillStyle = c1;
  ctx.shadowColor = c1;
  ctx.shadowBlur = 10;
  ctx.fillRect(player.x * CELL + 1, player.y * CELL + 1, CELL - 2, CELL - 2);
  ctx.fillStyle = c2;
  ctx.shadowBlur = 6;
  ctx.fillRect(player.x * CELL + 3, player.y * CELL + 3, CELL - 6, CELL - 6);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(player.x * CELL + 4, player.y * CELL + 4, 2, 2);

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // Marqueur directionnel subtil
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(player.x * CELL + CELL / 2 - 1, player.y * CELL, 2, 1);
  ctx.fillRect(player.x * CELL + CELL / 2 - 1, player.y * CELL + CELL - 1, 2, 1);
  ctx.fillRect(player.x * CELL, player.y * CELL + CELL / 2 - 1, 1, 2);
  ctx.fillRect(player.x * CELL + CELL - 1, player.y * CELL + CELL / 2 - 1, 1, 2);
}

function drawSparks(ctx: CanvasRenderingContext2D, sparks: Spark[], frame: number, frozen: boolean) {
  for (const s of sparks) {
    const px = s.x * CELL + CELL / 2;
    const py = s.y * CELL + CELL / 2;
    const color = frozen ? "#88aacc" : s.type === "fast" ? COLOR_SPARK_FAST : s.type === "hunter" ? COLOR_SPARK_HUNTER : COLOR_SPARK;

    // Trainée
    const prevPx = s.px * CELL + CELL / 2;
    const prevPy = s.py * CELL + CELL / 2;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(prevPx, prevPy); ctx.lineTo(px, py);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Halo
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = s.type === "normal" ? 10 : 16;
    const size = s.type === "normal" ? 3 : 4;
    ctx.fillRect(px - size / 2 - 1, py - size / 2 - 1, size + 2, size + 2);

    // Noyau
    ctx.fillStyle = "#ffffff";
    ctx.shadowBlur = 6;
    ctx.fillRect(px - 1, py - 1, 2, 2);

    // Marqueur type (petit symbole)
    const flicker = Math.sin(frame * 0.4 + s.x * 3 + s.y * 2) * 0.3 + 0.7;
    ctx.globalAlpha = flicker;
    if (s.type === "hunter") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(px, py - 2, 1, 4);
      ctx.fillRect(px - 2, py, 4, 1);
    } else if (s.type === "fast") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
  }
  ctx.shadowBlur = 0;
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (const p of particles) {
    const a = p.life / p.maxLife;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 6 * a;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    // Petit halo
    if (p.size > 2) {
      ctx.globalAlpha = a * 0.3;
      ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
    }
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawPowerUps(ctx: CanvasRenderingContext2D, powerUps: PowerUp[], frame: number) {
  const info: Record<string, { color: string; sym: string }> = {
    speed: { color: "#ffdd00", sym: "⚡" },
    shield: { color: "#00d4ff", sym: "★" },
    bomb: { color: "#ff8800", sym: "💣" },
    life: { color: "#00ff41", sym: "♥" },
    freeze: { color: "#88ccff", sym: "❄" },
    slow: { color: "#cc88ff", sym: "◎" },
  };
  for (const pu of powerUps) {
    const px = pu.x * CELL + CELL / 2;
    const py = pu.y * CELL + CELL / 2;
    const i = info[pu.type] || info.speed;
    const pulse = Math.sin(frame * 0.12) * 2;
    const dying = pu.life < 120 && Math.floor(frame / 6) % 2 === 0;

    if (dying) ctx.globalAlpha = 0.4;

    // Anneau d'énergie tournant
    ctx.strokeStyle = i.color;
    ctx.shadowColor = i.color;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 1;
    ctx.globalAlpha *= 0.5 + Math.sin(frame * 0.15) * 0.3;
    ctx.beginPath();
    ctx.arc(px, py, 5 + pulse, frame * 0.05, frame * 0.05 + Math.PI * 1.5);
    ctx.stroke();

    ctx.globalAlpha = 1;
    // Corps
    ctx.fillStyle = i.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(px, py, 4 + pulse * 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#000";
    ctx.shadowBlur = 0;
    ctx.font = "bold 7px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(i.sym, px, py + 0.5);

    ctx.globalAlpha = 1;
  }
}

function drawScanlines(ctx: CanvasRenderingContext2D) {
  scanlineOffset = (scanlineOffset + 0.3) % 4;
  ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
  for (let y = Math.floor(scanlineOffset); y < GRID_H * CELL; y += 4) {
    ctx.fillRect(0, y, GRID_W * CELL, 1);
  }
}

export function drawTitleScreen(ctx: CanvasRenderingContext2D, frame: number) {
  const w = GRID_W * CELL, h = GRID_H * CELL;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);

  // Fond étoilé
  if (frame % 4 === 0) {
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.4 + Math.random() * 0.4;
    ctx.fillRect(Math.floor(Math.random() * w), Math.floor(Math.random() * h), 1, 1);
    ctx.globalAlpha = 1;
  }

  // Grille perspective
  ctx.strokeStyle = "rgba(20,10,40,0.6)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let x = 0; x <= GRID_W; x++) {
    const o = Math.sin(frame * 0.02 + x * 0.1) * 2;
    ctx.moveTo(x * CELL + 0.5, 0);
    ctx.lineTo(x * CELL + 0.5 + o, GRID_H * CELL);
  }
  ctx.stroke();

  // Logo Qix stylisé (rotation lente)
  const cx = w / 2, cy = h / 2 - 20;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(frame * 0.015);
  ctx.shadowColor = COLOR_QIX_YELLOW;
  ctx.shadowBlur = 20;
  ctx.strokeStyle = COLOR_QIX_YELLOW;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) {
    const a = (i * Math.PI * 2) / 8 + frame * 0.03;
    const r = i % 2 === 0 ? 35 : 18;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.stroke();
  ctx.strokeStyle = COLOR_QIX_CYAN;
  ctx.shadowColor = COLOR_QIX_CYAN;
  for (let i = 0; i <= 6; i++) {
    const a = (i * Math.PI * 2) / 6 - frame * 0.04;
    const r = 22 + Math.sin(frame * 0.06 + i) * 4;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.stroke();
  ctx.restore();
  ctx.shadowBlur = 0;

  drawScanlines(ctx);
}
