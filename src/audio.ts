// Système audio procédural — pistes thématiques + SFX riches
// Génère plusieurs musiques de fond selon le niveau (chaque thème a sa propre ambiance)
// + des effets sonores avec harmoniques et enveloppes soignées.

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicInterval: number | null = null;
let isMuted = false;

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.4;
    masterGain.connect(ctx.destination);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.005;
    comp.release.value = 0.18;

    musicGain = ctx.createGain();
    musicGain.gain.value = 0.45;
    musicGain.connect(comp);
    comp.connect(masterGain);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.7;
    sfxGain.connect(comp);
    comp.connect(masterGain);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// ----- Synthèse d'un "blip" avec enveloppe ADSR simple -----
function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = "square",
  volume = 0.3,
  slideTo?: number,
  when?: number,
  detune = 0,
) {
  const c = getCtx();
  const t = when ?? c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo !== undefined) {
    o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
  }
  o.detune.value = detune;
  // ADSR douce
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(volume, t + Math.min(0.005, duration * 0.1));
  g.gain.exponentialRampToValueAtTime(volume * 0.6, t + duration * 0.4);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  o.connect(g);
  g.connect(sfxGain!);
  o.start(t);
  o.stop(t + duration + 0.05);
}

// Bruit blanc avec enveloppe exponentielle + filtre
function playNoise(duration: number, volume = 0.3, freq = 1000, q = 1, type: BiquadFilterType = "bandpass") {
  const c = getCtx();
  const bufferSize = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(volume, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  src.connect(filter);
  filter.connect(g);
  g.connect(sfxGain!);
  src.start();
  src.stop(c.currentTime + duration);
}

// Accord — plusieurs oscillateurs pour un son plus riche
function playChord(freqs: number[], duration: number, type: OscillatorType = "square", volume = 0.15, slideTo?: number) {
  const c = getCtx();
  const t = c.currentTime;
  freqs.forEach((f, i) => playTone(f, duration, type, volume, slideTo, t + i * 0.005));
}

// Percussion — kick / snare / hat
function kick(when?: number) {
  const c = getCtx();
  const t = when ?? c.currentTime;
  playTone(80, 0.18, "sine", 0.45, 35, t);
  playNoise(0.06, 0.18, 4000, 1, "highpass");
}
function snare(when?: number) {
  const c = getCtx();
  const t = when ?? c.currentTime;
  playNoise(0.12, 0.25, 1800, 0.8, "bandpass");
  playTone(220, 0.06, "triangle", 0.1, 100, t);
}
function hat() {
  playNoise(0.04, 0.08, 8000, 1, "highpass");
}

// ============== SFX ==============
export function sfxMove(boosted = false) {
  playTone(boosted ? 520 : 330, 0.03, "triangle", boosted ? 0.12 : 0.06);
}

export function sfxCapture() {
  playChord([523, 659, 784], 0.18, "square", 0.18, 1047);
  playNoise(0.18, 0.12, 800, 1, "bandpass");
}
export function sfxCaptureBig() {
  playChord([392, 523, 659, 784, 988], 0.35, "square", 0.16, 1760);
  playNoise(0.3, 0.18, 600, 1, "lowpass");
}

export function sfxDeath() {
  playTone(440, 0.15, "sawtooth", 0.3, 110, undefined, -10);
  playTone(330, 0.2, "sawtooth", 0.25, 80, undefined, 10);
  playTone(220, 0.25, "sawtooth", 0.2, 55);
  playNoise(0.4, 0.3, 200, 1, "lowpass");
}

export function sfxWin() {
  const seq = [523, 659, 784, 1047, 1319, 1568];
  seq.forEach((f, i) => playTone(f, 0.2, "square", 0.18, undefined, undefined, i % 2 ? 5 : -5));
}
export function sfxLevelUp() {
  [330, 494, 659, 880].forEach((f, i) => playTone(f, 0.16, "triangle", 0.18, undefined, undefined, i * 2));
}
export function sfxPowerUp() {
  playChord([880, 1175, 1568], 0.2, "square", 0.18, 2350);
}
export function sfxStart() {
  [220, 330, 440, 587, 740].forEach((f, i) => playTone(f, 0.1, "square", 0.12, undefined, undefined, i * 3));
}
export function sfxBomb() {
  playNoise(0.5, 0.5, 80, 1, "lowpass");
  playTone(60, 0.6, "sawtooth", 0.4, 20);
  [200, 160, 120, 80].forEach((f, i) => playTone(f, 0.2, "square", 0.15, undefined, undefined, i * 5));
}
export function sfxFreeze() {
  playChord([880, 1319, 1760], 0.4, "triangle", 0.2);
  playNoise(0.3, 0.12, 5000, 1, "highpass");
}
export function sfxSlow() {
  playChord([330, 440, 587], 0.4, "sine", 0.18);
  playTone(220, 0.4, "sine", 0.1, 110);
}

// ============== MUSIQUE ==============

type TrackId = "sunset" | "forest" | "city" | "desert" | "space" | "aurora" | "volcano" | "ocean" | "garden" | "ice" | "apocalypse" | "paradise";

interface Track {
  id: TrackId;
  // Pulsation / tempo (s)
  tempo: number;
  // Gammes ascendantes (une note par "pas", loop)
  scaleMinor: number[];  // mélodie mineure
  scaleMajor: number[];  // mélodie majeure
  bassPattern: number[]; // motifs de basse (index dans scaleMinor)
  melodyPattern: number[]; // motifs de mélodie (index dans scaleMajor)
  // Distorsion / filtres
  bassType: OscillatorType;
  meloType: OscillatorType;
  bassVol: number;
  meloVol: number;
  // Perco (kick à chaque N steps, snare à chaque N steps)
  kickEvery: number;
  snareEvery: number;
  hatEvery: number;
}

// Fréquences de base (notes)
const ROOT_A2 = 110;       // La2
const ROOT_C3 = 130.81;    // Do3
const ROOT_D3 = 146.83;    // Ré3
const ROOT_E3 = 164.81;    // Mi3
const ROOT_F3 = 174.61;    // Fa3
const ROOT_G3 = 196.00;    // Sol3 (utile)
const ROOT_A3 = 220;       // La3
const ROOT_C4 = 261.63;    // Do4

// Gammes pentatoniques / modes
const PENT_MIN = [0, 3, 5, 7, 10]; // pentatonique mineure
const PENT_MAJ = [0, 2, 4, 7, 9];  // pentatonique majeure
const DORIAN   = [0, 2, 3, 5, 7, 9, 10];
const LYDIAN   = [0, 2, 4, 6, 7, 9, 11];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];

