const counterDOM = document.getElementById("counter");
const endDOM = document.getElementById("end");
const highscoreDOM = document.getElementById("highscore");
const endScoreDOM = document.getElementById("end-score");
const coinDOM = document.getElementById("coinCounter");
const controllsDOM = document.getElementById("controlls");
const eagleWarningDOM = document.getElementById("eagleWarning");

function getHighScore(mode) {
  return parseInt(localStorage.getItem("crossyHighScore_" + mode)) || 0;
}
function setHighScore(mode, value) {
  localStorage.setItem("crossyHighScore_" + mode, value);
}
function getTotalCoins() {
  return parseInt(localStorage.getItem("crossyCoins")) || 0;
}
function setTotalCoins(value) {
  localStorage.setItem("crossyCoins", value);
}

let highScore = getHighScore("classic");
highscoreDOM.textContent = "Best: " + highScore;

// Music
let isMuted = false;
let midiPlayer = null;
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

let midiBuffer = null; // cache the file so we don't re-fetch it every time

function startMusic() {
  if (isMuted) return;
  const ctx = getAudioCtx();

  if (midiBuffer) {
    rebuildAndPlayMidiPlayer(ctx, midiBuffer);
    return;
  }

  fetch("music.mid")
    .then(res => res.arrayBuffer())
    .then(buffer => {
      midiBuffer = buffer;
      rebuildAndPlayMidiPlayer(ctx, buffer);
    });
}

function rebuildAndPlayMidiPlayer(ctx, buffer) {
  // Always create a fresh player instance so playback reliably restarts from the beginning.
  if (midiPlayer) {
    midiPlayer.stop();
    midiPlayer = null;
  }

  midiPlayer = new MidiPlayer.Player((event) => {
    if (isMuted) return;
    if (event.name === "Note on" && event.velocity > 0) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.value = 440 * Math.pow(2, (event.noteNumber - 69) / 12);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }
  });

  midiPlayer.on("endOfFile", () => {
    if (!isMuted) rebuildAndPlayMidiPlayer(ctx, buffer);
  });

  midiPlayer.loadArrayBuffer(buffer);
  midiPlayer.play();
}

function stopMusic() {
  if (midiPlayer) {
    midiPlayer.stop();
    midiPlayer = null;
  }
}

function playCoinSound() {
  if (isMuted) return;
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.setValueAtTime(1200, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  osc.start();
  osc.stop(ctx.currentTime + 0.15);
}

document.getElementById("muteBtn").addEventListener("click", () => {
  isMuted = !isMuted;
  document.getElementById("muteBtn").textContent = isMuted ? "🔇" : "🔊";
  if (isMuted) stopMusic(); else startMusic();
});

const scene = new THREE.Scene();

const distance = 500;
const camera = new THREE.OrthographicCamera(
  window.innerWidth / -2,
  window.innerWidth / 2,
  window.innerHeight / 2,
  window.innerHeight / -2,
  0.1,
  10000
);

camera.zoom = 0.5;
camera.updateProjectionMatrix();

camera.rotation.x = (50 * Math.PI) / 180;
camera.rotation.y = (20 * Math.PI) / 180;
camera.rotation.z = (10 * Math.PI) / 180;

const initialCameraPositionY = -Math.tan(camera.rotation.x) * distance;
const initialCameraPositionX =
  Math.tan(camera.rotation.y) *
  Math.sqrt(distance ** 2 + initialCameraPositionY ** 2);
camera.position.y = initialCameraPositionY;
camera.position.x = initialCameraPositionX;
camera.position.z = distance;

const zoom = 2;
const chickenSize = 15;
const positionWidth = 42;
const columns = 17;
const boardWidth = positionWidth * columns;
const stepTime = 200;

let lanes;
let currentLane;
let currentColumn;
let previousTimestamp;
let startMoving;
let moves;
let stepStartTimestamp;
let moveStartX = 0;
let gameOver;
let gameStarted = false;
let gameMode = "classic"; // "classic" or "arcade"
let laneEnterTime = 0;
const eagleTimeLimit = 10000; // ms before the eagle swoops in
let eagleWarningShown = false;
let coinCount = getTotalCoins();
coinDOM.textContent = "🪙 " + coinCount;

const carFrontTexture = new Texture(40, 80, [{ x: 0, y: 10, w: 30, h: 60 }]);
const carBackTexture = new Texture(40, 80, [{ x: 10, y: 10, w: 30, h: 60 }]);
const carRightSideTexture = new Texture(110, 40, [
  { x: 10, y: 0, w: 50, h: 30 },
  { x: 70, y: 0, w: 30, h: 30 },
]);
const carLeftSideTexture = new Texture(110, 40, [
  { x: 10, y: 10, w: 50, h: 30 },
  { x: 70, y: 10, w: 30, h: 30 },
]);

const truckFrontTexture = new Texture(30, 30, [{ x: 15, y: 0, w: 10, h: 30 }]);
const truckRightSideTexture = new Texture(25, 30, [{ x: 0, y: 15, w: 10, h: 10 }]);
const truckLeftSideTexture = new Texture(25, 30, [{ x: 0, y: 5, w: 10, h: 10 }]);

const generateLanes = () => {
  const result = [];
  [-9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach((index) => {
    const prevType = result.length > 0 ? result[result.length - 1].type : null;
    const lane = new Lane(index, prevType);
    lane.mesh.position.y = index * positionWidth * zoom;
    scene.add(lane.mesh);
    result.push(lane);
  });
  return result.filter((lane) => lane.index >= 0);
};

const addLane = () => {
  const index = lanes.length;
  const prevType = lanes.length > 0 ? lanes[lanes.length - 1].type : null;
  const lane = new Lane(index, prevType);
  lane.mesh.position.y = index * positionWidth * zoom;
  scene.add(lane.mesh);
  lanes.push(lane);
};

function getActiveSkin() {
  return localStorage.getItem("crossyActiveSkin") || "chicken";
}
function setActiveSkin(skinId) {
  localStorage.setItem("crossyActiveSkin", skinId);
}
function getUnlockedSkins() {
  const stored = localStorage.getItem("crossyUnlockedSkins");
  return stored ? JSON.parse(stored) : ["chicken"];
}
function unlockSkin(skinId) {
  const unlocked = getUnlockedSkins();
  if (!unlocked.includes(skinId)) {
    unlocked.push(skinId);
    localStorage.setItem("crossyUnlockedSkins", JSON.stringify(unlocked));
  }
}

const skinDefinitions = [
  { id: "chicken", name: "Chicken", cost: 0, previewClass: "preview-chicken" },
  { id: "pig", name: "Pig", cost: 10, previewClass: "preview-pig" },
  { id: "gifty", name: "Gifty", cost: 15, previewClass: "preview-gifty" },
  { id: "duck", name: "Baby Duck", cost: 15, previewClass: "preview-duck" },
  { id: "pigeon", name: "Poopy Pigeon", cost: 20, previewClass: "preview-pigeon" },
];

let chicken = CharacterModel(getActiveSkin());
scene.add(chicken);

const eagle = Eagle();
scene.add(eagle);
let eagleSwooping = false;

function swapCharacterModel(skinId) {
  scene.remove(chicken);
  chicken = CharacterModel(skinId);
  chicken.position.x = 0;
  chicken.position.y = currentLane ? currentLane * positionWidth * zoom : 0;
  scene.add(chicken);
  dirLight.target = chicken;
}

hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.6);
scene.add(hemiLight);

const initialDirLightPositionX = -100;
const initialDirLightPositionY = -100;
dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(initialDirLightPositionX, initialDirLightPositionY, 200);
dirLight.castShadow = true;
dirLight.target = chicken;
scene.add(dirLight);

dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
var d = 500;
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;

backLight = new THREE.DirectionalLight(0x000000, 0.4);
backLight.position.set(200, 200, 50);
backLight.castShadow = true;
scene.add(backLight);

const laneTypes = ["car", "truck", "forest", "tracks", "river"];
const laneSpeeds = [2, 2.5, 3];
const vechicleColors = [0xa52523, 0xbdb638, 0x78b14b];
const threeHeights = [20, 45, 60];
const trainSpeed = 9; // trains move much faster than cars
const trainWarningDuration = 1200; // ms of warning before the train actually arrives
const padDrift = [1, 1.5, 2]; // lily pad drift speeds, similar feel to vehicle lanes

function Coin() {
  const coin = new THREE.Mesh(
    new THREE.CylinderBufferGeometry(6 * zoom, 6 * zoom, 2 * zoom, 16),
    new THREE.MeshPhongMaterial({ color: 0xffd700, flatShading: true })
  );
  coin.rotation.x = Math.PI / 2;
  coin.position.z = 10 * zoom;
  coin.castShadow = true;
  return coin;
}

function addCoinsToLane(lane) {
  // Sparse coins: ~18% chance to place a single coin on this lane
  if (Math.random() < 0.18) {
    let position;
    let attempts = 0;
    do {
      position = Math.floor(Math.random() * columns);
      attempts++;
    } while (lane.occupiedPositions.has(position) && attempts < 20);
    if (!lane.occupiedPositions.has(position)) {
      const coin = new Coin();
      coin.position.x = (position * positionWidth + positionWidth / 2) * zoom - (boardWidth * zoom) / 2;
      lane.coinPositions.add(position);
      lane.coins.push(coin);
      lane.mesh.add(coin);
    }
  }
}

const initaliseValues = () => {
  lanes = generateLanes();
  currentLane = 0;
  currentColumn = Math.floor(columns / 2);
  previousTimestamp = null;
  startMoving = false;
  moves = [];
  stepStartTimestamp = null;
  gameOver = false;
  eagleWarningShown = false;
  eagleWarningDOM.classList.remove("active");
  swapCharacterModel(getActiveSkin()); // rebuild a fresh, unflattened, fully opaque character
  chicken.position.x = 0;
  chicken.position.y = 0;
  chicken.scale.z = 1;
  eagle.visible = false;
  eagleSwooping = false;
  camera.position.y = initialCameraPositionY;
  camera.position.x = initialCameraPositionX;
  dirLight.position.x = initialDirLightPositionX;
  dirLight.position.y = initialDirLightPositionY;
  // NOTE: laneEnterTime is intentionally NOT set here.
  // It gets set when the player actually presses Classic/Arcade (see startGame),
  // so the eagle timer never starts ticking before the game has begun.
};

initaliseValues();

const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true,
});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

