import * as THREE from "three";
import "./styles.css";

const canvas = document.querySelector("#game");
const blueScoreEl = document.querySelector("#blueScore");
const redScoreEl = document.querySelector("#redScore");
const clockEl = document.querySelector("#clock");
const chaosMeter = document.querySelector("#chaosMeter");
const pauseButton = document.querySelector("#pauseButton");
const cameraButton = document.querySelector("#cameraButton");
const resetButton = document.querySelector("#resetButton");
const speedSlider = document.querySelector("#speedSlider");

const ARENA = { width: 34, depth: 22, halfW: 17, halfD: 11 };
const MATCH_LENGTH = 150;
const PLAYER_COUNT = 5;
const BALL_COUNT = 5;
const cameraModes = ["iso", "top", "sideline"];

const palette = {
  blue: 0x0ea5e9,
  blueDark: 0x0369a1,
  red: 0xf43f5e,
  redDark: 0xbe123c,
  floor: 0xe7eef3,
  floorLine: 0xc8d3dc,
  glass: 0xb7d9ee,
  wood: 0xb98b5e,
  metal: 0x94a3b8,
  leaf: 0x16a34a,
  paper: 0xffffff,
  ball: 0xf97316,
  ink: 0x172033,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdde8ef);
scene.fog = new THREE.Fog(0xdde8ef, 38, 74);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.OrthographicCamera(-18, 18, 10, -10, 0.1, 120);
scene.add(camera);

const ambient = new THREE.HemisphereLight(0xf8fbff, 0x78909c, 2.45);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 2.1);
sun.position.set(-12, 22, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -26;
sun.shadow.camera.right = 26;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -22;
scene.add(sun);

const shared = {
  cube: new THREE.BoxGeometry(1, 1, 1),
  ball: new THREE.IcosahedronGeometry(0.38, 1),
  dust: new THREE.BoxGeometry(0.14, 0.04, 0.1),
  player: new THREE.BoxGeometry(0.92, 1.3, 0.92),
};

const materials = {
  blue: new THREE.MeshStandardMaterial({ color: palette.blue, roughness: 0.72 }),
  blueDark: new THREE.MeshStandardMaterial({ color: palette.blueDark, roughness: 0.8 }),
  red: new THREE.MeshStandardMaterial({ color: palette.red, roughness: 0.72 }),
  redDark: new THREE.MeshStandardMaterial({ color: palette.redDark, roughness: 0.8 }),
  floor: new THREE.MeshStandardMaterial({ color: palette.floor, roughness: 0.62 }),
  floorLine: new THREE.MeshStandardMaterial({ color: palette.floorLine, roughness: 0.7 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: palette.glass,
    roughness: 0.16,
    transmission: 0.18,
    transparent: true,
    opacity: 0.34,
  }),
  wood: new THREE.MeshStandardMaterial({ color: palette.wood, roughness: 0.76 }),
  metal: new THREE.MeshStandardMaterial({ color: palette.metal, roughness: 0.44, metalness: 0.2 }),
  ink: new THREE.MeshStandardMaterial({ color: palette.ink, roughness: 0.58 }),
  leaf: new THREE.MeshStandardMaterial({ color: palette.leaf, roughness: 0.86 }),
  paper: new THREE.MeshStandardMaterial({ color: palette.paper, roughness: 0.92 }),
  ball: new THREE.MeshStandardMaterial({ color: palette.ball, roughness: 0.45 }),
  shadow: new THREE.MeshBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.1 }),
};

const players = [];
const balls = [];
const props = [];
const particles = [];
const walls = [];

let gameTime = MATCH_LENGTH;
let blueScore = 0;
let redScore = 0;
let chaos = 0;
let paused = false;
let cameraModeIndex = 0;
let speedScale = 1;
let lastTime = performance.now();

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function length2(x, z) {
  return Math.sqrt(x * x + z * z);
}

function makeBox({ size, position, material, cast = true, receive = true }) {
  const mesh = new THREE.Mesh(shared.cube, material);
  mesh.scale.set(size.x, size.y, size.z);
  mesh.position.set(position.x, position.y, position.z);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  scene.add(mesh);
  return mesh;
}

