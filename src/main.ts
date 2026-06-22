import * as THREE from "three";
import "./styles.css";

declare global {
  interface Window {
    __voxelOfficeDodgeball?: {
      metrics: () => unknown;
    };
  }
}

function requireElement<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const canvas = requireElement<HTMLCanvasElement>("#game");
const blueScoreEl = requireElement<HTMLElement>("#blueScore");
const redScoreEl = requireElement<HTMLElement>("#redScore");
const clockEl = requireElement<HTMLElement>("#clock");
const chaosMeter = requireElement<HTMLMeterElement>("#chaosMeter");
const pauseButton = requireElement<HTMLButtonElement>("#pauseButton");
const cameraButton = requireElement<HTMLButtonElement>("#cameraButton");
const resetButton = requireElement<HTMLButtonElement>("#resetButton");
const speedSlider = requireElement<HTMLInputElement>("#speedSlider");
const urlParams = new URLSearchParams(window.location.search);
const runSeedParam = urlParams.get("seed") ?? urlParams.get("playtestSeed");

const ARENA = { width: 38, depth: 24, halfW: 19, halfD: 12 };
const MATCH_LENGTH = 150;
const PLAYER_COUNT = 5;
const BALL_COUNT = 6;
const PROP_THROW_CHANCE = 0.42;
const MAX_THROWABLE_PROP_MASS = 1.08;
const MAX_THROWABLE_PROP_RADIUS = 1.05;
const PLAYER_GRAVITY = 12.8;
const cameraModes = ["iso", "top", "sideline"];

const palette = {
  blue: 0x0ea5e9,
  blueDark: 0x075985,
  red: 0xf43f5e,
  redDark: 0xbe123c,
  floor: 0xe8eef2,
  floorLine: 0xc7d4df,
  glass: 0xadd7ec,
  glassEdge: 0x7aa5b8,
  warmWall: 0xf7f2e8,
  wood: 0xb98252,
  woodDark: 0x7f5635,
  metal: 0x9aa8b8,
  darkMetal: 0x202938,
  tealFabric: 0x148f88,
  coralFabric: 0xef7c63,
  yellow: 0xfacc15,
  leaf: 0x1f9d55,
  paper: 0xfffbf0,
  stickyBlue: 0x93c5fd,
  stickyPink: 0xf9a8d4,
  ball: 0xf97316,
  ink: 0x172033,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdce7ee);
scene.fog = new THREE.Fog(0xdce7ee, 42, 86);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

const camera = new THREE.OrthographicCamera(-18, 18, 10, -10, 0.1, 140);
scene.add(camera);

const ambient = new THREE.HemisphereLight(0xffffff, 0x7b8794, 2.2);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 2.35);
sun.position.set(-14, 25, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -28;
sun.shadow.camera.right = 28;
sun.shadow.camera.top = 24;
sun.shadow.camera.bottom = -24;
scene.add(sun);

for (const light of [
  [-12, -6, 1.15],
  [0, 0, 1.35],
  [12, 6, 1.15],
]) {
  const point = new THREE.PointLight(0xffffff, light[2], 28, 1.8);
  point.position.set(light[0], 5.8, light[1]);
  scene.add(point);
}

const officeGroup = new THREE.Group();
scene.add(officeGroup);

const shared = {
  cube: new THREE.BoxGeometry(1, 1, 1),
  ball: new THREE.IcosahedronGeometry(0.38, 2),
  dust: new THREE.BoxGeometry(0.14, 0.04, 0.1),
  playerBody: new THREE.BoxGeometry(0.9, 1.18, 0.72),
  playerHead: new THREE.BoxGeometry(0.6, 0.46, 0.58),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
  cone: new THREE.ConeGeometry(0.46, 0.8, 5),
  torus: new THREE.TorusGeometry(0.34, 0.035, 6, 24),
  floorDecal: new THREE.PlaneGeometry(1, 1),
  shadow: new THREE.CircleGeometry(0.72, 24),
};

function makeTileTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 512;
  textureCanvas.height = 512;
  const ctx = textureCanvas.getContext("2d");
  ctx.fillStyle = "#e8eef2";
  ctx.fillRect(0, 0, 512, 512);

  for (let y = 0; y <= 512; y += 64) {
    ctx.strokeStyle = "rgba(126, 148, 164, 0.26)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(512, y + 0.5);
    ctx.stroke();
  }

  for (let x = 0; x <= 512; x += 64) {
    ctx.strokeStyle = "rgba(126, 148, 164, 0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, 512);
    ctx.stroke();
  }

  for (let i = 0; i < 900; i += 1) {
    const alpha = Math.random() * 0.045;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1.4, 1.4);
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 4);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

type MaterialOptions = {
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  map?: THREE.Texture;
};

type PropOptions = {
  y?: number;
  rotationY?: number;
  radius?: number;
  parent?: THREE.Object3D;
  breakable?: boolean;
  dynamic?: boolean;
};

const atlasColumns = 4;
const atlasRows = 5;
// Vite's base keeps texture URLs valid under GitHub Pages' /paper-jam-dodgeball/ path.
const textureAtlasUrl = `${import.meta.env.BASE_URL}assets/textures/office-voxel-atlas-20260621.png`;
const textureLoader = new THREE.TextureLoader();

let textureAtlasLoaded = false;
let textureAtlasAppliedCount = 0;

function configureGeneratedTexture(texture: THREE.Texture, repeatX = 1, repeatY = 1) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function atlasTileFrom(source: THREE.Texture, column: number, row: number, repeatX = 1, repeatY = 1) {
  const sourceImage = source.image as CanvasImageSource & { width: number; height: number };
  const tileWidth = Math.floor(sourceImage.width / atlasColumns);
  const tileHeight = Math.floor(sourceImage.height / atlasRows);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create texture canvas");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.filter = "saturate(1.18) contrast(1.12)";
  ctx.drawImage(
    sourceImage,
    column * tileWidth,
    row * tileHeight,
    tileWidth,
    tileHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const texture = new THREE.CanvasTexture(canvas);
  configureGeneratedTexture(texture, repeatX, repeatY);
  texture.needsUpdate = true;
  return texture;
}

function mat(color: number, options: MaterialOptions = {}) {
  const params: THREE.MeshStandardMaterialParameters = {
    color,
    roughness: options.roughness ?? 0.68,
    metalness: options.metalness ?? 0,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
  };

  if (options.map) {
    params.map = options.map;
  }

  return new THREE.MeshStandardMaterial(params);
}

const materials = {
  floor: mat(0xffffff, { map: makeTileTexture(), roughness: 0.58 }),
  floorLine: mat(palette.floorLine, { roughness: 0.72 }),
  courtBlue: mat(0xd6edf8, { roughness: 0.78 }),
  courtRed: mat(0xf7d7d6, { roughness: 0.78 }),
  courtLane: mat(0xf4f8fb, { roughness: 0.62 }),
  blueTape: mat(0x38bdf8, { roughness: 0.54 }),
  redTape: mat(0xfb7185, { roughness: 0.54 }),
  safetyOrange: mat(0xf97316, { roughness: 0.48 }),
  carpetTeal: mat(0x6ab4aa, { roughness: 0.88 }),
  carpetPlum: mat(0xb27aa0, { roughness: 0.86 }),
  receptionStone: mat(0xd9dde2, { roughness: 0.46, metalness: 0.08 }),
  lockerBlue: mat(0x3b82f6, { roughness: 0.58, metalness: 0.08 }),
  lockerRed: mat(0xf43f5e, { roughness: 0.58, metalness: 0.08 }),
  cartGreen: mat(0x22c55e, { roughness: 0.74 }),
  warmWall: mat(palette.warmWall, { roughness: 0.7 }),
  wallTrim: mat(0xd6c3ad, { roughness: 0.6 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: palette.glass,
    roughness: 0.08,
    metalness: 0,
    transmission: 0.26,
    transparent: true,
    opacity: 0.42,
    ior: 1.25,
  }),
  glassEdge: mat(palette.glassEdge, { roughness: 0.34, metalness: 0.16 }),
  wood: mat(palette.wood, { roughness: 0.62 }),
  woodDark: mat(palette.woodDark, { roughness: 0.64 }),
  metal: mat(palette.metal, { roughness: 0.38, metalness: 0.26 }),
  darkMetal: mat(palette.darkMetal, { roughness: 0.48, metalness: 0.18 }),
  rubber: mat(0x313948, { roughness: 0.74 }),
  blue: mat(palette.blue, { roughness: 0.64 }),
  blueDark: mat(palette.blueDark, { roughness: 0.7 }),
  red: mat(palette.red, { roughness: 0.64 }),
  redDark: mat(palette.redDark, { roughness: 0.7 }),
  tealFabric: mat(palette.tealFabric, { roughness: 0.9 }),
  coralFabric: mat(palette.coralFabric, { roughness: 0.88 }),
  yellow: mat(palette.yellow, { roughness: 0.7 }),
  leaf: mat(palette.leaf, { roughness: 0.86 }),
  pot: mat(0x9a6b43, { roughness: 0.78 }),
  paper: mat(palette.paper, { roughness: 0.94 }),
  stickyBlue: mat(palette.stickyBlue, { roughness: 0.9 }),
  stickyPink: mat(palette.stickyPink, { roughness: 0.9 }),
  ball: mat(palette.ball, { roughness: 0.38 }),
  ballStripe: mat(0xfff1c2, { roughness: 0.42 }),
  ink: mat(palette.ink, { roughness: 0.54 }),
  screen: mat(0x082f49, { roughness: 0.26, emissive: 0x0ea5e9, emissiveIntensity: 0.16 }),
  lightPanel: mat(0xfff7da, { roughness: 0.18, emissive: 0xfff0b3, emissiveIntensity: 1.15 }),
  shadow: new THREE.MeshBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.12 }),
};

type MaterialKey = keyof typeof materials;
type AtlasMaterialSlot = {
  key: MaterialKey;
  column: number;
  row: number;
  repeatX?: number;
  repeatY?: number;
};

const atlasMaterialSlots: AtlasMaterialSlot[] = [
  { key: "floor", column: 0, row: 0, repeatX: 9, repeatY: 6 },
  { key: "floorLine", column: 1, row: 0, repeatX: 2, repeatY: 1 },
  { key: "courtLane", column: 3, row: 0, repeatX: 3, repeatY: 5 },
  { key: "safetyOrange", column: 0, row: 4, repeatX: 1.5, repeatY: 1.5 },
  { key: "carpetTeal", column: 0, row: 2, repeatX: 4, repeatY: 3 },
  { key: "carpetPlum", column: 1, row: 2, repeatX: 4, repeatY: 3 },
  { key: "receptionStone", column: 0, row: 0, repeatX: 2, repeatY: 2 },
  { key: "cartGreen", column: 3, row: 3, repeatX: 1, repeatY: 1 },
  { key: "warmWall", column: 3, row: 4, repeatX: 4, repeatY: 1.5 },
  { key: "glass", column: 2, row: 1, repeatX: 2, repeatY: 1 },
  { key: "wood", column: 0, row: 1, repeatX: 2.2, repeatY: 1.2 },
  { key: "woodDark", column: 1, row: 1, repeatX: 2, repeatY: 1 },
  { key: "metal", column: 3, row: 1, repeatX: 1.4, repeatY: 1.1 },
  { key: "darkMetal", column: 2, row: 3, repeatX: 1, repeatY: 1 },
  { key: "rubber", column: 2, row: 3, repeatX: 2, repeatY: 1 },
  { key: "tealFabric", column: 0, row: 2, repeatX: 1.5, repeatY: 1 },
  { key: "coralFabric", column: 1, row: 2, repeatX: 1.5, repeatY: 1 },
  { key: "leaf", column: 3, row: 3, repeatX: 1, repeatY: 1 },
  { key: "paper", column: 0, row: 3, repeatX: 1, repeatY: 1 },
  { key: "ball", column: 0, row: 4, repeatX: 1, repeatY: 1 },
];

