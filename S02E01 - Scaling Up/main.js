const agentWorld = {
  homes: [],
  pubs: [], 
  messages: [],
};

const FOOD_RADIUS = 8;
const AGENT_RADIUS = 16;

const HOME_LAYOUT = [
  { x: 40, y: 520, width: 150, height: 90 },
  { x: 405, y: 520, width: 150, height: 90 },
  { x: 770, y: 520, width: 150, height: 90 },
];

const PUB_LAYOUT = [
  { x: 280, y: 0, width: 120, height: 70 },
  { x: 420, y: 0, width: 120, height: 70 },
  { x: 560, y: 0, width: 120, height: 70 },
];

// ====================================================================
// DATA CLASSES
// ====================================================================
class Memory {
  constructor(type, agent, value, importance = 1) {
    this.type = type;
    this.agentId = agent.id;
    this.value = value;
    this.createdAt = Date.now();
    this.importance = importance;
  }
  getWeight() {
    const age = Date.now() - this.createdAt;
    const maxAge = 60000; // 1 minute
    const recency = Math.max(0, 1 - age / maxAge);
    return this.value * this.importance * recency;
  }
}

class Message {
  constructor(from, to, text) {
    this.from = from;
    this.to = to;
    this.text = text;
    this.createdAt = Date.now();
    this.duration = 3000;
  }
  isAlive() {
    return Date.now() - this.createdAt < this.duration;
  }
}

class Home {
  constructor(x, y, width, height, color = "lightgrey") {
    this.owners = [];
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.color = color;
  }
  draw() {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    ctx.strokeStyle = "black";
    ctx.strokeRect(this.x, this.y, this.width, this.height);
    ctx.fillStyle = "black";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
      `Home: ${this.owners.map((o) => o.name).join(", ")}`,
      this.x + this.width / 2,
      this.y - 10,
    );
  }
  contains(x, y) {
    return (
      x >= this.x &&
      x <= this.x + this.width &&
      y >= this.y &&
      y <= this.y + this.height
    );
  }
  center() {
    return { x: this.x + this.width / 2, y: this.y + this.height / 2 };
  }
}

class Pub {
  constructor(x, y, width, height, color = "#f3e6d8") {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.color = color;
    this.capacity = null;
    this.label = "Pub";
  }
  draw() {
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    ctx.strokeStyle = "black";
    ctx.strokeRect(this.x, this.y, this.width, this.height);
    ctx.fillStyle = "black";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
      `${this.label}`,
      this.x + this.width / 2,
      this.y + this.height + 10,
    );
  }
  center() {
    return { x: this.x + this.width / 2, y: this.y + this.height / 2 };
  }
}

class Food extends Ball {
  constructor(x, y, nutrition = 30) {
    super(x, y, FOOD_RADIUS, 0);
    this.nutrition = nutrition;
    this.eatenBy = null;
  }
  drawBall() {
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = "limegreen";
    ctx.fill();
    ctx.strokeStyle = "black";
    ctx.stroke();
    ctx.closePath();
  }
}

// ====================================================================
// WORLD HELPERS
// ====================================================================
function sendMessage(from, to, text) {
  agentWorld.messages.push(new Message(from, to, text));
}
function getAgents() {
  return physicsWorld.balls.filter((b) => b instanceof Agent);
}
function getFoods() {
  return physicsWorld.balls.filter((b) => b instanceof Food);
}
function findClosest(source, targets) {
  let closest = null;
  let closestDist = Infinity;
  for (const target of targets) {
    const distSq = distanceSquared(target.pos, source.pos);
    if (distSq < closestDist) {
      closestDist = distSq;
      closest = target;
    }
  }
  return closest;
}
function spawnFood() {
  const foods = getFoods();
  if (foods.length >= 2) {
    return;
  }
  const x = randInt(40, canvas.width - 40);
  const y = randInt(40, canvas.height - 150);
  const nutrition = randInt(20, 50);
  const food = new Food(x, y, nutrition);
}