function Texture(width, height, rects) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "rgba(0,0,0,0.6)";
  rects.forEach((rect) => {
    context.fillRect(rect.x, rect.y, rect.w, rect.h);
  });
  return new THREE.CanvasTexture(canvas);
}

function Wheel() {
  const wheel = new THREE.Mesh(
    new THREE.BoxBufferGeometry(12 * zoom, 33 * zoom, 12 * zoom),
    new THREE.MeshLambertMaterial({ color: 0x333333, flatShading: true })
  );
  wheel.position.z = 6 * zoom;
  return wheel;
}

function Car() {
  const car = new THREE.Group();
  const color = vechicleColors[Math.floor(Math.random() * vechicleColors.length)];
  const main = new THREE.Mesh(
    new THREE.BoxBufferGeometry(60 * zoom, 30 * zoom, 15 * zoom),
    new THREE.MeshPhongMaterial({ color, flatShading: true })
  );
  main.position.z = 12 * zoom;
  main.castShadow = true;
  main.receiveShadow = true;
  car.add(main);
  const cabin = new THREE.Mesh(
    new THREE.BoxBufferGeometry(33 * zoom, 24 * zoom, 12 * zoom),
    [
      new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: carBackTexture }),
      new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: carFrontTexture }),
      new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: carRightSideTexture }),
      new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: carLeftSideTexture }),
      new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true }),
      new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true }),
    ]
  );
  cabin.position.x = 6 * zoom;
  cabin.position.z = 25.5 * zoom;
  cabin.castShadow = true;
  cabin.receiveShadow = true;
  car.add(cabin);
  const frontWheel = new Wheel();
  frontWheel.position.x = -18 * zoom;
  car.add(frontWheel);
  const backWheel = new Wheel();
  backWheel.position.x = 18 * zoom;
  car.add(backWheel);
  car.castShadow = true;
  car.receiveShadow = false;
  return car;
}

function Truck() {
  const truck = new THREE.Group();
  const color = vechicleColors[Math.floor(Math.random() * vechicleColors.length)];
  const base = new THREE.Mesh(
    new THREE.BoxBufferGeometry(100 * zoom, 25 * zoom, 5 * zoom),
    new THREE.MeshLambertMaterial({ color: 0xb4c6fc, flatShading: true })
  );
  base.position.z = 10 * zoom;
  truck.add(base);
  const cargo = new THREE.Mesh(
    new THREE.BoxBufferGeometry(75 * zoom, 35 * zoom, 40 * zoom),
    new THREE.MeshPhongMaterial({ color: 0xb4c6fc, flatShading: true })
  );
  cargo.position.x = 15 * zoom;
  cargo.position.z = 30 * zoom;
  cargo.castShadow = true;
  cargo.receiveShadow = true;
  truck.add(cargo);
  const cabin = new THREE.Mesh(
    new THREE.BoxBufferGeometry(25 * zoom, 30 * zoom, 30 * zoom),
    [
      new THREE.MeshPhongMaterial({ color, flatShading: true }),
      new THREE.MeshPhongMaterial({ color, flatShading: true, map: truckFrontTexture }),
      new THREE.MeshPhongMaterial({ color, flatShading: true, map: truckRightSideTexture }),
      new THREE.MeshPhongMaterial({ color, flatShading: true, map: truckLeftSideTexture }),
      new THREE.MeshPhongMaterial({ color, flatShading: true }),
      new THREE.MeshPhongMaterial({ color, flatShading: true }),
    ]
  );
  cabin.position.x = -40 * zoom;
  cabin.position.z = 20 * zoom;
  cabin.castShadow = true;
  cabin.receiveShadow = true;
  truck.add(cabin);
  const frontWheel = new Wheel();
  frontWheel.position.x = -38 * zoom;
  truck.add(frontWheel);
  const middleWheel = new Wheel();
  middleWheel.position.x = -10 * zoom;
  truck.add(middleWheel);
  const backWheel = new Wheel();
  backWheel.position.x = 30 * zoom;
  truck.add(backWheel);
  return truck;
}