function applyGeneratedTextureAtlas() {
  textureLoader.load(textureAtlasUrl, (source) => {
    textureAtlasLoaded = true;
    textureAtlasAppliedCount = 0;

    for (const { key, column, row, repeatX = 1, repeatY = 1 } of atlasMaterialSlots) {
      const material = materials[key];
      material.map = atlasTileFrom(source, column, row, repeatX, repeatY);
      material.needsUpdate = true;
      textureAtlasAppliedCount += 1;
    }
  });
}

applyGeneratedTextureAtlas();

const players = [];
const balls = [];
const props = [];
const particles = [];
const barriers = [];

let gameTime = MATCH_LENGTH;
let blueScore = 0;
let redScore = 0;
let chaos = 0;
let paused = false;
let cameraModeIndex = 0;
let speedScale = 1;
let lastTime = performance.now();
let matchElapsed = 0;
let peakChaos = 0;
let timeToChaos80: number | null = null;
const eventCounters = {
  ballThrows: 0,
  propThrows: 0,
  playerHitsByBall: 0,
  playerHitsByProp: 0,
  propImpacts: 0,
  propChainImpacts: 0,
  propFractures: 0,
  barrierFractures: 0,
  wallFractures: 0,
  deskFractures: 0,
  playerLaunches: 0,
  particlesSpawned: 0,
};