function buildOffice() {
  const floor = makeBox({
    size: { x: ARENA.width, y: 0.16, z: ARENA.depth },
    position: { x: 0, y: -0.08, z: 0 },
    material: materials.floor,
    cast: false,
  });
  floor.receiveShadow = true;

  for (let x = -ARENA.halfW; x <= ARENA.halfW; x += 2) {
    makeBox({
      size: { x: 0.035, y: 0.022, z: ARENA.depth },
      position: { x, y: 0.02, z: 0 },
      material: materials.floorLine,
      cast: false,
    });
  }

  for (let z = -ARENA.halfD; z <= ARENA.halfD; z += 2) {
    makeBox({
      size: { x: ARENA.width, y: 0.024, z: 0.035 },
      position: { x: 0, y: 0.03, z },
      material: materials.floorLine,
      cast: false,
    });
  }

  makeBox({
    size: { x: 0.14, y: 0.04, z: ARENA.depth },
    position: { x: 0, y: 0.065, z: 0 },
    material: new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.7 }),
    cast: false,
  });

  const wallData = [
    { x: 0, z: -ARENA.halfD - 0.36, sx: ARENA.width + 1.2, sz: 0.22 },
    { x: 0, z: ARENA.halfD + 0.36, sx: ARENA.width + 1.2, sz: 0.22 },
    { x: -ARENA.halfW - 0.36, z: 0, sx: 0.22, sz: ARENA.depth + 1.2 },
    { x: ARENA.halfW + 0.36, z: 0, sx: 0.22, sz: ARENA.depth + 1.2 },
  ];

  for (const wall of wallData) {
    walls.push(
      makeBox({
        size: { x: wall.sx, y: 2.6, z: wall.sz },
        position: { x: wall.x, y: 1.3, z: wall.z },
        material: materials.glass,
        cast: false,
        receive: false,
      }),
    );
  }

  for (let x = -14; x <= 14; x += 7) {
    makeBox({
      size: { x: 1.1, y: 0.08, z: 0.1 },
      position: { x, y: 3.1, z: -ARENA.halfD - 0.48 },
      material: materials.ink,
      cast: false,
      receive: false,
    });
  }
}

function addProp(kind, x, z, sx, sy, sz, material, mass = 1) {
  const mesh = makeBox({
    size: { x: sx, y: sy, z: sz },
    position: { x, y: sy / 2, z },
    material,
  });

  const prop = {
    kind,
    mesh,
    baseY: sy / 2,
    homePosition: mesh.position.clone(),
    homeRotation: mesh.rotation.clone(),
    radius: Math.max(sx, sz) * 0.64,
    mass,
    velocity: new THREE.Vector3(),
    spin: new THREE.Vector3(),
    air: false,
    health: 1,
  };
  props.push(prop);
  return prop;
}

function addDeskCluster(x, z, direction) {
  addProp("desk", x, z, 2.7, 0.42, 1.35, materials.wood, 2.4);
  addProp("monitor", x - 0.62 * direction, z - 0.18, 0.56, 0.52, 0.16, materials.ink, 0.7);
  addProp("keyboard", x - 0.38 * direction, z + 0.34, 0.86, 0.08, 0.22, materials.metal, 0.45);
  addProp("chair", x + 1.45 * direction, z, 0.72, 0.72, 0.72, materials.metal, 0.9);
}

function addPlant(x, z) {
  addProp("planter", x, z, 0.66, 0.62, 0.66, materials.wood, 1.4);
  const stem = addProp("plant", x, z, 0.2, 1.1, 0.2, materials.leaf, 0.7);
  stem.mesh.position.y = 1.16;
  stem.baseY = 1.16;
  for (const offset of [
    [-0.25, 0.15],
    [0.26, -0.18],
    [0.18, 0.24],
  ]) {
    const leaf = addProp("leaf", x + offset[0], z + offset[1], 0.44, 0.3, 0.44, materials.leaf, 0.35);
    leaf.mesh.position.y = 1.76 + rand(-0.1, 0.15);
    leaf.baseY = leaf.mesh.position.y;
  }
}