// ====================================================================
// CONVERSATION LIFECYCLE
// ====================================================================
function startConversation(agent1, agent2) {
  if (agent1.isConversing || agent2.isConversing) return;
  const conversation = {
    count: 1,
    turn: agent1,
    active: true,
  };
  for (const [agent, partner] of [
    [agent1, agent2],
    [agent2, agent1],
  ]) {
    agent.currentGoal = "socialize";
    agent.currentPlan = [...agent.plans.socialize];
    agent.currentTaskIndex = agent.currentPlan.indexOf("converse");
    agent.conversation = conversation;
    agent.isConversing = true;
    agent.conversationPartner = partner;
    agent.target = null;
    agent.frozen = true;
    agent.currentAgentTarget = null;
    agent.pendingIncomingRequest = null;
    agent.vel.set(0, 0);
    agent.addMemory("conversation", partner, 2);
  }
  agent1.replyTimeout = Date.now();
  sendMessage(agent1, agent2, "Hello!");
  conversation.count++;
  conversation.turn = agent2;
  agent2.replyTimeout = Date.now() + CONVERSATION.REPLY_DELAY;
  return true;
}
function endConversation(agent1, agent2, reason = "") {
  const now = Date.now();
  const conversation = agent1.conversation;
  const value = conversation.count * 0.2;
  agent1.isConversing = false;
  agent2.isConversing = false;
  agent1.conversation = null;
  agent2.conversation = null;
  agent1.conversationPartner = null;
  agent2.conversationPartner = null;
  agent1.conversationCooldownUntil = now + CONVERSATION.COOLDOWN_AFTER_END;
  agent2.conversationCooldownUntil = now + CONVERSATION.COOLDOWN_AFTER_END;
  agent1.replyTimeout = null;
  agent2.replyTimeout = null;
  agent1.frozen = false;
  agent2.frozen = false;
  agent1.addEmotionEvent("satisfaction", 10);
  agent2.addEmotionEvent("satisfaction", 10);
  agent1.addMemory("conversation", agent2, value);
  agent2.addMemory("conversation", agent1, value);
  agent1.pickRandomTarget();
  agent2.pickRandomTarget();
  logEvent(
    `${agent1.name} & ${agent2.name} ended (${conversation.count} msgs${reason ? " — " + reason : ""})`,
  );
}

