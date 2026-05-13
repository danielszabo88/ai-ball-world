const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const world = {
  balls: [],
  walls: [],
  grid: [],
  cellSize: 100,
};

//grid system for spatial partitioning
world.gridWidth = Math.ceil(canvas.width / world.cellSize);
world.gridHeight = Math.ceil(canvas.height / world.cellSize);
world.gridSize = world.gridWidth * world.gridHeight;
world.grid = new Array(world.gridSize);

//global time accumulator for fixed timestep
let accumulator = 0;
const fixedDt = 1 / 60;
let lastTime = performance.now();

let LEFT, UP, RIGHT, DOWN;
let idCounter = 0;
let damping = 0.98;

window.addEventListener("keydown", function (e) {
  if (e.keyCode === 37) {
    LEFT = true;
  }
  if (e.keyCode === 38) {
    UP = true;
  }
  if (e.keyCode === 39) {
    RIGHT = true;
  }
  if (e.keyCode === 40) {
    DOWN = true;
  }
});

window.addEventListener("keyup", function (e) {
  if (e.keyCode === 37) {
    LEFT = false;
  }
  if (e.keyCode === 38) {
    UP = false;
  }
  if (e.keyCode === 39) {
    RIGHT = false;
  }
  if (e.keyCode === 40) {
    DOWN = false;
  }
});

canvas.addEventListener("mousedown", function (e) {
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  let selectedBall = null;

  for (let i = 0; i < world.balls.length; i++) {
    const b = world.balls[i];
    const dx = mouseX - b.pos.x;
    const dy = mouseY - b.pos.y;
    if (dx * dx + dy * dy <= b.r * b.r) {
      selectedBall = b;
      break;
    }
  }

  if (selectedBall) {
    world.balls.forEach((b) => (b.player = false));
    selectedBall.player = true;
    selectedBall.target = null;
    selectedBall.vel.set(0, 0);
  } else {
    const active = world.balls.find((b) => b.player);
    if (active) {
      active.target = new Vector(mouseX, mouseY);
    }
  }
});

canvas.addEventListener("contextmenu", function (e) {
  e.preventDefault();
  world.balls.forEach((b) => {
    b.player = false;
    b.target = null;
    b.vel.set(0, 0);
    b.acc.set(0, 0);
  });
});

