import type Phaser from 'phaser';

export type SpritePose = 'idle' | 'work' | 'walkA' | 'walkB';

type HairStyle =
  | 'spiky'
  | 'bob'
  | 'ponytail'
  | 'curly'
  | 'bun'
  | 'braids'
  | 'longwave';

interface CharacterRecipe {
  id: string;
  hairStyle: HairStyle;
  hair: string;
  hairHi: string;
  skin: string;
  blush: string;
  top: string;
  inner: string;
  pants: string;
  shoes: string;
  glasses?: boolean;
  headset?: boolean;
  neckphones?: boolean;
  earrings?: boolean;
  badge?: boolean;
}

const OUTLINE = '#241917';
const W = 20;
const H = 24;

export const CHARACTER_RECIPES: Record<string, CharacterRecipe> = {
  lead: {
    id: 'lead',
    hairStyle: 'spiky',
    hair: '#3b373b',
    hairHi: '#5a545a',
    skin: '#f8d5b8',
    blush: '#f1a799',
    top: '#344156',
    inner: '#f8fafc',
    pants: '#283244',
    shoes: '#1e1b24',
    badge: true,
  },
  researcher: {
    id: 'researcher',
    hairStyle: 'bob',
    hair: '#a1583b',
    hairHi: '#c47554',
    skin: '#f9d9be',
    blush: '#f2a596',
    top: '#7d8c65',
    inner: '#f4f1ea',
    pants: '#d8c5a8',
    shoes: '#5c4033',
    glasses: true,
  },
  developer: {
    id: 'developer',
    hairStyle: 'spiky',
    hair: '#5c4033',
    hairHi: '#7e5a47',
    skin: '#f7d2b4',
    blush: '#ee9f91',
    top: '#345995',
    inner: '#e2e8f0',
    pants: '#273043',
    shoes: '#e2e8f0',
    neckphones: true,
  },
  reviewer: {
    id: 'reviewer',
    hairStyle: 'ponytail',
    hair: '#4c3b4d',
    hairHi: '#6c556e',
    skin: '#fae0c8',
    blush: '#f4a89d',
    top: '#843b55',
    inner: '#ffffff',
    pants: '#3a2e39',
    shoes: '#241b24',
    badge: true,
  },
  docs: {
    id: 'docs',
    hairStyle: 'curly',
    hair: '#9c5a2b',
    hairHi: '#be7642',
    skin: '#f8d6b9',
    blush: '#ef9f91',
    top: '#d49538',
    inner: '#fffbeb',
    pants: '#6b4f3a',
    shoes: '#3e2c20',
  },
  editor: {
    id: 'editor',
    hairStyle: 'spiky',
    hair: '#785a4a',
    hairHi: '#9a7866',
    skin: '#f6d2b5',
    blush: '#ec9c8d',
    top: '#3b373c',
    inner: '#ef6f5e',
    pants: '#47434a',
    shoes: '#2b282d',
    neckphones: true,
  },
  ops: {
    id: 'ops',
    hairStyle: 'bun',
    hair: '#a35638',
    hairHi: '#c67350',
    skin: '#fae0c6',
    blush: '#f4a798',
    top: '#2a9d8f',
    inner: '#ffffff',
    pants: '#efe3cf',
    shoes: '#524136',
    earrings: true,
  },
  writer: {
    id: 'writer',
    hairStyle: 'curly',
    hair: '#63433b',
    hairHi: '#855d53',
    skin: '#f9d8be',
    blush: '#f1a496',
    top: '#7c3f4d',
    inner: '#f8f4f0',
    pants: '#3b3238',
    shoes: '#261e22',
  },
  designer: {
    id: 'designer',
    hairStyle: 'bob',
    hair: '#6c4f9b',
    hairHi: '#8f6ec2',
    skin: '#fbe0ca',
    blush: '#f5a9a0',
    top: '#a985dc',
    inner: '#ffffff',
    pants: '#936ec9',
    shoes: '#4a3869',
    glasses: true,
  },
  voice: {
    id: 'voice',
    hairStyle: 'curly',
    hair: '#3d2c26',
    hairHi: '#5e463d',
    skin: '#d99e73',
    blush: '#c97a63',
    top: '#7ccfa0',
    inner: '#e6f7ed',
    pants: '#4d4644',
    shoes: '#2c2725',
    headset: true,
  },
  analyst: {
    id: 'analyst',
    hairStyle: 'braids',
    hair: '#524457',
    hairHi: '#726078',
    skin: '#f9dac0',
    blush: '#f2a496',
    top: '#4b73b8',
    inner: '#ffffff',
    pants: '#2f3d59',
    shoes: '#1e2536',
    glasses: true,
  },
  community: {
    id: 'community',
    hairStyle: 'spiky',
    hair: '#d99b52',
    hairHi: '#f0b872',
    skin: '#f9d7ba',
    blush: '#f29f8f',
    top: '#ec8c5a',
    inner: '#fff5eb',
    pants: '#4a3f3a',
    shoes: '#2b2421',
    headset: true,
    badge: true,
  },
  pm: {
    id: 'pm',
    hairStyle: 'longwave',
    hair: '#59423a',
    hairHi: '#7a5c52',
    skin: '#fae0c8',
    blush: '#f3a698',
    top: '#6e7a48',
    inner: '#ffffff',
    pants: '#e6d8c3',
    shoes: '#473c32',
    earrings: true,
  },
};