// ====================================================================
// RENDERING — bars & status
// ====================================================================
function drawBar(x, y, value, config) {
  const width = config.width;
  const height = config.height;
  const normalized = value / 100;
  const isGood =
    (config.min == null || value >= config.min) &&
    (config.max == null || value <= config.max);
  ctx.fillStyle = "#ddd";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = isGood ? "green" : "salmon";
  ctx.fillRect(
    x,
    y + (height - normalized * height),
    width,
    normalized * height,
  );
}
function drawNeedBars(agent) {
  const x = agent.pos.x - 50;
  const y = agent.pos.y - 15;
  const barW = 5;
  const barH = 25;
  const gap = 10;
  const bars = [
    {
      label: "H",
      value: agent.hunger,
      max: agent.hungerThreshold,
    },
    {
      label: "E",
      value: agent.energy,
      min: agent.energyMin,
      max: agent.energyMax,
    },
    {
      label: "S",
      value: agent.social,
      min: agent.socialMin,
      max: agent.socialMax,
    },
  ];
  ctx.font = "8px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  bars.forEach((b, i) => {
    const bx = x + i * gap;
    drawBar(bx, y, b.value, {
      width: barW,
      height: barH,
      min: b.min,
      max: b.max,
    });
    ctx.fillStyle = "black";
    ctx.fillText(Math.floor(b.value), bx + barW / 2, y - 8);
    ctx.fillText(b.label, bx + barW / 2, y + barH + 10);
  });
}
function drawEmotionBars(agent) {
  const x = agent.pos.x + 25;
  const y = agent.pos.y - 15;
  const barW = 5;
  const barH = 25;
  const gap = 10;
  const bars = [
    {
      label: "st",
      value: agent.emotions.stress,
    },
    {
      label: "sa",
      value: agent.emotions.satisfaction,
    },
    {
      label: "fr",
      value: agent.emotions.frustration,
    },
  ];
  ctx.font = "10px Arial";
  bars.forEach((b, i) => {
    const bx = x + i * gap;
    drawBar(bx, y, b.value, {
      width: barW,
      height: barH,
    });
    ctx.fillStyle = "black";
    ctx.textAlign = "center";
    ctx.fillText(Math.floor(b.value), bx + barW / 2, y - 5);
    ctx.fillText(b.label, bx + barW / 2, y + barH + 10);
  });
}
function drawTask(agent) {
  ctx.fillStyle = "black";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.fillText(
    agent.currentPlan[agent.currentTaskIndex],
    agent.pos.x,
    agent.pos.y - 35,
  );
}
function drawGoalScores(agent) {
  const x = agent.pos.x;
  let y = agent.pos.y + 30;
  const entries = Object.entries(agent.goalScores);
  let bestName = null;
  let bestScore = -Infinity;
  for (const [name, score] of entries) {
    if (score > bestScore) {
      bestScore = score;
      bestName = name;
    }
  }
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  for (const [name, score] of entries) {
    const isBest = name === bestName;
    ctx.fillStyle = isBest ? "red" : "black";
    ctx.fillText(`${name}: ${score.toFixed(0)}`, x, y);
    y += 12;
  }
}
function drawAgentInfo(agent) {
  drawNeedBars(agent);
  drawEmotionBars(agent);
  drawTask(agent);
  drawGoalScores(agent);
}