class Vector {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  addMut(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  subMut(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  multMut(n) {
    this.x *= n;
    this.y *= n;
    return this;
  }

  copyFrom(v) {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  mag() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  magSq() {
    return this.x * this.x + this.y * this.y;
  }

  normalize() {
    const m = this.mag();
    if (m > 0) {
      this.x /= m;
      this.y /= m;
    }
    return this;
  }

  drawVec(start_x, start_y, n, color) {
    ctx.beginPath();
    ctx.moveTo(start_x, start_y);
    ctx.lineTo(start_x + this.x * n, start_y + this.y * n);
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.closePath();
  }
}

//vector allocation pool to reduce garbage collection overhead
const tempVecA = new Vector(0, 0);
const tempVecB = new Vector(0, 0);
const tempVecC = new Vector(0, 0);

class Ball {
  constructor(x, y, r, m) {
    this.id = idCounter++;
    this.pos = new Vector(x, y);
    this.r = r;
    this.m = m;
    if (this.m === 0) {
      this.inv_m = 0;
    } else {
      this.inv_m = 1 / this.m;
    }
    this.elasticity = 1;
    this.vel = new Vector(0, 0);
    this.acc = new Vector(0, 0);
    this.acceleration = 1;
    this.player = false;
    this.target = null;
    world.balls.push(this);
  }

  setTarget(x, y) {
    this.target = new Vector(x, y);
  }

  drawBall() {
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.r, 0, 2 * Math.PI);
    ctx.strokeStyle = "black";
    ctx.stroke();
    if (this.player) {
      if (this.target !== null) {
        ctx.fillStyle = "#ff6b6b";
      } else {
        ctx.fillStyle = "#ff8c42";
      }
    } else {
      ctx.fillStyle = "red";
    }
    ctx.fill();
    ctx.closePath();
  }

  display() {
    this.vel.drawVec(this.pos.x, this.pos.y, 10, "green");
    ctx.fillStyle = "black";
    ctx.fillText("m = " + this.m, this.pos.x - 10, this.pos.y - 5);
    ctx.fillText("e = " + this.elasticity, this.pos.x - 10, this.pos.y + 5);
  }

  reposition() {
    let magSq = this.acc.x * this.acc.x + this.acc.y * this.acc.y;
    if (magSq > 1) {
      const mag = Math.sqrt(magSq);
      this.acc.x /= mag;
      this.acc.y /= mag;
    }

    this.acc.multMut(this.acceleration);
    this.vel.addMut(this.acc);
    this.vel.multMut(damping);
    if (this.vel.magSq() < 0.0001) {
      this.vel.set(0, 0);
    }
    this.pos.addMut(this.vel);
  }
}

//Walls are line segments between two points
class Wall {
  constructor(x1, y1, x2, y2) {
    this.start = new Vector(x1, y1);
    this.end = new Vector(x2, y2);
    world.walls.push(this);
  }

  drawWall() {
    ctx.beginPath();
    ctx.moveTo(this.start.x, this.start.y);
    ctx.lineTo(this.end.x, this.end.y);
    ctx.strokeStyle = "black";
    ctx.stroke();
    ctx.closePath();
  }

  wallUnit() {
    const dx = this.end.x - this.start.x;
    const dy = this.end.y - this.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return { x: 0, y: 0 };
    return { x: dx / len, y: dy / len };
  }
}

//spatial hash grid for better performance
function buildSpatialGrid() {
  // clear grid
  for (let i = 0; i < world.gridSize; i++) {
    world.grid[i] = [];
  }

  // insert balls
  for (let i = 0; i < world.balls.length; i++) {
    const b = world.balls[i];
    const minX = Math.floor((b.pos.x - b.r) / world.cellSize);
    const maxX = Math.floor((b.pos.x + b.r) / world.cellSize);
    const minY = Math.floor((b.pos.y - b.r) / world.cellSize);
    const maxY = Math.floor((b.pos.y + b.r) / world.cellSize);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        if (x >= 0 && y >= 0 && x < world.gridWidth && y < world.gridHeight) {
          const index = x + y * world.gridWidth;
          world.grid[index].push(b);
        }
      }
    }
  }
}

function keyControl(b) {
  b.acc.x = 0;
  b.acc.y = 0;

  if (LEFT) b.acc.x -= 1;
  if (RIGHT) b.acc.x += 1;
  if (UP) b.acc.y -= 1;
  if (DOWN) b.acc.y += 1;
  if (!LEFT && !RIGHT) {
    b.acc.x = 0;
  }
  if (!UP && !DOWN) {
    b.acc.y = 0;
  }
}