function resetPlaytestCounters() {
  matchElapsed = 0;
  peakChaos = 0;
  timeToChaos80 = null;
  for (const key of Object.keys(eventCounters) as Array<keyof typeof eventCounters>) {
    eventCounters[key] = 0;
  }
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

let randomState = runSeedParam ? hashSeed(runSeedParam) || 1 : 0;

function seededRandom() {
  randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
  return randomState / 4294967296;
}

function rand(min, max) {
  return min + (runSeedParam ? seededRandom() : Math.random()) * (max - min);
}

function pick(list) {
  return list[Math.floor((runSeedParam ? seededRandom() : Math.random()) * list.length)];
}

function chance(probability) {
  return (runSeedParam ? seededRandom() : Math.random()) < probability;
}

function clampComponent(value: number, limit: number) {
  return clamp(value, -limit, limit);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function length2(x, z) {
  return Math.sqrt(x * x + z * z);
}

function makeBox({ size, position, material, cast = true, receive = true, parent = scene, rotationY = 0 }) {
  const mesh = new THREE.Mesh(shared.cube, material);
  mesh.scale.set(size.x, size.y, size.z);
  mesh.position.set(position.x, position.y, position.z);
  mesh.rotation.y = rotationY;
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  parent.add(mesh);
  return mesh;
}

function makeCylinder({ radius = 0.5, height = 1, position, material, cast = true, receive = true, parent = scene }) {
  const mesh = new THREE.Mesh(shared.cylinder, material);
  mesh.scale.set(radius, height, radius);
  mesh.position.set(position.x, position.y, position.z);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  parent.add(mesh);
  return mesh;
}

function addCourtCircle(x, z, radius, material = materials.paper) {
  const mesh = new THREE.Mesh(shared.torus, material);
  const scale = radius / 0.34;
  mesh.scale.set(scale, scale, scale);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, 0.1, z);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  officeGroup.add(mesh);
  return mesh;
}

function addBarrierBox({ x, z, sx, sz, height, y = 0, material, visualHeight = height, breakable = true, kind = "barrier" }) {
  const mesh = makeBox({
    size: { x: sx, y: visualHeight, z: sz },
    position: { x, y: y + visualHeight / 2, z },
    material,
    parent: officeGroup,
  });

  barriers.push({
    kind,
    mesh,
    x,
    z,
    sx,
    sz,
    y,
    material,
    visualHeight,
    breakable,
    broken: false,
    minX: x - sx / 2,
    maxX: x + sx / 2,
    minZ: z - sz / 2,
    maxZ: z + sz / 2,
    height: y + height,
  });
  return mesh;
}

function circleRectPenetration(x, z, radius, rect) {
  const closestX = clamp(x, rect.minX, rect.maxX);
  const closestZ = clamp(z, rect.minZ, rect.maxZ);
  let dx = x - closestX;
  let dz = z - closestZ;
  const distSq = dx * dx + dz * dz;

  if (distSq >= radius * radius) return null;

  if (distSq < 0.0001) {
    const left = Math.abs(x - rect.minX);
    const right = Math.abs(rect.maxX - x);
    const top = Math.abs(z - rect.minZ);
    const bottom = Math.abs(rect.maxZ - z);
    const side = Math.min(left, right, top, bottom);
    if (side === left) return { nx: -1, nz: 0, penetration: radius + left };
    if (side === right) return { nx: 1, nz: 0, penetration: radius + right };
    if (side === top) return { nx: 0, nz: -1, penetration: radius + top };
    return { nx: 0, nz: 1, penetration: radius + bottom };
  }

  const dist = Math.sqrt(distSq);
  dx /= dist;
  dz /= dist;
  return { nx: dx, nz: dz, penetration: radius - dist };
}

function isBlockedPoint(x, z, pad = 0.75) {
  return barriers.some(
    (barrier) =>
      !barrier.broken &&
      x > barrier.minX - pad &&
      x < barrier.maxX + pad &&
      z > barrier.minZ - pad &&
      z < barrier.maxZ + pad,
  );
}

function addFloorInset(x, z, sx, sz, material, y = 0.058) {
  const mesh = new THREE.Mesh(shared.floorDecal, material);
  mesh.scale.set(sx, sz, 1);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = 10 + Math.round(y * 1000);
  officeGroup.add(mesh);
  return mesh;
}

function addCourtLine(x, z, sx, sz, material = materials.safetyOrange) {
  addFloorInset(x, z, sx, sz, material, 0.078);
}

function isNaturallyBreakableKind(kind) {
  return (
    kind.includes("wall-panel") ||
    kind.includes("desk") ||
    kind.includes("table") ||
    kind.includes("counter") ||
    kind.includes("cabinet") ||
    kind.includes("locker") ||
    kind.includes("shelf") ||
    kind.includes("divider") ||
    kind.includes("crate")
  );
}

function addProp(kind, x, z, sx, sy, sz, material, mass = 1, options: PropOptions = {}) {
  const mesh = makeBox({
    size: { x: sx, y: sy, z: sz },
    position: { x, y: options.y ?? sy / 2, z },
    material,
    rotationY: options.rotationY ?? 0,
  });

  const prop = {
    kind,
    mesh,
    size: new THREE.Vector3(sx, sy, sz),
    material,
    baseY: mesh.position.y,
    homeBaseY: mesh.position.y,
    floorY: sy / 2,
    homePosition: mesh.position.clone(),
    homeRotation: mesh.rotation.clone(),
    radius: options.radius ?? Math.max(sx, sz) * 0.64,
    mass,
    breakable: options.breakable ?? isNaturallyBreakableKind(kind),
    dynamic: options.dynamic ?? false,
    broken: false,
    holder: null,
    team: null,
    velocity: new THREE.Vector3(),
    spin: new THREE.Vector3(),
    air: false,
    throwAge: 99,
    impactCooldown: 0,
    pickupCooldown: 0,
    chainCooldown: 0,
    health: 1,
  };
  props.push(prop);
  return prop;
}

function addCylinderProp(kind, x, z, radius, height, material, mass = 1, options: PropOptions = {}) {
  const mesh = makeCylinder({
    radius,
    height,
    position: { x, y: options.y ?? height / 2, z },
    material,
    parent: options.parent ?? scene,
  });

  const prop = {
    kind,
    mesh,
    size: new THREE.Vector3(radius * 2, height, radius * 2),
    material,
    baseY: mesh.position.y,
    homeBaseY: mesh.position.y,
    floorY: height / 2,
    homePosition: mesh.position.clone(),
    homeRotation: mesh.rotation.clone(),
    radius: options.radius ?? radius * 1.2,
    mass,
    breakable: options.breakable ?? isNaturallyBreakableKind(kind),
    dynamic: options.dynamic ?? false,
    broken: false,
    holder: null,
    team: null,
    velocity: new THREE.Vector3(),
    spin: new THREE.Vector3(),
    air: false,
    throwAge: 99,
    impactCooldown: 0,
    pickupCooldown: 0,
    chainCooldown: 0,
    health: 1,
  };
  props.push(prop);
  return prop;
}

function addStaticDetail(x, y, z, sx, sy, sz, material, parent = officeGroup) {
  return makeBox({
    size: { x: sx, y: sy, z: sz },
    position: { x, y, z },
    material,
    parent,
  });
}

function addGlassPanel(x, z, sx, sz, height = 2.55) {
  addBarrierBox({ x, z, sx, sz, height, material: materials.glass, visualHeight: height, kind: "glass-panel" });
  if (sx > sz) {
    for (let i = -sx / 2; i <= sx / 2; i += 1.8) {
      addStaticDetail(x + i, height / 2, z, 0.055, height + 0.08, 0.1, materials.glassEdge);
    }
  } else {
    for (let i = -sz / 2; i <= sz / 2; i += 1.8) {
      addStaticDetail(x, height / 2, z + i, 0.1, height + 0.08, 0.055, materials.glassEdge);
    }
  }
}

function addCeilingLight(x, z, sx, sz) {
  addStaticDetail(x, 4.65, z, sx, 0.08, sz, materials.lightPanel);
  addStaticDetail(x, 4.58, z, sx + 0.16, 0.05, 0.05, materials.glassEdge);
  addStaticDetail(x, 4.58, z - sz / 2, sx + 0.16, 0.05, 0.05, materials.glassEdge);
  addStaticDetail(x, 4.58, z + sz / 2, sx + 0.16, 0.05, 0.05, materials.glassEdge);
}

function addBreakableWallStrip(x, z, sx, sz) {
  const alongX = sx >= sz;
  const length = alongX ? sx : sz;
  const panelCount = Math.max(4, Math.ceil(length / 3.2));
  const panelLength = length / panelCount;

  for (let i = 0; i < panelCount; i += 1) {
    const offset = -length / 2 + panelLength * (i + 0.5);
    const px = alongX ? x + offset : x;
    const pz = alongX ? z : z + offset;
    const panelSx = alongX ? panelLength * 0.96 : sx;
    const panelSz = alongX ? sz : panelLength * 0.96;
    addProp("outer-wall-panel", px, pz, panelSx, 2.6, panelSz, materials.warmWall, 4.4, {
      y: 1.45,
      radius: Math.max(panelSx, panelSz) * 0.58,
      breakable: true,
    });
  }
}

function buildOfficeShell() {
  makeBox({
    size: { x: ARENA.width, y: 0.16, z: ARENA.depth },
    position: { x: 0, y: -0.08, z: 0 },
    material: materials.floor,
    cast: false,
    parent: officeGroup,
  });

  addFloorInset(-9.5, 0, 17, 21.4, materials.courtBlue, 0.022);
  addFloorInset(9.5, 0, 17, 21.4, materials.courtRed, 0.022);
  addFloorInset(0, 0, 7.8, 18.8, materials.courtLane, 0.042);
  addFloorInset(-13.2, 7.7, 8.4, 5.4, materials.carpetTeal, 0.058);
  addFloorInset(13.3, -7.6, 7.4, 5.2, materials.carpetPlum, 0.058);

  addCourtLine(0, 0, 0.18, 17.4, materials.paper);
  addCourtCircle(0, 0, 1.7, materials.paper);
  addCourtLine(-3.95, 0, 0.12, 17.2, materials.blueTape);
  addCourtLine(3.95, 0, 0.12, 17.2, materials.redTape);
  addCourtLine(0, -8.55, 7.9, 0.12, materials.safetyOrange);
  addCourtLine(0, 8.55, 7.9, 0.12, materials.safetyOrange);

  for (let z = -7.2; z <= 7.2; z += 3.6) {
    addCourtLine(0, z, 0.14, 2.2, materials.safetyOrange);
  }

  for (const [x, material] of [
    [-5.35, materials.blueTape],
    [5.35, materials.redTape],
  ]) {
    for (const z of [-4.8, 0, 4.8]) {
      addFloorInset(x, z, 1.15, 1.15, material, 0.072);
      addStaticDetail(x, 0.108, z, 0.64, 0.045, 0.64, materials.ballStripe);
    }
  }

  for (const z of [-10.7, 10.7]) {
    addStaticDetail(0, 0.12, z, ARENA.width + 0.8, 0.24, 0.28, materials.wallTrim);
    addBreakableWallStrip(0, z + Math.sign(z) * 0.22, ARENA.width + 0.4, 0.2);
  }

  for (const x of [-18.9, 18.9]) {
    addStaticDetail(x, 0.12, 0, 0.28, 0.24, ARENA.depth + 0.8, materials.wallTrim);
    addBreakableWallStrip(x + Math.sign(x) * 0.22, 0, 0.2, ARENA.depth + 0.4);
  }

  for (let x = -15; x <= 15; x += 5) {
    addStaticDetail(x, 2.15, -10.72, 2.3, 0.84, 0.08, materials.glass);
    addStaticDetail(x, 2.15, 10.72, 2.3, 0.84, 0.08, materials.glass);
  }

  for (const [x, z, sx, sz] of [
    [-12, -5.8, 4.2, 1.05],
    [0, -0.6, 5.3, 1.15],
    [12, 5.4, 4.2, 1.05],
  ]) {
    addCeilingLight(x, z, sx, sz);
  }
}

function buildCentralCourtProps() {
  for (const z of [-5.7, 0, 5.7]) {
    addBarrierBox({ x: -4.35, z, sx: 0.16, sz: 2.55, height: 0.82, material: materials.glassEdge, visualHeight: 0.82 });
    addBarrierBox({ x: 4.35, z, sx: 0.16, sz: 2.55, height: 0.82, material: materials.glassEdge, visualHeight: 0.82 });
  }

  for (const [x, material] of [
    [-2.2, materials.blueTape],
    [2.2, materials.redTape],
  ]) {
    addProp("ball-crate", x, -9.05, 1.15, 0.42, 0.72, material, 1.25);
    addProp("ball-crate", x, 9.05, 1.15, 0.42, 0.72, material, 1.25);
  }

  for (const z of [-6.9, 6.9]) {
    addProp("floor-cable", -0.8, z, 1.3, 0.05, 0.16, materials.rubber, 0.18);
    addProp("floor-cable", 0.8, z, 1.3, 0.05, 0.16, materials.rubber, 0.18);
  }
}

function buildTeamUtilityProps() {
  for (const side of [-1, 1]) {
    const teamMaterial = side < 0 ? materials.blue : materials.red;
    const accentMaterial = side < 0 ? materials.blueDark : materials.redDark;
    const utilityX = side * 16.25;
    const dividerX = side * 6.35;

    for (const z of [-7.4, -4.6, -0.8, 3.1, 6.8]) {
      addCylinderProp("team-drum", utilityX, z, 0.38, 0.86, accentMaterial, 0.82);
    }

    for (const z of [-5.4, 0, 5.4]) {
      addProp("low-team-divider", dividerX, z, 1.45, 0.42, 0.28, teamMaterial, 0.95);
      addProp("bumper-pad", dividerX + side * 0.72, z + 0.65, 0.62, 0.34, 0.3, accentMaterial, 0.55);
    }

    addProp("supply-crate", side * 12.9, -8.9, 1.1, 0.62, 0.82, accentMaterial, 1.05);
    addProp("supply-crate", side * 12.8, 8.6, 1.0, 0.56, 0.78, teamMaterial, 0.95);
  }
}

function buildMeetingRoom() {
  addFloorInset(-12.6, -6.6, 9.2, 6.2, mat(0xdbe8ed, { roughness: 0.64 }));
  addGlassPanel(-12.6, -9.45, 9.4, 0.18);
  addGlassPanel(-17.2, -6.55, 0.18, 5.8);
  addGlassPanel(-8.05, -6.55, 0.18, 5.8);
  addGlassPanel(-15.4, -3.72, 3.5, 0.18);
  addGlassPanel(-9.5, -3.72, 2.7, 0.18);

  addStaticDetail(-12.6, 0.08, -3.5, 1.4, 0.08, 0.22, materials.glassEdge);
  addProp("conference-table", -12.6, -6.55, 4.3, 0.42, 1.55, materials.woodDark, 3.3);

  for (const [x, z, rot] of [
    [-14.5, -7.85, Math.PI / 2],
    [-12.6, -7.9, Math.PI / 2],
    [-10.7, -7.85, Math.PI / 2],
    [-14.5, -5.25, -Math.PI / 2],
    [-12.6, -5.2, -Math.PI / 2],
    [-10.7, -5.25, -Math.PI / 2],
  ]) {
    addProp("meeting-chair", x, z, 0.7, 0.58, 0.68, materials.tealFabric, 0.92, { rotationY: rot });
  }

  addProp("whiteboard", -12.4, -9.12, 2.6, 1.2, 0.12, materials.paper, 1.2, { y: 1.38 });
  for (let i = 0; i < 8; i += 1) {
    addProp(
      "sticky-note",
      -13.35 + (i % 4) * 0.45,
      -8.96,
      0.25,
      0.03,
      0.2,
      i % 2 ? materials.stickyPink : materials.stickyBlue,
      0.08,
      { y: 1.95 - Math.floor(i / 4) * 0.34 },
    );
  }
}

function addDeskIsland(x, z, side) {
  addProp("desk", x, z, 3.0, 0.42, 1.35, materials.wood, 2.45);
  addStaticDetail(x - 1.23, 0.35, z - 0.48, 0.12, 0.62, 0.12, materials.darkMetal);
  addStaticDetail(x + 1.23, 0.35, z - 0.48, 0.12, 0.62, 0.12, materials.darkMetal);
  addStaticDetail(x - 1.23, 0.35, z + 0.48, 0.12, 0.62, 0.12, materials.darkMetal);
  addStaticDetail(x + 1.23, 0.35, z + 0.48, 0.12, 0.62, 0.12, materials.darkMetal);

  addProp("monitor", x - 0.62 * side, z - 0.23, 0.66, 0.52, 0.13, materials.screen, 0.62, { y: 0.9 });
  addProp("keyboard", x - 0.32 * side, z + 0.35, 0.84, 0.08, 0.23, materials.darkMetal, 0.38, { y: 0.68 });
  addProp("laptop", x + 0.62 * side, z + 0.05, 0.72, 0.08, 0.5, materials.ink, 0.48, { y: 0.68 });
  addProp("chair", x + 1.55 * side, z, 0.72, 0.72, 0.72, side < 0 ? materials.blueDark : materials.redDark, 0.9);
  addProp("paper-stack", x + 0.1, z - 0.44, 0.48, 0.13, 0.34, materials.paper, 0.22, { y: 0.72 });
  addProp("coffee-cup", x + 1.08 * side, z - 0.38, 0.22, 0.32, 0.22, materials.yellow, 0.16, { y: 0.82 });
}

function buildDeskIslands() {
  for (const rowZ of [-6.2, -2.0, 2.0, 6.2]) {
    addDeskIsland(-9.7, rowZ, -1);
    addDeskIsland(9.7, rowZ, 1);
  }

  for (const rowZ of [-4.1, 4.1]) {
    addDeskIsland(-14.1, rowZ, 1);
    addDeskIsland(14.1, rowZ, -1);
  }
}

function addPlant(x, z, scale = 1) {
  addProp("planter", x, z, 0.68 * scale, 0.58 * scale, 0.68 * scale, materials.pot, 1.25);
  addProp("plant-stem", x, z, 0.18 * scale, 1.05 * scale, 0.18 * scale, materials.leaf, 0.55, {
    y: 0.82 * scale,
    radius: 0.32 * scale,
  });
  for (const [ox, oz] of [
    [-0.25, 0.1],
    [0.28, -0.12],
    [0.15, 0.26],
    [-0.1, -0.28],
  ]) {
    addProp("leaf", x + ox * scale, z + oz * scale, 0.46 * scale, 0.28 * scale, 0.38 * scale, materials.leaf, 0.25, {
      y: rand(1.15, 1.62) * scale,
      radius: 0.34 * scale,
    });
  }
}

function buildLounge() {
  addProp("sofa", -14.2, 8.2, 3.25, 0.72, 0.94, materials.tealFabric, 2.2);
  addProp("sofa", -10.6, 7.2, 0.94, 0.72, 2.55, materials.coralFabric, 1.9);
  addProp("coffee-table", -12.4, 7.0, 1.6, 0.32, 0.92, materials.woodDark, 1.4);
  addProp("magazine", -12.2, 6.75, 0.5, 0.035, 0.36, materials.stickyBlue, 0.12, { y: 0.52 });
  addProp("magazine", -12.65, 7.12, 0.5, 0.035, 0.36, materials.stickyPink, 0.12, { y: 0.56, rotationY: 0.6 });
  addPlant(-16.2, 9.6, 1.1);
  addProp("side-table", -9.35, 9.25, 0.72, 0.42, 0.72, materials.wood, 0.8);
}

function buildCafeLounge() {
  addFloorInset(0, -8.15, 8.4, 4.15, mat(0xd3a66e, { roughness: 0.72 }), 0.045);
  addProp("lounge-counter", 0, -7.0, 4.5, 0.82, 0.72, materials.woodDark, 3.1);
  addProp("teal-sofa", -1.85, -9.05, 2.25, 0.72, 0.82, materials.tealFabric, 1.8);
  addProp("teal-sofa", 1.85, -9.05, 2.25, 0.72, 0.82, materials.tealFabric, 1.8);
  addCylinderProp("round-table", 0, -9.02, 0.48, 0.42, materials.wood, 0.85);
  addCylinderProp("round-table", -1.15, -8.1, 0.34, 0.38, materials.wood, 0.55);
  addCylinderProp("round-table", 1.15, -8.1, 0.34, 0.38, materials.wood, 0.55);

  for (let x = -3.2; x <= 3.2; x += 1.05) {
    addProp("back-cabinet", x, -10.15, 0.74, 1.18, 0.48, materials.woodDark, 1.35);
  }

  for (const x of [-2.9, 0, 2.9]) {
    addCylinderProp("bar-stool", x, -6.35, 0.24, 0.58, materials.metal, 0.42);
  }
}

function buildCopyZone() {
  addProp("copy-machine", 14.2, -8.3, 1.42, 1.1, 0.95, materials.paper, 2.2);
  addProp("scanner-lid", 14.2, -8.88, 1.25, 0.12, 0.18, materials.darkMetal, 0.6, { y: 1.22 });
  addProp("paper-tray", 14.2, -7.66, 0.9, 0.16, 0.36, materials.metal, 0.45, { y: 0.84 });
  addCylinderProp("recycle-bin", 16.2, -8.3, 0.38, 0.84, materials.tealFabric, 0.85);

  for (const x of [10.5, 11.9, 16.9]) {
    addProp("cabinet", x, -10.1, 1.1, 1.34, 0.66, materials.metal, 2.0);
  }

  for (let i = 0; i < 10; i += 1) {
    addProp("loose-paper", rand(10.4, 17.2), rand(-9.6, -6.5), 0.42, 0.035, 0.32, materials.paper, 0.14, {
      rotationY: rand(-0.7, 0.7),
    });
  }
}

function buildServiceNooks() {
  addFloorInset(-15.2, 9.1, 5.2, 2.65, mat(0x334155, { roughness: 0.86 }), 0.045);
  addProp("storage-shelf", -17.0, 9.4, 1.15, 1.24, 0.58, materials.darkMetal, 1.65);
  addProp("storage-shelf", -15.6, 9.4, 1.15, 1.24, 0.58, materials.darkMetal, 1.65);
  addProp("box-stack", -13.8, 9.7, 0.95, 0.82, 0.75, materials.wood, 0.9);
  addProp("box-stack", -14.6, 8.55, 0.7, 0.62, 0.58, materials.wood, 0.68);

  addFloorInset(13.7, 9.0, 5.5, 2.7, mat(0xe1e7ed, { roughness: 0.7 }), 0.045);
  addProp("service-printer", 12.2, 9.08, 1.05, 0.95, 0.72, materials.paper, 1.75);
  addProp("service-copier", 14.0, 9.05, 1.18, 1.12, 0.82, materials.paper, 2.0);
  addProp("parcel-cart", 15.8, 8.85, 0.95, 0.82, 0.72, materials.wood, 0.95);
  addCylinderProp("round-service-table", 16.8, 9.62, 0.34, 0.42, materials.paper, 0.5);

  for (const [x, z] of [
    [12.0, 10.15],
    [13.1, 10.2],
    [15.4, 9.72],
    [16.2, 8.15],
  ]) {
    addProp("parcel", x, z, 0.5, 0.38, 0.42, materials.wood, 0.38);
  }
}

function addLockerRow(x, z, side, material) {
  for (let i = 0; i < 4; i += 1) {
    const offset = (i - 1.5) * 0.92;
    const locker = addProp("locker", x, z + offset, 0.72, 1.58, 0.48, material, 1.55, {
      radius: 0.52,
    });
    addStaticDetail(locker.mesh.position.x, 1.05, locker.mesh.position.z + side * 0.25, 0.42, 0.05, 0.04, materials.paper);
    addStaticDetail(locker.mesh.position.x, 0.75, locker.mesh.position.z + side * 0.25, 0.14, 0.05, 0.04, materials.darkMetal);
  }
}

function addStorageCart(x, z, material) {
  addProp("storage-cart", x, z, 1.15, 0.72, 0.78, material, 1.05);
  addProp("file-box", x - 0.24, z - 0.18, 0.46, 0.34, 0.38, materials.paper, 0.28, { y: 0.88 });
  addProp("binder", x + 0.32, z + 0.2, 0.46, 0.16, 0.32, materials.ink, 0.24, { y: 0.82 });
}

function buildReceptionAndStorage() {
  addFloorInset(0, 9.2, 7.6, 2.5, mat(0xe4edf1, { roughness: 0.66 }), 0.045);
  addProp("reception-counter", 0, 9.62, 4.4, 0.92, 0.72, materials.receptionStone, 3.2);
  addProp("front-monitor", -1.0, 9.22, 0.62, 0.48, 0.12, materials.screen, 0.52, { y: 1.28 });
  addProp("front-monitor", 1.0, 9.22, 0.62, 0.48, 0.12, materials.screen, 0.52, { y: 1.28 });
  addProp("visitor-stool", -2.45, 8.55, 0.55, 0.5, 0.55, materials.tealFabric, 0.58);
  addProp("visitor-stool", 2.45, 8.55, 0.55, 0.5, 0.55, materials.coralFabric, 0.58);

  addLockerRow(-17.55, -3.6, 1, materials.lockerBlue);
  addLockerRow(17.55, 3.6, -1, materials.lockerRed);
  addLockerRow(17.55, -7.5, -1, materials.lockerRed);

  addStorageCart(-5.7, -8.85, materials.cartGreen);
  addStorageCart(5.7, 8.85, materials.cartGreen);
  addStorageCart(15.65, 6.6, materials.metal);
  addStorageCart(-15.65, -6.7, materials.metal);
}

function buildAccentProps() {
  for (const pos of [
    [-17, -10],
    [17, 10],
    [-4.6, -10.2],
    [4.6, 10.2],
    [17, -2],
    [-17, 2.4],
  ]) {
    addPlant(pos[0], pos[1], rand(0.78, 1.12));
  }

  for (const pos of [
    [-5.8, 9.9],
    [5.8, -9.9],
    [-2.4, 10.05],
    [2.4, -10.05],
  ]) {
    addProp("rolling-cabinet", pos[0], pos[1], 1.05, 1.2, 0.68, materials.metal, 1.9);
  }

  for (let i = 0; i < 24; i += 1) {
    let x = rand(-16, 16);
    let z = rand(-8.8, 8.8);
    if (Math.abs(x) < 3.4) {
      x += x < 0 ? -2.6 : 2.6;
    }
    if (isBlockedPoint(x, z, 0.3)) continue;
    addProp("loose-paper", x, z, 0.45, 0.035, 0.34, pick([materials.paper, materials.stickyBlue, materials.stickyPink]), 0.13, {
      rotationY: rand(-Math.PI, Math.PI),
    });
  }
}

function buildOffice() {
  buildOfficeShell();
  buildCentralCourtProps();
  buildTeamUtilityProps();
  buildMeetingRoom();
  buildDeskIslands();
  buildCafeLounge();
  buildLounge();
  buildCopyZone();
  buildServiceNooks();
  buildReceptionAndStorage();
  buildAccentProps();
}

function createPlayer(team, index) {
  const teamColor = team === "blue" ? materials.blue : materials.red;
  const accent = team === "blue" ? materials.blueDark : materials.redDark;
  const side = team === "blue" ? -1 : 1;
  const group = new THREE.Group();

  const shadow = new THREE.Mesh(shared.shadow, materials.shadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  group.add(shadow);

  const body = new THREE.Mesh(shared.playerBody, teamColor);
  body.position.y = 0.84;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const chest = new THREE.Mesh(shared.cube, accent);
  chest.scale.set(0.66, 0.24, 0.08);
  chest.position.set(0, 0.98, side * -0.39);
  chest.castShadow = true;
  group.add(chest);

  const head = new THREE.Mesh(shared.playerHead, materials.paper);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);

  const hair = new THREE.Mesh(shared.cube, accent);
  hair.scale.set(0.64, 0.16, 0.62);
  hair.position.y = 1.91;
  hair.castShadow = true;
  group.add(hair);

  for (const armX of [-0.58, 0.58]) {
    const arm = new THREE.Mesh(shared.cube, accent);
    arm.scale.set(0.18, 0.62, 0.2);
    arm.position.set(armX, 0.96, 0);
    arm.castShadow = true;
    group.add(arm);
  }

  for (const footX of [-0.25, 0.25]) {
    const foot = new THREE.Mesh(shared.cube, materials.rubber);
    foot.scale.set(0.24, 0.18, 0.46);
    foot.position.set(footX, 0.14, side * -0.08);
    foot.castShadow = true;
    group.add(foot);
  }

  group.position.set(side * rand(5.8, 14), 0, rand(-8.5, 8.5));
  scene.add(group);

  return {
    team,
    index,
    group,
    shadow,
    velocity: new THREE.Vector3(),
    target: new THREE.Vector3(group.position.x, 0, group.position.z),
    radius: 0.68,
    cooldown: rand(0.2, 1.8),
    stun: 0,
    dodge: rand(0, Math.PI * 2),
    lean: 0,
    airY: 0,
    airVelocity: 0,
    knockbackTime: 0,
    tumble: 0,
    tumbleVelocity: 0,
  };
}

function createBall(index) {
  const group = new THREE.Group();
  const ballCore = new THREE.Mesh(shared.ball, materials.ball);
  ballCore.castShadow = true;
  ballCore.receiveShadow = true;
  group.add(ballCore);

  const stripeA = new THREE.Mesh(shared.torus, materials.ballStripe);
  stripeA.rotation.x = Math.PI / 2;
  group.add(stripeA);

  const stripeB = new THREE.Mesh(shared.torus, materials.ballStripe);
  stripeB.rotation.y = Math.PI / 2;
  group.add(stripeB);

  scene.add(group);

  return {
    index,
    mesh: group,
    holder: null,
    team: null,
    airborne: false,
    active: true,
    velocity: new THREE.Vector3(),
    radius: 0.38,
    spin: new THREE.Vector3(),
    age: 0,
  };
}

function resetBall(ball) {
  ball.holder = null;
  ball.team = null;
  ball.airborne = false;
  ball.active = true;
  ball.velocity.set(0, 0, 0);
  ball.spin.set(0, 0, 0);
  ball.age = 0;
  ball.mesh.position.set(rand(-2.8, 2.8), 0.42, rand(-7.4, 7.4));
  ball.mesh.rotation.set(rand(0, 1), rand(0, 1), rand(0, 1));
  ball.mesh.visible = true;
}

function createTeamsAndBalls() {
  for (let i = 0; i < PLAYER_COUNT; i += 1) {
    players.push(createPlayer("blue", i));
    players.push(createPlayer("red", i));
  }

  for (let i = 0; i < BALL_COUNT; i += 1) {
    const ball = createBall(i);
    balls.push(ball);
    resetBall(ball);
  }
}

function pickNewTarget(player) {
  const laneMin = player.team === "blue" ? -ARENA.halfW + 1.8 : 1.6;
  const laneMax = player.team === "blue" ? -1.6 : ARENA.halfW - 1.8;

  for (let attempt = 0; attempt < 18; attempt += 1) {
    const x = rand(laneMin, laneMax);
    const z = rand(-ARENA.halfD + 1.4, ARENA.halfD - 1.4);
    if (!isBlockedPoint(x, z, player.radius + 0.3)) {
      player.target.set(x, 0, z);
      return;
    }
  }
  player.target.set(rand(laneMin, laneMax), 0, rand(-7, 7));
}

function nearestOpponent(player) {
  let best = null;
  let bestDist = Infinity;
  for (const other of players) {
    if (other.team === player.team || other.stun > 0.85) continue;
    const dx = other.group.position.x - player.group.position.x;
    const dz = other.group.position.z - player.group.position.z;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      best = other;
    }
  }
  return best;
}