function Three() {
  const three = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.BoxBufferGeometry(15 * zoom, 15 * zoom, 20 * zoom),
    new THREE.MeshPhongMaterial({ color: 0x4d2926, flatShading: true })
  );
  trunk.position.z = 10 * zoom;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  three.add(trunk);
  height = threeHeights[Math.floor(Math.random() * threeHeights.length)];
  const crown = new THREE.Mesh(
    new THREE.BoxBufferGeometry(30 * zoom, 30 * zoom, height * zoom),
    new THREE.MeshLambertMaterial({ color: 0x7aa21d, flatShading: true })
  );
  crown.position.z = (height / 2 + 20) * zoom;
  crown.castShadow = true;
  crown.receiveShadow = false;
  three.add(crown);
  return three;
}

function Chicken() {
  const chicken = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxBufferGeometry(chickenSize * zoom, chickenSize * zoom, 20 * zoom),
    new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true })
  );
  body.position.z = 10 * zoom;
  body.castShadow = true;
  body.receiveShadow = true;
  chicken.add(body);
  const rowel = new THREE.Mesh(
    new THREE.BoxBufferGeometry(2 * zoom, 4 * zoom, 2 * zoom),
    new THREE.MeshLambertMaterial({ color: 0xf0619a, flatShading: true })
  );
  rowel.position.z = 21 * zoom;
  rowel.castShadow = true;
  rowel.receiveShadow = false;
  chicken.add(rowel);
  return chicken;
}

function Pig() {
  const pig = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxBufferGeometry(chickenSize * zoom, chickenSize * zoom, 18 * zoom),
    new THREE.MeshPhongMaterial({ color: 0xf5a9c3, flatShading: true })
  );
  body.position.z = 9 * zoom;
  body.castShadow = true;
  body.receiveShadow = true;
  pig.add(body);

  const snout = new THREE.Mesh(
    new THREE.BoxBufferGeometry(6 * zoom, 5 * zoom, 4 * zoom),
    new THREE.MeshPhongMaterial({ color: 0xe07ba0, flatShading: true })
  );
  snout.position.set(0, -(chickenSize / 2 + 1) * zoom, 10 * zoom);
  snout.castShadow = true;
  pig.add(snout);

  // Curly tail made of two small offset cubes to suggest a curl
  const tail1 = new THREE.Mesh(
    new THREE.BoxBufferGeometry(2 * zoom, 2 * zoom, 2 * zoom),
    new THREE.MeshLambertMaterial({ color: 0xe07ba0, flatShading: true })
  );
  tail1.position.set(0, (chickenSize / 2 + 1) * zoom, 16 * zoom);
  pig.add(tail1);

  const tail2 = new THREE.Mesh(
    new THREE.BoxBufferGeometry(2 * zoom, 2 * zoom, 2 * zoom),
    new THREE.MeshLambertMaterial({ color: 0xe07ba0, flatShading: true })
  );
  tail2.position.set(2 * zoom, (chickenSize / 2 + 2) * zoom, 18 * zoom);
  pig.add(tail2);

  return pig;
}

function Gifty() {
  const gifty = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxBufferGeometry(chickenSize * zoom, chickenSize * zoom, 18 * zoom),
    new THREE.MeshPhongMaterial({ color: 0xe63946, flatShading: true })
  );
  box.position.z = 9 * zoom;
  box.castShadow = true;
  box.receiveShadow = true;
  gifty.add(box);

  const ribbonV = new THREE.Mesh(
    new THREE.BoxBufferGeometry(3 * zoom, chickenSize * zoom + 1, 18.5 * zoom),
    new THREE.MeshLambertMaterial({ color: 0xffd700, flatShading: true })
  );
  ribbonV.position.z = 9 * zoom;
  gifty.add(ribbonV);

  const ribbonH = new THREE.Mesh(
    new THREE.BoxBufferGeometry(chickenSize * zoom + 1, 3 * zoom, 18.5 * zoom),
    new THREE.MeshLambertMaterial({ color: 0xffd700, flatShading: true })
  );
  ribbonH.position.z = 9 * zoom;
  gifty.add(ribbonH);

  const bowL = new THREE.Mesh(
    new THREE.BoxBufferGeometry(4 * zoom, 4 * zoom, 4 * zoom),
    new THREE.MeshLambertMaterial({ color: 0xffd700, flatShading: true })
  );
  bowL.position.set(-3 * zoom, 0, 20 * zoom);
  gifty.add(bowL);

  const bowR = new THREE.Mesh(
    new THREE.BoxBufferGeometry(4 * zoom, 4 * zoom, 4 * zoom),
    new THREE.MeshLambertMaterial({ color: 0xffd700, flatShading: true })
  );
  bowR.position.set(3 * zoom, 0, 20 * zoom);
  gifty.add(bowR);

  return gifty;
}

function BabyDuck() {
  const duck = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxBufferGeometry(chickenSize * zoom, chickenSize * zoom, 16 * zoom),
    new THREE.MeshPhongMaterial({ color: 0xffe066, flatShading: true })
  );
  body.position.z = 8 * zoom;
  body.castShadow = true;
  body.receiveShadow = true;
  duck.add(body);

  const beak = new THREE.Mesh(
    new THREE.BoxBufferGeometry(5 * zoom, 4 * zoom, 3 * zoom),
    new THREE.MeshLambertMaterial({ color: 0xf5a623, flatShading: true })
  );
  beak.position.set(0, -(chickenSize / 2 + 1) * zoom, 9 * zoom);
  duck.add(beak);

  const wing = new THREE.Mesh(
    new THREE.BoxBufferGeometry(5 * zoom, 7 * zoom, 8 * zoom),
    new THREE.MeshLambertMaterial({ color: 0xe6c64f, flatShading: true })
  );
  wing.position.set((chickenSize / 2 - 1) * zoom, 0, 9 * zoom);
  duck.add(wing);

  return duck;
}

function PoopyPigeon() {
  const pigeon = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxBufferGeometry(chickenSize * zoom, chickenSize * zoom, 18 * zoom),
    new THREE.MeshPhongMaterial({ color: 0xb0b3b8, flatShading: true })
  );
  body.position.z = 9 * zoom;
  body.castShadow = true;
  body.receiveShadow = true;
  pigeon.add(body);

  const chest = new THREE.Mesh(
    new THREE.BoxBufferGeometry(chickenSize * 0.7 * zoom, 4 * zoom, 10 * zoom),
    new THREE.MeshLambertMaterial({ color: 0xf4f4f4, flatShading: true })
  );
  chest.position.set(0, -(chickenSize / 2 - 1) * zoom, 6 * zoom);
  pigeon.add(chest);

  const beak = new THREE.Mesh(
    new THREE.BoxBufferGeometry(4 * zoom, 4 * zoom, 3 * zoom),
    new THREE.MeshLambertMaterial({ color: 0xe8732a, flatShading: true })
  );
  beak.position.set(0, -(chickenSize / 2 + 1) * zoom, 11 * zoom);
  pigeon.add(beak);

  return pigeon;
}

function CharacterModel(skinId) {
  switch (skinId) {
    case "pig": return Pig();
    case "gifty": return Gifty();
    case "duck": return BabyDuck();
    case "pigeon": return PoopyPigeon();
    default: return Chicken();
  }
}

function Road() {
  const road = new THREE.Group();
  const createSection = (color) =>
    new THREE.Mesh(
      new THREE.PlaneBufferGeometry(boardWidth * zoom, positionWidth * zoom),
      new THREE.MeshPhongMaterial({ color })
    );
  const middle = createSection(0x454a59);
  middle.receiveShadow = true;
  road.add(middle);
  const left = createSection(0x393d49);
  left.position.x = -boardWidth * zoom;
  road.add(left);
  const right = createSection(0x393d49);
  right.position.x = boardWidth * zoom;
  road.add(right);
  return road;
}

