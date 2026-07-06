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

    this.memories = [];
  }

  pickRandomTarget() {
    const margin = 50;
    const x = margin + Math.random() * (canvas.width - 2 * margin);
    const y = margin + Math.random() * (canvas.height - 120 - 2 * margin);
    this.setTarget(x, y);
  }

  home() {
    return agentWorld.homes.find((home) => home.owner === this);
  }

  addMemory(type, agent, value, importance = 1) {
    const mem = new Memory(type, agent, value, importance);
    this.memories.push(mem);
    this.cleanUpMemories();
    console.log(this.name + " formed memory: " + type + " about " + agent.name);
  }

  updateSocial() {
    const home = this.home();
    if (this.isConversing) {
      this.social += 0.05;
    } else if (home.contains(this.pos.x, this.pos.y)) {
      this.social -= 0.02;
    } else {
      this.social -= 0.01;
    }
  }

  updateHunger() {
    this.hunger += 0.05;
    this.hunger = Math.min(this.hunger, 100);
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
  }

  seekAgents() {
    const nearby = detectNearbyAgents(this, 500);
    const validTargets = nearby.filter((a) => !a.isConversing && a !== this);
    const closest = findClosest(this, validTargets);
    if (!closest) {
      this.wander();
      return;
    }
    this.setTarget(closest.pos.x, closest.pos.y);
    this.state = "seeking_agent";
  }

  seekFood() {
    const closest = findClosest(this, getFoods());
    if (!closest) {
      this.wander();
      return;
    }
    this.setTarget(closest.pos.x, closest.pos.y);
    this.state = "seeking_food";
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

  knowsAgent(other) {
    return this.hasMemory("discovery", other);
  }

  discoverAgents() {
    const nearby = detectNearbyAgents(this, 100);
    for (const other of nearby) {
      if (other === this) continue;
      if (this.knowsAgent(other)) continue;
      this.addMemory("discovery", other, 0.1);
    }
  }

  checkCollisionMemories() {
    const nearby = detectNearbyAgents(this, 100);
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
      this.addMemory("collision", other, penalty);
    }
  }

  checkFoodCollision() {
    const foods = getFoods();
    for (const food of foods) {
      if (!checkBallBallCollision(this, food)) continue;
      this.hunger -= food.nutrition;
      this.hunger = Math.max(this.hunger, 0);
      this.addMemory("ate_food", this, food.nutrition);
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
    ctx.fillText(this.state, this.pos.x, this.pos.y - this.r + 50);
  }

  update(world) {
    const now = Date.now();

    this.discoverAgents();
    this.updateSocial();
    this.updateHunger();
    this.updateEnergy();
    this.checkFoodCollision();
    this.checkCollisionMemories();

    if (
      this.energy <= this.energyMin &&
      this.home() &&
      this.home().contains(this.pos.x, this.pos.y)
    ) {
      this.energy += 10;
    }

    if (this.isConversing) {
      // reply phase of conversation
      const conv = this.conversation;
      if (!conv || !conv.active) return;
      if (conv.turn !== this) return;

      if (!this.hasReplied && now > this.replyTimeout) {
        if (this.social > this.socialMax) {
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
        this.addMemory("conversation", this.conversationPartner, 1);
        this.conversationPartner.addMemory("conversation", this, 1);
      }

      return;
    }

    // detect nearby agents and start conversation if possible
    const inCooldown = now < this.conversationCooldownUntil;
    if (!inCooldown) {
      const nearby = detectNearbyAgents(this);
      if (nearby.length > 0) {
        const partner = nearby[0];
        if (!partner.isConversing && now > partner.conversationCooldownUntil) {
          startConversation(this, partner);
          return;
        }
      }
    }

    if (this.hunger > this.hungerThreshold) {
      this.seekFood();
    } else if (this.energy < this.energyMin) {
      this.goHome();
    } else if (this.social < this.socialMin) {
      this.seekAgents();
    } else if (this.social > this.socialMax) {
      this.goHome();
    } else {
      this.wander();
    }
  }
}
