const simControls = {
  paused: false,
  speedMultiplier: 1,
};
const SPEED_STEPS = [0.25, 0.5, 1, 2];
const MAX_LOG_ENTRIES = 50;
const eventLog = [];
let currentInspectedAgent = null;

document.getElementById("btn-pause").addEventListener("click", (e) => {
  simControls.paused = !simControls.paused;
  e.currentTarget.textContent = simControls.paused ? "Play" : "Pause";
});

document.getElementById("speed-slider").addEventListener("input", (e) => {
  simControls.speedMultiplier = SPEED_STEPS[parseInt(e.target.value, 10)];
  document.getElementById("speed-label").textContent =
    simControls.speedMultiplier + "x";
});

function renderStatsPanel() {
  const agents = getAgents();
  if (agents.length === 0) return;

  const totals = agents.reduce(
    (acc, a) => {
      acc.hunger += a.hunger;
      acc.energy += a.energy;
      acc.social += a.social;
      acc.stress += a.emotions.stress;
      acc.satisfaction += a.emotions.satisfaction;
      acc.frustration += a.emotions.frustration;
      return acc;
    },
    {
      hunger: 0,
      energy: 0,
      social: 0,
      stress: 0,
      satisfaction: 0,
      frustration: 0,
    },
  );

  const avg = (v) => Math.round(v / agents.length);
  document.getElementById("stat-hunger").textContent = avg(totals.hunger);
  document.getElementById("stat-energy").textContent = avg(totals.energy);
  document.getElementById("stat-social").textContent = avg(totals.social);
  document.getElementById("stat-stress").textContent = avg(totals.stress);
  document.getElementById("stat-satisfaction").textContent = avg(
    totals.satisfaction,
  );
  document.getElementById("stat-frustration").textContent = avg(
    totals.frustration,
  );
}

function logEvent(text, className = "log-social") {
  eventLog.push({ time: Date.now(), text, className });
  if (eventLog.length > MAX_LOG_ENTRIES) {
    eventLog.shift();
  }
}

function renderEventLog() {
  const container = document.getElementById("log-entries");
  container.innerHTML = "";
  for (let i = eventLog.length - 1; i >= 0; i--) {
    const entry = eventLog[i];
    const seconds = Math.floor((entry.time % 100000) / 1000);
    const div = document.createElement("div");
    div.className = "log-entry";
    div.innerHTML =
      `<span class="log-time">${seconds}s</span>` +
      `<span class="${entry.className}">${entry.text}</span>`;
    container.appendChild(div);
  }
}

function renderInspector() {
  const agent =
    physicsWorld.selectedBall instanceof Agent
      ? physicsWorld.selectedBall
      : null;

  const empty = document.getElementById("inspector-empty");
  const content = document.getElementById("inspector-content");

  if (!agent) {
    empty.style.display = "";
    content.style.display = "none";
    currentInspectedAgent = null;
    return;
  }

  empty.style.display = "none";
  content.style.display = "flex";

  // rebuild DOM structure only when selected agent changes
  if (agent !== currentInspectedAgent) {
    buildInspectorDOM(content);
    currentInspectedAgent = agent;
  }
  updateInspectorValues(agent);
}

function buildInspectorDOM(container) {
  container.innerHTML = "";

  // --- Identity ---
  const identity = makeSection("identity", "Identity");
  identity.content.innerHTML = `
    <div class="inspector-row"><span class="key">name</span><span class="value" id="isp-name"></span></div>
    <div class="inspector-row"><span class="key">sociability</span><span class="value" id="isp-sociability"></span></div>
    <div class="inspector-row"><span class="key">goal</span><span class="value" id="isp-goal"></span></div>
    <div class="inspector-row"><span class="key">task</span><span class="value" id="isp-task"></span></div>
  `;
  container.appendChild(identity.section);

  // --- Needs ---
  const needs = makeSection("needs", "Needs");
  needs.content.innerHTML = `
    ${makeBarHTML("isp-hunger", "hunger")}
    ${makeBarHTML("isp-energy", "energy")}
    ${makeBarHTML("isp-social", "social")}
  `;
  container.appendChild(needs.section);

  // --- Emotions ---
  const emotions = makeSection("emotions", "Emotions");
  emotions.content.innerHTML = `
    ${makeBarHTML("isp-stress", "stress")}
    ${makeBarHTML("isp-satisfaction", "satisfaction")}
    ${makeBarHTML("isp-frustration", "frustration")}
  `;
  container.appendChild(emotions.section);

  // --- Goals ---
  const goals = makeSection("goals", "Goal Scores");
  goals.content.innerHTML = `
    <div class="inspector-row"><span class="key">eat</span><span class="value" id="isp-score-eat"></span></div>
    <div class="inspector-row"><span class="key">socialize</span><span class="value" id="isp-score-socialize"></span></div>
    <div class="inspector-row"><span class="key">rest</span><span class="value" id="isp-score-rest"></span></div>
    <div class="inspector-row"><span class="key">wander</span><span class="value" id="isp-score-wander"></span></div>
  `;
  container.appendChild(goals.section);

  // --- Memories ---
  const mems = makeSection("memories", "Memories");
  mems.content.id = "isp-memories-content";
  container.appendChild(mems.section);
}