function Grass() {
  const grass = new THREE.Group();
  const createSection = (color) =>
    new THREE.Mesh(
      new THREE.BoxBufferGeometry(boardWidth * zoom, positionWidth * zoom, 3 * zoom),
      new THREE.MeshPhongMaterial({ color })
    );
  const middle = createSection(0xbaf455);
  middle.receiveShadow = true;
  grass.add(middle);
  const left = createSection(0x99c846);
  left.position.x = -boardWidth * zoom;
  grass.add(left);
  const right = createSection(0x99c846);
  right.position.x = boardWidth * zoom;
  grass.add(right);
  grass.position.z = 1.5 * zoom;
  return grass;
}

function Lane(index, prevType) {
  this.index = index;
  this.type = index <= 0 ? "field" : laneTypes[Math.floor(Math.random() * laneTypes.length)];
  // Prevent two rivers in a row (can create impossible crossings)
  if (this.type === "river" && prevType === "river") this.type = "car";
  // Keep rivers sparse overall
  if (this.type === "river" && Math.random() < 0.5) this.type = "car";
  switch (this.type) {
    case "field": {
      this.type = "field";
      this.mesh = new Grass();
      this.occupiedPositions = new Set();
      this.coinPositions = new Set();
      this.coins = [];
      addCoinsToLane(this);
      break;
    }
    case "forest": {
      this.mesh = new Grass();
      this.occupiedPositions = new Set();
      // In arcade mode use fewer trees so auto-sidestep has more viable paths
      const treeCount = gameMode === "arcade" ? 2 : 4;
      this.threes = Array.from({ length: treeCount }).map(() => {
        const three = new Three();
        let position;
        do {
          position = Math.floor(Math.random() * columns);
        } while (this.occupiedPositions.has(position));
        this.occupiedPositions.add(position);
        three.position.x =
          (position * positionWidth + positionWidth / 2) * zoom - (boardWidth * zoom) / 2;
        this.mesh.add(three);
        return three;
      });
      this.coinPositions = new Set();
      this.coins = [];
      addCoinsToLane(this);
      break;
    }
    case "car": {
      this.mesh = new Road();
      this.direction = Math.random() >= 0.5;
      const occupiedPositions = new Set();
      this.vechicles = [1, 2, 3].map(() => {
        const vechicle = new Car();
        let position;
        do {
          position = Math.floor((Math.random() * columns) / 2);
        } while (occupiedPositions.has(position));
        occupiedPositions.add(position);
        vechicle.position.x =
          (position * positionWidth * 2 + positionWidth / 2) * zoom - (boardWidth * zoom) / 2;
        if (!this.direction) vechicle.rotation.z = Math.PI;
        this.mesh.add(vechicle);
        return vechicle;
      });
      this.speed = laneSpeeds[Math.floor(Math.random() * laneSpeeds.length)];
      this.occupiedPositions = new Set();
      this.coinPositions = new Set();
      this.coins = [];
      break;
    }
    case "truck": {
      this.mesh = new Road();
      this.direction = Math.random() >= 0.5;
      const occupiedPositions = new Set();
      this.vechicles = [1, 2].map(() => {
        const vechicle = new Truck();
        let position;
        do {
          position = Math.floor((Math.random() * columns) / 3);
        } while (occupiedPositions.has(position));
        occupiedPositions.add(position);
        vechicle.position.x =
          (position * positionWidth * 3 + positionWidth / 2) * zoom - (boardWidth * zoom) / 2;
        if (!this.direction) vechicle.rotation.z = Math.PI;
        this.mesh.add(vechicle);
        return vechicle;
      });
      this.speed = laneSpeeds[Math.floor(Math.random() * laneSpeeds.length)];
      this.occupiedPositions = new Set();
      this.coinPositions = new Set();
      this.coins = [];
      break;
    }
    case "tracks": {
      this.mesh = new Tracks();
      this.direction = Math.random() >= 0.5;
      this.train = new Train();
      // Start the train off-screen; it only becomes visible/dangerous while "active"
      this.train.position.x = this.direction
        ? (boardWidth * zoom) / 2 + positionWidth * 3 * zoom
        : (-boardWidth * zoom) / 2 - positionWidth * 3 * zoom;
      this.mesh.add(this.train);
      this.trainActive = false;
      this.trainWarningActive = false;
      this.nextTrainTime = performance.now() + 2000 + Math.random() * 4000;
      this.occupiedPositions = new Set();
      this.coinPositions = new Set();
      this.coins = [];
      break;
    }
    case "river": {
      this.mesh = new River();
      this.direction = Math.random() >= 0.5;
      this.speed = padDrift[Math.floor(Math.random() * padDrift.length)];
      this.occupiedPositions = new Set(); // not used for blocking, kept for consistency
      const padPositions = new Set();
      this.pads = [1, 2, 3].map(() => {
        const pad = new LilyPad();
        let position;
        do {
          position = Math.floor((Math.random() * columns) / 2);
        } while (padPositions.has(position));
        padPositions.add(position);
        pad.position.x =
          (position * positionWidth * 2 + positionWidth / 2) * zoom - (boardWidth * zoom) / 2;
        this.mesh.add(pad);
        return pad;
      });
      this.coinPositions = new Set();
      this.coins = [];
      break;
    }
  }
}

function Tracks() {
  const group = new THREE.Group();
  const bed = new THREE.Mesh(
    new THREE.PlaneBufferGeometry(boardWidth * zoom, positionWidth * zoom),
    new THREE.MeshPhongMaterial({ color: 0x6b5842 })
  );
  bed.receiveShadow = true;
  group.add(bed);

  const railOffset = 10 * zoom;
  [-railOffset, railOffset].forEach((offsetY) => {
    const rail = new THREE.Mesh(
      new THREE.BoxBufferGeometry(boardWidth * zoom, 2 * zoom, 1.5 * zoom),
      new THREE.MeshLambertMaterial({ color: 0x999999, flatShading: true })
    );
    rail.position.y = offsetY;
    rail.position.z = 1 * zoom;
    group.add(rail);
  });

  // Railroad ties
  for (let i = 0; i < columns * 1.2; i++) {
    const tie = new THREE.Mesh(
      new THREE.BoxBufferGeometry(4 * zoom, positionWidth * 0.8 * zoom, 1 * zoom),
      new THREE.MeshLambertMaterial({ color: 0x3d2b1f, flatShading: true })
    );
    tie.position.x = -boardWidth * zoom / 2 + i * (boardWidth * zoom) / (columns * 1.2);
    tie.position.z = 0.6 * zoom;
    group.add(tie);
  }

  return group;
}

function Train() {
  const train = new THREE.Group();
  const engine = new THREE.Mesh(
    new THREE.BoxBufferGeometry(130 * zoom, 28 * zoom, 30 * zoom),
    new THREE.MeshPhongMaterial({ color: 0x2266cc, flatShading: true })
  );
  engine.position.z = 16 * zoom;
  engine.castShadow = true;
  engine.receiveShadow = true;
  train.add(engine);

  const cabin = new THREE.Mesh(
    new THREE.BoxBufferGeometry(30 * zoom, 26 * zoom, 14 * zoom),
    new THREE.MeshPhongMaterial({ color: 0xdddddd, flatShading: true })
  );
  cabin.position.set(-40 * zoom, 0, 32 * zoom);
  cabin.castShadow = true;
  train.add(cabin);

  return train;
}

