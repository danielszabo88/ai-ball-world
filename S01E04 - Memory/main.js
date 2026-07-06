const agentWorld = {
  homes: [],
  messages: [],
};

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
  constructor(owner, x, y, width, height, color) {
    this.owner = owner;
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
      this.owner.name + "'s Home",
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

function sendMessage(from, to, text) {
  agentWorld.messages.push(new Message(from, to, text));
}

function detectNearbyAgents(agent, radius = 80) {
  const nearby = [];
  for (let i = 0; i < physicsWorld.balls.length; i++) {
    const other = physicsWorld.balls[i];
    if (other === agent) continue;
    const dx = other.pos.x - agent.pos.x;
    const dy = other.pos.y - agent.pos.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= radius * radius) {
      nearby.push(other);
    }
  }
  return nearby;
}

function startConversation(agent1, agent2) {
  const now = Date.now();
  const conversation = {
    count: 1,
    turn: agent1,
    active: true,
  };
  agent1.conversation = conversation;
  agent2.conversation = conversation;
  agent1.isConversing = true;
  agent2.isConversing = true;
  agent1.conversationPartner = agent2;
  agent2.conversationPartner = agent1;
  agent1.target = null;
  agent2.target = null;
  agent1.vel.set(0, 0);
  agent2.vel.set(0, 0);
  agent1.hasReplied = true;
  agent2.hasReplied = false;
  agent1.replyTimeout = now + 1000;
  agent2.replyTimeout = now + 1000;
  sendMessage(agent1, agent2, "Hello!");
  agent1.addMemory("conversation", agent2, 5);
  agent2.addMemory("conversation", agent1, 5);
  conversation.count++;
  conversation.turn = agent2;
}

function endConversation(agent1, agent2) {
  const cooldown = 5000;
  const now = Date.now();
  agent1.isConversing = false;
  agent2.isConversing = false;
  agent1.conversation = null;
  agent2.conversation = null;
  agent1.conversationPartner = null;
  agent2.conversationPartner = null;
  agent1.conversationCooldownUntil = now + cooldown;
  agent2.conversationCooldownUntil = now + cooldown;
  agent1.hasReplied = false;
  agent2.hasReplied = false;
  agent1.replyTimeout = null;
  agent2.replyTimeout = null;
  agent1.pickRandomTarget();
  agent2.pickRandomTarget();
}

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

function drawMessages() {
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  agentWorld.messages = agentWorld.messages.filter((m) => m.isAlive());
  agentWorld.messages.forEach((m) => {
    const x = m.to.pos.x;
    const y = m.to.pos.y - m.to.r - 20;
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

function drawEnergyBars() {
  physicsWorld.balls.forEach((b) => {
    const width = 50;
    const height = 6;
    const x = b.pos.x - width / 2;
    const y = b.pos.y - b.r - 5;
    ctx.fillStyle = "lightgrey";
    ctx.fillRect(x, y, width, height);
    const idealValue =
      b.socialEnergy >= b.socialMin && b.socialEnergy <= b.socialMax;
    ctx.fillStyle = idealValue ? "green" : "salmon";
    const fill = (b.socialEnergy / 100) * width;
    ctx.fillRect(x, y, fill, height);
  });
}

function drawRelationships() {
  const agent = physicsWorld.selectedBall;
  if (!agent) return;
  for (const other of physicsWorld.balls) {
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

function renderBackground() {
  agentWorld.homes.forEach((h) => h.draw());
}

function renderOverlay() {
  drawRelationships();
  drawConversationLines();
  drawMessages();
  drawEnergyBars();
}

const agent1 = new Agent("Test A", 200, 200, 20, 1);
agent1.elasticity = 0.5;
const agent2 = new Agent("Test B", 300, 200, 20, 1);
const agent3 = new Agent("Test C", 250, 300, 20, 1);

agentWorld.homes.push(new Home(agent1, 40, 400, 120, 80, "lightgrey"));
agentWorld.homes.push(new Home(agent2, 260, 400, 120, 80, "lightgrey"));
agentWorld.homes.push(new Home(agent3, 480, 400, 120, 80, "lightgrey"));
