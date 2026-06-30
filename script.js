const counterDOM = document.getElementById("counter");
const endDOM = document.getElementById("end");
const highscoreDOM = document.getElementById("highscore");
const endScoreDOM = document.getElementById("end-score");
const coinDOM = document.getElementById("coinCounter");
const controllsDOM = document.getElementById("controlls");
const eagleWarningDOM = document.getElementById("eagleWarning");

let highScore = parseInt(localStorage.getItem("crossyHighScore")) || 0;
highscoreDOM.textContent = "Best: " + highScore;

// Music
let isMuted = false;
let midiPlayer = null;
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function startMusic() {
  if (isMuted) return;
  if (midiPlayer) {
    midiPlayer.play();
    return;
  }
  const ctx = getAudioCtx();
  fetch("music.mid")
    .then(res => res.arrayBuffer())
    .then(buffer => {
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
        if (!isMuted) midiPlayer.play();
      });
      midiPlayer.loadArrayBuffer(buffer);
      midiPlayer.play();
    });
}

function stopMusic() {
  if (midiPlayer) midiPlayer.stop();
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
let gameOver;
let gameStarted = false;
let gameMode = "classic"; // "classic" or "arcade"
let laneEnterTime = 0;
const eagleTimeLimit = 10000; // ms before the eagle swoops in
let eagleWarningShown = false;
let coinCount = 0;

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

const generateLanes = () =>
  [-9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    .map((index) => {
      const lane = new Lane(index);
      lane.mesh.position.y = index * positionWidth * zoom;
      scene.add(lane.mesh);
      return lane;
    })
    .filter((lane) => lane.index >= 0);

const addLane = () => {
  const index = lanes.length;
  const lane = new Lane(index);
  lane.mesh.position.y = index * positionWidth * zoom;
  scene.add(lane.mesh);
  lanes.push(lane);
};

const chicken = new Chicken();
scene.add(chicken);

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

const laneTypes = ["car", "truck", "forest"];
const laneSpeeds = [2, 2.5, 3];
const vechicleColors = [0xa52523, 0xbdb638, 0x78b14b];
const threeHeights = [20, 45, 60];

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
  coinCount = 0;
  coinDOM.textContent = "🪙 0";
  eagleWarningDOM.classList.remove("active");
  chicken.position.x = 0;
  chicken.position.y = 0;
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

function Lane(index) {
  this.index = index;
  this.type = index <= 0 ? "field" : laneTypes[Math.floor(Math.random() * laneTypes.length)];
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
      this.threes = [1, 2, 3, 4].map(() => {
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
  }
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

// R1 scroll wheel
let lastScrollMoveTime = 0;
const scrollCooldown = 150; // ms required between scroll moves

function scrollMove(direction) {
  const now = Date.now();
  if (now - lastScrollMoveTime < scrollCooldown) return;
  lastScrollMoveTime = now;
  move(direction);
}

window.addEventListener("scrollUp", () => scrollMove("forward"));
window.addEventListener("scrollDown", () => scrollMove("backward"));

function findClearestColumn(laneIndex, fromColumn) {
  const lane = lanes[laneIndex];
  if (!lane || lane.type !== "forest") return fromColumn;
  if (!lane.occupiedPositions.has(fromColumn)) return fromColumn;

  // Search outward from fromColumn across the full lane width
  for (let offset = 1; offset < columns; offset++) {
    const right = fromColumn + offset;
    const left = fromColumn - offset;
    if (right < columns && !lane.occupiedPositions.has(right)) return right;
    if (left >= 0 && !lane.occupiedPositions.has(left)) return left;
  }
  return fromColumn; // no clear path found (shouldn't normally happen)
}

function move(direction) {
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
    }
  });

  if (startMoving) {
    stepStartTimestamp = timestamp;
    startMoving = false;
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
        const interpColumn = startColumn + (endColumn - startColumn) * columnProgress;
        const positionX = (interpColumn * positionWidth + positionWidth / 2) * zoom - (boardWidth * zoom) / 2;
        camera.position.y = initialCameraPositionY + positionY;
        camera.position.x = initialCameraPositionX + positionX - ((currentColumn * positionWidth + positionWidth / 2) * zoom - (boardWidth * zoom) / 2 - initialCameraPositionX + initialCameraPositionX);
        dirLight.position.y = initialDirLightPositionY + positionY;
        dirLight.position.x = initialDirLightPositionX + positionX - ((currentColumn * positionWidth + positionWidth / 2) * zoom - (boardWidth * zoom) / 2);
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
        const positionX =
          (currentColumn * positionWidth + positionWidth / 2) * zoom -
          (boardWidth * zoom) / 2 - moveDeltaDistance;
        camera.position.x = initialCameraPositionX + positionX;
        dirLight.position.x = initialDirLightPositionX + positionX;
        chicken.position.x = positionX;
        chicken.position.z = jumpDeltaDistance;
        break;
      }
      case "right": {
        const positionX =
          (currentColumn * positionWidth + positionWidth / 2) * zoom -
          (boardWidth * zoom) / 2 + moveDeltaDistance;
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
          currentColumn = endColumn;
          counterDOM.innerHTML = currentLane;
          if (currentLane > highScore) {
            highScore = currentLane;
            localStorage.setItem("crossyHighScore", highScore);
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
        case "left": { currentColumn--; checkCoinCollect(); break; }
        case "right": { currentColumn++; checkCoinCollect(); break; }
      }
      moves.shift();
      stepStartTimestamp = moves.length === 0 ? null : timestamp;
    }
  }

  // Hit test
  if (lanes[currentLane].type === "car" || lanes[currentLane].type === "truck") {
    const chickenMinX = chicken.position.x - (chickenSize * zoom) / 2;
    const chickenMaxX = chicken.position.x + (chickenSize * zoom) / 2;
    const vechicleLength = { car: 60, truck: 105 }[lanes[currentLane].type];
    lanes[currentLane].vechicles.forEach((vechicle) => {
      const carMinX = vechicle.position.x - (vechicleLength * zoom) / 2;
      const carMaxX = vechicle.position.x + (vechicleLength * zoom) / 2;
      if (chickenMaxX > carMinX && chickenMinX < carMaxX) {
        triggerGameOver("Score: " + currentLane + "\nBest: " + highScore);
      }
    });
  }

  // Eagle time limit check (only when chicken isn't mid-hop, and only once gameplay has actually started)
  if (gameStarted && !gameOver && !stepStartTimestamp && laneEnterTime > 0) {
    const timeOnLane = timestamp - laneEnterTime;
    if (timeOnLane > eagleTimeLimit - 1500 && !eagleWarningShown) {
      eagleWarningShown = true;
      eagleWarningDOM.classList.add("active");
    }
    if (timeOnLane > eagleTimeLimit) {
      eagleWarningDOM.classList.remove("active");
      triggerGameOver("The eagle got you!\nScore: " + currentLane + "\nBest: " + highScore);
    }
  }

  renderer.render(scene, camera);
}

function triggerGameOver(message) {
  if (gameOver) return;
  gameOver = true;
  moves = [];
  stopMusic();
  eagleWarningDOM.classList.remove("active");
  endScoreDOM.textContent = message;
  endDOM.style.visibility = "visible";
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
  coinDOM.textContent = "🪙 " + coinCount;
  playCoinSound();
}

requestAnimationFrame(animate);

function startGame(mode) {
  gameMode = mode;
  gameStarted = true;
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
  highScore = 0;
  localStorage.setItem("crossyHighScore", 0);
  highscoreDOM.textContent = "Best: 0";
});

document.getElementById("mainMenuBtn").addEventListener("click", () => {
  counterDOM.innerHTML = '0';
  lanes.forEach((lane) => scene.remove(lane.mesh));
  initaliseValues();
  endDOM.style.visibility = "hidden";
  gameStarted = false;
  laneEnterTime = 0;
  document.getElementById("splash").style.display = "flex";
});