function updateInspectorValues(agent) {
  // --- Identity ---
  document.getElementById("isp-name").textContent = agent.name;
  document.getElementById("isp-sociability").textContent =
    agent.personality.sociability.toFixed(2);
  document.getElementById("isp-goal").textContent = agent.currentGoal ?? "—";
  document.getElementById("isp-task").textContent =
    agent.currentPlan[agent.currentTaskIndex] ?? "—";

  // --- Needs ---
  const hungerOk = agent.hunger <= agent.hungerThreshold;
  const energyOk =
    agent.energy >= agent.energyMin && agent.energy <= agent.energyMax;
  const socialOk =
    agent.social >= agent.socialMin && agent.social <= agent.socialMax;

  updateBar("isp-hunger", agent.hunger, hungerOk ? "good" : "bad");
  updateBar("isp-energy", agent.energy, energyOk ? "good" : "bad");
  updateBar("isp-social", agent.social, socialOk ? "good" : "bad");

  // --- Emotions ---
  updateBar("isp-stress", agent.emotions.stress, "bad");
  updateBar("isp-satisfaction", agent.emotions.satisfaction, "good");
  updateBar("isp-frustration", agent.emotions.frustration, "bad");

  // --- Goals ---
  const scores = agent.goalScores;
  const best = Object.entries(scores).reduce((a, b) =>
    a[1] > b[1] ? a : b,
  )[0];
  for (const [name, score] of Object.entries(scores)) {
    const el = document.getElementById("isp-score-" + name);
    if (!el) continue;
    el.textContent = Math.round(score);
    el.style.color = name === best ? "#e67e22" : "#222";
  }

  // --- Memories ---
  const memContainer = document.getElementById("isp-memories-content");

  const allMemories = agent.memories
    .filter((mem) => mem.type !== "discovery")
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 12);

  if (allMemories.length === 0) {
    memContainer.innerHTML = `<span class="panel-empty">no memories yet</span>`;
    return;
  }

  const agentMap = {};
  for (const other of getAgents()) {
    agentMap[other.id] = other.name;
  }

  memContainer.innerHTML = allMemories
    .map((mem) => {
      const weight = mem.getWeight().toFixed(2);
      const cls = mem.value >= 0 ? "pos" : "neg";
      const agentName = agentMap[mem.agentId] ?? "?";
      return `<div class="memory-entry">
    <span class="mem-type">${mem.type} (${agentName})</span>
    <span class="mem-val ${cls}">${Number(weight) > 0 ? "+" : ""}${weight}</span>
  </div>`;
    })
    .join("");
}

function makeSection(id, title) {
  const section = document.createElement("div");
  section.className = "inspector-section";
  section.id = "isp-section-" + id;

  const heading = document.createElement("p");
  heading.className = "inspector-section-title";
  heading.textContent = title;

  const content = document.createElement("div");
  content.className = "inspector-section-content";

  section.appendChild(heading);
  section.appendChild(content);
  return { section, content };
}

function makeBarHTML(id, label) {
  return `
    <div class="inspector-bar-row">
      <span class="inspector-bar-label">${label}</span>
      <div class="inspector-bar-track">
        <div class="inspector-bar-fill" id="${id}-fill"></div>
      </div>
      <span class="inspector-bar-num" id="${id}-num"></span>
    </div>
  `;
}

function updateBar(id, value, colorClass) {
  document.getElementById(id + "-fill").style.width = value + "%";
  document.getElementById(id + "-fill").className =
    "inspector-bar-fill " + colorClass;
  document.getElementById(id + "-num").textContent = Math.round(value);
}

function renderFpsCounter(){
  const el = document.getElementById("fps-counter");
  if (el) el.textContent = `${currentFps} fps`;
}

function renderUI() {
  renderFpsCounter();
  renderStatsPanel();
  renderEventLog();
  renderInspector();
}
