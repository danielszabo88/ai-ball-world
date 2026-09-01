const CONVERSATION = {
  REPLY_DELAY: 1000,
  REQUEST_TIMEOUT: 3000,
  REJECTION_COOLDOWN: 5000,
  COOLDOWN_AFTER_END: 5000,
  RESOLUTION_DELAY: 500,
};

class Agent extends Ball {
  constructor(name, x, y, r, m) {
    super(x, y, r, m);
    // === Identity ===
    this.name = name;

    // === Conversation state ===
    this.isConversing = false;
    this.conversation = null;
    this.conversationPartner = null;
    this.conversationCooldownUntil = 0;
    this.interactionRadius = 90;
    this.pendingConversation = null;
    this.pendingIncomingRequest = null;
    this.requestSentAt = 0;
    this.replyTimeout = 0;
    this.lastRequestOutcome = null;

    // === Needs ===
    this.socialMin = 30;
    this.socialMax = 70;
    this.social = randInt(this.socialMin, this.socialMax);
    this.hunger = 0;
    this.hungerThreshold = 60;
    this.energyMin = 40;
    this.energyMax = 80;
    this.energy = randInt(50, 80);

    // === Perception ===
    this.visionRadius = 150;
    this.visibleFoods = [];
    this.visibleAgents = [];
    this.currentAgentTarget = null;
    this.currentFoodTarget = null;

    // === Memory, personality, emotion ===
    this.memories = [];
    this.personality = {
      sociability: randFloat(-1, 1),
    };
    this.emotions = {
      stress: 20,
      satisfaction: 40,
      frustration: 0,
    };

    // === Planner state ===
    this.goalCooldownUntil = 0;
    this.goalScores = {};
    this.currentGoal = null;
    this.currentPlan = [];
    this.currentTaskIndex = 0;
    this.plans = {
      wander: ["wander"],
      rest: ["go_home", "rest"],
      eat: ["find_food", "move_to_food", "eat_food"],
      socialize: [
        "find_partner",
        "approach_partner",
        "request_conversation",
        "wait_for_response",
        "converse",
      ],
    };
    this.tasks = {
      wander: {
        execute: () => {
          if (!this.target) {
            this.pickSearchTarget();
          }
        },
        isComplete: () => {
          return this.target == null;
        },
        hasFailed: () => {
          return false;
        },
      },

      go_home: {
        execute: () => {
          const home = this.home();
          if (!home) {
            return;
          }
          const center = home.center();
          this.setTarget(center.x, center.y);
        },
        isComplete: () => {
          return this.target == null;
        },
        hasFailed: () => {
          return !this.home();
        },
      },

      rest: {
        execute: () => {},
        isComplete: () => {
          return this.energy >= this.energyMax;
        },
        hasFailed: () => {
          return false;
        },
      },

      find_food: {
        execute: () => {
          if (this.currentFoodTarget) {
            return;
          }
          this.currentFoodTarget = findClosest(this, this.visibleFoods);
          if (!this.currentFoodTarget) {
            this.search("searching_food");
          }
        },
        isComplete: () => {
          return this.currentFoodTarget != null;
        },
        hasFailed: () => {
          return false;
        },
      },

      move_to_food: {
        execute: () => {
          if (!this.currentFoodTarget) {
            return;
          }
          this.setTarget(
            this.currentFoodTarget.pos.x,
            this.currentFoodTarget.pos.y,
          );
        },
        isComplete: () => {
          return (
            this.currentFoodTarget &&
            checkBallBallCollision(this, this.currentFoodTarget)
          );
        },
        hasFailed: () => {
          return (
            !this.currentFoodTarget ||
            !physicsWorld.balls.includes(this.currentFoodTarget)
          );
        },
      },

      eat_food: {
        execute: () => {},
        isComplete: () => {
          return this.currentFoodTarget == null;
        },
        hasFailed: () => {
          return false;
        },
      },

      find_partner: {
        execute: () => {
          if (this.currentAgentTarget) return;
          this.currentAgentTarget = this.findBestConversationPartner();
          if (!this.currentAgentTarget) {
            this.search("searching_agent");
          }
        },
        isComplete: () => {
          return this.currentAgentTarget != null;
        },
        hasFailed: () => {
          return false;
        },
      },

      approach_partner: {
        execute: () => {
          if (!this.currentAgentTarget) {
            return;
          }
          this.setTarget(
            this.currentAgentTarget.pos.x,
            this.currentAgentTarget.pos.y,
          );
        },
        isComplete: () => {
          return (
            this.currentAgentTarget &&
            this.canInteractWith(this.currentAgentTarget)
          );
        },
        hasFailed: () => {
          return (
            !this.currentAgentTarget || this.currentAgentTarget.isConversing
          );
        },
      },

      request_conversation: {
        execute: () => {
          if (!this.currentAgentTarget) return;
          if (this.pendingConversation) return;
          const target = this.currentAgentTarget;
          const sent = this.requestConversation(target);
          if (sent) {
            this.target = null;
            target.target = null;
            this.frozen = true;
            target.frozen = true;
            target.pendingIncomingRequest = this;
            target.currentGoal = "respond_to_request";
            target.currentPlan = ["respond_to_request"];
            target.currentTaskIndex = 0;
          }
        },
        isComplete: () => this.pendingConversation != null,
        hasFailed: () => {
          return (
            !this.currentAgentTarget ||
            Date.now() - this.requestSentAt > CONVERSATION.REQUEST_TIMEOUT
          );
        },
      },

      wait_for_response: {
        execute: () => {},
        isComplete: () => this.isConversing,
        hasFailed: () => {
          if (this.isConversing) return false;
          if (this.lastRequestOutcome === "rejected") return true;
          return Date.now() - this.requestSentAt > CONVERSATION.REQUEST_TIMEOUT;
        },
      },

      converse: {
        execute: () => {
          if (!this.isConversing) return;
          const conv = this.conversation;
          if (!conv || !conv.active) return;

          if (this.hunger > 95) {
            endConversation(
              this,
              this.conversationPartner,
              `${this.name} too hungry`,
            );
            return;
          }
          if (this.energy < 30) {
            endConversation(
              this,
              this.conversationPartner,
              `${this.name} too tired`,
            );
            return;
          }

          if (conv.turn !== this) return;
          if (Date.now() < this.replyTimeout) return;
          const sociability = this.personality.sociability;
          const effectiveMaxSocial = this.socialMax + sociability * 10;
          if (this.social > effectiveMaxSocial) {
            endConversation(
              this,
              this.conversationPartner,
              `${this.name} satisfied (social ${this.social.toFixed(0)})`,
            );
            return;
          }

          const text = "Hello " + conv.count;
          sendMessage(this, this.conversationPartner, text);
          conv.count++;
          conv.turn = this.conversationPartner;
          this.conversationPartner.replyTimeout =
            Date.now() + CONVERSATION.REPLY_DELAY;
        },
        isComplete: () => {
          return !this.isConversing;
        },
        hasFailed: () => {
          return false;
        },
      },

      respond_to_request: {
        execute: () => {},
        isComplete: () => {
          return !this.pendingIncomingRequest;
        },
        hasFailed: () => false,
      },
    };
  }