function River() {
  const river = new THREE.Group();
  const createSection = (color) =>
    new THREE.Mesh(
      new THREE.PlaneBufferGeometry(boardWidth * zoom, positionWidth * zoom),
      new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.9 })
    );
  const middle = createSection(0x3a8fd1);
  middle.receiveShadow = true;
  river.add(middle);
  const left = createSection(0x3179b3);
  left.position.x = -boardWidth * zoom;
  river.add(left);
  const right = createSection(0x3179b3);
  right.position.x = boardWidth * zoom;
  river.add(right);
  return river;
}

function Eagle() {
  const eagle = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxBufferGeometry(20 * zoom, 14 * zoom, 10 * zoom),
    new THREE.MeshPhongMaterial({ color: 0x5a4632, flatShading: true })
  );
  body.castShadow = true;
  eagle.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxBufferGeometry(8 * zoom, 8 * zoom, 8 * zoom),
    new THREE.MeshPhongMaterial({ color: 0xf5f1e6, flatShading: true })
  );
  head.position.set(0, 13 * zoom, 2 * zoom);
  eagle.add(head);

  const beak = new THREE.Mesh(
    new THREE.BoxBufferGeometry(3 * zoom, 4 * zoom, 3 * zoom),
    new THREE.MeshLambertMaterial({ color: 0xf5a623, flatShading: true })
  );
  beak.position.set(0, 18 * zoom, 1 * zoom);
  eagle.add(beak);

  const wingGeometry = new THREE.BoxBufferGeometry(34 * zoom, 10 * zoom, 2 * zoom);
  const wingMaterial = new THREE.MeshLambertMaterial({ color: 0x4a3a26, flatShading: true });

  const wingLeft = new THREE.Mesh(wingGeometry, wingMaterial);
  wingLeft.position.set(-24 * zoom, 0, 3 * zoom);
  wingLeft.name = "wingLeft";
  eagle.add(wingLeft);

  const wingRight = new THREE.Mesh(wingGeometry, wingMaterial);
  wingRight.position.set(24 * zoom, 0, 3 * zoom);
  wingRight.name = "wingRight";
  eagle.add(wingRight);

  const tail = new THREE.Mesh(
    new THREE.BoxBufferGeometry(8 * zoom, 12 * zoom, 2 * zoom),
    new THREE.MeshLambertMaterial({ color: 0x4a3a26, flatShading: true })
  );
  tail.position.set(0, -12 * zoom, 1 * zoom);
  eagle.add(tail);

  eagle.visible = false;
  return eagle;
}

function LilyPad() {
  const pad = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderBufferGeometry(16 * zoom, 16 * zoom, 2 * zoom, 12),
    new THREE.MeshLambertMaterial({ color: 0x4caf50, flatShading: true })
  );
  base.rotation.x = Math.PI / 2;
  base.position.z = 3 * zoom;
  base.castShadow = true;
  base.receiveShadow = true;
  pad.add(base);

  const notch = new THREE.Mesh(
    new THREE.BoxBufferGeometry(8 * zoom, 8 * zoom, 3 * zoom),
    new THREE.MeshLambertMaterial({ color: 0x2e7d32, flatShading: true })
  );
  notch.position.set(12 * zoom, 0, 3 * zoom);
  notch.rotation.z = Math.PI / 4;
  pad.add(notch);

  return pad;
}

document.querySelector("#retry").addEventListener("click", () => {
  counterDOM.innerHTML = '0';
  lanes.forEach((lane) => scene.remove(lane.mesh));
  initaliseValues();
  laneEnterTime = performance.now();
  endDOM.style.visibility = "hidden";
  startMusic();
});

document.getElementById("left").addEventListener("click", () => move("left"));
document.getElementById("right").addEventListener("click", () => move("right"));

window.addEventListener("keydown", (event) => {
  if (event.keyCode == "38") move("forward");
  else if (event.keyCode == "40") { event.preventDefault(); }
  else if (event.keyCode == "37") move("left");
  else if (event.keyCode == "39") move("right");
});

// R1 scroll wheel — one notch = one hop, no accidental repeats.
// We use two guards:
//   1. moves.length > 0 (already in move()) blocks a new hop while one is animating.
//   2. A per-direction debounce prevents the same direction firing twice from one physical notch.
let lastScrollUp = 0;
let lastScrollDown = 0;
const scrollDebounce = stepTime + 120; // slightly longer than one hop animation

window.addEventListener("scrollUp", () => {
  const now = Date.now();
  if (now - lastScrollUp < scrollDebounce) return;
  lastScrollUp = now;
  move("forward");
});

window.addEventListener("scrollDown", () => {
  const now = Date.now();
  if (now - lastScrollDown < scrollDebounce) return;
  lastScrollDown = now;
  move("backward");
});

window.addEventListener("scrollDown", () => {
  const now = Date.now();
  if (now - lastMoveFiredTime < scrollMoveCooldown) return;

  scrollDownCount++;

  if (scrollDownTimer) clearTimeout(scrollDownTimer);
  scrollDownTimer = setTimeout(() => {
    if (scrollDownCount >= scrollThreshold) {
      lastMoveFiredTime = Date.now();
      move("backward");
    }
    scrollDownCount = 0;
    scrollDownTimer = null;
  }, scrollWindowMs);
});

function findClearestColumn(laneIndex, fromColumn) {
  const lane = lanes[laneIndex];
  if (!lane || lane.type !== "forest") return fromColumn;

  // If the current column is clear, stay there — but still validate it isn't a dead end.
  const candidates = [];
  for (let offset = 0; offset < columns; offset++) {
    const right = fromColumn + offset;
    const left = fromColumn - offset;
    if (right < columns && !lane.occupiedPositions.has(right)) {
      if (!candidates.includes(right)) candidates.push(right);
    }
    if (left >= 0 && !lane.occupiedPositions.has(left)) {
      if (!candidates.includes(left)) candidates.push(left);
    }
  }

  if (candidates.length === 0) return fromColumn; // fully blocked, shouldn't happen

  // Look ahead: prefer a candidate that also has an exit in the next lane
  const nextLane = lanes[laneIndex + 1];
  if (nextLane && nextLane.type === "forest") {
    // Score each candidate: prefer ones where at least one neighbor column is clear in the
    // next lane too, so the player isn't immediately trapped again
    const scored = candidates.map((col) => {
      const exits = [-1, 0, 1].filter((d) => {
        const c = col + d;
        return c >= 0 && c < columns && !nextLane.occupiedPositions.has(c);
      }).length;
      return { col, exits };
    });
    // Pick the candidate closest to fromColumn that has at least one exit forward
    const safe = scored.filter((s) => s.exits > 0);
    if (safe.length > 0) return safe[0].col;
  }

  // No look-ahead available or all candidates lead to dead ends — just pick nearest open
  return candidates[0];
}