const SCALES = {
  pent_min: PENT_MIN,
  pent_maj: PENT_MAJ,
  dorian: DORIAN,
  lydian: LYDIAN,
  phrygian: PHRYGIAN,
};

function buildScale(root: number, intervals: number[]): number[] {
  return intervals.map(i => root * Math.pow(2, i / 12));
}

const Tracks: Track[] = [
  // 1. Coucher de soleil (Sol mineur pentatonique, lent)
  {
    id: "sunset",
    tempo: 0.22,
    bassType: "triangle", meloType: "square",
    bassVol: 0.12, meloVol: 0.06,
    kickEvery: 4, snareEvery: 8, hatEvery: 2,
    bassPattern: [0, 0, 3, 0, 4, 4, 3, 0],
    melodyPattern: [0, 2, 4, 3, 4, 2, 0, 2],
    scaleMinor: buildScale(ROOT_G3, SCALES.pent_min),
    scaleMajor: buildScale(ROOT_G3, SCALES.pent_min).map(f => f * 1.0),
  },
  // 2. Forêt (La dorien, lent)
  {
    id: "forest",
    tempo: 0.20,
    bassType: "sine", meloType: "triangle",
    bassVol: 0.10, meloVol: 0.05,
    kickEvery: 4, snareEvery: 8, hatEvery: 4,
    bassPattern: [0, 2, 4, 2, 5, 4, 2, 0],
    melodyPattern: [0, 2, 4, 5, 7, 5, 4, 2],
    scaleMinor: buildScale(ROOT_A2 * 1.0, SCALES.dorian),
    scaleMajor: buildScale(ROOT_A3, SCALES.dorian),
  },
  // 3. Cité futuriste (La mineur, tempo moyen + distorsion)
  {
    id: "city",
    tempo: 0.16,
    bassType: "sawtooth", meloType: "square",
    bassVol: 0.14, meloVol: 0.07,
    kickEvery: 4, snareEvery: 8, hatEvery: 2,
    bassPattern: [0, 0, 5, 0, 7, 5, 3, 0],
    melodyPattern: [0, 3, 5, 7, 10, 7, 5, 3],
    scaleMinor: buildScale(ROOT_A2, SCALES.pent_min),
    scaleMajor: buildScale(ROOT_A3, SCALES.pent_min),
  },
  // 4. Désert (Do phrygien, berceur)
  {
    id: "desert",
    tempo: 0.24,
    bassType: "sine", meloType: "triangle",
    bassVol: 0.10, meloVol: 0.05,
    kickEvery: 4, snareEvery: 8, hatEvery: 4,
    bassPattern: [0, 0, 1, 3, 0, 0, 1, 3],
    melodyPattern: [0, 3, 5, 6, 5, 3, 1, 0],
    scaleMinor: buildScale(ROOT_C3, SCALES.phrygian),
    scaleMajor: buildScale(ROOT_C4, SCALES.phrygian),
  },
  // 5. Espace (La lydien, planant)
  {
    id: "space",
    tempo: 0.26,
    bassType: "sine", meloType: "triangle",
    bassVol: 0.08, meloVol: 0.06,
    kickEvery: 8, snareEvery: 16, hatEvery: 4,
    bassPattern: [0, 0, 4, 0, 0, 0, 4, 0],
    melodyPattern: [0, 2, 4, 6, 7, 6, 4, 2],
    scaleMinor: buildScale(ROOT_A2 * 0.5, SCALES.lydian),
    scaleMajor: buildScale(ROOT_A3, SCALES.lydian),
  },
  // 6. Aurore (Ré lydien, doux)
  {
    id: "aurora",
    tempo: 0.22,
    bassType: "sine", meloType: "triangle",
    bassVol: 0.09, meloVol: 0.06,
    kickEvery: 4, snareEvery: 8, hatEvery: 2,
    bassPattern: [0, 2, 4, 2, 0, 2, 4, 2],
    melodyPattern: [0, 4, 6, 7, 6, 4, 2, 0],
    scaleMinor: buildScale(ROOT_D3, SCALES.lydian),
    scaleMajor: buildScale(ROOT_D3 * 2, SCALES.lydian),
  },
  // 7. Volcan (La pentatonique mineure, rapide + agressif)
  {
    id: "volcano",
    tempo: 0.13,
    bassType: "sawtooth", meloType: "square",
    bassVol: 0.16, meloVol: 0.08,
    kickEvery: 4, snareEvery: 8, hatEvery: 1,
    bassPattern: [0, 0, 5, 0, 7, 5, 3, 0],
    melodyPattern: [0, 5, 7, 10, 12, 10, 7, 5],
    scaleMinor: buildScale(ROOT_A2, SCALES.pent_min),
    scaleMajor: buildScale(ROOT_A3, SCALES.pent_min),
  },
  // 8. Océan (Fa majeur, berceur)
  {
    id: "ocean",
    tempo: 0.20,
    bassType: "sine", meloType: "triangle",
    bassVol: 0.10, meloVol: 0.05,
    kickEvery: 4, snareEvery: 8, hatEvery: 4,
    bassPattern: [0, 2, 4, 2, 5, 4, 2, 0],
    melodyPattern: [0, 2, 4, 5, 4, 2, 0, -1],
    scaleMinor: buildScale(ROOT_F3, SCALES.lydian),
    scaleMajor: buildScale(ROOT_F3 * 2, SCALES.lydian),
  },
  // 9. Jardin (Mi majeur, délicat)
  {
    id: "garden",
    tempo: 0.20,
    bassType: "triangle", meloType: "sine",
    bassVol: 0.09, meloVol: 0.05,
    kickEvery: 4, snareEvery: 8, hatEvery: 4,
    bassPattern: [0, 2, 4, 0, 0, 2, 4, 0],
    melodyPattern: [0, 2, 4, 5, 7, 5, 4, 2],
    scaleMinor: buildScale(ROOT_E3, SCALES.pent_maj),
    scaleMajor: buildScale(ROOT_E3, SCALES.pent_maj),
  },
  // 10. Cristal (Do lydien, cristallin)
  {
    id: "ice",
    tempo: 0.18,
    bassType: "triangle", meloType: "sine",
    bassVol: 0.10, meloVol: 0.06,
    kickEvery: 4, snareEvery: 8, hatEvery: 2,
    bassPattern: [0, 4, 0, 5, 0, 4, 0, 2],
    melodyPattern: [0, 4, 6, 7, 11, 7, 6, 4],
    scaleMinor: buildScale(ROOT_C3, SCALES.lydian),
    scaleMajor: buildScale(ROOT_C4, SCALES.lydian),
  },
  // 11. Apocalypse (Do phrygien, sombre, lourd)
  {
    id: "apocalypse",
    tempo: 0.14,
    bassType: "sawtooth", meloType: "square",
    bassVol: 0.16, meloVol: 0.07,
    kickEvery: 4, snareEvery: 8, hatEvery: 2,
    bassPattern: [0, 0, 1, 0, 3, 1, 0, -1],
    melodyPattern: [0, 1, 3, 5, 3, 1, 0, -2],
    scaleMinor: buildScale(ROOT_C3, SCALES.phrygian),
    scaleMajor: buildScale(ROOT_C4, SCALES.phrygian),
  },
  // 12. Paradis (Do majeur, enjoué)
  {
    id: "paradise",
    tempo: 0.16,
    bassType: "triangle", meloType: "square",
    bassVol: 0.10, meloVol: 0.07,
    kickEvery: 4, snareEvery: 8, hatEvery: 2,
    bassPattern: [0, 2, 4, 2, 5, 4, 2, 0],
    melodyPattern: [0, 2, 4, 5, 7, 5, 4, 2],
    scaleMinor: buildScale(ROOT_C3, SCALES.pent_maj),
    scaleMajor: buildScale(ROOT_C4, SCALES.pent_maj),
  },
];