function nearestFreeBall(player) {
  let best = null;
  let bestDist = Infinity;
  for (const ball of balls) {
    if (ball.holder || ball.airborne) continue;
    const dx = ball.mesh.position.x - player.group.position.x;
    const dz = ball.mesh.position.z - player.group.position.z;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      best = ball;
    }
  }
  return best;
}

function ballHeldBy(player) {
  return balls.find((ball) => ball.holder === player) ?? null;
}

function propHeldBy(player) {
  return props.find((prop) => prop.holder === player) ?? null;
}

function canThrowProp(prop) {
  if (prop.broken) return false;
  if (prop.holder || prop.air || prop.pickupCooldown > 0) return false;
  if (prop.mass > MAX_THROWABLE_PROP_MASS || prop.radius > MAX_THROWABLE_PROP_RADIUS) return false;
  const fixedFragments = [
    "desk",
    "table",
    "sofa",
    "counter",
    "cabinet",
    "shelf",
    "machine",
    "copier",
    "printer",
    "whiteboard",
    "divider",
    "locker",
    "storage",
    "lounge",
    "reception",
    "plant-stem",
  ];
  return !fixedFragments.some((fragment) => prop.kind.includes(fragment));
}

function nearestThrowableProp(player) {
  let best = null;
  let bestDist = Infinity;
  for (const prop of props) {
    if (!canThrowProp(prop)) continue;
    const dx = prop.mesh.position.x - player.group.position.x;
    const dz = prop.mesh.position.z - player.group.position.z;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      best = prop;
    }
  }
  return bestDist < 92 ? best : null;
}

function throwBall(player, ball, target) {
  eventCounters.ballThrows += 1;
  const from = player.group.position;
  const to = target.group.position;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.max(1, length2(dx, dz));
  const leadX = target.velocity.x * 0.48;
  const leadZ = target.velocity.z * 0.48;
  const speed = 14.2 + Math.min(6.8, dist * 0.3) + chaos * 0.022;
  const inv = 1 / Math.max(0.001, length2(dx + leadX, dz + leadZ));

  ball.holder = null;
  ball.team = player.team;
  ball.airborne = true;
  ball.age = 0;
  ball.mesh.position.set(from.x, 1.35, from.z);
  ball.velocity.set((dx + leadX) * inv * speed, 3.55 + rand(0.25, 1.35), (dz + leadZ) * inv * speed);
  ball.spin.set(rand(-7, 7), rand(-9, 9), rand(-7, 7));
  player.cooldown = rand(0.78, 1.35);
  player.lean = player.team === "blue" ? -0.28 : 0.28;
}

