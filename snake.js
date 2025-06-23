let socket;
let myId;
let snakes = {};

const GRID_SIZE = 200;
let cellSize;
let offsetX, offsetY;

function setup() {
  const size = min(windowWidth, windowHeight);
  cellSize = floor(size / GRID_SIZE);
  createCanvas(cellSize * GRID_SIZE, cellSize * GRID_SIZE);
  frameRate(10);

  offsetX = (windowWidth - width) / 2;
  offsetY = (windowHeight - height) / 2;

  socket = io();

  socket.on("init", (data) => {
    myId = data.id;
  });

  socket.on("state", (data) => {
    snakes = data;
  });
}

function draw() {
  background(220);

  push();
  translate(offsetX, offsetY);
  drawGrid();

  for (const id in snakes) {
    const snake = snakes[id];
    fill(id === myId ? "blue" : "red");
    for (const segment of snake.body) {
      rect(segment[0] * cellSize, segment[1] * cellSize, cellSize, cellSize);
    }
  }

  pop();
}

function keyPressed() {
  let dir;
  if (keyCode === UP_ARROW) dir = "up";
  else if (keyCode === DOWN_ARROW) dir = "down";
  else if (keyCode === LEFT_ARROW) dir = "left";
  else if (keyCode === RIGHT_ARROW) dir = "right";
  if (dir) socket.emit("move", dir);
}

function drawGrid() {
  stroke(200);
  for (let i = 0; i <= GRID_SIZE; i++) {
    line(i * cellSize, 0, i * cellSize, GRID_SIZE * cellSize);
    line(0, i * cellSize, GRID_SIZE * cellSize, i * cellSize);
  }
}
