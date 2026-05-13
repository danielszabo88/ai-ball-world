class Agent extends Ball {
  constructor(name, x, y, r, m) {
    super(x, y, r, m);
    this.name = name;
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
    if (!this.target) {
      this.pickRandomTarget();
    }
  }
}
