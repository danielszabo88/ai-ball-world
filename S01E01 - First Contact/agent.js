class Agent extends Ball {
  constructor(name, x, y, r, m) {
    super(x, y, r, m);

    this.name = name;

    this.isConversing = false;
    this.conversationPartner = null;
    this.conversationEndTime = 0;
    this.conversationCooldownUntil = 0;
    this.hasReplied = false;
    this.replyTimeout = 0;
  }

  pickRandomTarget() {
    const margin = 50;
    const x = margin + Math.random() * (canvas.width - 2 * margin);
    const y = margin + Math.random() * (canvas.height - 2 * margin);
    this.setTarget(x, y);
  }

  update(world) {
    if (this.player) {
      return;
    }
    const now = Date.now();
    if(now < 1000) return; //skip first second to let things settle

    if (this.isConversing) {
      // reply phase of conversation
      if(!this.hasReplied && now > this.replyTimeout) {
        sendMessage(this, this.conversationPartner, "Hello!");
        this.hasReplied = true;
        const endTime = now + 3000;
        this.conversationEndTime = endTime;
        this.conversationPartner.conversationEndTime = endTime;
      }

      // ending phase of conversation
      if (now > this.conversationEndTime && this.conversationEndTime !== 0) {
        endConversation(this, this.conversationPartner);
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

    if (!this.target) {
      this.pickRandomTarget();
    }
  }
}