function buildProps() {
  for (const rowZ of [-6.5, -2.2, 2.2, 6.5]) {
    addDeskCluster(-10.5, rowZ, -1);
    addDeskCluster(10.5, rowZ, 1);
  }

  for (const pos of [
    [-15, -9],
    [15, 9],
    [-15, 8.2],
    [15, -8.2],
    [-2.8, -9],
    [2.8, 9],
  ]) {
    addPlant(pos[0], pos[1]);
  }

  for (const pos of [
    [-5.8, -9.2],
    [5.8, 9.2],
    [-6.4, 9.4],
    [6.4, -9.4],
  ]) {
    addProp("cabinet", pos[0], pos[1], 1.1, 1.35, 0.72, materials.metal, 2.1);
  }

  for (let i = 0; i < 18; i += 1) {
    addProp("paper", rand(-13, 13), rand(-7.8, 7.8), 0.46, 0.035, 0.34, materials.paper, 0.16);
  }
}

function createPlayer(team, index) {
  const teamColor = team === "blue" ? materials.blue : materials.red;
  const accent = team === "blue" ? materials.blueDark : materials.redDark;
  const side = team === "blue" ? -1 : 1;
  const group = new THREE.Group();
  const body = new THREE.Mesh(shared.player, teamColor);
  body.position.y = 0.82;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const head = new THREE.Mesh(shared.cube, accent);
  head.scale.set(0.62, 0.46, 0.62);
  head.position.y = 1.74;
  head.castShadow = true;
  group.add(head);

  const visor = new THREE.Mesh(shared.cube, materials.paper);
  visor.scale.set(0.42, 0.1, 0.08);
  visor.position.set(0, 1.78, side * -0.34);
  group.add(visor);

  group.position.set(side * rand(5.6, 12.8), 0, rand(-8, 8));
  scene.add(group);

  return {
    team,
    index,
    group,
    velocity: new THREE.Vector3(),
    target: new THREE.Vector3(group.position.x, 0, group.position.z),
    radius: 0.7,
    cooldown: rand(0.2, 1.8),
    stun: 0,
    dodge: rand(0, Math.PI * 2),
    lean: 0,
  };
}