// ====================================================================
// RENDERING — social overlays
// ====================================================================
function drawConversationLines() {
  physicsWorld.balls.forEach((b) => {
    if (!b.isConversing || !b.conversationPartner) return;
    ctx.beginPath();
    ctx.moveTo(b.pos.x, b.pos.y);
    ctx.lineTo(b.conversationPartner.pos.x, b.conversationPartner.pos.y);
    ctx.strokeStyle = "rgba(0,0,255,0.3)";
    ctx.stroke();
  });
}
function drawConversationRequests() {
  const agents = getAgents();
  for (const a of agents) {
    if (!a.pendingConversation) continue;
    const b = a.pendingConversation;
    if (!b) continue;
    ctx.beginPath();
    ctx.moveTo(a.pos.x, a.pos.y);
    ctx.lineTo(b.pos.x, b.pos.y);
    ctx.strokeStyle = "rgb(255, 0, 0)";
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
function drawRelationships() {
  const agent = physicsWorld.selectedBall;
  if (!agent) return;
  for (const other of getAgents()) {
    if (other === agent) continue;
    const value = agent.calculateRelationship(other);
    ctx.beginPath();
    ctx.moveTo(agent.pos.x, agent.pos.y);
    ctx.lineTo(other.pos.x, other.pos.y);
    if (value > 0) {
      ctx.strokeStyle = "rgba(0,255,0,0.7)";
    } else if (value < 0) {
      ctx.strokeStyle = "rgba(255, 0, 0,0.7)";
    } else {
      ctx.strokeStyle = "grey";
    }
    ctx.lineWidth = Math.max(1, Math.abs(value) / 10);
    ctx.stroke();
    ctx.closePath();
    const stats = agent.getMemoryStats(other);
    const midX = (agent.pos.x + other.pos.x) / 2;
    const midY = (agent.pos.y + other.pos.y) / 2;
    ctx.fillStyle = "black";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
      `${value.toFixed(1)} (+${stats.positive}/-${stats.negative})`,
      midX,
      midY,
    );
  }
  ctx.lineWidth = 1;
}
function drawMessages() {
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  agentWorld.messages = agentWorld.messages.filter((m) => m.isAlive());
  agentWorld.messages.forEach((m) => {
    const x = m.from.pos.x;
    const y = m.from.pos.y + 5;
    const metrics = ctx.measureText(m.text);
    const paddingX = 10;
    const paddingY = 6;
    const boxWidth = metrics.width + paddingX * 2;
    const boxHeight = 24;
    const boxX = x - boxWidth / 2;
    const boxY = y - boxHeight / 2;
    ctx.fillStyle = "white";
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.strokeStyle = "black";
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
    ctx.fillStyle = "black";
    ctx.fillText(m.text, x, y);
  });
}
function drawPerceptionOverlay() {
  const selected = physicsWorld.selectedBall;
  if (!(selected instanceof Agent)) return;
  const x = selected.pos.x;
  const y = selected.pos.y;
  const r = selected.visionRadius;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.arc(x, y, r, 0, Math.PI * 2, true);
  ctx.fill("evenodd");
  ctx.restore();
}

// ====================================================================
// RENDER HOOKS
// ====================================================================
function renderBackground() {
  agentWorld.homes.forEach((h) => h.draw());
  agentWorld.pubs.forEach((p) => p.draw());
}
function renderOverlay() {
  drawRelationships();
  drawConversationLines();
  drawMessages();
  drawPerceptionOverlay();
  drawConversationRequests();
}

// ====================================================================
// SETUP
// ====================================================================
HOME_LAYOUT.forEach((h, i) => {
  agentWorld.homes.push(new Home(h.x, h.y, h.width, h.height));
});
PUB_LAYOUT.forEach((p, i) => {
  const pub = new Pub(p.x, p.y, p.width, p.height);
  pub.label = `Pub ${i + 1}`;
  agentWorld.pubs.push(pub);
})
const AGENT_LIST = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
function isPositionFree(x, y, existingAgents, minGap = 4) {
  const minDist = AGENT_RADIUS * 2 + minGap;
  return existingAgents.every((agent) => {
    const dx = agent.pos.x - x;
    const dy = agent.pos.y - y;
    return dx * dx + dy * dy >= minDist * minDist;
  });
}
function spawnAgents(count) {
  const agents = [];
  const margin = AGENT_RADIUS + 10;
  for (let i = 0; i < count; i++) {
    const home = agentWorld.homes[i % agentWorld.homes.length];
    let x,
      y,
      attempts = 0;
    do {
      x = margin + Math.random() * (canvas.width - 2 * margin);
      y = margin + Math.random() * (canvas.height - 2 * margin);
      attempts++;
    } while (!isPositionFree(x, y, agents) && attempts < 200);
    const agent = new Agent(AGENT_LIST[i], x, y, AGENT_RADIUS, 1);
    home.owners.push(agent);
    agents.push(agent);
  }
  return agents;
}

let simStarted = false

function resetToSetup(){
  physicsWorld.balls = physicsWorld.balls.filter(
    b => !(b instanceof Agent || b instanceof Food),
  );
  agentWorld.messages = [];
  agentWorld.homes.forEach(h => h.owners = []);
  physicsWorld.selectedBall = null;
  eventLog.length = 0;
  document.getElementById("start-screen").style.display = "flex";
  document.getElementById("wrapper").style.display = "none";
}

document.getElementById("btn-start").addEventListener("click", () => {
  const input = document.getElementById("agent-count");
  let count = parseInt(input.value, 10);
  if (isNaN(count)) count = 12;
  count = Math.max(3, Math.min(12, count));
  document.getElementById("start-screen").style.display = "none";
  document.getElementById("wrapper").style.display = "flex";
  spawnAgents(count);
  if (!simStarted) {
    simStarted = true;
    requestAnimationFrame(mainLoop);
  }
});

document.getElementById("btn-reset").addEventListener("click", resetToSetup);

setInterval(() => {
  spawnFood();
}, 3000);