function move(direction) {
  // Resync currentColumn with the chicken's true visual position before validating any move.
  // This matters most after standing on a drifting lily pad, where currentColumn can go stale.
  currentColumn = Math.round(
    ((chicken.position.x + (boardWidth * zoom) / 2) / zoom - positionWidth / 2) / positionWidth
  );
  currentColumn = Math.max(0, Math.min(columns - 1, currentColumn));

  if (gameOver || !gameStarted) return;

  // Arcade mode only allows forward/backward
  if (gameMode === "arcade" && (direction === "left" || direction === "right")) return;

  // Block new moves while a hop is still animating, to prevent clipping through obstacles
  if (moves.length > 0) return;

  if (direction === "forward") {
    const targetLaneIndex = currentLane + 1;
    let targetColumn = currentColumn;

    if (gameMode === "arcade") {
      targetColumn = findClearestColumn(targetLaneIndex, currentColumn);
    } else if (
      lanes[targetLaneIndex].type === "forest" &&
      lanes[targetLaneIndex].occupiedPositions.has(currentColumn)
    ) {
      return; // blocked by tree directly ahead in classic mode
    }

    addLane();
    startMoving = true;
    moves.push({ type: "forward", targetColumn });
  } else if (direction === "backward") {
    if (currentLane === 0) return;
    const targetLaneIndex = currentLane - 1;
    if (
      lanes[targetLaneIndex].type === "forest" &&
      lanes[targetLaneIndex].occupiedPositions.has(currentColumn)
    ) return;
    startMoving = true;
    moves.push({ type: "backward" });
  } else if (direction === "left") {
    if (currentColumn === 0) return;
    if (
      lanes[currentLane].type === "forest" &&
      lanes[currentLane].occupiedPositions.has(currentColumn - 1)
    ) return;
    startMoving = true;
    moves.push({ type: "left" });
  } else if (direction === "right") {
    if (currentColumn === columns - 1) return;
    if (
      lanes[currentLane].type === "forest" &&
      lanes[currentLane].occupiedPositions.has(currentColumn + 1)
    ) return;
    startMoving = true;
    moves.push({ type: "right" });
  }
}

// Checks whether the chicken's current column sits on a lily pad in a river lane.
// Returns true if safe (on a pad or not in a river at all), false if it would drown.
function isSafeOnRiver(lane, chickenX) {
  if (!lane || lane.type !== "river") return true;
  const padRadius = 16 * zoom; // matches LilyPad's cylinder radius
  return lane.pads.some((pad) => Math.abs(pad.position.x - chickenX) < padRadius * 0.75);
}