function makeEmptyGrid(): (string | null)[][] {
  return Array.from({ length: H }, () => Array<string | null>(W).fill(null));
}

function fillRect(
  grid: (string | null)[][],
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      if (py >= 0 && py < H && px >= 0 && px < W) {
        grid[py][px] = color;
      }
    }
  }
}

function setPx(
  grid: (string | null)[][],
  x: number,
  y: number,
  color: string,
) {
  if (y >= 0 && y < H && x >= 0 && x < W) {
    grid[y][x] = color;
  }
}

function buildCharacterGrid(
  recipe: CharacterRecipe,
  pose: SpritePose,
): (string | null)[][] {
  const g = makeEmptyGrid();

  // Back hair layer (behind head/body)
  if (recipe.hairStyle === 'bun') {
    fillRect(g, 7, 1, 6, 4, recipe.hair);
    fillRect(g, 8, 1, 3, 2, recipe.hairHi);
  } else if (recipe.hairStyle === 'ponytail') {
    fillRect(g, 13, 3, 4, 6, recipe.hair);
    fillRect(g, 15, 7, 3, 5, recipe.hair);
    fillRect(g, 14, 4, 2, 2, recipe.hairHi);
  } else if (recipe.hairStyle === 'longwave') {
    fillRect(g, 4, 6, 12, 10, recipe.hair);
  } else if (recipe.hairStyle === 'braids') {
    fillRect(g, 4, 9, 2, 7, recipe.hair);
    fillRect(g, 14, 9, 2, 7, recipe.hair);
  } else if (recipe.hairStyle === 'bob') {
    fillRect(g, 4, 6, 12, 7, recipe.hair);
  }

  // Legs & Shoes by pose
  if (pose === 'walkA') {
    fillRect(g, 6, 18, 3, 3, recipe.pants);
    fillRect(g, 11, 17, 3, 3, recipe.pants);
    fillRect(g, 5, 21, 4, 2, recipe.shoes);
    fillRect(g, 11, 20, 4, 2, recipe.shoes);
  } else if (pose === 'walkB') {
    fillRect(g, 6, 17, 3, 3, recipe.pants);
    fillRect(g, 11, 18, 3, 3, recipe.pants);
    fillRect(g, 6, 20, 4, 2, recipe.shoes);
    fillRect(g, 11, 21, 4, 2, recipe.shoes);
  } else {
    fillRect(g, 6, 18, 3, 3, recipe.pants);
    fillRect(g, 11, 18, 3, 3, recipe.pants);
    fillRect(g, 6, 21, 3, 2, recipe.shoes);
    fillRect(g, 11, 21, 3, 2, recipe.shoes);
  }

  // Torso (jacket/hoodie + inner shirt)
  fillRect(g, 6, 13, 8, 5, recipe.top);
  fillRect(g, 8, 13, 4, 5, recipe.inner);
  if (recipe.badge) {
    fillRect(g, 9, 15, 2, 2, '#94a3b8');
  }

  // Arms by pose
  if (pose === 'work') {
    fillRect(g, 4, 13, 2, 3, recipe.top);
    fillRect(g, 14, 13, 2, 3, recipe.top);
    fillRect(g, 4, 12, 2, 2, recipe.skin);
    fillRect(g, 14, 12, 2, 2, recipe.skin);
  } else if (pose === 'walkA') {
    fillRect(g, 4, 13, 2, 4, recipe.top);
    fillRect(g, 4, 17, 2, 1, recipe.skin);
    fillRect(g, 14, 14, 2, 4, recipe.top);
    fillRect(g, 14, 18, 2, 1, recipe.skin);
  } else if (pose === 'walkB') {
    fillRect(g, 4, 14, 2, 4, recipe.top);
    fillRect(g, 4, 18, 2, 1, recipe.skin);
    fillRect(g, 14, 13, 2, 4, recipe.top);
    fillRect(g, 14, 17, 2, 1, recipe.skin);
  } else {
    fillRect(g, 4, 13, 2, 4, recipe.top);
    fillRect(g, 14, 13, 2, 4, recipe.top);
    fillRect(g, 4, 17, 2, 1, recipe.skin);
    fillRect(g, 14, 17, 2, 1, recipe.skin);
  }

  // Neckphones accessory
  if (recipe.neckphones) {
    fillRect(g, 6, 13, 2, 2, '#cbd5e1');
    fillRect(g, 12, 13, 2, 2, '#cbd5e1');
  }

  // Chibi Head (big rounded face)
  fillRect(g, 6, 5, 8, 8, recipe.skin);
  fillRect(g, 5, 6, 10, 6, recipe.skin);

  // Eyes & Blush
  setPx(g, 7, 9, OUTLINE);
  setPx(g, 7, 10, OUTLINE);
  setPx(g, 12, 9, OUTLINE);
  setPx(g, 12, 10, OUTLINE);
  setPx(g, 6, 11, recipe.blush);
  setPx(g, 13, 11, recipe.blush);

  // Glasses
  if (recipe.glasses) {
    fillRect(g, 6, 9, 3, 2, '#e0f2fe');
    fillRect(g, 11, 9, 3, 2, '#e0f2fe');
    setPx(g, 7, 9, OUTLINE);
    setPx(g, 12, 9, OUTLINE);
    fillRect(g, 9, 9, 2, 1, '#475569');
  }

  // Front Hair Cap & Bangs
  fillRect(g, 5, 3, 10, 4, recipe.hair);
  fillRect(g, 6, 2, 8, 2, recipe.hair);
  fillRect(g, 7, 3, 5, 2, recipe.hairHi);

  if (recipe.hairStyle === 'spiky') {
    setPx(g, 6, 1, recipe.hair);
    setPx(g, 9, 1, recipe.hair);
    setPx(g, 12, 1, recipe.hair);
    fillRect(g, 4, 5, 2, 3, recipe.hair);
    fillRect(g, 14, 5, 2, 3, recipe.hair);
    setPx(g, 8, 7, recipe.hair);
    setPx(g, 11, 7, recipe.hair);
  } else if (recipe.hairStyle === 'curly') {
    fillRect(g, 4, 4, 2, 4, recipe.hair);
    fillRect(g, 14, 4, 2, 4, recipe.hair);
    setPx(g, 5, 2, recipe.hair);
    setPx(g, 14, 2, recipe.hair);
    setPx(g, 7, 7, recipe.hair);
    setPx(g, 10, 7, recipe.hair);
  } else {
    fillRect(g, 4, 5, 2, 5, recipe.hair);
    fillRect(g, 14, 5, 2, 5, recipe.hair);
    setPx(g, 7, 7, recipe.hair);
    setPx(g, 12, 7, recipe.hair);
  }

  // Headset & Earrings
  if (recipe.headset) {
    fillRect(g, 6, 2, 8, 1, '#64748b');
    fillRect(g, 3, 7, 2, 4, '#94a3b8');
    fillRect(g, 15, 7, 2, 4, '#94a3b8');
  }
  if (recipe.earrings) {
    setPx(g, 5, 11, '#fbbf24');
    setPx(g, 14, 11, '#fbbf24');
  }

  // Auto 1px dark outline pass (Chibi RPG signature look)
  const out = makeEmptyGrid();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (g[y][x]) {
        out[y][x] = g[y][x];
      } else {
        const hasNeighbor =
          (y > 0 && g[y - 1][x]) ||
          (y < H - 1 && g[y + 1][x]) ||
          (x > 0 && g[y][x - 1]) ||
          (x < W - 1 && g[y][x + 1]);
        if (hasNeighbor) {
          out[y][x] = OUTLINE;
        }
      }
    }
  }
  return out;
}