function round(number, precision) {
  let factor = 10 ** precision;
  return Math.round(number * factor) / factor;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createRandomWall() {
  const margin = 50;
  const minLen = 150;
  const maxLen = 300;

  let x1 = randInt(margin, canvas.width - margin);
  let y1 = randInt(margin, canvas.height - margin);

  const angle = Math.random() * Math.PI * 2;
  const length = randInt(minLen, maxLen);

  let x2 = x1 + Math.cos(angle) * length;
  let y2 = y1 + Math.sin(angle) * length;

  x2 = Math.max(margin, Math.min(canvas.width - margin, x2));
  y2 = Math.max(margin, Math.min(canvas.height - margin, y2));

  return new Wall(x1, y1, x2, y2);
}

function drawTargets() {
  const size = 6;

  world.balls.forEach((b) => {
    if (!b.target) return;

    const targetPoint = b.target;

    ctx.strokeStyle = "#4da6ff";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(targetPoint.x - size, targetPoint.y - size);
    ctx.lineTo(targetPoint.x + size, targetPoint.y + size);
    ctx.moveTo(targetPoint.x + size, targetPoint.y - size);
    ctx.lineTo(targetPoint.x - size, targetPoint.y + size);
    ctx.stroke();
  });

  ctx.lineWidth = 1;
}

//returns with the closest point on a line segment to a given point
function closestPointBallWall(b, w) {
  const wx = w.end.x - w.start.x;
  const wy = w.end.y - w.start.y;

  const lenSq = wx * wx + wy * wy;

  if (lenSq === 0) {
    tempVecC.x = w.start.x;
    tempVecC.y = w.start.y;
    return tempVecC;
  }

  const bx = b.pos.x - w.start.x;
  const by = b.pos.y - w.start.y;

  const dot = bx * wx + by * wy;
  let t = dot / lenSq;

  if (t < 0) t = 0;
  else if (t > 1) t = 1;

  tempVecC.x = w.start.x + wx * t;
  tempVecC.y = w.start.y + wy * t;

  return tempVecC;
}

function checkBallBallCollision(b1, b2) {
  const dx = b2.pos.x - b1.pos.x;
  const dy = b2.pos.y - b1.pos.y;
  const r = b1.r + b2.r;
  return dx * dx + dy * dy <= r * r;
}

//collision detection between ball and wall
function checkBallWallCollision(b, w) {
  const p = closestPointBallWall(b, w);
  const dx = p.x - b.pos.x;
  const dy = p.y - b.pos.y;
  return dx * dx + dy * dy <= b.r * b.r;
}

function resolveBallBallPenetration(b1, b2) {
  const invMassSum = b1.inv_m + b2.inv_m;
  if (invMassSum === 0) return;
  const percent = 0.8;
  const slop = 0.01;
  if (invMassSum === 0) return;
  const dx = b1.pos.x - b2.pos.x;
  const dy = b1.pos.y - b2.pos.y;
  const distSq = dx * dx + dy * dy;
  let dist;
  if (distSq === 0) return;
  dist = Math.sqrt(distSq);
  const penDepth = b1.r + b2.r - dist;
  if (penDepth <= 0) return;

  const correctionMag = (Math.max(penDepth - slop, 0) / invMassSum) * percent;

  // normalize (dx, dy)
  const invDist = 1 / dist;
  const nx = dx * invDist;
  const ny = dy * invDist;
  const cx = nx * correctionMag;
  const cy = ny * correctionMag;
  b1.pos.x += cx * b1.inv_m;
  b1.pos.y += cy * b1.inv_m;
  b2.pos.x -= cx * b2.inv_m;
  b2.pos.y -= cy * b2.inv_m;
}

function resolveBallBallCollision(b1, b2) {
  let dx = b1.pos.x - b2.pos.x;
  let dy = b1.pos.y - b2.pos.y;
  const distSq = dx * dx + dy * dy;
  if (distSq === 0) return;
  const dist = Math.sqrt(distSq);
  const nx = dx / dist;
  const ny = dy / dist;
  tempVecA.set(b1.vel.x - b2.vel.x, b1.vel.y - b2.vel.y);
  const sepVel = tempVecA.x * nx + tempVecA.y * ny;
  if (sepVel > 0) return;
  const e = Math.min(b1.elasticity, b2.elasticity);
  const j = (-(1 + e) * sepVel) / (b1.inv_m + b2.inv_m);
  const ix = nx * j;
  const iy = ny * j;
  b1.vel.x += ix * b1.inv_m;
  b1.vel.y += iy * b1.inv_m;
  b2.vel.x -= ix * b2.inv_m;
  b2.vel.y -= iy * b2.inv_m;
}

//collision response between ball and wall
function resolveBallWall(b, w) {
  const percent = 1.0;
  const slop = 0.01;
  const wx = w.end.x - w.start.x;
  const wy = w.end.y - w.start.y;
  const lenSq = wx * wx + wy * wy;

  let cx, cy;
  if (lenSq === 0) {
    cx = w.start.x;
    cy = w.start.y;
  } else {
    const bx = b.pos.x - w.start.x;
    const by = b.pos.y - w.start.y;
    let t = (bx * wx + by * wy) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    cx = w.start.x + wx * t;
    cy = w.start.y + wy * t;
  }

  const dx = b.pos.x - cx;
  const dy = b.pos.y - cy;
  const distSq = dx * dx + dy * dy;
  if (distSq === 0) return;
  let dist = Math.sqrt(distSq);
  const penDepth = b.r - dist;
  if (penDepth <= 0) return;

  const invDist = 1 / dist;
  const nx = dx * invDist;
  const ny = dy * invDist;

  const correction = Math.max(penDepth - slop, 0) * percent;
  b.pos.x += nx * correction;
  b.pos.y += ny * correction;

  const sepVel = b.vel.x * nx + b.vel.y * ny;
  if (sepVel < 0) {
    const e = b.elasticity;
    const impulse = -(1 + e) * sepVel;
    b.vel.x += nx * impulse;
    b.vel.y += ny * impulse;
  }
}

function handleInput() {
  world.balls.forEach((b) => {
    if (b.m === 0) return;
    if (b.target !== null) {
      moveToTarget(b);
      return;
    }
    if (b.player) {
      keyControl(b);
      return;
    }
    b.acc.set(0, 0);
  });
}

function moveToTarget(b) {
  const slowRadius = 120;
  const stopRadius = 3;
  const maxSpeed = 6;

  const dx = b.target.x - b.pos.x;
  const dy = b.target.y - b.pos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < stopRadius) {
    b.pos.set(b.target.x, b.target.y);
    b.vel.set(0, 0);
    b.target = null;
    return;
  }

  const nx = dx / dist;
  const ny = dy / dist;

  let t = Math.min(1, dist / slowRadius);
  let desiredSpeed = maxSpeed * t;
  desiredSpeed = Math.max(desiredSpeed, 1.0);

  const desiredVx = nx * desiredSpeed;
  const desiredVy = ny * desiredSpeed;

  const kp = 0.25;
  const kd = 0.12;

  b.acc.x = (desiredVx - b.vel.x) * kp - b.vel.x * kd;
  b.acc.y = (desiredVy - b.vel.y) * kp - b.vel.y * kd;
}