  // ====================================================================
  // MOVEMENT & TARGETING
  // ====================================================================
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
  search() {
    if (!this.target) {
      this.pickSearchTarget();
    }
  }
  home() {
    return agentWorld.homes.find((home) => home.owners.includes(this));
  }

  // ====================================================================
  // MEMORY
  // ====================================================================
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
  cleanUpMemories() {
    this.memories = this.memories.filter((mem) => {
      if (mem.type === "discovery") {
        return true; // always keep discovery memories
      }
      return Math.abs(mem.getWeight()) > 0.05;
    });
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
  calculateRelationship(other) {
    let total = 0;
    const memories = this.getMemoriesOf(other);
    for (const mem of memories) {
      total += mem.getWeight();
    }
    return total;
  }

  // ====================================================================
  // PERCEPTION
  // ====================================================================
  updatePerception() {
    this.visibleFoods = [];
    this.visibleAgents = [];
    const radiusSq = this.visionRadius * this.visionRadius;
    const nearby = getNearbyBalls(this.pos, this.visionRadius);
    for (const b of nearby) {
      if (b === this) continue;
      if (distanceSquared(b.pos, this.pos) >= radiusSq) continue;
      if (b instanceof Food) {
        this.visibleFoods.push(b);
      } else if (b instanceof Agent) {
        this.visibleAgents.push(b);
      }
    }
  }

  updateTargetStatus() {
    if (this.currentAgentTarget) {
      const stillVisible = this.visibleAgents.includes(this.currentAgentTarget);
      const stillValid = !this.currentAgentTarget.isConversing;
      if (!stillVisible || !stillValid) {
        this.currentAgentTarget = null;
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
  discoverAgents() {
    const nearby = this.visibleAgents;
    for (const other of nearby) {
      if (other === this) continue;
      if (this.knowsAgent(other)) continue;
      this.addMemory("discovery", other, 0.1);
      logEvent(`${this.name} discovered ${other.name}`);
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
      logEvent(`${this.name} ate food (+${food.nutrition})`);
      food.eatenBy = this;
      const index = physicsWorld.balls.indexOf(food);
      if (index != -1) {
        physicsWorld.balls.splice(index, 1);
      }
    }
  }

  // ====================================================================
  // NEEDS & EMOTIONS
  // ====================================================================
  updateSocial() {
    const home = this.home();
    const sociability = this.personality.sociability;
    if (this.isConversing) {
      const gain = 0.05 - sociability * 0.02;
      this.social += gain;
    } else if (home && home.contains(this.pos.x, this.pos.y)) {
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
  onFoodTargetLost() {
    if (this.currentGoal !== "eat") {
      return;
    }
    const thief = this.currentFoodTarget.eatenBy;
    if (!thief || thief === this) {
      return;
    }
    this.addMemory("food_stolen", thief, -5, 3);
    this.addEmotionEvent("frustration", 25);
    logEvent(`${thief.name} stole food from ${this.name}`, "log-danger");
  }

  // ====================================================================
  // GOAL SCORING
  // ====================================================================
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
  evaluateGoals() {
    return {
      eat: clamp(this.scoreEat(), 0, 100),
      socialize: clamp(this.scoreSocialize(), 0, 100),
      rest: clamp(this.scoreRest(), 0, 100),
      wander: clamp(this.scoreWander(), 0, 100),
    };
  }
  selectBestGoal(scores) {
    let bestGoal = null;
    let bestScore = -Infinity;
    for (const [goal, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestGoal = goal;
      }
    }
    return bestGoal;
  }

  // ====================================================================
  // PLANNER (GOAL -> PLAN -> TASK)
  // ====================================================================
  startPlan(goalName) {
    this.currentGoal = goalName;
    this.currentPlan = [...this.plans[goalName]];
    this.currentTaskIndex = 0;
  }
  abortPlan() {
    this.target = null;
    this.currentFoodTarget = null;
    this.currentAgentTarget = null;
    this.currentGoal = null;
    this.currentPlan = [];
    this.currentTaskIndex = 0;
    if (
      !this.isConversing &&
      !this.pendingIncomingRequest &&
      !this.pendingConversation
    ) {
      this.frozen = false;
    }
  }
  updatePlan() {
    if (this.currentPlan.length === 0) {
      return;
    }
    if (this.currentTaskIndex >= this.currentPlan.length) {
      this.abortPlan();
      return;
    }
    const taskName = this.currentPlan[this.currentTaskIndex];
    const task = this.tasks[taskName];
    task.execute();
    if (task.hasFailed()) {
      this.abortPlan();
      return;
    }
    if (task.isComplete()) {
      this.currentTaskIndex++;
    }
    if (this.currentTaskIndex >= this.currentPlan.length) {
      this.abortPlan();
    }
  }

  // ====================================================================
  // CONVERSATION HANDSHAKE
  // ====================================================================
  findBestConversationPartner() {
    let bestPartner = null;
    let bestScore = -Infinity;
    for (const other of this.visibleAgents) {
      if (other === this) continue;
      if (other.isConversing) continue;
      if (Date.now() < other.conversationCooldownUntil) continue;
      if (
        this.getRecentMemories(
          "got_rejected",
          other,
          CONVERSATION.REJECTION_COOLDOWN,
        ).length > 0
      )
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
  canInteractWith(other) {
    return (
      distanceSquared(other.pos, this.pos) <=
      this.interactionRadius * this.interactionRadius
    );
  }
  requestConversation(target) {
    if (!target) return false;
    this.pendingConversation = target;
    this.requestSentAt = Date.now();
    logEvent(`${this.name} → ${target.name} request`);
    return true;
  }
  resolveConversationRequest() {
    if (!this.pendingConversation) return;
    const other = this.pendingConversation;
    if (!other || !getAgents().includes(other)) {
      this.pendingConversation = null;
      return;
    }
    const elapsed = Date.now() - this.requestSentAt;
    if (elapsed > CONVERSATION.RESOLUTION_DELAY) {
      if (!this.canInteractWith(other)) {
        this.pendingConversation = null;
        this.requestSentAt = null;
        this.currentAgentTarget = null;
        this.target = null;
        other.frozen = false;
        other.pendingIncomingRequest = null;
        return;
      }
    }
    if (elapsed < CONVERSATION.RESOLUTION_DELAY) return;
    if (other.pendingConversation && other.pendingConversation !== this) return;
    const accepted = other.acceptConversation(this);
    if (accepted && startConversation(this, other)) {
      other.pendingConversation = null;
      other.requestSentAt = null;
      this.lastRequestOutcome = "accepted";
      logEvent(`${other.name} accepted ${this.name}`, "log-success");
    } else {
      sendMessage(other, this, "NO");
      this.addEmotionEvent("frustration", 20);
      this.addMemory("got_rejected", other, -2, 2);
      other.addMemory("rejecting", this, -0.5, 1);
      this.currentAgentTarget = null;
      this.target = null;
      this.frozen = false;
      other.frozen = false;
      other.pendingIncomingRequest = null;
      this.lastRequestOutcome = "rejected";
      const rel = other.calculateRelationship(this).toFixed(1);
      const need = (100 - other.social).toFixed(0);
      logEvent(
        `${other.name} rejected ${this.name} (rel ${rel}, need ${need})`,
        "log-danger",
      );
    }
    this.pendingConversation = null;
    this.requestSentAt = null;
  }

  // ====================================================================
  // DISPLAY
  // ====================================================================
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

  // ====================================================================
  // MAIN UPDATE LOOP
  // ====================================================================
  update(world) {
    const now = Date.now();
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

    if (!this.isConversing) {
      this.resolveConversationRequest();
    }
    this.goalScores = this.evaluateGoals();
    const bestGoal = this.selectBestGoal(this.goalScores);
    const shouldSwitch =
      bestGoal !== this.currentGoal && Date.now() >= this.goalCooldownUntil;
    if (
      !this.isConversing &&
      !this.pendingIncomingRequest &&
      !this.pendingConversation &&
      (this.currentPlan.length === 0 || shouldSwitch)
    ) {
      this.abortPlan();
      this.startPlan(bestGoal);
      this.goalCooldownUntil = Date.now() + 2000;
    }
    this.updatePlan();
  }
}