function renderGridToCanvas(
  ctx: CanvasRenderingContext2D,
  grid: (string | null)[][],
  scale: number,
) {
  ctx.clearRect(0, 0, grid[0].length * scale, grid.length * scale);
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const c = grid[y][x];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
}

export function resolveSpriteKey(spriteId?: string, roleType?: string, provider?: string): string {
  if (spriteId && CHARACTER_RECIPES[spriteId]) return spriteId;
  if (roleType === 'lead') return 'lead';
  return provider === 'codex' ? 'developer' : 'researcher';
}

const previewCache = new Map<string, string>();

export function getCharacterPreviewUrl(presetId: string): string {
  if (previewCache.has(presetId)) return previewCache.get(presetId)!;
  const recipe = CHARACTER_RECIPES[presetId] ?? CHARACTER_RECIPES.lead;
  const grid = buildCharacterGrid(recipe, 'idle');
  const scale = 3;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    renderGridToCanvas(ctx, grid, scale);
  }
  const url = canvas.toDataURL('image/png');
  previewCache.set(presetId, url);
  return url;
}

function drawSimpleProp(
  scene: Phaser.Scene,
  key: string,
  grid: string[],
  palette: Record<string, string>,
  scale = 3,
) {
  if (scene.textures.exists(key)) return;
  const h = grid.length;
  const w = grid[0].length;
  const tex = scene.textures.createCanvas(key, w * scale, h * scale);
  if (!tex) return;
  const ctx = tex.getContext();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = palette[grid[y][x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  tex.refresh();
}

export function registerPixelTextures(scene: Phaser.Scene) {
  const scale = 2;
  const poses: SpritePose[] = ['idle', 'work', 'walkA', 'walkB'];

  for (const recipe of Object.values(CHARACTER_RECIPES)) {
    for (const pose of poses) {
      const texKey = `char_${recipe.id}_${pose}`;
      if (scene.textures.exists(texKey)) continue;
      const grid = buildCharacterGrid(recipe, pose);
      const tex = scene.textures.createCanvas(texKey, W * scale, H * scale);
      if (!tex) continue;
      const ctx = tex.getContext();
      renderGridToCanvas(ctx, grid, scale);
      tex.refresh();
    }
  }

  // Props with dark outlines matching the reference art
  drawSimpleProp(
    scene,
    'prop_plant',
    [
      '....oooooo......',
      '..oogglgggoo....',
      '.oggllggllggo...',
      '.oogglgglggoo...',
      '...oogllgoo.....',
      '....ooggoo......',
      '...oooooooo.....',
      '...obppppbo.....',
      '....oppppo......',
      '....oppppo......',
      '....oooooo......',
    ],
    { o: OUTLINE, g: '#2d8a4e', l: '#6ee787', b: '#b45309', p: '#d97706' },
    3,
  );

  drawSimpleProp(
    scene,
    'prop_bookshelf',
    [
      'oooooooooooooooo',
      'obbbbbbbbbbbbbbo',
      'obrrggyybbppggbo',
      'obrrggyybbppggbo',
      'obbbbbbbbbbbbbbo',
      'obyybbpprrggbbbo',
      'obyybbpprrggbbbo',
      'obbbbbbbbbbbbbbo',
      'obggppyybbrryybo',
      'obggppyybbrryybo',
      'obbbbbbbbbbbbbbo',
      'oooooooooooooooo',
    ],
    {
      o: OUTLINE,
      b: '#8b5a2b',
      r: '#e05a47',
      g: '#38a169',
      y: '#ecc94b',
      p: '#9f7aea',
    },
    3,
  );

  drawSimpleProp(
    scene,
    'prop_coffee',
    [
      '....wwww....',
      '..oooooooo..',
      '..osssssso..',
      '..osrggsso..',
      '..oooooooo..',
      '..oo.cc.oo..',
      '..oo.cc.oo..',
      '..oooooooo..',
    ],
    {
      o: OUTLINE,
      w: '#f8fafc',
      s: '#64748b',
      r: '#ef4444',
      g: '#22c55e',
      c: '#ffffff',
    },
    3,
  );
}