function spawnPaperBurst(position, count, baseVelocity, colorMix = false) {
  eventCounters.particlesSpawned += count;
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(shared.dust, colorMix ? pick([materials.paper, materials.stickyBlue, materials.stickyPink]) : materials.paper);
    mesh.position.copy(position);
    mesh.position.y += rand(0.1, 0.9);
    mesh.scale.set(rand(0.8, 1.9), 1, rand(0.8, 1.7));
    scene.add(mesh);
    particles.push({
      mesh,
      life: rand(0.7, 1.6),
      velocity: new THREE.Vector3(
        baseVelocity.x * 0.12 + rand(-3.4, 3.4),
        rand(2.4, 6.8),
        baseVelocity.z * 0.12 + rand(-3.4, 3.4),
      ),
      spin: new THREE.Vector3(rand(-9, 9), rand(-11, 11), rand(-9, 9)),
    });
  }
}

function dropHeldItems(player, sourceVelocity) {
  const heldBall = ballHeldBy(player);
  if (heldBall) {
    heldBall.holder = null;
    heldBall.team = null;
    heldBall.airborne = true;
    heldBall.age = 0;
    heldBall.mesh.position.set(player.group.position.x, 1.1 + player.airY, player.group.position.z);
    heldBall.velocity.set(
      sourceVelocity.x * 0.18 + rand(-1.8, 1.8),
      rand(1.8, 3.2),
      sourceVelocity.z * 0.18 + rand(-1.8, 1.8),
    );
    heldBall.spin.set(rand(-5, 5), rand(-7, 7), rand(-5, 5));
  }

  const heldProp = propHeldBy(player);
  if (heldProp) {
    heldProp.holder = null;
    heldProp.team = null;
    heldProp.air = true;
    heldProp.throwAge = 99;
    heldProp.baseY = heldProp.floorY;
    heldProp.pickupCooldown = 0.85;
    heldProp.impactCooldown = 0.16;
    heldProp.chainCooldown = 0.12;
    heldProp.mesh.position.set(player.group.position.x, 1.05 + Math.min(0.45, heldProp.radius * 0.3) + player.airY, player.group.position.z);
    heldProp.velocity.set(
      sourceVelocity.x * 0.16 + rand(-1.5, 1.5),
      rand(1.2, 2.8),
      sourceVelocity.z * 0.16 + rand(-1.5, 1.5),
    );
    heldProp.spin.set(rand(-1.5, 1.5), rand(-2.4, 2.4), rand(-1.5, 1.5));
  }
}

function launchPlayer(player, sourceVelocity, liftBias = 0) {
  const planarSpeed = Math.max(0.001, length2(sourceVelocity.x, sourceVelocity.z));
  const speed = clamp(sourceVelocity.length(), 4, 20);
  const nx = sourceVelocity.x / planarSpeed;
  const nz = sourceVelocity.z / planarSpeed;
  const lateral = 2.4 + speed * 0.2;
  const sideKick = rand(-0.9, 0.9);

  dropHeldItems(player, sourceVelocity);
  eventCounters.playerLaunches += 1;
  player.velocity.x += nx * lateral - nz * sideKick;
  player.velocity.z += nz * lateral + nx * sideKick;
  player.airY = Math.max(player.airY, 0.03);
  player.airVelocity = Math.max(player.airVelocity, 2.35 + speed * 0.075 + liftBias);
  player.knockbackTime = Math.max(player.knockbackTime, 0.5 + speed * 0.018);
  player.tumbleVelocity = clampComponent(player.tumbleVelocity + (sourceVelocity.x >= 0 ? -1 : 1) * (1.25 + speed * 0.04), 2.9);
  player.tumble = clampComponent(player.tumble + (sourceVelocity.x >= 0 ? -0.28 : 0.28), 0.75);
}

function hitPlayer(player, ball) {
  eventCounters.playerHitsByBall += 1;
  launchPlayer(player, ball.velocity, 0.35);
  player.stun = Math.max(player.stun, 1.05);
  player.lean = ball.velocity.x > 0 ? 0.65 : -0.65;

  if (ball.team === "blue") {
    blueScore += 1;
  } else if (ball.team === "red") {
    redScore += 1;
  }
  chaos = clamp(chaos + 7, 0, 100);
  spawnPaperBurst(player.group.position, 10, ball.velocity, true);
  resetBall(ball);
}

function isFlutterProp(prop) {
  return (
    prop.kind.includes("paper") ||
    prop.kind.includes("note") ||
    prop.kind.includes("magazine") ||
    prop.kind.includes("leaf")
  );
}

function isSmallLooseProp(prop) {
  return isFlutterProp(prop) || prop.kind.includes("cup") || prop.kind.includes("binder") || prop.kind.includes("cable");
}

function holdProp(player, prop) {
  prop.holder = player;
  prop.team = player.team;
  prop.air = false;
  prop.throwAge = 0;
  prop.velocity.set(0, 0, 0);
  prop.spin.set(0, 0, 0);
  prop.pickupCooldown = 0.25;
  prop.chainCooldown = 0;
  chaos = clamp(chaos + 0.8, 0, 100);
}

function throwProp(player, prop, target) {
  eventCounters.propThrows += 1;
  const from = player.group.position;
  const to = target.group.position;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.max(1, length2(dx, dz));
  const leadX = target.velocity.x * 0.34;
  const leadZ = target.velocity.z * 0.34;
  const flutter = isFlutterProp(prop);
  const speed = clamp(13.6 + Math.min(4.4, dist * 0.26) - prop.mass * 1.9 + chaos * 0.016, 8.4, 16.2);
  const inv = 1 / Math.max(0.001, length2(dx + leadX, dz + leadZ));

  prop.holder = null;
  prop.team = player.team;
  prop.air = true;
  prop.throwAge = 0;
  prop.baseY = prop.floorY;
  prop.mesh.position.set(from.x + (player.team === "blue" ? 0.45 : -0.45), 1.32, from.z + 0.1);
  prop.velocity.set(
    (dx + leadX) * inv * speed,
    flutter ? rand(1.25, 2.15) : rand(2.05, 3.15),
    (dz + leadZ) * inv * speed,
  );
  prop.spin.y = rand(-2.6, 2.6);
  prop.spin.x = rand(-0.9, 0.9);
  prop.spin.z = rand(-0.9, 0.9);
  prop.impactCooldown = 0.12;
  prop.pickupCooldown = 1.25;
  prop.chainCooldown = 0.04;
  prop.health -= 0.08;
  player.cooldown = rand(0.68, 1.18);
  player.lean = player.team === "blue" ? -0.36 : 0.36;
  chaos = clamp(chaos + (flutter ? 2.2 : 3.4), 0, 100);

  if (flutter) {
    spawnPaperBurst(prop.mesh.position, 3, prop.velocity, true);
  }
}

function hitPlayerWithProp(player, prop) {
  eventCounters.playerHitsByProp += 1;
  launchPlayer(player, prop.velocity, isFlutterProp(prop) ? 0.05 : 0.22);
  player.stun = Math.max(player.stun, 0.68 + Math.min(0.55, prop.velocity.length() * 0.025));
  player.lean = prop.velocity.x > 0 ? 0.52 : -0.52;

  if (prop.team === "blue") {
    blueScore += 1;
  } else if (prop.team === "red") {
    redScore += 1;
  }

  chaos = clamp(chaos + 6.5, 0, 100);
  spawnPaperBurst(player.group.position, isFlutterProp(prop) ? 9 : 6, prop.velocity, true);
  prop.team = null;
  prop.throwAge = 99;
  prop.pickupCooldown = 0.95;
  prop.chainCooldown = 0.18;
  prop.impactCooldown = 0.18;
  prop.velocity.multiplyScalar(-0.18);
  prop.velocity.y = Math.max(prop.velocity.y, rand(0.18, 0.52));
  prop.spin.multiplyScalar(0.45);
}

function isActivePropProjectile(prop) {
  if (prop.broken) return false;
  if (prop.holder || prop.chainCooldown > 0) return false;
  const planarSpeed = length2(prop.velocity.x, prop.velocity.z);
  return planarSpeed > 1.25 || Math.abs(prop.velocity.y) > 1.0 || (prop.team && prop.throwAge < 2.25);
}

function resolvePropToPropImpacts(prop) {
  if (!isActivePropProjectile(prop)) return;

  const speed = Math.max(0.1, length2(prop.velocity.x, prop.velocity.z));
  for (const other of props) {
    if (other === prop || other.broken || other.holder || other.chainCooldown > 0) continue;
    const dx = other.mesh.position.x - prop.mesh.position.x;
    const dz = other.mesh.position.z - prop.mesh.position.z;
    const dist = length2(dx, dz);
    const hitRadius = Math.min(1.25, prop.radius * 0.58 + other.radius * 0.58);
    const verticalGap = Math.abs(other.mesh.position.y - prop.mesh.position.y);
    if (dist >= hitRadius || verticalGap > Math.max(0.75, other.radius + 0.55)) continue;

    const nx = dist > 0.001 ? dx / dist : rand(-1, 1);
    const nz = dist > 0.001 ? dz / dist : rand(-1, 1);
    const overlap = hitRadius - Math.max(0.001, dist);
    prop.mesh.position.x -= nx * overlap * 0.42;
    prop.mesh.position.z -= nz * overlap * 0.42;
    other.mesh.position.x += nx * overlap * 0.58;
    other.mesh.position.z += nz * overlap * 0.58;

    const impulse = prop.velocity.clone().multiplyScalar(clamp(0.34 + speed * 0.035, 0.38, 0.78));
    impulse.x += nx * speed * 0.34;
    impulse.z += nz * speed * 0.34;
    impulse.y = Math.max(impulse.y, isFlutterProp(other) ? rand(0.55, 1.4) : rand(0.18, 0.72));

    other.baseY = other.floorY;
    eventCounters.propChainImpacts += 1;
    kickProp(other, impulse, prop.mesh.position, { force: true, dropToFloor: true });
    if (prop.team && prop.throwAge < 2.25) {
      other.team = prop.team;
      other.throwAge = 0.12;
    }

    const dot = prop.velocity.x * nx + prop.velocity.z * nz;
    if (dot > 0) {
      prop.velocity.x -= nx * dot * 0.72;
      prop.velocity.z -= nz * dot * 0.72;
    }
    prop.velocity.multiplyScalar(isFlutterProp(prop) ? 0.74 : 0.58);
    prop.velocity.y = Math.max(prop.velocity.y, isFlutterProp(prop) ? 0.24 : 0.12);
    prop.spin.y += rand(-0.8, 0.8);
    prop.chainCooldown = 0.08;
    other.chainCooldown = 0.1;
    chaos = clamp(chaos + (isSmallLooseProp(other) ? 2.8 : 4.4), 0, 100);
    spawnPaperBurst(prop.mesh.position, isFlutterProp(other) ? 5 : 3, impulse, true);
    break;
  }
}

function fractureThresholdForProp(prop) {
  if (prop.kind.includes("wall-panel")) return 4.9;
  if (prop.kind.includes("divider") || prop.kind.includes("crate")) return 3.8;
  if (prop.kind.includes("desk") || prop.kind.includes("table") || prop.kind.includes("counter")) return 4.7;
  if (prop.kind.includes("cabinet") || prop.kind.includes("locker") || prop.kind.includes("shelf")) return 5.6;
  return 5.1;
}

function fracturePieceCount(kind, span) {
  if (kind.includes("wall-panel")) return clamp(Math.ceil(span * 1.3), 5, 12);
  if (kind.includes("desk") || kind.includes("table") || kind.includes("counter")) return 8;
  if (kind.includes("cabinet") || kind.includes("locker") || kind.includes("shelf")) return 6;
  return 5;
}