function createBall(index) {
  const mesh = new THREE.Mesh(shared.ball, materials.ball);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  return {
    index,
    mesh,
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
  ball.mesh.position.set(rand(-2.8, 2.8), 0.42, rand(-7.2, 7.2));
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
  const laneMin = player.team === "blue" ? -ARENA.halfW + 2.2 : 1.6;
  const laneMax = player.team === "blue" ? -1.6 : ARENA.halfW - 2.2;
  player.target.set(rand(laneMin, laneMax), 0, rand(-ARENA.halfD + 2, ARENA.halfD - 2));
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

function throwBall(player, ball, target) {
  const from = player.group.position;
  const to = target.group.position;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.max(1, length2(dx, dz));
  const leadX = target.velocity.x * 0.46;
  const leadZ = target.velocity.z * 0.46;
  const speed = 13 + Math.min(6, dist * 0.28) + chaos * 0.02;
  const inv = 1 / Math.max(0.001, length2(dx + leadX, dz + leadZ));

  ball.holder = null;
  ball.team = player.team;
  ball.airborne = true;
  ball.age = 0;
  ball.mesh.position.set(from.x, 1.35, from.z);
  ball.velocity.set((dx + leadX) * inv * speed, 3.4 + rand(0.2, 1.2), (dz + leadZ) * inv * speed);
  ball.spin.set(rand(-12, 12), rand(-12, 12), rand(-12, 12));
  player.cooldown = rand(0.85, 1.45);
  player.lean = player.team === "blue" ? -0.28 : 0.28;
}

function spawnPaperBurst(position, count, baseVelocity) {
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(shared.dust, materials.paper);
    mesh.position.copy(position);
    mesh.position.y += rand(0.1, 0.9);
    mesh.scale.set(rand(0.8, 1.7), 1, rand(0.8, 1.6));
    scene.add(mesh);
    particles.push({
      mesh,
      life: rand(0.7, 1.5),
      velocity: new THREE.Vector3(
        baseVelocity.x * 0.12 + rand(-3.2, 3.2),
        rand(2.2, 6.2),
        baseVelocity.z * 0.12 + rand(-3.2, 3.2),
      ),
      spin: new THREE.Vector3(rand(-8, 8), rand(-10, 10), rand(-8, 8)),
    });
  }
}

function hitPlayer(player, ball) {
  const impulse = ball.velocity.clone().multiplyScalar(0.1);
  player.velocity.add(new THREE.Vector3(impulse.x, 0, impulse.z));
  player.stun = 1.05;
  player.lean = ball.velocity.x > 0 ? 0.65 : -0.65;

  if (ball.team === "blue") {
    blueScore += 1;
  } else if (ball.team === "red") {
    redScore += 1;
  }
  chaos = clamp(chaos + 7, 0, 100);
  spawnPaperBurst(player.group.position, 9, ball.velocity);
  resetBall(ball);
}

function kickProp(prop, impulse, sourcePosition) {
  const strength = impulse.length();
  prop.velocity.x += impulse.x / prop.mass;
  prop.velocity.z += impulse.z / prop.mass;
  prop.velocity.y += Math.min(7, 1.15 + strength * 0.09) / prop.mass;
  prop.spin.x += rand(-3.4, 3.4) + impulse.z * 0.18;
  prop.spin.y += rand(-5.8, 5.8);
  prop.spin.z += rand(-3.4, 3.4) - impulse.x * 0.18;
  prop.air = true;
  prop.health -= 0.25;
  chaos = clamp(chaos + (prop.kind === "paper" ? 1 : 3), 0, 100);

  if (prop.kind === "paper" || prop.kind === "monitor" || prop.kind === "plant" || prop.kind === "leaf") {
    spawnPaperBurst(sourcePosition, prop.kind === "paper" ? 3 : 7, impulse);
  }
}

function updatePlayers(dt) {
  for (const player of players) {
    player.cooldown -= dt;
    player.stun = Math.max(0, player.stun - dt);
    player.dodge += dt * (1.5 + player.index * 0.17);

    const held = ballHeldBy(player);
    const opponent = nearestOpponent(player);

    if (held && opponent && player.cooldown <= 0 && player.stun <= 0) {
      throwBall(player, held, opponent);
    }

    if (!held && player.stun <= 0) {
      const freeBall = nearestFreeBall(player);
      if (freeBall) {
        const dx = freeBall.mesh.position.x - player.group.position.x;
        const dz = freeBall.mesh.position.z - player.group.position.z;
        if (length2(dx, dz) < 1.08) {
          freeBall.holder = player;
          freeBall.team = player.team;
          freeBall.airborne = false;
        } else if (Math.random() < 0.02) {
          player.target.set(freeBall.mesh.position.x, 0, freeBall.mesh.position.z);
        }
      }
    }

    const distToTarget = player.group.position.distanceTo(player.target);
    if (distToTarget < 1.1 || Math.random() < 0.006) {
      pickNewTarget(player);
    }

    const toTarget = new THREE.Vector3(
      player.target.x - player.group.position.x,
      0,
      player.target.z - player.group.position.z,
    );
    const targetLen = Math.max(0.001, length2(toTarget.x, toTarget.z));
    toTarget.multiplyScalar(1 / targetLen);

    if (opponent && !held) {
      const awayX = player.group.position.x - opponent.group.position.x;
      const awayZ = player.group.position.z - opponent.group.position.z;
      const awayLen = Math.max(0.001, length2(awayX, awayZ));
      if (awayLen < 4.8) {
        toTarget.x += (awayX / awayLen) * 0.55;
        toTarget.z += (awayZ / awayLen) * 0.55;
      }
    }

    toTarget.z += Math.sin(player.dodge) * 0.34;
    const moveSpeed = player.stun > 0 ? 1.4 : 4.1 + (held ? 0.4 : 0);
    const desired = toTarget.multiplyScalar(moveSpeed);
    player.velocity.lerp(desired, player.stun > 0 ? 0.025 : 0.08);

    player.group.position.x += player.velocity.x * dt;
    player.group.position.z += player.velocity.z * dt;
    player.group.position.x = clamp(player.group.position.x, -ARENA.halfW + 1.1, ARENA.halfW - 1.1);
    player.group.position.z = clamp(player.group.position.z, -ARENA.halfD + 1.1, ARENA.halfD - 1.1);

    for (const prop of props) {
      const dx = player.group.position.x - prop.mesh.position.x;
      const dz = player.group.position.z - prop.mesh.position.z;
      const dist = length2(dx, dz);
      const overlap = player.radius + prop.radius * 0.65 - dist;
      if (overlap > 0 && dist > 0.001) {
        player.group.position.x += (dx / dist) * overlap * 0.4;
        player.group.position.z += (dz / dist) * overlap * 0.4;
      }
    }

    const facing = Math.atan2(player.velocity.x, player.velocity.z);
    player.group.rotation.y = THREE.MathUtils.lerp(player.group.rotation.y, facing, 0.14);
    player.lean = THREE.MathUtils.lerp(player.lean, 0, 0.06);
    player.group.rotation.z = player.lean;
    player.group.position.y = Math.max(0, Math.sin(performance.now() * 0.012 + player.index) * 0.035);

    if (held) {
      held.mesh.position.set(
        player.group.position.x + (player.team === "blue" ? 0.55 : -0.55),
        1.18,
        player.group.position.z + 0.22,
      );
      held.mesh.rotation.x += dt * 7;
      held.mesh.rotation.z += dt * 4;
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
    if (ball.mesh.position.y < ball.radius) {
      ball.mesh.position.y = ball.radius;
      ball.velocity.y *= -0.46;
      ball.velocity.x *= 0.78;
      ball.velocity.z *= 0.78;
      if (ball.velocity.length() < 3.2 || ball.age > 2.6) {
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
      const dx = prop.mesh.position.x - ball.mesh.position.x;
      const dy = prop.mesh.position.y - ball.mesh.position.y;
      const dz = prop.mesh.position.z - ball.mesh.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < prop.radius + ball.radius) {
        const impulse = ball.velocity.clone().multiplyScalar(0.42);
        kickProp(prop, impulse, ball.mesh.position);
        ball.velocity.multiplyScalar(-0.22);
        ball.velocity.y += rand(0.3, 1.8);
        break;
      }
    }
  }
}

function updateProps(dt) {
  for (const prop of props) {
    prop.velocity.y -= 10.8 * dt;
    prop.mesh.position.addScaledVector(prop.velocity, dt);
    prop.mesh.rotation.x += prop.spin.x * dt;
    prop.mesh.rotation.y += prop.spin.y * dt;
    prop.mesh.rotation.z += prop.spin.z * dt;

    if (prop.mesh.position.y < prop.baseY) {
      prop.mesh.position.y = prop.baseY;
      if (prop.air && Math.abs(prop.velocity.y) > 1.1) {
        spawnPaperBurst(prop.mesh.position, prop.kind === "paper" ? 1 : 4, prop.velocity);
      }
      prop.velocity.y *= -0.24;
      prop.velocity.x *= 0.82;
      prop.velocity.z *= 0.82;
      prop.spin.multiplyScalar(0.82);
      if (prop.velocity.length() < 0.22) {
        prop.velocity.set(0, 0, 0);
        prop.spin.multiplyScalar(0.5);
        prop.air = false;
      }
    }

    if (Math.abs(prop.mesh.position.x) > ARENA.halfW - 0.45) {
      prop.mesh.position.x = clamp(prop.mesh.position.x, -ARENA.halfW + 0.45, ARENA.halfW - 0.45);
      prop.velocity.x *= -0.42;
    }
    if (Math.abs(prop.mesh.position.z) > ARENA.halfD - 0.45) {
      prop.mesh.position.z = clamp(prop.mesh.position.z, -ARENA.halfD + 0.45, ARENA.halfD - 0.45);
      prop.velocity.z *= -0.42;
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
  const zoom = mode === "top" ? 15 : mode === "sideline" ? 14 : 16;
  camera.left = -zoom * aspect;
  camera.right = zoom * aspect;
  camera.top = zoom;
  camera.bottom = -zoom;
  camera.updateProjectionMatrix();

  const target = new THREE.Vector3(0, 0, 0);
  if (mode === "top") {
    camera.position.lerp(new THREE.Vector3(0, 35, 0.01), 1 - Math.pow(0.001, dt));
  } else if (mode === "sideline") {
    camera.position.lerp(new THREE.Vector3(0, 13, 24), 1 - Math.pow(0.001, dt));
  } else {
    const swing = Math.sin(performance.now() * 0.00018) * 2.5;
    camera.position.lerp(new THREE.Vector3(24 + swing, 22, 24 - swing), 1 - Math.pow(0.001, dt));
  }
  camera.lookAt(target);
}

function updateHud() {
  blueScoreEl.textContent = blueScore;
  redScoreEl.textContent = redScore;
  chaosMeter.value = Math.round(chaos);
  const time = Math.max(0, Math.ceil(gameTime));
  const minutes = String(Math.floor(time / 60)).padStart(2, "0");
  const seconds = String(time % 60).padStart(2, "0");
  clockEl.textContent = `${minutes}:${seconds}`;
}

function resizeRenderer() {
  const { clientWidth, clientHeight } = canvas;
  const needsResize = canvas.width !== Math.floor(clientWidth * renderer.getPixelRatio())
    || canvas.height !== Math.floor(clientHeight * renderer.getPixelRatio());
  if (needsResize) {
    renderer.setSize(clientWidth, clientHeight, false);
  }
}

function resetMatch() {
  gameTime = MATCH_LENGTH;
  blueScore = 0;
  redScore = 0;
  chaos = 0;

  for (const player of players) {
    const side = player.team === "blue" ? -1 : 1;
    player.group.position.set(side * rand(5.5, 13), 0, rand(-8, 8));
    player.velocity.set(0, 0, 0);
    player.stun = 0;
    player.cooldown = rand(0.2, 1.7);
    pickNewTarget(player);
  }

  for (const ball of balls) {
    resetBall(ball);
  }

  for (const prop of props) {
    prop.mesh.position.copy(prop.homePosition);
    prop.mesh.rotation.copy(prop.homeRotation);
    prop.velocity.set(0, 0, 0);
    prop.spin.set(0, 0, 0);
    prop.air = false;
  }

  updateHud();
}

function animate(now) {
  const rawDt = Math.min(0.04, (now - lastTime) / 1000);
  lastTime = now;
  const dt = paused ? 0 : rawDt * speedScale;

  if (dt > 0) {
    gameTime -= dt;
    if (gameTime <= 0) {
      resetMatch();
    }
    chaos = clamp(chaos - dt * 4.2, 0, 100);
    updatePlayers(dt);
    updateBalls(dt);
    updateProps(dt);
    updateParticles(dt);
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
  speedScale = Number(event.target.value);
});

buildOffice();
buildProps();
createTeamsAndBalls();
resetMatch();

window.__voxelOfficeDodgeball = {
  metrics: () => ({
    playerCount: players.length,
    ballCount: balls.length,
    propCount: props.length,
    particleCount: particles.length,
    blueScore,
    redScore,
    chaos: Math.round(chaos),
    cameraMode: cameraModes[cameraModeIndex],
    paused,
    samplePlayers: players.slice(0, 4).map((player) => ({
      team: player.team,
      x: Number(player.group.position.x.toFixed(2)),
      z: Number(player.group.position.z.toFixed(2)),
      stun: Number(player.stun.toFixed(2)),
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
