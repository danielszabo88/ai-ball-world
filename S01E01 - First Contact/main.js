const agent1 = new Agent("Test A", 200, 200, 20, 1);
agent1.elasticity = 0.5;
const agent2 = new Agent("Test B", 300, 200, 20, 1);
const agent3 = new Agent("Test C", 250, 300, 20, 1);

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