function fragmentVelocity(position, impulse, sourcePosition, scale = 0.38) {
  const awayX = position.x - sourcePosition.x;
  const awayZ = position.z - sourcePosition.z;
  const awayLen = Math.max(0.001, length2(awayX, awayZ));
  return new THREE.Vector3(
    impulse.x * scale + (awayX / awayLen) * rand(1.8, 5.4),
    rand(0.8, 2.8) + Math.min(1.6, Math.abs(impulse.y) * 0.12),
    impulse.z * scale + (awayZ / awayLen) * rand(1.8, 5.4),
  );
}

function fractureProp(prop, impulse, sourcePosition) {
  if (!prop.breakable || prop.dynamic || prop.broken) return false;

  eventCounters.propFractures += 1;
  if (prop.kind.includes("wall-panel")) eventCounters.wallFractures += 1;
  if (prop.kind.includes("desk") || prop.kind.includes("table") || prop.kind.includes("counter")) {
    eventCounters.deskFractures += 1;
  }

  prop.broken = true;
  prop.mesh.visible = false;
  prop.holder = null;
  prop.team = null;
  prop.air = false;
  prop.velocity.set(0, 0, 0);
  prop.spin.set(0, 0, 0);

  const size = prop.size;
  const alongX = size.x >= size.z;
  const span = Math.max(size.x, size.z);
  const count = fracturePieceCount(prop.kind, span);
  const center = prop.mesh.position.clone();
  const isWall = prop.kind.includes("wall-panel");

  for (let i = 0; i < count; i += 1) {
    const offset = -span / 2 + (span / count) * (i + 0.5) + rand(-0.14, 0.14);
    const px = center.x + (alongX ? offset : rand(-size.x * 0.32, size.x * 0.32));
    const pz = center.z + (alongX ? rand(-size.z * 0.32, size.z * 0.32) : offset);
    const pieceSx = isWall ? (alongX ? Math.max(0.42, (size.x / count) * rand(0.55, 1.05)) : rand(0.18, 0.34)) : rand(0.36, Math.max(0.48, size.x * 0.42));
    const pieceSy = isWall ? rand(0.38, 1.05) : rand(0.16, Math.max(0.28, size.y * 0.7));
    const pieceSz = isWall ? (alongX ? rand(0.16, 0.32) : Math.max(0.42, (size.z / count) * rand(0.55, 1.05))) : rand(0.28, Math.max(0.42, size.z * 0.42));
    const fragment = addProp(`${prop.kind}-fragment`, px, pz, pieceSx, pieceSy, pieceSz, prop.material, Math.max(0.16, prop.mass / count), {
      y: Math.max(pieceSy / 2, center.y + rand(isWall ? -0.7 : -0.18, isWall ? 0.75 : 0.24)),
      rotationY: prop.mesh.rotation.y + rand(-0.8, 0.8),
      radius: Math.max(pieceSx, pieceSz) * 0.72,
      dynamic: true,
      breakable: false,
    });

    fragment.baseY = fragment.floorY;
    fragment.air = true;
    fragment.velocity.copy(fragmentVelocity(fragment.mesh.position, impulse, sourcePosition, isWall ? 0.28 : 0.34));
    fragment.spin.set(rand(-1.4, 1.4), rand(-3.2, 3.2), rand(-1.4, 1.4));
    fragment.pickupCooldown = 0.75;
    fragment.chainCooldown = 0.08;
    fragment.impactCooldown = 0.1;
  }

  chaos = clamp(chaos + (isWall ? 10 : 7), 0, 100);
  spawnPaperBurst(center, isWall ? 12 : 8, impulse, true);
  return true;
}

function fractureBarrier(barrier, impulse, sourcePosition) {
  if (!barrier.breakable || barrier.broken) return false;

  eventCounters.barrierFractures += 1;

  barrier.broken = true;
  barrier.mesh.visible = false;

  const alongX = barrier.sx >= barrier.sz;
  const span = Math.max(barrier.sx, barrier.sz);
  const count = clamp(Math.ceil(span * 1.2), 4, 12);
  const center = barrier.mesh.position.clone();
  const isGlass = barrier.kind.includes("glass") || barrier.material === materials.glass;

  for (let i = 0; i < count; i += 1) {
    const offset = -span / 2 + (span / count) * (i + 0.5) + rand(-0.1, 0.1);
    const px = barrier.x + (alongX ? offset : rand(-barrier.sx * 0.3, barrier.sx * 0.3));
    const pz = barrier.z + (alongX ? rand(-barrier.sz * 0.3, barrier.sz * 0.3) : offset);
    const pieceSx = alongX ? Math.max(0.34, (barrier.sx / count) * rand(0.55, 1.0)) : rand(0.12, 0.26);
    const pieceSz = alongX ? rand(0.12, 0.26) : Math.max(0.34, (barrier.sz / count) * rand(0.55, 1.0));
    const pieceSy = rand(0.28, Math.max(0.5, barrier.visualHeight * 0.5));
    const fragment = addProp(`${barrier.kind}-fragment`, px, pz, pieceSx, pieceSy, pieceSz, barrier.material, isGlass ? 0.12 : 0.28, {
      y: Math.max(pieceSy / 2, center.y + rand(-0.45, 0.45)),
      rotationY: rand(-0.4, 0.4),
      radius: Math.max(pieceSx, pieceSz) * 0.72,
      dynamic: true,
      breakable: false,
    });
    fragment.baseY = fragment.floorY;
    fragment.air = true;
    fragment.velocity.copy(fragmentVelocity(fragment.mesh.position, impulse, sourcePosition, isGlass ? 0.22 : 0.32));
    fragment.spin.set(rand(-1.8, 1.8), rand(-3.8, 3.8), rand(-1.8, 1.8));
    fragment.pickupCooldown = 0.7;
    fragment.chainCooldown = 0.08;
    fragment.impactCooldown = 0.1;
  }

  chaos = clamp(chaos + (isGlass ? 8 : 6), 0, 100);
  spawnPaperBurst(center, isGlass ? 14 : 7, impulse, true);
  return true;
}

function kickProp(prop, impulse, sourcePosition, options: { force?: boolean; dropToFloor?: boolean } = {}) {
  const strength = impulse.length();
  if (prop.impactCooldown > 0 && !options.force) return;
  eventCounters.propImpacts += 1;

  if (options.dropToFloor || strength > 2.6 || prop.mesh.position.y > prop.floorY + 0.22) {
    prop.baseY = prop.floorY;
  }

  if (strength >= fractureThresholdForProp(prop) && fractureProp(prop, impulse, sourcePosition)) {
    return;
  }

  const flutter = isFlutterProp(prop);
  const loose = isSmallLooseProp(prop);
  const invMass = 1 / Math.max(0.72, prop.mass);
  const slideLimit = flutter ? 6.4 : loose ? 5.2 : prop.mass > 2 ? 2.6 : 4.1;
  const slideScale = flutter ? 0.34 : loose ? 0.42 : 0.36;

  prop.velocity.x = clampComponent(prop.velocity.x + impulse.x * invMass * slideScale, slideLimit);
  prop.velocity.z = clampComponent(prop.velocity.z + impulse.z * invMass * slideScale, slideLimit);

  const lift =
    flutter
      ? clamp(0.42 + strength * 0.045, 0.35, 1.95)
      : loose
        ? clamp(0.18 + strength * 0.022, 0.12, 0.72)
        : clamp(strength * 0.008, 0, prop.mass > 1.8 ? 0.16 : 0.34);
  prop.velocity.y = Math.max(prop.velocity.y, lift);

  const yawKick = clampComponent((impulse.x - impulse.z) * 0.045 + rand(-0.85, 0.85), flutter ? 2.2 : 1.45);
  prop.spin.y = clampComponent(prop.spin.y + yawKick, flutter ? 2.8 : 1.8);
  prop.spin.x = clampComponent(prop.spin.x + rand(-0.55, 0.55) + impulse.z * 0.025, flutter ? 2.8 : 0.72);
  prop.spin.z = clampComponent(prop.spin.z + rand(-0.55, 0.55) - impulse.x * 0.025, flutter ? 2.8 : 0.72);

  prop.air = prop.velocity.y > 0.16;
  prop.impactCooldown = flutter ? 0.08 : 0.18;
  prop.health -= 0.25;
  chaos = clamp(chaos + (prop.kind.includes("paper") || prop.kind.includes("note") ? 1 : 3), 0, 100);

  if (
    prop.kind.includes("paper") ||
    prop.kind.includes("monitor") ||
    prop.kind.includes("plant") ||
    prop.kind.includes("leaf") ||
    prop.kind.includes("magazine") ||
    prop.kind.includes("whiteboard")
  ) {
    spawnPaperBurst(sourcePosition, prop.kind.includes("paper") ? 3 : 7, impulse, true);
  }
}

function resolveBarriersForEntity(position, radius, velocity = null, height = 1) {
  for (const barrier of barriers) {
    if (barrier.broken) continue;
    if (position.y > barrier.height + height) continue;
    const hit = circleRectPenetration(position.x, position.z, radius, barrier);
    if (!hit) continue;
    position.x += hit.nx * hit.penetration;
    position.z += hit.nz * hit.penetration;
    if (velocity) {
      const dot = velocity.x * hit.nx + velocity.z * hit.nz;
      if (dot < 0) {
        velocity.x -= dot * hit.nx * 1.78;
        velocity.z -= dot * hit.nz * 1.78;
      }
    }
  }
}

