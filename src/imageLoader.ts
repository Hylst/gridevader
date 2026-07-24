// Gestionnaire de chargement et de cache des superbes images HD générées par IA

export interface LevelHDImage {
  id: number;
  name: string;
  src: string;
  img: HTMLImageElement | null;
  loaded: boolean;
}

export const LEVEL_IMAGES: LevelHDImage[] = [
  { id: 1, name: "Coucher de soleil Synthwave", src: "/images/level1.jpg", img: null, loaded: false },
  { id: 2, name: "Forêt Cybernétique Mystique",  src: "/images/level2.jpg", img: null, loaded: false },
  { id: 3, name: "Mégapole Cyberpunk Néon",       src: "/images/level3.jpg", img: null, loaded: false },
  { id: 4, name: "Pyramides du Désert de Données", src: "/images/level4.jpg", img: null, loaded: false },
  { id: 5, name: "Nébuleuse et Monolitithe",     src: "/images/level5.jpg", img: null, loaded: false },
  { id: 6, name: "Caverne de Glace Haute Tech",  src: "/images/level6.jpg", img: null, loaded: false },
];

export const UI_IMAGES = {
  arcadeCabinet: { src: "/images/arcade_cabinet.jpg", img: null as HTMLImageElement | null, loaded: false },
};

export function preloadAllImages(onProgress?: (loaded: number, total: number) => void) {
  const all = [...LEVEL_IMAGES, UI_IMAGES.arcadeCabinet];
  let loadedCount = 0;

  all.forEach((item) => {
    const i = new Image();
    i.src = item.src;
    i.onload = () => {
      item.img = i;
      item.loaded = true;
      loadedCount++;
      if (onProgress) onProgress(loadedCount, all.length);
    };
    i.onerror = () => {
      console.warn(`Impossible de charger l'image HD : ${item.src}`);
      loadedCount++;
      if (onProgress) onProgress(loadedCount, all.length);
    };
  });
}

export function getHDImageForLevel(lvl: number): LevelHDImage {
  const index = (lvl - 1) % LEVEL_IMAGES.length;
  return LEVEL_IMAGES[index];
}