function animate(timestamp) {
  requestAnimationFrame(animate);
  if (!previousTimestamp) previousTimestamp = timestamp;
  const delta = timestamp - previousTimestamp;
  previousTimestamp = timestamp;

  lanes.forEach((lane) => {
    if (lane.type === "car" || lane.type === "truck") {
      const aBitBeforeTheBeginingOfLane = (-boardWidth * zoom) / 2 - positionWidth * 2 * zoom;
      const aBitAfterTheEndOFLane = (boardWidth * zoom) / 2 + positionWidth * 2 * zoom;
      lane.vechicles.forEach((vechicle) => {
        if (lane.direction) {
          vechicle.position.x =
            vechicle.position.x < aBitBeforeTheBeginingOfLane
              ? aBitAfterTheEndOFLane
              : (vechicle.position.x -= (lane.speed / 16) * delta);
        } else {
          vechicle.position.x =
            vechicle.position.x > aBitAfterTheEndOFLane
              ? aBitBeforeTheBeginingOfLane
              : (vechicle.position.x += (lane.speed / 16) * delta);
        }
      });
    } else if (lane.type === "river") {
      const aBitBeforeTheBeginingOfLane = (-boardWidth * zoom) / 2 - positionWidth * 2 * zoom;
      const aBitAfterTheEndOFLane = (boardWidth * zoom) / 2 + positionWidth * 2 * zoom;
      lane.pads.forEach((pad) => {
        if (lane.direction) {
          pad.position.x =
            pad.position.x < aBitBeforeTheBeginingOfLane
              ? aBitAfterTheEndOFLane
              : (pad.position.x -= (lane.speed / 16) * delta);
        } else {
          pad.position.x =
            pad.position.x > aBitAfterTheEndOFLane
              ? aBitBeforeTheBeginingOfLane
              : (pad.position.x += (lane.speed / 16) * delta);
        }
      });
    } else if (lane.type === "tracks") {
      const now = performance.now();
      if (!lane.trainActive && !lane.trainWarningActive && now > lane.nextTrainTime) {
        lane.trainWarningActive = true;
        lane.warningStartTime = now;
        if (lane.index === currentLane || lane.index === currentLane + 1) {
          document.getElementById("trainWarning").classList.add("active");
        }
      }
      if (lane.trainWarningActive && now - lane.warningStartTime > trainWarningDuration) {
        lane.trainWarningActive = false;
        lane.trainActive = true;
        document.getElementById("trainWarning").classList.remove("active");
        lane.train.position.x = lane.direction
          ? (boardWidth * zoom) / 2 + positionWidth * 3 * zoom
          : (-boardWidth * zoom) / 2 - positionWidth * 3 * zoom;
      }
      if (lane.trainActive) {
        if (lane.direction) {
          lane.train.position.x -= (trainSpeed / 16) * delta;
          if (lane.train.position.x < (-boardWidth * zoom) / 2 - positionWidth * 3 * zoom) {
            lane.trainActive = false;
            lane.nextTrainTime = now + 3000 + Math.random() * 5000;
          }
        } else {
          lane.train.position.x += (trainSpeed / 16) * delta;
          if (lane.train.position.x > (boardWidth * zoom) / 2 + positionWidth * 3 * zoom) {
            lane.trainActive = false;
            lane.nextTrainTime = now + 3000 + Math.random() * 5000;
          }
        }
      }
    }
  });

  if (startMoving) {
    stepStartTimestamp = timestamp;
    startMoving = false;
    moveStartX = chicken.position.x;
  }

  if (stepStartTimestamp) {
    const currentMove = moves[0].type;
    const moveDeltaTime = timestamp - stepStartTimestamp;
    const moveDeltaDistance = Math.min(moveDeltaTime / stepTime, 1) * positionWidth * zoom;
    const jumpDeltaDistance = Math.sin(Math.min(moveDeltaTime / stepTime, 1) * Math.PI) * 8 * zoom;

    const startColumn = currentColumn;
    const endColumn = moves[0].targetColumn !== undefined ? moves[0].targetColumn : currentColumn;
    const columnProgress = Math.min(moveDeltaTime / stepTime, 1);

    switch (currentMove) {
      case "forward": {
        const positionY = currentLane * positionWidth * zoom + moveDeltaDistance;
        // Land at the SAME relative X offset the chicken started the hop at, plus whatever
        // sideways shift this particular move requires (used by arcade auto-sidestep).
        const columnShift = (endColumn - startColumn) * positionWidth * zoom;
        const targetX = moveStartX + columnShift;
        const positionX = moveStartX + (targetX - moveStartX) * columnProgress;
        camera.position.y = initialCameraPositionY + positionY;
        camera.position.x = initialCameraPositionX + positionX;
        dirLight.position.y = initialDirLightPositionY + positionY;
        dirLight.position.x = initialDirLightPositionX + positionX;
        chicken.position.y = positionY;
        chicken.position.x = positionX;
        chicken.position.z = jumpDeltaDistance;
        break;
      }
      case "backward": {
        const positionY = currentLane * positionWidth * zoom - moveDeltaDistance;
        camera.position.y = initialCameraPositionY + positionY;
        dirLight.position.y = initialDirLightPositionY + positionY;
        chicken.position.y = positionY;
        chicken.position.z = jumpDeltaDistance;
        break;
      }
      case "left": {
        const positionX = moveStartX - moveDeltaDistance;
        camera.position.x = initialCameraPositionX + positionX;
        dirLight.position.x = initialDirLightPositionX + positionX;
        chicken.position.x = positionX;
        chicken.position.z = jumpDeltaDistance;
        break;
      }
      case "right": {
        const positionX = moveStartX + moveDeltaDistance;
        camera.position.x = initialCameraPositionX + positionX;
        dirLight.position.x = initialDirLightPositionX + positionX;
        chicken.position.x = positionX;
        chicken.position.z = jumpDeltaDistance;
        break;
      }
    }
    if (moveDeltaTime > stepTime) {
      switch (currentMove) {
        case "forward": {
          currentLane++;
          // Recompute currentColumn from the chicken's true visual X (accounts for any
          // lily pad drift that happened before this hop), not from the old pre-drift value.
          currentColumn = Math.round(
            ((chicken.position.x + (boardWidth * zoom) / 2) / zoom - positionWidth / 2) / positionWidth
          );
          currentColumn = Math.max(0, Math.min(columns - 1, currentColumn));
          counterDOM.innerHTML = currentLane;
          if (currentLane > highScore) {
            highScore = currentLane;
            setHighScore(gameMode, highScore);
            highscoreDOM.textContent = "Best: " + highScore;
          }
          laneEnterTime = timestamp;
          eagleWarningShown = false;
          eagleWarningDOM.classList.remove("active");
          checkCoinCollect();
          break;
        }
        case "backward": {
          currentLane--;
          counterDOM.innerHTML = currentLane;
          laneEnterTime = timestamp;
          eagleWarningShown = false;
          eagleWarningDOM.classList.remove("active");
          checkCoinCollect();
          break;
        }
        case "left":
        case "right": {
          currentColumn = Math.round(
            ((chicken.position.x + (boardWidth * zoom) / 2) / zoom - positionWidth / 2) / positionWidth
          );
          currentColumn = Math.max(0, Math.min(columns - 1, currentColumn));
          checkCoinCollect();
          break;
        }
      }
      moves.shift();
      stepStartTimestamp = moves.length === 0 ? null : timestamp;
    }
  }

  // Hit test - cars/trucks
  if (lanes[currentLane].type === "car" || lanes[currentLane].type === "truck") {
    const chickenMinX = chicken.position.x - (chickenSize * zoom) / 2;
    const chickenMaxX = chicken.position.x + (chickenSize * zoom) / 2;
    const vechicleLength = { car: 60, truck: 105 }[lanes[currentLane].type];
    lanes[currentLane].vechicles.forEach((vechicle) => {
      const carMinX = vechicle.position.x - (vechicleLength * zoom) / 2;
      const carMaxX = vechicle.position.x + (vechicleLength * zoom) / 2;
      if (chickenMaxX > carMinX && chickenMinX < carMaxX) {
        const vehicleName = lanes[currentLane].type === "truck" ? "truck" : "car";
        triggerGameOver("Hit by a " + vehicleName + "!\nScore: " + currentLane + "\nBest: " + highScore, true);
      }
    });
  }

  // Hit test - trains (only dangerous once active, after the warning period)
  if (lanes[currentLane].type === "tracks" && lanes[currentLane].trainActive) {
    const chickenMinX = chicken.position.x - (chickenSize * zoom) / 2;
    const chickenMaxX = chicken.position.x + (chickenSize * zoom) / 2;
    const trainLength = 130;
    const train = lanes[currentLane].train;
    const trainMinX = train.position.x - (trainLength * zoom) / 2;
    const trainMaxX = train.position.x + (trainLength * zoom) / 2;
    if (chickenMaxX > trainMinX && chickenMinX < trainMaxX) {
      triggerGameOver("Hit by a train!\nScore: " + currentLane + "\nBest: " + highScore, true);
    }
  }

  // Drowning test - rivers (only checked once the chicken has finished landing, not mid-hop)
  if (lanes[currentLane].type === "river" && !stepStartTimestamp) {
    if (!isSafeOnRiver(lanes[currentLane], chicken.position.x)) {
      triggerGameOver("You drowned!\nScore: " + currentLane + "\nBest: " + highScore, true);
    }
  }

  // If standing on a river lane (and not mid-hop), drift the chicken along with its lily pad
  if (lanes[currentLane] && lanes[currentLane].type === "river" && !stepStartTimestamp && !gameOver) {
    const lane = lanes[currentLane];
    const padRadius = 16 * zoom;
    const ridingPad = lane.pads.find((pad) => Math.abs(pad.position.x - chicken.position.x) < padRadius * 0.75);
    if (ridingPad) {
      const drift = lane.direction ? -(lane.speed / 16) * delta : (lane.speed / 16) * delta;
      chicken.position.x += drift;
      camera.position.x += drift;
      dirLight.position.x += drift;
    }
  }

  // Eagle time limit check (only when chicken isn't mid-hop, and only once gameplay has actually started)
  if (gameStarted && !gameOver && !stepStartTimestamp && laneEnterTime > 0) {
    const timeOnLane = timestamp - laneEnterTime;
    if (timeOnLane > eagleTimeLimit - 1500 && !eagleWarningShown) {
      eagleWarningShown = true;
      eagleWarningDOM.classList.add("active");
    }
    if (timeOnLane > eagleTimeLimit && !eagleSwooping) {
      eagleWarningDOM.classList.remove("active");
      gameOver = true; // lock out further movement immediately, before the swoop plays
      moves = [];
      stopMusic();
      eagleSwoopAndGrab(() => {
        endScoreDOM.textContent = "The eagle got you!\nScore: " + currentLane + "\nBest: " + highScore;
        endDOM.style.visibility = "visible";
      });
    }
  }

  renderer.render(scene, camera);
}

function eagleSwoopAndGrab(onComplete) {
  eagleSwooping = true;
  eagle.visible = true;

  const duration = 1100; // ms
  const startTime = performance.now();

  // Start high above and to the side of the chicken's current visual spot, end exactly on it.
  const grabX = chicken.position.x;
  const grabY = chicken.position.y;
  const startX = grabX + 160 * zoom;
  const startZ = 220 * zoom;
  const endZ = 16 * zoom;

  eagle.position.set(startX, grabY - 60 * zoom, startZ);
  eagle.rotation.z = 0;

  function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    // Ease-in toward the chicken for a fast, dramatic dive
    const eased = t * t;

    eagle.position.x = startX + (grabX - startX) * eased;
    eagle.position.y = (grabY - 60 * zoom) + (grabY - (grabY - 60 * zoom)) * eased;
    eagle.position.z = startZ + (endZ - startZ) * eased;

    // Simple wing flap
    const flap = Math.sin(now / 60) * 0.5;
    const wingLeft = eagle.getObjectByName("wingLeft");
    const wingRight = eagle.getObjectByName("wingRight");
    if (wingLeft) wingLeft.rotation.x = flap;
    if (wingRight) wingRight.rotation.x = -flap;

    if (t < 0.85) {
      requestAnimationFrame(step);
    } else if (t < 1) {
      // Final grab moment: snap chicken to the eagle's talons and lift off together
      chicken.position.x = eagle.position.x;
      chicken.position.y = eagle.position.y;
      chicken.position.z = eagle.position.z - 4 * zoom;
      requestAnimationFrame(step);
    } else {
      // Carry the chicken away upward and off-screen
      liftOffWithChicken(onComplete);
    }
  }
  requestAnimationFrame(step);
}

