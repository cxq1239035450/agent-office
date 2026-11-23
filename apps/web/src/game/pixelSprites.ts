import type Phaser from 'phaser';

type Palette = Record<string, string>;

function drawPixelArt(
  scene: Phaser.Scene,
  key: string,
  grid: string[],
  palette: Palette,
  scale = 2,
) {
  if (scene.textures.exists(key)) return;
  const h = grid.length;
  const w = grid[0].length;
  const canvasTex = scene.textures.createCanvas(key, w * scale, h * scale);
  if (!canvasTex) return;
  const ctx = canvasTex.getContext();
  ctx.clearRect(0, 0, w * scale, h * scale);

  for (let y = 0; y < h; y++) {
    const row = grid[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      const color = palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  canvasTex.refresh();
}

const CHAR_IDLE_GRID = [
  '....hhhhhh......',
  '...hhhhhhhh.....',
  '..hhsssssshh....',
  '..hsessssesh....',
  '..hsssssssshh...',
  '...hssmmsshh....',
  '....ssssss......',
  '...cccccccc.....',
  '..cccccccccc....',
  '..csccccccsc....',
  '..csccccccsc....',
  '..ssccccccss....',
  '....pppppp......',
  '....pp..pp......',
  '....pp..pp......',
  '...ddd..ddd.....',
];

const CHAR_TYPE_GRID = [
  '....hhhhhh......',
  '...hhhhhhhh.....',
  '..hhsssssshh....',
  '..hsessssesh....',
  '..hsssssssshh...',
  '...hssmmsshh....',
  '....ssssss......',
  '...cccccccc.....',
  '..csccccccsc....',
  '.ssccccccccss...',
  '..cccccccccc....',
  '....cccccc......',
  '....pppppp......',
  '....pp..pp......',
  '....pp..pp......',
  '...ddd..ddd.....',
];

const CHAR_LEAD_IDLE_GRID = [
  '....y.yy.y......',
  '....yyyyyy......',
  '...hhhhhhhh.....',
  '..hhsssssshh....',
  '..hsessssesh....',
  '..hsssssssshh...',
  '...hssmmsshh....',
  '...cccccccc.....',
  '..ccccyycccc....',
  '..csccccccsc....',
  '..csccccccsc....',
  '..ssccccccss....',
  '....pppppp......',
  '....pp..pp......',
  '....pp..pp......',
  '...ddd..ddd.....',
];

const CHAR_LEAD_TYPE_GRID = [
  '....y.yy.y......',
  '....yyyyyy......',
  '...hhhhhhhh.....',
  '..hhsssssshh....',
  '..hsessssesh....',
  '..hsssssssshh...',
  '...hssmmsshh....',
  '...cccccccc.....',
  '..csccyyccsc....',
  '.ssccccccccss...',
  '..cccccccccc....',
  '....cccccc......',
  '....pppppp......',
  '....pp..pp......',
  '....pp..pp......',
  '...ddd..ddd.....',
];

const PLANT_GRID = [
  '.....gg.gg......',
  '...gggllggg.....',
  '..ggllggllgg....',
  '...gggllggg.....',
  '....ggllgg......',
  '.....gggg.......',
  '....bbbbbb......',
  '....bppppb......',
  '.....pppp.......',
  '.....pppp.......',
  '.....dddd.......',
];

const BOOKSHELF_GRID = [
  'bbbbbbbbbbbbbbbb',
  'bddddddddddddddb',
  'bdrrggyybbppggdb',
  'bdrrggyybbppggdb',
  'bddddddddddddddb',
  'bdyybbpprrggbbdb',
  'bdyybbpprrggbbdb',
  'bddddddddddddddb',
  'bdggppyybbrryydb',
  'bdggppyybbrryydb',
  'bddddddddddddddb',
  'bbbbbbbbbbbbbbbb',
  'bb............bb',
  'bb............bb',
];

const COFFEE_GRID = [
  '....wwww....',
  '.....w......',
  '..dddddddd..',
  '..dssssssd..',
  '..dsrggssd..',
  '..dssssssd..',
  '..dddddddd..',
  '..dd.cc.dd..',
  '..dd.cc.dd..',
  '..dddddddd..',
];

export function registerPixelTextures(scene: Phaser.Scene) {
  const skinBase = {
    s: '#f6d0b1',
    e: '#1e293b',
    m: '#d98a6c',
    p: '#334155',
    d: '#1e1b2e',
    y: '#fbbf24',
  };

  // Lead character (Gold crown + Navy blazer)
  drawPixelArt(
    scene,
    'char_lead_idle',
    CHAR_LEAD_IDLE_GRID,
    { ...skinBase, h: '#3b2416', c: '#2563eb' },
    3,
  );
  drawPixelArt(
    scene,
    'char_lead_type',
    CHAR_LEAD_TYPE_GRID,
    { ...skinBase, h: '#3b2416', c: '#2563eb' },
    3,
  );

  // Antigravity worker (Violet hoodie)
  drawPixelArt(
    scene,
    'char_agy_idle',
    CHAR_IDLE_GRID,
    { ...skinBase, h: '#1e1b4b', c: '#8b5cf6' },
    3,
  );
  drawPixelArt(
    scene,
    'char_agy_type',
    CHAR_TYPE_GRID,
    { ...skinBase, h: '#1e1b4b', c: '#8b5cf6' },
    3,
  );

  // Codex worker (Emerald hoodie)
  drawPixelArt(
    scene,
    'char_codex_idle',
    CHAR_IDLE_GRID,
    { ...skinBase, h: '#78350f', c: '#10b981' },
    3,
  );
  drawPixelArt(
    scene,
    'char_codex_type',
    CHAR_TYPE_GRID,
    { ...skinBase, h: '#78350f', c: '#10b981' },
    3,
  );

  // Office Props
  drawPixelArt(
    scene,
    'prop_plant',
    PLANT_GRID,
    {
      g: '#15803d',
      l: '#4ade80',
      b: '#b45309',
      p: '#d97706',
      d: '#78350f',
    },
    3,
  );

  drawPixelArt(
    scene,
    'prop_bookshelf',
    BOOKSHELF_GRID,
    {
      b: '#78350f',
      d: '#451a03',
      r: '#ef4444',
      g: '#22c55e',
      y: '#eab308',
      p: '#a855f7',
    },
    3,
  );

  drawPixelArt(
    scene,
    'prop_coffee',
    COFFEE_GRID,
    {
      w: '#e2e8f0',
      d: '#334155',
      s: '#64748b',
      r: '#ef4444',
      g: '#22c55e',
      c: '#f8fafc',
    },
    3,
  );
}
