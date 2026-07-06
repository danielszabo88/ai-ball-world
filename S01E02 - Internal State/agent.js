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

    this.socialMin = 30
    this.socialMax = 70

    this.socialEnergy = randInt(this.socialMin, this.socialMax);

    this.state = "wandering";
  }

  pickRandomTarget() {
    const margin = 50;
    const x = margin + Math.random() * (canvas.width - 2 * margin);
    const y = margin + Math.random() * (canvas.height - 120 - 2 * margin);
    this.setTarget(x, y);
  }

  home() {
    return agentWorld.homes.find(home => home.owner === this);
  }

  updateSocialEnergy(){
    const home = this.home()
    if(this.isConversing){
      this.socialEnergy += 0.05
    } else if (home.contains(this.pos.x, this.pos.y)){
      this.socialEnergy -= 0.02
    } else {
      this.socialEnergy -= 0.01
    }
  }

  seekAgents(){
    const nearby = detectNearbyAgents(this, 500);
    if(nearby.length === 0){
      this.wander()
      return
    }
    let closest = nearby[0];
    let closestDist = Infinity

    for(const other of nearby){
      if(other.isConversing) continue;
      const dx = other.pos.x - this.pos.x;
      const dy = other.pos.y - this.pos.y;
      const distSq = dx*dx + dy*dy
      if(distSq < closestDist){
        closestDist = distSq
        closest = other
      }
    }
    this.setTarget(closest.pos.x, closest.pos.y)
    this.state = "seeking"
  }

  goHome(){
    const home = this.home()
    if(!home){
      return;
    }
    const center = home.center()
    this.setTarget(center.x, center.y)
    this.state = "going_home"
  }

  wander(){
    if(!this.target){
      this.pickRandomTarget()
    }
    this.state = "wandering"
  }

  display(){
    super.display()
    ctx.fillStyle = "black";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(this.name, this.pos.x, this.pos.y - this.r - 25);
    ctx.fillText(`Energy: ${this.socialEnergy.toFixed(1)}`, this.pos.x, this.pos.y - this.r + 10);
    ctx.fillText(this.state, this.pos.x, this.pos.y + this.r + 15);
  }

  update(world) {
    if (this.player) {
      return;
    }
    const now = Date.now();
    if(now < 1000) return; //skip first second to let things settle

    this.updateSocialEnergy();

    if (this.isConversing) {
      // reply phase of conversation
      const conv = this.conversation
      if(!conv || !conv.active) return
      if(conv.turn !== this) return

      if(!this.hasReplied && now > this.replyTimeout) {
        if(this.socialEnergy > this.socialMax){
          endConversation(this, this.conversationPartner)
          return
        }

        const text = "Hello " + conv.count
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

    if(this.socialEnergy < this.socialMin){
      this.seekAgents()
    } else if (this.socialEnergy > this.socialMax) {
      this.goHome()
    } else {
      this.wander()
    }
  }
}
