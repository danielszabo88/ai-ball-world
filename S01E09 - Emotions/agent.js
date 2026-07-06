class Agent extends Ball {
  constructor(name, x, y, r, m) {
    super(x, y, r, m);

    this.name = name;

    this.isConversing = false;
    this.conversation = null;
    this.conversationPartner = null;
    this.conversationCooldownUntil = 0;
    this.hasReplied = false;
    this.replyTimeout = 0;

    this.socialMin = 30;
    this.socialMax = 70;
    this.social = randInt(this.socialMin, this.socialMax);

    this.hunger = 0;
    this.hungerThreshold = 60;

    this.energyMin = 40;
    this.energyMax = 80;
    this.energy = randInt(50, 80);

    this.state = "wandering";

    this.visionRadius = 150;
    this.visibleFoods = [];
    this.visibleAgents = [];
    this.currentAgentTarget = null;
    this.currentFoodTarget = null;

    this.memories = [];

    this.personality = {
      sociability: randFloat(-1, 1),
    };

    this.emotions = {
      stress: 20,
      satisfaction: 40,
      frustration: 0,
    };

    this.currentAction = "wander";
    this.actionCooldownUntil = 0;
    this.actionScores = {};

    this.actions = {
      eat: {
        score: () => this.scoreEat(),
        execute: () => this.seekFood(),
      },
      socialize: {
        score: () => this.scoreSocialize(),
        execute: () => this.seekAgents(),
      },
      rest: {
        score: () => this.scoreRest(),
        execute: () => this.goHome(),
      },
      wander: {
        score: () => this.scoreWander(),
        execute: () => this.wander(),
      },
    };
  }

  pickRandomTarget() {
    const margin = 50;
    const x = margin + Math.random() * (canvas.width - 2 * margin);
    const y = margin + Math.random() * (canvas.height - 120 - 2 * margin);
    this.setTarget(x, y);
  }

  pickSearchTarget(radius = 150) {
    const margin = 50;
    const x = this.pos.x + randInt(-radius, radius);
    const y = this.pos.y + randInt(-radius, radius);
    const clampedX = Math.max(margin, Math.min(canvas.width - margin, x));
    const clampedY = Math.max(margin, Math.min(canvas.height - 150, y));
    this.setTarget(clampedX, clampedY);
  }

  search(state) {
    const reachedTarget = !this.target;
    if (reachedTarget) {
      this.pickSearchTarget();
    }
    this.state = state;
  }

  home() {
    return agentWorld.homes.find((home) => home.owner === this);
  }

  addMemory(type, agent, value, importance = 1) {
    if (type === "collision") {
      importance *= 1 + this.emotions.stress * 0.01;
    }
    if (type === "got_rejected") {
      importance *= 1 + this.emotions.frustration * 0.02;
    }
    if (type === "food_stolen") {
      importance *= 1 + this.emotions.frustration * 0.02;
    }
    const mem = new Memory(type, agent, value, importance);
    this.memories.push(mem);
    this.cleanUpMemories();
  }

  updatePerception() {
    this.visibleFoods = [];
    this.visibleAgents = [];
    const radiusSq = this.visionRadius * this.visionRadius;
    for (const food of getFoods()) {
      const dx = food.pos.x - this.pos.x;
      const dy = food.pos.y - this.pos.y;
      if (dx * dx + dy * dy < radiusSq) {
        this.visibleFoods.push(food);
      }
    }
    for (const other of getAgents()) {
      if (other === this) continue;
      const dx = other.pos.x - this.pos.x;
      const dy = other.pos.y - this.pos.y;
      if (dx * dx + dy * dy < radiusSq) {
        this.visibleAgents.push(other);
      }
    }
  }

  scoreEat() {
    let score = this.hunger;
    score *= 1 + this.emotions.stress * 0.01;
    return score;
  }

  scoreSocialize() {
    const missingSocial = 100 - this.social;
    const sociability = this.personality.sociability;
    const personalityFactor = 1 + sociability * 0.25;
    let score = missingSocial * personalityFactor;
    score *= 1 - this.emotions.frustration * 0.005;
    score *= 1 + this.emotions.satisfaction * 0.01;
    return score;
  }

  scoreRest() {
    const missingEnergy = 100 - this.energy;
    let score = (missingEnergy * missingEnergy) / 100;
    score *= 1 + this.emotions.stress * 0.01;
    return score;
  }

  scoreWander() {
    return 40 + this.emotions.satisfaction * 0.3;
  }

  evaluateActions() {
    const scores = {};
    for (const [name, action] of Object.entries(this.actions)) {
      scores[name] = clamp(action.score(), 0, 100);
    }
    return scores;
  }

  selectBestAction(scores) {
    const now = Date.now();
    if (this.currentAction && now < this.actionCooldownUntil) {
      return this.currentAction;
    }

    let bestAction = null;
    let bestScore = -Infinity;

    for (const [actionName, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestAction = actionName;
      }
    }

    if (bestAction !== this.currentAction) {
      this.actionCooldownUntil = now + 2000; // 2 second cooldown for switching actions
    }
    return bestAction;
  }

  executeAction(actionName) {
    const action = this.actions[actionName];
    if (!action) {
      return;
    }
    action.execute();
    this.currentAction = actionName;
    this.state = actionName;
  }

  addEmotionEvent(type, value) {
    switch (type) {
      case "stress":
        this.emotions.stress = clamp(this.emotions.stress + value, 0, 100);
        break;

      case "satisfaction":
        this.emotions.satisfaction = clamp(
          this.emotions.satisfaction + value,
          0,
          100,
        );
        break;

      case "frustration":
        this.emotions.frustration = clamp(
          this.emotions.frustration + value,
          0,
          100,
        );
        break;
    }
  }

  updateSocial() {
    const home = this.home();
    const sociability = this.personality.sociability;
    if (this.isConversing) {
      const gain = 0.05 - sociability * 0.02;
      this.social += gain;
    } else if (home.contains(this.pos.x, this.pos.y)) {
      const recovery = 0.02 - sociability * 0.005;
      this.social -= recovery;
    } else {
      const recovery = 0.01 - sociability * 0.005;
      this.social -= recovery;
    }

    this.social = Math.max(0, Math.min(100, this.social));
  }

  updateHunger() {
    this.hunger += 0.05;
    this.hunger = clamp(this.hunger);
  }

  updateEnergy() {
    const moving = this.vel.magSq() > 0.05;
    if (moving) {
      this.energy -= 0.03;
    }
    if (this.isConversing) {
      this.energy += 0.01;
    }
    const home = this.home();
    if (home && home.contains(this.pos.x, this.pos.y)) {
      this.energy += 0.05;
    }
    this.energy = clamp(this.energy);
  }

  seekAgents() {
    let closest = this.currentAgentTarget;
    if (!closest) {
      closest = this.findBestConversationPartner();
      this.currentAgentTarget = closest;
    }
    if (!closest) {
      this.search("searching_agent");
      return;
    }
    this.setTarget(closest.pos.x, closest.pos.y);
    this.state = "seeking_agent";
  }

  updateTargetStatus() {
    if (this.currentAgentTarget) {
      const stillVisible = this.visibleAgents.includes(this.currentAgentTarget);
      const stillValid = !this.currentAgentTarget.isConversing;
      if (!stillVisible || !stillValid) {
        this.currentAgentTarget = null;
        if (this.state === "seeking_agent") {
          this.target = null;
        }
      }
    }
  }

  updateFoodTargetStatus() {
    if (!this.currentFoodTarget) {
      return;
    }
    const stillExists = physicsWorld.balls.includes(this.currentFoodTarget);
    if (!stillExists) {
      this.onFoodTargetLost();
      this.currentFoodTarget = null;
    }
  }

  updateEmotions() {
    const idealHunger = this.hunger < this.hungerThreshold;
    const idealEnergy =
      this.energy > this.energyMin && this.energy < this.energyMax;
    const idealSocial =
      this.social > this.socialMin && this.social < this.socialMax;

    if (this.hunger > this.hungerThreshold) {
      this.addEmotionEvent("stress", 0.1);
    }
    if (this.energy < this.energyMin) {
      this.addEmotionEvent("stress", 0.1);
    }
    this.emotions.stress *= 0.996;

    if (idealHunger && idealEnergy && idealSocial) {
      this.addEmotionEvent("satisfaction", 0.3);
    }
    this.emotions.satisfaction *= 0.999;

    this.emotions.frustration *= 0.999;

    if (this.emotions.frustration < 30 && this.emotions.satisfaction > 40) {
      this.addEmotionEvent("stress", -0.2);
    }
  }

  seekFood() {
    let closest = this.currentFoodTarget;
    if (!closest) {
      closest = findClosest(this, this.visibleFoods);
      this.currentFoodTarget = closest;
    }
    if (!closest) {
      this.search("searching_food");
      return;
    }
    this.setTarget(closest.pos.x, closest.pos.y);
    this.state = "seeking_food";
  }

  onFoodTargetLost() {
    if (this.currentAction !== "eat") {
      return;
    }
    const thief = this.currentFoodTarget.eatenBy;
    if (!thief || thief === this) {
      return;
    }
    this.addMemory("food_stolen", thief, -5, 3);
    this.addEmotionEvent("frustration", 25);
    console.log("Food stolen by ", thief);
  }

  goHome() {
    const home = this.home();
    if (!home) {
      return;
    }
    const center = home.center();
    this.setTarget(center.x, center.y);
    this.state = "going_home";
  }

  wander() {
    if (!this.target) {
      this.pickRandomTarget();
    }
    this.state = "wandering";
  }

  getMemoriesOf(agent) {
    return this.memories.filter((mem) => mem.agentId === agent.id);
  }

  hasMemory(type, agent) {
    return this.getMemoriesOf(agent).some((mem) => mem.type === type);
  }

  getRecentMemories(type, agent, maxAgeMs) {
    const now = Date.now();
    return this.getMemoriesOf(agent).filter(
      (mem) => mem.type === type && now - mem.createdAt <= maxAgeMs,
    );
  }

  knowsAgent(other) {
    return this.hasMemory("discovery", other);
  }

  discoverAgents() {
    const nearby = this.visibleAgents;
    for (const other of nearby) {
      if (other === this) continue;
      if (this.knowsAgent(other)) continue;
      this.addMemory("discovery", other, 0.1);
    }
  }

  checkCollisionMemories() {
    const nearby = this.visibleAgents;
    for (const other of nearby) {
      if (other === this) continue;
      if (!this.knowsAgent(other)) continue;
      if (!checkBallBallCollision(this, other)) continue;
      let penalty = -0.1;
      if (this.isConversing) {
        penalty -= 1;
      }
      const ownHome = this.home();
      if (ownHome && ownHome.contains(other.pos.x, other.pos.y)) {
        penalty -= 0.5;
      }
      this.addEmotionEvent("frustration", 3);
      this.addMemory("collision", other, penalty);
    }
  }

  checkFoodCollision() {
    const foods = getFoods();
    for (const food of foods) {
      if (!checkBallBallCollision(this, food)) continue;
      this.hunger -= food.nutrition;
      this.hunger = Math.max(this.hunger, 0);
      this.addEmotionEvent("stress", -15);
      this.addEmotionEvent("satisfaction", 20);
      this.addMemory("ate_food", this, food.nutrition);
      food.eatenBy = this;
      const index = physicsWorld.balls.indexOf(food);
      if (index != -1) {
        physicsWorld.balls.splice(index, 1);
      }
    }
  }

  calculateRelationship(other) {
    let total = 0;
    const memories = this.getMemoriesOf(other);
    for (const mem of memories) {
      total += mem.getWeight();
    }
    return total;
  }

  findBestConversationPartner() {
    let bestPartner = null;
    let bestScore = -Infinity;
    for (const other of this.visibleAgents) {
      if (other === this) continue;
      if (other.isConversing) continue;
      if (this.getRecentMemories("got_rejected", other, 5000).length > 0)
        continue;
      const score = this.calculateRelationship(other);
      if (score > bestScore) {
        bestScore = score;
        bestPartner = other;
      }
    }
    return bestPartner;
  }

  acceptConversation(requester) {
    const relationship = this.calculateRelationship(requester);
    const socialNeed = 100 - this.social;
    let chance = 40;
    chance += relationship * 6;
    chance += socialNeed * 0.4;
    chance = Math.max(5, Math.min(95, chance));
    return Math.random() * 100 < chance;
  }

  requestConversation(target) {
    if (!target) return false;
    const accepted = target.acceptConversation(this);
    if (accepted) {
      startConversation(this, target);
      return true;
    }
    sendMessage(target, this, "NO");
    this.addEmotionEvent("frustration", 20);
    this.addMemory("got_rejected", target, -2, 2);
    target.addMemory("rejecting", this, -0.5, 1);
    this.currentAgentTarget = null;
    this.target = null;
    this.currentAction = "wander";
    this.vel.set(0, 0);
    return false;
  }

  getMemoryStats(agent) {
    let positive = 0;
    let negative = 0;
    const memories = this.getMemoriesOf(agent);
    for (const mem of memories) {
      if (mem.value > 0) {
        positive++;
      } else {
        negative++;
      }
    }
    return { positive, negative };
  }

  cleanUpMemories() {
    this.memories = this.memories.filter((mem) => {
      if (mem.type === "discovery") {
        return true; // always keep discovery memories
      }
      return Math.abs(mem.getWeight()) > 0.05;
    });
  }

  display() {
    super.display();
    ctx.fillStyle = "black";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(this.name, this.pos.x, this.pos.y - this.r - 25);

    const sociability = this.personality.sociability;
    ctx.fillStyle = "black";
    ctx.fillText(`${sociability.toFixed(2)}`, this.pos.x, this.pos.y);
  }

  update(world) {
    const now = Date.now();
    if (now < 1000) return;

    this.updatePerception();
    this.updateTargetStatus();
    this.updateFoodTargetStatus();
    this.discoverAgents();
    this.updateSocial();
    this.updateHunger();
    this.updateEnergy();
    this.checkFoodCollision();
    this.updateEmotions();
    this.checkCollisionMemories();

    this.actionScores = this.evaluateActions();

    if (this.isConversing) {
      // reply phase of conversation
      const conv = this.conversation;
      if (!conv || !conv.active) return;
      if (conv.turn !== this) return;

      if (!this.hasReplied && now > this.replyTimeout) {
        const sociability = this.personality.sociability;
        const effectiveMaxSocial = this.socialMax + sociability * 10;
        if (this.social > effectiveMaxSocial) {
          endConversation(this, this.conversationPartner);
          return;
        }

        const text = "Hello " + conv.count;
        sendMessage(this, this.conversationPartner, text);
        conv.count++;
        conv.turn = this.conversationPartner;
        this.hasReplied = true;
        this.conversationPartner.hasReplied = false;
        this.conversationPartner.replyTimeout = now + 1000;
      }

      return;
    }

    // detect nearby agents and start conversation if possible
    const inCooldown = now < this.conversationCooldownUntil;
    const canInteract =
      !inCooldown &&
      this.currentAction === "socialize" &&
      this.currentAgentTarget &&
      this.visibleAgents.includes(this.currentAgentTarget);

    if (canInteract) {
      this.requestConversation(this.currentAgentTarget);
      return;
    }

    const bestAction = this.selectBestAction(this.actionScores);
    this.executeAction(bestAction);
  }
}