function updatePlayers(dt) {
  for (const player of players) {
    player.cooldown -= dt;
    player.stun = Math.max(0, player.stun - dt);
    player.knockbackTime = Math.max(0, player.knockbackTime - dt);
    player.dodge += dt * (1.55 + player.index * 0.17);
    const launched = player.knockbackTime > 0 || player.airY > 0.025 || Math.abs(player.airVelocity) > 0.05;

    let heldBall = ballHeldBy(player);
    let heldProp = propHeldBy(player);
    const opponent = nearestOpponent(player);

    if (!launched && heldBall && opponent && player.cooldown <= 0 && player.stun <= 0) {
      throwBall(player, heldBall, opponent);
      heldBall = null;
    } else if (!launched && heldProp && opponent && player.cooldown <= 0 && player.stun <= 0) {
      throwProp(player, heldProp, opponent);
      heldProp = null;
    }

    const holding = heldBall || heldProp;

    if (!launched && !holding && player.stun <= 0) {
      const freeBall = nearestFreeBall(player);
      const looseProp = nearestThrowableProp(player);
      const preferProp = looseProp && (!freeBall || chance(PROP_THROW_CHANCE + chaos * 0.003));

      if (preferProp) {
        const dx = looseProp.mesh.position.x - player.group.position.x;
        const dz = looseProp.mesh.position.z - player.group.position.z;
        if (length2(dx, dz) < 1.02 + looseProp.radius * 0.32) {
          holdProp(player, looseProp);
          heldProp = looseProp;
        } else if (chance(0.035)) {
          player.target.set(looseProp.mesh.position.x, 0, looseProp.mesh.position.z);
        }
      } else if (freeBall) {
        const dx = freeBall.mesh.position.x - player.group.position.x;
        const dz = freeBall.mesh.position.z - player.group.position.z;
        if (length2(dx, dz) < 1.08) {
          freeBall.holder = player;
          freeBall.team = player.team;
          freeBall.airborne = false;
          heldBall = freeBall;
        } else if (chance(0.024)) {
          player.target.set(freeBall.mesh.position.x, 0, freeBall.mesh.position.z);
        }
      }
    }

    if (launched) {
      const drag = player.airY > 0.025 ? 0.965 : 0.36;
      player.velocity.x *= Math.pow(drag, dt);
      player.velocity.z *= Math.pow(drag, dt);
    } else {
      const distToTarget = player.group.position.distanceTo(player.target);
      if (distToTarget < 1.1 || chance(0.006)) {
        pickNewTarget(player);
      }

      const toTarget = new THREE.Vector3(
        player.target.x - player.group.position.x,
        0,
        player.target.z - player.group.position.z,
      );
      const targetLen = Math.max(0.001, length2(toTarget.x, toTarget.z));
      toTarget.multiplyScalar(1 / targetLen);

      const stillHolding = heldBall || heldProp;
      if (opponent && !stillHolding) {
        const awayX = player.group.position.x - opponent.group.position.x;
        const awayZ = player.group.position.z - opponent.group.position.z;
        const awayLen = Math.max(0.001, length2(awayX, awayZ));
        if (awayLen < 5.0) {
          toTarget.x += (awayX / awayLen) * 0.58;
          toTarget.z += (awayZ / awayLen) * 0.58;
        }
      }

      toTarget.z += Math.sin(player.dodge) * 0.34;
      const moveSpeed = player.stun > 0 ? 1.35 : 4.25 + (heldBall ? 0.38 : 0) - (heldProp ? 0.18 : 0);
      const desired = toTarget.multiplyScalar(moveSpeed);
      player.velocity.lerp(desired, player.stun > 0 ? 0.025 : 0.08);
    }

    player.group.position.x += player.velocity.x * dt;
    player.group.position.z += player.velocity.z * dt;
    const clampedX = clamp(player.group.position.x, -ARENA.halfW + 1.05, ARENA.halfW - 1.05);
    const clampedZ = clamp(player.group.position.z, -ARENA.halfD + 1.05, ARENA.halfD - 1.05);
    if (launched && clampedX !== player.group.position.x) player.velocity.x *= -0.28;
    if (launched && clampedZ !== player.group.position.z) player.velocity.z *= -0.28;
    player.group.position.x = clampedX;
    player.group.position.z = clampedZ;
    resolveBarriersForEntity(player.group.position, player.radius, player.velocity, 1.2);

    const wasAirborne = player.airY > 0.025 || player.airVelocity > 0;
    if (player.airY > 0 || player.airVelocity > 0) {
      player.airVelocity -= PLAYER_GRAVITY * dt;
      player.airY += player.airVelocity * dt;
      if (player.airY <= 0) {
        if (wasAirborne && player.airVelocity < -2.25) {
          spawnPaperBurst(player.group.position, 5, player.velocity, true);
          chaos = clamp(chaos + 1.4, 0, 100);
        }
        player.airY = 0;
        player.airVelocity = 0;
        player.velocity.x *= 0.68;
        player.velocity.z *= 0.68;
      }
    }
    player.tumble += player.tumbleVelocity * dt;
    player.tumbleVelocity *= Math.pow(player.airY > 0.025 ? 0.74 : 0.18, dt);
    player.tumble = THREE.MathUtils.lerp(player.tumble, 0, player.airY > 0.025 ? 0.018 : 0.12);

    for (const prop of props) {
      if (prop.broken || prop.holder) continue;
      const dx = player.group.position.x - prop.mesh.position.x;
      const dz = player.group.position.z - prop.mesh.position.z;
      const dist = length2(dx, dz);
      const overlap = player.radius + prop.radius * 0.58 - dist;
      if (overlap > 0 && dist > 0.001) {
        player.group.position.x += (dx / dist) * overlap * 0.32;
        player.group.position.z += (dz / dist) * overlap * 0.32;
        if (prop.mass < 1.2 && player.velocity.length() > 3 && chance(0.12)) {
          kickProp(prop, player.velocity.clone().multiplyScalar(0.32), player.group.position);
        }
      }
    }

    const facing = Math.atan2(player.velocity.x, player.velocity.z);
    player.group.rotation.y = THREE.MathUtils.lerp(player.group.rotation.y, facing, 0.14);
    player.lean = THREE.MathUtils.lerp(player.lean, 0, 0.06);
    player.group.rotation.z = player.lean + player.tumble;
    player.group.rotation.x = THREE.MathUtils.lerp(player.group.rotation.x, clampComponent(-player.tumble * 0.42, 0.36), 0.16);
    const bob = player.airY > 0.025 ? 0 : Math.sin(performance.now() * 0.012 + player.index) * 0.035;
    player.group.position.y = Math.max(0, player.airY + bob);
    player.shadow.position.y = 0.015 - player.group.position.y;
    const shadowScale = 1 + Math.min(0.55, player.airY * 0.16);
    player.shadow.scale.set(shadowScale, shadowScale, shadowScale);

    if (heldBall) {
      heldBall.mesh.position.set(
        player.group.position.x + (player.team === "blue" ? 0.58 : -0.58),
        1.2,
        player.group.position.z + 0.2,
      );
      heldBall.mesh.rotation.x += dt * 8;
      heldBall.mesh.rotation.z += dt * 4.4;
    }

    if (heldProp) {
      heldProp.mesh.position.set(
        player.group.position.x + (player.team === "blue" ? 0.62 : -0.62),
        1.18 + Math.min(0.42, heldProp.radius * 0.35),
        player.group.position.z + 0.12,
      );
      heldProp.mesh.rotation.y = THREE.MathUtils.lerp(heldProp.mesh.rotation.y, player.group.rotation.y, 0.24);
      heldProp.mesh.rotation.x += dt * (isFlutterProp(heldProp) ? 2.4 : 0.9);
      heldProp.mesh.rotation.z += dt * (player.team === "blue" ? 0.55 : -0.55);
    }
  }
}

function updateBalls(dt) {
  for (const ball of balls) {
    if (ball.holder || !ball.airborne) continue;

    ball.age += dt;
    ball.velocity.y -= 11.8 * dt;
    ball.mesh.position.addScaledVector(ball.velocity, dt);
    ball.mesh.rotation.x += ball.spin.x * dt;
    ball.mesh.rotation.y += ball.spin.y * dt;
    ball.mesh.rotation.z += ball.spin.z * dt;
    ball.spin.multiplyScalar(Math.pow(0.78, dt));

    if (Math.abs(ball.mesh.position.x) > ARENA.halfW - 0.36) {
      ball.mesh.position.x = clamp(ball.mesh.position.x, -ARENA.halfW + 0.36, ARENA.halfW - 0.36);
      ball.velocity.x *= -0.72;
      chaos = clamp(chaos + 1, 0, 100);
    }
    if (Math.abs(ball.mesh.position.z) > ARENA.halfD - 0.36) {
      ball.mesh.position.z = clamp(ball.mesh.position.z, -ARENA.halfD + 0.36, ARENA.halfD - 0.36);
      ball.velocity.z *= -0.72;
      chaos = clamp(chaos + 1, 0, 100);
    }

    for (const barrier of barriers) {
      if (barrier.broken) continue;
      if (ball.mesh.position.y > barrier.height + ball.radius) continue;
      const hit = circleRectPenetration(ball.mesh.position.x, ball.mesh.position.z, ball.radius, barrier);
      if (!hit) continue;
      if (barrier.breakable && ball.velocity.length() > 5.0) {
        fractureBarrier(barrier, ball.velocity.clone().multiplyScalar(0.42), ball.mesh.position);
        ball.velocity.multiplyScalar(0.68);
        ball.velocity.y += rand(0.25, 0.85);
        chaos = clamp(chaos + 2.5, 0, 100);
        continue;
      }
      ball.mesh.position.x += hit.nx * hit.penetration;
      ball.mesh.position.z += hit.nz * hit.penetration;
      const dot = ball.velocity.x * hit.nx + ball.velocity.z * hit.nz;
      if (dot < 0) {
        ball.velocity.x -= dot * hit.nx * 1.72;
        ball.velocity.z -= dot * hit.nz * 1.72;
      }
      ball.velocity.multiplyScalar(0.86);
      ball.velocity.y += rand(0.2, 0.9);
      chaos = clamp(chaos + 1.2, 0, 100);
    }

    if (ball.mesh.position.y < ball.radius) {
      ball.mesh.position.y = ball.radius;
      ball.velocity.y *= -0.46;
      ball.velocity.x *= 0.78;
      ball.velocity.z *= 0.78;
      ball.spin.multiplyScalar(0.72);
      if (ball.velocity.length() < 3.2 || ball.age > 2.7) {
        ball.airborne = false;
        ball.team = null;
        ball.velocity.set(0, 0, 0);
      }
    }

    for (const player of players) {
      if (player.team === ball.team || ball.age < 0.08) continue;
      const dx = player.group.position.x - ball.mesh.position.x;
      const dy = 1.0 - ball.mesh.position.y;
      const dz = player.group.position.z - ball.mesh.position.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < player.radius + ball.radius) {
        hitPlayer(player, ball);
        break;
      }
    }

    if (!ball.airborne) continue;
    for (const prop of props) {
      if (prop.broken || prop.holder) continue;
      const dx = prop.mesh.position.x - ball.mesh.position.x;
      const dy = prop.mesh.position.y - ball.mesh.position.y;
      const dz = prop.mesh.position.z - ball.mesh.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < prop.radius + ball.radius) {
        const impulse = ball.velocity.clone().multiplyScalar(0.44);
        kickProp(prop, impulse, ball.mesh.position, { dropToFloor: true });
        ball.velocity.multiplyScalar(-0.22);
        ball.velocity.y += rand(0.3, 1.85);
        break;
      }
    }
  }
}