let currentTrackId: TrackId | null = null;
let musicStep = 0;
let nextNoteTime = 0;

const TrackById: Record<TrackId, Track> = Tracks.reduce((acc, t) => { acc[t.id] = t; return acc; }, {} as Record<TrackId, Track>);

function getTrack(): Track {
  return currentTrackId ? TrackById[currentTrackId] : Tracks[0];
}

function scheduleMusic() {
  const c = getCtx();
  const lookahead = 0.2;
  const track = getTrack();
  while (nextNoteTime < c.currentTime + lookahead) {
    const step = musicStep % 16;
    const bassIdx = track.bassPattern[step % track.bassPattern.length];
    const meloIdx = track.melodyPattern[step % track.melodyPattern.length];
    const bassFreq = track.scaleMinor[((bassIdx % track.scaleMinor.length) + track.scaleMinor.length) % track.scaleMinor.length];
    const meloFreq = track.scaleMajor[((meloIdx % track.scaleMajor.length) + track.scaleMajor.length) % track.scaleMajor.length];

    // Bass (toujours)
    {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = track.bassType;
      o.frequency.setValueAtTime(bassFreq * 0.5, nextNoteTime);
      g.gain.setValueAtTime(0, nextNoteTime);
      g.gain.linearRampToValueAtTime(track.bassVol, nextNoteTime + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + track.tempo * 1.5);
      o.connect(g); g.connect(musicGain!);
      o.start(nextNoteTime); o.stop(nextNoteTime + track.tempo * 2);
    }

    // Melody
    if (meloIdx >= 0 && (step % 2 === 0 || Math.random() > 0.2)) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = track.meloType;
      o.frequency.setValueAtTime(meloFreq, nextNoteTime);
      g.gain.setValueAtTime(0, nextNoteTime);
      g.gain.linearRampToValueAtTime(track.meloVol, nextNoteTime + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + track.tempo * 0.9);
      o.connect(g); g.connect(musicGain!);
      o.start(nextNoteTime); o.stop(nextNoteTime + track.tempo);
    }

    // Percussion
    if (step % track.kickEvery === 0) kick(nextNoteTime);
    if (step % track.snareEvery === track.snareEvery / 2) snare(nextNoteTime);
    if (step % track.hatEvery === track.hatEvery - 1) hat();

    musicStep++;
    nextNoteTime += track.tempo;
  }
}

export function startMusic(themeIndex: number) {
  const c = getCtx();
  if (musicInterval) return;
  const tracks = Tracks;
  currentTrackId = tracks[themeIndex % tracks.length].id;
  nextNoteTime = c.currentTime + 0.1;
  musicStep = 0;
  musicInterval = window.setInterval(scheduleMusic, 60);
}

export function setMusicTheme(themeIndex: number) {
  const tracks = Tracks;
  currentTrackId = tracks[themeIndex % tracks.length].id;
}

export function stopMusic() {
  if (musicInterval) { clearInterval(musicInterval); musicInterval = null; }
}

export function toggleMute() {
  isMuted = !isMuted;
  if (masterGain) {
    masterGain.gain.setTargetAtTime(isMuted ? 0 : 0.4, getCtx().currentTime, 0.1);
  }
  return isMuted;
}

export function isAudioMuted() {
  return isMuted;
}
