// Génération procédurale d'images bitmap uniques par niveau
// Chaque image est un canvas offscreen de GRID_W × GRID_H pixels
// dessiné avec des formes géométriques, dégradés et motifs

import { GRID_W, GRID_H } from "./game";

// Simple PRNG déterministe pour que chaque seed donne la même image
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const THEMES = [
  // 1. Coucher de soleil sur la mer
  { name: "Coucher de soleil",    sky: ["#0d1b2a","#1b2838","#fb8500","#ffb703","#ffd60a"], ground: "#14213d", accent: "#e63946" },
  // 2. Forêt enchantée
  { name: "Forêt enchantée",      sky: ["#0b3d0b","#1a5c1a","#2d8f2d","#55c455","#a8e6cf"], ground: "#0a2f0a", accent: "#ffdd00" },
  // 3. Cité futuriste
  { name: "Cité futuriste",       sky: ["#0a0a2e","#1a1a5e","#2a2a8e","#4040be","#6060ee"], ground: "#0a0a1e", accent: "#00ffff" },
  // 4. Désert doré
  { name: "Désert doré",          sky: ["#87ceeb","#f0e68c","#daa520","#cd853f","#8b4513"], ground: "#a0522d", accent: "#ff6347" },
  // 5. Espace profond
  { name: "Espace profond",       sky: ["#000011","#000033","#000066","#000033","#000011"], ground: "#000000", accent: "#ffffff" },
  // 6. Aurore boréale
  { name: "Aurore boréale",       sky: ["#0d0d2b","#1a0d3b","#2d1b69","#00cc99","#00ff88"], ground: "#050515", accent: "#ff00ff" },
  // 7. Volcan
  { name: "Volcan ardent",        sky: ["#1a0000","#330000","#660000","#cc3300","#ff6600"], ground: "#0d0000", accent: "#ffcc00" },
  // 8. Océan abyssal
  { name: "Océan abyssal",        sky: ["#000022","#001144","#002266","#003388","#0044aa"], ground: "#000011", accent: "#00ffcc" },
  // 9. Jardin japonais
  { name: "Jardin japonais",      sky: ["#ffeef2","#ffccdd","#ff99bb","#cc6699","#993366"], ground: "#2d1f2d", accent: "#ffffff" },
  // 10. Cristal de glace
  { name: "Cristal de glace",     sky: ["#e0f7fa","#b2ebf2","#80deea","#4dd0e1","#26c6da"], ground: "#004d40", accent: "#ffffff" },
  // 11. Apocalypse
  { name: "Monde dévasté",        sky: ["#1a1a1a","#333333","#4d4d4d","#666666","#804000"], ground: "#0d0d0d", accent: "#ff3300" },
  // 12. Paradis
  { name: "Paradis céleste",      sky: ["#fffde7","#fff9c4","#fff176","#ffee58","#ffeb3b"], ground: "#e8f5e9", accent: "#ff4081" },
];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function rgbStr(c: [number, number, number]): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function generateLevelBitmap(level: number): ImageData {
  const w = GRID_W;
  const h = GRID_H;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const rng = mulberry32(level * 7919 + 1337);

  const theme = THEMES[(level - 1) % THEMES.length];
  const skyColors = theme.sky.map(hexToRgb);
  const accentRgb = hexToRgb(theme.accent);
  const groundRgb = hexToRgb(theme.ground);

  // --- Fond dégradé vertical ---
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const segCount = skyColors.length - 1;
    const seg = Math.min(Math.floor(t * segCount), segCount - 1);
    const segT = (t * segCount) - seg;
    const c = lerpColor(skyColors[seg], skyColors[seg + 1], segT);
    ctx.fillStyle = rgbStr(c);
    ctx.fillRect(0, y, w, 1);
  }

  // --- Éléments par thème ---
  const themeIdx = (level - 1) % THEMES.length;

  if (themeIdx === 0) {
    // Coucher de soleil : soleil + reflets
    const sx = Math.floor(w * 0.5 + (rng() - 0.5) * 20);
    const sy = Math.floor(h * 0.4);
    ctx.fillStyle = "#ffb703";
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        if (dx * dx + dy * dy <= 36) {
          const px = sx + dx, py = sy + dy;
          if (px >= 0 && px < w && py >= 0 && py < h) {
            const dist = Math.sqrt(dx * dx + dy * dy) / 6;
            const alpha = 1 - dist * 0.6;
            ctx.globalAlpha = alpha;
            ctx.fillRect(px, py, 1, 1);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
    // Vagues
    for (let y = Math.floor(h * 0.6); y < h; y++) {
      for (let x = 0; x < w; x++) {
        const wave = Math.sin(x * 0.3 + y * 0.2 + rng() * 2) * 0.15;
        ctx.globalAlpha = 0.3 + wave;
        ctx.fillStyle = rgbStr(groundRgb);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  } else if (themeIdx === 1) {
    // Forêt : arbres
    for (let i = 0; i < 12; i++) {
      const tx = Math.floor(rng() * w);
      const ty = Math.floor(h * 0.3 + rng() * h * 0.5);
      const th = Math.floor(4 + rng() * 10);
      // Tronc
      ctx.fillStyle = "#5c4033";
      for (let dy = 0; dy < th; dy++) {
        if (ty + dy < h) ctx.fillRect(tx, ty + dy, 1, 1);
      }
      // Feuillage
      const fr = Math.floor(2 + rng() * 4);
      ctx.fillStyle = rgbStr(lerpColor(hexToRgb("#228B22"), accentRgb, rng() * 0.3));
      for (let dy = -fr; dy <= 1; dy++) {
        for (let dx = -fr; dx <= fr; dx++) {
          if (Math.abs(dx) + Math.abs(dy) <= fr + 1) {
            const px = tx + dx, py = ty + dy;
            if (px >= 0 && px < w && py >= 0 && py < h) ctx.fillRect(px, py, 1, 1);
          }
        }
      }
    }
  } else if (themeIdx === 2) {
    // Cité futuriste : bâtiments
    for (let i = 0; i < 18; i++) {
      const bx = Math.floor(rng() * w);
      const bw = Math.floor(2 + rng() * 5);
      const bh = Math.floor(5 + rng() * 20);
      const by = h - bh;
      const c = lerpColor(hexToRgb("#2a2a8e"), accentRgb, rng() * 0.4);
      ctx.fillStyle = rgbStr(c);
      ctx.fillRect(bx, by, bw, bh);
      // Fenêtres
      ctx.fillStyle = rgbStr(accentRgb);
      for (let wy = by + 1; wy < h - 1; wy += 3) {
        for (let wx = bx; wx < bx + bw; wx += 2) {
          if (rng() > 0.4 && wx < w) ctx.fillRect(wx, wy, 1, 1);
        }
      }
    }
  } else if (themeIdx === 3) {
    // Désert : dunes + pyramides
    for (let x = 0; x < w; x++) {
      const duneH = Math.floor(h * 0.6 + Math.sin(x * 0.08) * 5 + Math.sin(x * 0.03) * 8);
      for (let y = duneH; y < h; y++) {
        ctx.fillStyle = rgbStr(lerpColor(hexToRgb("#daa520"), groundRgb, (y - duneH) / (h - duneH)));
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // Pyramides
    for (let i = 0; i < 2; i++) {
      const px = Math.floor(15 + rng() * (w - 30));
      const py = Math.floor(h * 0.5);
      const ps = Math.floor(5 + rng() * 8);
      for (let row = 0; row < ps; row++) {
        ctx.fillStyle = rgbStr(lerpColor(hexToRgb("#cd853f"), accentRgb, row / ps * 0.3));
        ctx.fillRect(px - row, py + row, row * 2 + 1, 1);
      }
    }
  } else if (themeIdx === 4) {
    // Espace : étoiles + galaxie
    for (let i = 0; i < 120; i++) {
      const sx = Math.floor(rng() * w);
      const sy = Math.floor(rng() * h);
      const brightness = 0.3 + rng() * 0.7;
      ctx.globalAlpha = brightness;
      ctx.fillStyle = rng() > 0.9 ? rgbStr(accentRgb) : "#ffffff";
      ctx.fillRect(sx, sy, 1, 1);
    }
    ctx.globalAlpha = 1;
    // Nébuleuse
    for (let i = 0; i < 5; i++) {
      const nx = Math.floor(rng() * w);
      const ny = Math.floor(rng() * h);
      const nr = Math.floor(3 + rng() * 8);
      for (let dy = -nr; dy <= nr; dy++) {
        for (let dx = -nr; dx <= nr; dx++) {
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < nr) {
            const px = nx + dx, py = ny + dy;
            if (px >= 0 && px < w && py >= 0 && py < h) {
              ctx.globalAlpha = (1 - d / nr) * 0.2;
              ctx.fillStyle = i % 2 === 0 ? "#8800ff" : "#ff0088";
              ctx.fillRect(px, py, 1, 1);
            }
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  } else if (themeIdx === 5) {
    // Aurore boréale : bandes ondulantes
    for (let band = 0; band < 4; band++) {
      const by = Math.floor(h * 0.2 + band * h * 0.15);
      const color = band % 2 === 0 ? hexToRgb("#00cc99") : hexToRgb("#ff00ff");
      for (let x = 0; x < w; x++) {
        const wave = Math.sin(x * 0.15 + band * 2 + rng() * 0.5) * 3;
        const yy = Math.floor(by + wave);
        for (let dy = 0; dy < 3; dy++) {
          if (yy + dy >= 0 && yy + dy < h) {
            ctx.globalAlpha = 0.15 - dy * 0.04;
            ctx.fillStyle = rgbStr(color);
            ctx.fillRect(x, yy + dy, 1, 1);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
    // Étoiles
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.3 + rng() * 0.5;
      ctx.fillRect(Math.floor(rng() * w), Math.floor(rng() * h), 1, 1);
    }
    ctx.globalAlpha = 1;
  } else if (themeIdx === 6) {
    // Volcan : montagne + lave
    const peakX = Math.floor(w * 0.5 + (rng() - 0.5) * 10);
    const peakY = Math.floor(h * 0.2);
    for (let x = 0; x < w; x++) {
      const dist = Math.abs(x - peakX);
      const mountainH = Math.max(0, Math.floor((h - peakY) - dist * 0.8));
      for (let dy = 0; dy < mountainH; dy++) {
        const y = h - dy - 1;
        if (y >= 0 && y < h) {
          const lava = dy < 3 + rng() * 4 ? accentRgb : lerpColor(hexToRgb("#330000"), hexToRgb("#660000"), dy / mountainH);
          ctx.fillStyle = rgbStr(lava);
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    // Coulées de lave
    for (let i = 0; i < 3; i++) {
      let lx = peakX + Math.floor((rng() - 0.5) * 6);
      for (let ly = peakY; ly < h; ly++) {
        ctx.fillStyle = rgbStr(accentRgb);
        ctx.globalAlpha = 0.6 + rng() * 0.4;
        if (lx >= 0 && lx < w) ctx.fillRect(lx, ly, 1, 1);
        lx += Math.floor((rng() - 0.5) * 3);
      }
    }
    ctx.globalAlpha = 1;
  } else if (themeIdx === 7) {
    // Océan abyssal : bulles + créatures
    for (let i = 0; i < 30; i++) {
      const bx = Math.floor(rng() * w);
      const by = Math.floor(rng() * h);
      const br = Math.floor(1 + rng() * 3);
      ctx.globalAlpha = 0.15 + rng() * 0.2;
      ctx.fillStyle = rgbStr(accentRgb);
      for (let dy = -br; dy <= br; dy++) {
        for (let dx = -br; dx <= br; dx++) {
          if (dx * dx + dy * dy <= br * br && bx + dx >= 0 && bx + dx < w && by + dy >= 0 && by + dy < h) {
            ctx.fillRect(bx + dx, by + dy, 1, 1);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
    // Poisson
    for (let i = 0; i < 4; i++) {
      const fx = Math.floor(rng() * (w - 6));
      const fy = Math.floor(rng() * h);
      ctx.fillStyle = i % 2 === 0 ? "#ff6600" : "#ffcc00";
      ctx.fillRect(fx, fy, 4, 2);
      ctx.fillRect(fx - 1, fy + 1, 1, 1);
    }
  } else if (themeIdx === 8) {
    // Jardin japonais : cerisier
    const tx = Math.floor(w * 0.5);
    const ty = Math.floor(h * 0.8);
    ctx.fillStyle = "#5c3317";
    for (let i = 0; i < 15; i++) {
      const y = ty - i;
      if (y >= 0) ctx.fillRect(tx, y, 1, 1);
    }
    // Branches et fleurs
    for (let b = 0; b < 6; b++) {
      let bx = tx, by = ty - 10 - Math.floor(rng() * 5);
      for (let s = 0; s < 8; s++) {
        bx += rng() > 0.5 ? 1 : -1;
        by -= Math.floor(rng() * 2);
        if (bx >= 0 && bx < w && by >= 0 && by < h) {
          ctx.fillStyle = "#5c3317";
          ctx.fillRect(bx, by, 1, 1);
          // Pétales
          if (rng() > 0.4) {
            ctx.fillStyle = rgbStr(lerpColor(hexToRgb("#ff99bb"), hexToRgb("#ffffff"), rng() * 0.5));
            const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            for (const [ox, oy] of offsets) {
              if (rng() > 0.3 && bx + ox >= 0 && bx + ox < w && by + oy >= 0 && by + oy < h) {
                ctx.fillRect(bx + ox, by + oy, 1, 1);
              }
            }
          }
        }
      }
    }
  } else if (themeIdx === 9) {
    // Cristal de glace : formations cristallines
    for (let i = 0; i < 8; i++) {
      const cx = Math.floor(rng() * w);
      const cy = Math.floor(rng() * h);
      const size = Math.floor(3 + rng() * 6);
      for (let s = 0; s < size; s++) {
        const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [-1, 1]];
        for (const [dx, dy] of dirs) {
          const px = cx + dx * s, py = cy + dy * s;
          if (px >= 0 && px < w && py >= 0 && py < h) {
            ctx.globalAlpha = 0.3 + (1 - s / size) * 0.5;
            ctx.fillStyle = rgbStr(accentRgb);
            ctx.fillRect(px, py, 1, 1);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  } else if (themeIdx === 10) {
    // Apocalypse : ruines
    for (let i = 0; i < 15; i++) {
      const bx = Math.floor(rng() * w);
      const bw = Math.floor(2 + rng() * 4);
      const bh = Math.floor(3 + rng() * 12);
      const by = h - bh;
      ctx.fillStyle = rgbStr(lerpColor(hexToRgb("#333333"), hexToRgb("#666666"), rng()));
      ctx.fillRect(bx, by, bw, bh);
      // Destruction aléatoire
      for (let j = 0; j < 3; j++) {
        const rx = bx + Math.floor(rng() * bw);
        const ry = by + Math.floor(rng() * bh);
        ctx.fillStyle = "#000000";
        if (rx < w && ry < h) ctx.fillRect(rx, ry, 1, 1);
      }
    }
    // Lueur rouge
    for (let i = 0; i < 10; i++) {
      ctx.globalAlpha = 0.1 + rng() * 0.15;
      ctx.fillStyle = rgbStr(accentRgb);
      ctx.fillRect(Math.floor(rng() * w), h - 3 - Math.floor(rng() * 5), 2, 2);
    }
    ctx.globalAlpha = 1;
  } else {
    // Paradis : arcs-en-ciel + nuages
    const arcColors = ["#ff0000", "#ff7700", "#ffff00", "#00ff00", "#0000ff", "#8b00ff"];
    for (let a = 0; a < arcColors.length; a++) {
      const r = 20 + a * 2;
      const cx = Math.floor(w * 0.5);
      const cy = Math.floor(h * 0.6);
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = arcColors[a];
      for (let ang = 0; ang < Math.PI; ang += 0.05) {
        const px = Math.floor(cx + Math.cos(ang) * r);
        const py = Math.floor(cy - Math.sin(ang) * r * 0.5);
        if (px >= 0 && px < w && py >= 0 && py < h) ctx.fillRect(px, py, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
    // Nuages
    for (let i = 0; i < 5; i++) {
      const cx = Math.floor(rng() * w);
      const cy = Math.floor(5 + rng() * 15);
      for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (rng() > 0.3) {
            const px = cx + dx, py = cy + dy;
            if (px >= 0 && px < w && py >= 0 && py < h) {
              ctx.globalAlpha = 0.3 + rng() * 0.2;
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(px, py, 1, 1);
            }
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // Ajouter du "bruit pixel art" universel
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rng() < 0.02) {
        ctx.globalAlpha = 0.05 + rng() * 0.05;
        ctx.fillStyle = rgbStr(accentRgb);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  ctx.globalAlpha = 1;

  return ctx.getImageData(0, 0, w, h);
}

export function getThemeName(level: number): string {
  return THEMES[(level - 1) % THEMES.length].name;
}