function updateProps(dt) {
  for (const prop of props) {
    if (prop.broken) continue;
    prop.impactCooldown = Math.max(0, prop.impactCooldown - dt);
    prop.pickupCooldown = Math.max(0, prop.pickupCooldown - dt);
    prop.chainCooldown = Math.max(0, prop.chainCooldown - dt);

    if (prop.holder) {
      prop.air = false;
      continue;
    }

    const flutter = isFlutterProp(prop);
    const planarSpeed = length2(prop.velocity.x, prop.velocity.z);
    if (prop.team || prop.air || planarSpeed > 0.1) {
      prop.throwAge += dt;
    }

    const airborne = prop.air || prop.mesh.position.y > prop.baseY + 0.015 || Math.abs(prop.velocity.y) > 0.02;

    if (airborne) {
      prop.velocity.y -= (flutter ? 7.2 : 13.4) * dt;
      prop.velocity.x *= Math.pow(flutter ? 0.965 : 0.94, dt);
      prop.velocity.z *= Math.pow(flutter ? 0.965 : 0.94, dt);
    } else {
      prop.mesh.position.y = prop.baseY;
      prop.velocity.y = 0;
      prop.velocity.x *= Math.pow(0.09, dt);
      prop.velocity.z *= Math.pow(0.09, dt);
    }

    prop.mesh.position.x += prop.velocity.x * dt;
    prop.mesh.position.y += prop.velocity.y * dt;
    prop.mesh.position.z += prop.velocity.z * dt;

    const spinScale = airborne && !flutter ? 0.22 : 1;
    prop.mesh.rotation.x += prop.spin.x * dt * spinScale;
    prop.mesh.rotation.y += prop.spin.y * dt * (airborne && !flutter ? 0.55 : 1);
    prop.mesh.rotation.z += prop.spin.z * dt * spinScale;

    if (prop.mesh.position.y < prop.baseY) {
      prop.mesh.position.y = prop.baseY;
      if (prop.air && Math.abs(prop.velocity.y) > (flutter ? 1.6 : 2.6)) {
        spawnPaperBurst(prop.mesh.position, prop.kind.includes("paper") ? 1 : 4, prop.velocity, true);
      }
      prop.velocity.y = flutter && Math.abs(prop.velocity.y) > 2.8 ? Math.abs(prop.velocity.y) * 0.08 : 0;
      prop.velocity.x *= flutter ? 0.74 : 0.54;
      prop.velocity.z *= flutter ? 0.74 : 0.54;
      prop.spin.x *= flutter ? 0.42 : 0.16;
      prop.spin.y *= flutter ? 0.62 : 0.38;
      prop.spin.z *= flutter ? 0.42 : 0.16;
      if (length2(prop.velocity.x, prop.velocity.z) < 0.22 && Math.abs(prop.velocity.y) < 0.03) {
        prop.velocity.set(0, 0, 0);
        prop.spin.multiplyScalar(0.35);
        prop.air = false;
      }
    }

    for (const barrier of barriers) {
      if (barrier.broken) continue;
      if (prop.mesh.position.y > barrier.height + prop.radius) continue;
      const hit = circleRectPenetration(prop.mesh.position.x, prop.mesh.position.z, prop.radius * 0.68, barrier);
      if (!hit) continue;
      if (barrier.breakable && isActivePropProjectile(prop) && prop.velocity.length() > 2.4) {
        fractureBarrier(barrier, prop.velocity.clone().multiplyScalar(0.52), prop.mesh.position);
        prop.velocity.multiplyScalar(0.66);
        prop.velocity.y = Math.max(prop.velocity.y, 0.18);
        chaos = clamp(chaos + 2.2, 0, 100);
        continue;
      }
      prop.mesh.position.x += hit.nx * hit.penetration;
      prop.mesh.position.z += hit.nz * hit.penetration;
      const dot = prop.velocity.x * hit.nx + prop.velocity.z * hit.nz;
      if (dot < 0) {
        prop.velocity.x -= dot * hit.nx * 1.45;
        prop.velocity.z -= dot * hit.nz * 1.45;
      }
      prop.velocity.multiplyScalar(0.72);
      prop.spin.multiplyScalar(0.55);
    }

    if (Math.abs(prop.mesh.position.x) > ARENA.halfW - 0.45) {
      prop.mesh.position.x = clamp(prop.mesh.position.x, -ARENA.halfW + 0.45, ARENA.halfW - 0.45);
      prop.velocity.x *= -0.42;
      prop.spin.multiplyScalar(0.55);
    }
    if (Math.abs(prop.mesh.position.z) > ARENA.halfD - 0.45) {
      prop.mesh.position.z = clamp(prop.mesh.position.z, -ARENA.halfD + 0.45, ARENA.halfD - 0.45);
      prop.velocity.z *= -0.42;
      prop.spin.multiplyScalar(0.55);
    }

    if (prop.team && prop.throwAge > 0.08 && prop.throwAge < 2.35) {
      for (const player of players) {
        if (player.team === prop.team || player.stun > 0.75) continue;
        const dx = player.group.position.x - prop.mesh.position.x;
        const dy = 1.0 - prop.mesh.position.y;
        const dz = player.group.position.z - prop.mesh.position.z;
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) < player.radius + Math.min(0.72, prop.radius)) {
          hitPlayerWithProp(player, prop);
          break;
        }
      }
    }

    resolvePropToPropImpacts(prop);

    if (prop.mesh.position.y <= prop.baseY + 0.001) {
      prop.mesh.rotation.x = THREE.MathUtils.lerp(prop.mesh.rotation.x, prop.homeRotation.x, flutter ? 0.035 : 0.18);
      prop.mesh.rotation.z = THREE.MathUtils.lerp(prop.mesh.rotation.z, prop.homeRotation.z, flutter ? 0.035 : 0.18);
      prop.spin.x *= Math.pow(0.02, dt);
      prop.spin.y *= Math.pow(0.06, dt);
      prop.spin.z *= Math.pow(0.02, dt);

      if (length2(prop.velocity.x, prop.velocity.z) < 0.035) {
        prop.velocity.x = 0;
        prop.velocity.z = 0;
      }
      if (prop.spin.length() < 0.035) {
        prop.spin.set(0, 0, 0);
      }
      if (length2(prop.velocity.x, prop.velocity.z) < 0.12 && prop.throwAge > 0.55) {
        prop.team = null;
      }
    }
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.life -= dt;
    particle.velocity.y -= 8.4 * dt;
    particle.mesh.position.addScaledVector(particle.velocity, dt);
    particle.mesh.rotation.x += particle.spin.x * dt;
    particle.mesh.rotation.y += particle.spin.y * dt;
    particle.mesh.rotation.z += particle.spin.z * dt;
    particle.mesh.scale.multiplyScalar(0.996);
    if (particle.mesh.position.y < 0.04) {
      particle.mesh.position.y = 0.04;
      particle.velocity.y *= -0.18;
      particle.velocity.x *= 0.82;
      particle.velocity.z *= 0.82;
    }
    if (particle.life <= 0) {
      scene.remove(particle.mesh);
      particles.splice(i, 1);
    }
  }
}

function updateCamera(dt) {
  const mode = cameraModes[cameraModeIndex];
  const bounds = canvas.getBoundingClientRect();
  const aspect = Math.max(0.5, bounds.width / Math.max(1, bounds.height));
  const zoom = mode === "top" ? 16.5 : mode === "sideline" ? 14.5 : 17.5;
  camera.left = -zoom * aspect;
  camera.right = zoom * aspect;
  camera.top = zoom;
  camera.bottom = -zoom;
  camera.updateProjectionMatrix();

  const target = new THREE.Vector3(0, 0, 0);
  if (mode === "top") {
    camera.position.lerp(new THREE.Vector3(0, 37, 0.01), 1 - Math.pow(0.001, dt));
  } else if (mode === "sideline") {
    camera.position.lerp(new THREE.Vector3(0, 13.5, 25.5), 1 - Math.pow(0.001, dt));
  } else {
    camera.position.lerp(new THREE.Vector3(25.5, 22.5, 25), 1 - Math.pow(0.001, dt));
  }
  camera.lookAt(target);
}

function updateHud() {
  blueScoreEl.textContent = String(blueScore);
  redScoreEl.textContent = String(redScore);
  chaosMeter.value = Math.round(chaos);
  const time = Math.max(0, Math.ceil(gameTime));
  const minutes = String(Math.floor(time / 60)).padStart(2, "0");
  const seconds = String(time % 60).padStart(2, "0");
  clockEl.textContent = `${minutes}:${seconds}`;
}

function resizeRenderer() {
  const { clientWidth, clientHeight } = canvas;
  const ratio = renderer.getPixelRatio();
  const needsResize = canvas.width !== Math.floor(clientWidth * ratio) || canvas.height !== Math.floor(clientHeight * ratio);
  if (needsResize) {
    renderer.setSize(clientWidth, clientHeight, false);
  }
}

function resetMatch() {
  gameTime = MATCH_LENGTH;
  blueScore = 0;
  redScore = 0;
  chaos = 0;
  resetPlaytestCounters();

  for (const player of players) {
    const side = player.team === "blue" ? -1 : 1;
    let x = side * rand(5.8, 14.4);
    let z = rand(-8.6, 8.6);
    for (let attempt = 0; attempt < 12 && isBlockedPoint(x, z, 1.0); attempt += 1) {
      x = side * rand(5.8, 14.4);
      z = rand(-8.6, 8.6);
    }
    player.group.position.set(x, 0, z);
    player.velocity.set(0, 0, 0);
    player.stun = 0;
    player.cooldown = rand(0.2, 1.7);
    player.lean = 0;
    player.airY = 0;
    player.airVelocity = 0;
    player.knockbackTime = 0;
    player.tumble = 0;
    player.tumbleVelocity = 0;
    player.group.rotation.x = 0;
    player.group.rotation.z = 0;
    player.shadow.position.y = 0.015;
    player.shadow.scale.set(1, 1, 1);
    pickNewTarget(player);
  }

  for (const ball of balls) {
    resetBall(ball);
  }

  for (let i = props.length - 1; i >= 0; i -= 1) {
    const prop = props[i];
    if (prop.dynamic) {
      scene.remove(prop.mesh);
      props.splice(i, 1);
      continue;
    }

    prop.broken = false;
    prop.mesh.visible = true;
    prop.holder = null;
    prop.team = null;
    prop.baseY = prop.homeBaseY;
    prop.mesh.position.copy(prop.homePosition);
    prop.mesh.rotation.copy(prop.homeRotation);
    prop.velocity.set(0, 0, 0);
    prop.spin.set(0, 0, 0);
    prop.air = false;
    prop.throwAge = 99;
    prop.impactCooldown = 0;
    prop.pickupCooldown = 0;
    prop.chainCooldown = 0;
  }

  for (const barrier of barriers) {
    barrier.broken = false;
    barrier.mesh.visible = true;
  }

  updateHud();
}

function animate(now) {
  const rawDt = Math.min(0.04, (now - lastTime) / 1000);
  lastTime = now;
  const dt = paused ? 0 : rawDt * speedScale;

  if (dt > 0) {
    matchElapsed += dt;
    gameTime -= dt;
    if (gameTime <= 0) {
      resetMatch();
    }
    chaos = clamp(chaos - dt * 4.0, 0, 100);
    updatePlayers(dt);
    updateBalls(dt);
    updateProps(dt);
    updateParticles(dt);
    peakChaos = Math.max(peakChaos, chaos);
    if (timeToChaos80 === null && chaos >= 80) {
      timeToChaos80 = matchElapsed;
    }
  }

  resizeRenderer();
  updateCamera(rawDt);
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

pauseButton.addEventListener("click", () => {
  paused = !paused;
  pauseButton.textContent = paused ? "Resume" : "Pause";
  pauseButton.setAttribute("aria-pressed", String(paused));
});

cameraButton.addEventListener("click", () => {
  cameraModeIndex = (cameraModeIndex + 1) % cameraModes.length;
});

resetButton.addEventListener("click", resetMatch);

speedSlider.addEventListener("input", (event) => {
  speedScale = Number((event.target as HTMLInputElement).value);
});

buildOffice();
createTeamsAndBalls();
resetMatch();

window.__voxelOfficeDodgeball = {
  metrics: () => ({
    seed: runSeedParam,
    matchElapsed: Number(matchElapsed.toFixed(2)),
    playerCount: players.length,
    ballCount: balls.length,
    propCount: props.length,
    throwablePropCount: props.filter((prop) => canThrowProp(prop)).length,
    heldPropCount: props.filter((prop) => prop.holder).length,
    activePropCount: props.filter((prop) => length2(prop.velocity.x, prop.velocity.z) > 0.2 || prop.air).length,
    brokenPropCount: props.filter((prop) => prop.broken).length,
    dynamicFragmentCount: props.filter((prop) => prop.dynamic).length,
    airbornePlayerCount: players.filter((player) => player.airY > 0.05 || player.knockbackTime > 0).length,
    particleCount: particles.length,
    barrierCount: barriers.length,
    brokenBarrierCount: barriers.filter((barrier) => barrier.broken).length,
    blueScore,
    redScore,
    chaos: Math.round(chaos),
    peakChaos: Math.round(peakChaos),
    timeToChaos80: timeToChaos80 === null ? null : Number(timeToChaos80.toFixed(2)),
    scoreSpread: Math.abs(blueScore - redScore),
    events: { ...eventCounters },
    eventRates: {
      propFracturesPerMinute: Number(((eventCounters.propFractures / Math.max(1, matchElapsed)) * 60).toFixed(2)),
      barrierFracturesPerMinute: Number(((eventCounters.barrierFractures / Math.max(1, matchElapsed)) * 60).toFixed(2)),
      particlesPerMinute: Number(((eventCounters.particlesSpawned / Math.max(1, matchElapsed)) * 60).toFixed(2)),
      throwsPerMinute: Number((((eventCounters.ballThrows + eventCounters.propThrows) / Math.max(1, matchElapsed)) * 60).toFixed(2)),
    },
    cameraMode: cameraModes[cameraModeIndex],
    paused,
    textureAtlasLoaded,
    textureAtlasAppliedCount,
    textureAtlasUrl,
    samplePlayers: players.slice(0, 4).map((player) => ({
      team: player.team,
      x: Number(player.group.position.x.toFixed(2)),
      z: Number(player.group.position.z.toFixed(2)),
      stun: Number(player.stun.toFixed(2)),
      airY: Number(player.airY.toFixed(2)),
    })),
    canvas: {
      width: canvas.width,
      height: canvas.height,
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight,
    },
  }),
};

requestAnimationFrame(animate);