function liftOffWithChicken(onComplete) {
  const duration = 500;
  const startTime = performance.now();
  const startPos = eagle.position.clone();
  const endPos = startPos.clone();
  endPos.z += 200 * zoom;
  endPos.y -= 80 * zoom;

  function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    eagle.position.lerpVectors(startPos, endPos, t);
    chicken.position.x = eagle.position.x;
    chicken.position.y = eagle.position.y;
    chicken.position.z = eagle.position.z - 4 * zoom;

    const flap = Math.sin(now / 50) * 0.6;
    const wingLeft = eagle.getObjectByName("wingLeft");
    const wingRight = eagle.getObjectByName("wingRight");
    if (wingLeft) wingLeft.rotation.x = flap;
    if (wingRight) wingRight.rotation.x = -flap;

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      eagle.visible = false;
      eagleSwooping = false;
      onComplete();
    }
  }
  requestAnimationFrame(step);
}

function flattenAndFade(onComplete) {
  const duration = 1000; // ms
  const startTime = performance.now();
  const startScaleZ = chicken.scale.z;
  const originalMaterialsOpacity = [];

  chicken.traverse((obj) => {
    if (obj.isMesh) {
      obj.material = obj.material.clone();
      obj.material.transparent = true;
      originalMaterialsOpacity.push(obj.material);
    }
  });

  function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    // Squash flat within the first 35% of the animation, then hold and fade
    const squashT = Math.min(t / 0.35, 1);
    chicken.scale.z = startScaleZ * (1 - squashT * 0.92);
    chicken.position.z = chicken.position.z * (1 - squashT) + 0.5 * zoom * squashT;

    const fadeT = Math.max((t - 0.35) / 0.65, 0);
    originalMaterialsOpacity.forEach((mat) => {
      mat.opacity = 1 - fadeT;
    });

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      onComplete();
    }
  }
  requestAnimationFrame(step);
}

function triggerGameOver(message, animated) {
  if (gameOver) return;
  gameOver = true;
  moves = [];
  stopMusic();
  eagleWarningDOM.classList.remove("active");

  if (animated) {
    flattenAndFade(() => {
      endScoreDOM.textContent = message;
      endDOM.style.visibility = "visible";
    });
  } else {
    endScoreDOM.textContent = message;
    endDOM.style.visibility = "visible";
  }
}

function checkCoinCollect() {
  const lane = lanes[currentLane];
  if (!lane || !lane.coinPositions || !lane.coinPositions.has(currentColumn)) return;
  lane.coinPositions.delete(currentColumn);
  const targetX = (currentColumn * positionWidth + positionWidth / 2) * zoom - (boardWidth * zoom) / 2;
  const coinIndex = lane.coins.findIndex((c) => Math.round(c.position.x) === Math.round(targetX));
  if (coinIndex !== -1) {
    lane.mesh.remove(lane.coins[coinIndex]);
    lane.coins.splice(coinIndex, 1);
  }
  coinCount++;
  setTotalCoins(coinCount);
  coinDOM.textContent = "🪙 " + coinCount;
  playCoinSound();
}

requestAnimationFrame(animate);

function startGame(mode) {
  gameMode = mode;
  gameStarted = true;
  highScore = getHighScore(mode); // load the high score belonging to THIS mode
  highscoreDOM.textContent = "Best: " + highScore;
  laneEnterTime = performance.now(); // eagle timer starts ONLY now, when gameplay truly begins
  document.getElementById("splash").style.display = "none";
  if (mode === "arcade") {
    controllsDOM.classList.add("hidden");
  } else {
    controllsDOM.classList.remove("hidden");
  }
  startMusic();
}

document.getElementById("classicBtn").addEventListener("click", () => startGame("classic"));
document.getElementById("arcadeBtn").addEventListener("click", () => startGame("arcade"));

document.getElementById("resetScoreBtn").addEventListener("click", () => {
  setHighScore("classic", 0);
  setHighScore("arcade", 0);
  highScore = 0;
  highscoreDOM.textContent = "Best: 0";

  const btn = document.getElementById("resetScoreBtn");
  const originalText = "Reset Score";
  btn.textContent = "Score Reset!";
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = originalText;
    btn.disabled = false;
  }, 1200);
});

document.getElementById("mainMenuBtn").addEventListener("click", () => {
  counterDOM.innerHTML = '0';
  lanes.forEach((lane) => scene.remove(lane.mesh));
  initaliseValues();
  endDOM.style.visibility = "hidden";
  gameStarted = false;
  laneEnterTime = 0;
  highscoreDOM.textContent = "Best: " + getHighScore("classic");
  document.getElementById("splash").style.display = "flex";
});

function renderSkinList() {
  const skinListDOM = document.getElementById("skinList");
  const unlocked = getUnlockedSkins();
  const active = getActiveSkin();
  const coins = getTotalCoins();

  document.getElementById("rewardsCoinCount").textContent = coins;
  skinListDOM.innerHTML = "";

  skinDefinitions.forEach((skin) => {
    const isUnlocked = unlocked.includes(skin.id);
    const isActive = skin.id === active;

    const card = document.createElement("div");
    card.className = "skin-card" + (isActive ? " selected" : "");

    const preview = document.createElement("div");
    preview.className = "skin-preview";
    const previewInner = document.createElement("div");
    previewInner.className = skin.previewClass;
    preview.appendChild(previewInner);

    const info = document.createElement("div");
    info.className = "skin-info";
    const nameDiv = document.createElement("div");
    nameDiv.className = "skin-name";
    nameDiv.textContent = skin.name;
    info.appendChild(nameDiv);

    if (!isUnlocked) {
      const costDiv = document.createElement("div");
      costDiv.className = "skin-cost";
      costDiv.textContent = "🪙 " + skin.cost + " to unlock";
      info.appendChild(costDiv);
    }

    const actionBtn = document.createElement("button");
    actionBtn.className = "skin-action-btn";

    if (isActive) {
      actionBtn.textContent = "Selected";
      actionBtn.classList.add("selected-btn");
      actionBtn.disabled = true;
    } else if (isUnlocked) {
      actionBtn.textContent = "Select";
      actionBtn.addEventListener("click", () => {
        setActiveSkin(skin.id);
        swapCharacterModel(skin.id);
        renderSkinList();
      });
    } else {
      actionBtn.textContent = "Unlock";
      actionBtn.classList.add("locked");
      if (coins < skin.cost) actionBtn.disabled = true;
      actionBtn.addEventListener("click", () => {
        const currentCoins = getTotalCoins();
        if (currentCoins < skin.cost) return;
        setTotalCoins(currentCoins - skin.cost);
        coinCount = currentCoins - skin.cost;
        coinDOM.textContent = "🪙 " + coinCount;
        unlockSkin(skin.id);
        renderSkinList();
      });
    }

    info.appendChild(actionBtn);
    card.appendChild(preview);
    card.appendChild(info);
    skinListDOM.appendChild(card);
  });
}

document.getElementById("rewardsBtn").addEventListener("click", () => {
  renderSkinList();
  document.getElementById("rewardsModal").classList.add("open");
});

document.getElementById("closeRewardsBtn").addEventListener("click", () => {
  document.getElementById("rewardsModal").classList.remove("open");
});