function updatePhysics() {
  world.balls.forEach((b) => b.reposition());
}

function solveCollisions() {
  const grid = world.grid;
  for (let i = 0; i < world.gridSize; i++) {
    const cell = grid[i];
    const len = cell.length;

    // internal pairs
    for (let a = 0; a < len; a++) {
      const b1 = cell[a];
      for (let b = a + 1; b < len; b++) {
        const b2 = cell[b];
        if (checkBallBallCollision(b1, b2)) {
          resolveBallBallCollision(b1, b2);
          resolveBallBallPenetration(b1, b2);
        }
      }
    }

    // neighbors
    const cx = i % world.gridWidth;
    const cy = (i / world.gridWidth) | 0;
    for (let dx = 0; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy <= 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= world.gridWidth || ny >= world.gridHeight)
          continue;
        const ni = nx + ny * world.gridWidth;
        const ncell = grid[ni];
        if (!ncell) continue;
        for (let a = 0; a < len; a++) {
          const b1 = cell[a];
          for (let b = 0; b < ncell.length; b++) {
            const b2 = ncell[b];
            if (b1.id >= b2.id) continue;
            if (checkBallBallCollision(b1, b2)) {
              resolveBallBallCollision(b1, b2);
              resolveBallBallPenetration(b1, b2);
            }
          }
        }
      }
    }
  }

  // walls unchanged
  for (let i = 0; i < world.balls.length; i++) {
    const b = world.balls[i];
    for (let j = 0; j < world.walls.length; j++) {
      const w = world.walls[j];
      if (checkBallWallCollision(b, w)) {
        resolveBallWall(b, w);
      }
    }
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  world.balls.forEach((b) => {
    b.drawBall();
    b.display();
  });
  drawTargets();
  world.walls.forEach((w) => w.drawWall());
}

function mainLoop(time) {
  const frameTime = (time - lastTime) / 1000;
  lastTime = time;
  accumulator += frameTime;
  accumulator = Math.min(accumulator, 0.25);

  handleInput();

  let steps = 0;
  const MAX_STEPS = 5;
  while (accumulator >= fixedDt && steps < MAX_STEPS) {
    world.balls.forEach((b) => {
      if (typeof b.update === "function") {
        b.update(world);
      }
    });
    updatePhysics();
    buildSpatialGrid();
    solveCollisions();
    accumulator -= fixedDt;
    steps++;
  }
  render();
  requestAnimationFrame(mainLoop);
}

// walls around the edges
let edge1 = new Wall(0, 0, canvas.clientWidth, 0);
let edge2 = new Wall(canvas.clientWidth, 0, canvas.clientWidth, canvas.clientHeight);
let edge3 = new Wall(canvas.clientWidth, canvas.clientHeight, 0, canvas.clientHeight);
let edge4 = new Wall(0, canvas.clientHeight, 0, 0);

requestAnimationFrame(mainLoop);