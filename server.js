// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const GRID_SIZE = 50;
const CELL_SIZE = 10; // utilisé uniquement pour calculs serveur
const TICK_INTERVAL = 100;

let snakes = {};
let food = [];
let rottenFood = [];
let yellowFood = [];
let flashingFood = [];
let blueFood = [];
let explosiveFood = [];
let nutrientFood = [];
let detachedSegments = [];
let collectibleSegments = [];

function randomCell() {
  return [
    Math.floor(Math.random() * GRID_SIZE) * CELL_SIZE,
    Math.floor(Math.random() * GRID_SIZE) * CELL_SIZE
  ];
}

function distSq(x1, y1, x2, y2) {
  let dx = x1 - x2;
  let dy = y1 - y2;
  return dx * dx + dy * dy;
}

function attractTo(head, elements) {
  for (let el of elements) {
    if (head[0] !== el[0]) el[0] += head[0] > el[0] ? CELL_SIZE : -CELL_SIZE;
    if (head[1] !== el[1]) el[1] += head[1] > el[1] ? CELL_SIZE : -CELL_SIZE;
  }
}

function eat(head, list) {
  const index = list.findIndex(f => f[0] === head[0] && f[1] === head[1]);
  if (index !== -1) {
    list.splice(index, 1);
    return true;
  }
  return false;
}

io.on('connection', socket => {
  console.log('Connecté :', socket.id);
  const startX = Math.floor(Math.random() * (GRID_SIZE - 3)) * CELL_SIZE;
  const startY = Math.floor(Math.random() * (GRID_SIZE - 3)) * CELL_SIZE;

  snakes[socket.id] = {
    body: [
      [startX, startY],
      [startX, startY + CELL_SIZE],
      [startX, startY + 2 * CELL_SIZE]
    ],
    dir: 'up',
    score: 0,
    superSpeedFrames: 0,
    invincibleFrames: 0,
    blueEffectFrames: 0,
    alive: true
  };

  socket.on('move', dir => {
    if (['up', 'down', 'left', 'right'].includes(dir)) {
      snakes[socket.id].dir = dir;
    }
  });

  socket.on('disconnect', () => {
    delete snakes[socket.id];
    console.log('Déconnecté :', socket.id);
  });

  socket.emit('init', { id: socket.id });
});

setInterval(() => {
  // Génération bonus
  if (Math.random() < 0.1) food.push(randomCell());
  if (Math.random() < 0.01) rottenFood.push(randomCell());
  if (Math.random() < 0.01) yellowFood.push(randomCell());
  if (Math.random() < 0.002) flashingFood.push(randomCell());
  if (Math.random() < 0.01) blueFood.push(randomCell());
  if (Math.random() < 0.01) explosiveFood.push(randomCell());
  if (Math.random() < 0.05) nutrientFood.push(randomCell());

  // Mise à jour serpents
  for (const id in snakes) {
    const s = snakes[id];
    if (!s.alive) continue;

    const head = [...s.body[0]];
    if (s.dir === 'up') head[1] -= CELL_SIZE;
    if (s.dir === 'down') head[1] += CELL_SIZE;
    if (s.dir === 'left') head[0] -= CELL_SIZE;
    if (s.dir === 'right') head[0] += CELL_SIZE;

    // Gestion bord + auto-collision
    if (s.invincibleFrames > 0) {
      head[0] = (head[0] + GRID_SIZE * CELL_SIZE) % (GRID_SIZE * CELL_SIZE);
      head[1] = (head[1] + GRID_SIZE * CELL_SIZE) % (GRID_SIZE * CELL_SIZE);
    } else {
      const outOfBounds = head[0] < 0 || head[0] >= GRID_SIZE * CELL_SIZE ||
                          head[1] < 0 || head[1] >= GRID_SIZE * CELL_SIZE;
      const hitsSelf = s.body.some(seg => seg[0] === head[0] && seg[1] === head[1]);
      if (outOfBounds || hitsSelf) {
        s.alive = false;
        continue;
      }
    }

    // Collecte de morceaux explosés
    let collectedIdx = collectibleSegments.findIndex(p => p.x === head[0] && p.y === head[1]);
    if (collectedIdx !== -1) {
      s.body.push([...s.body[s.body.length - 1]]);
      collectibleSegments.splice(collectedIdx, 1);
      s.score++;
    }

    s.body.unshift(head);

    if (eat(head, food)) {
      s.score++;
    } else if (eat(head, blueFood)) {
      s.blueEffectFrames = 50;
    } else if (eat(head, rottenFood) && s.invincibleFrames === 0) {
      const detached = s.body.splice(-5, 5);
      detached.forEach(seg => detachedSegments.push({ x: seg[0], y: seg[1], timer: 50 }));
      if (s.body.length === 0) s.alive = false;
    } else if (eat(head, yellowFood)) {
      s.superSpeedFrames = 50;
    } else if (eat(head, flashingFood)) {
      s.invincibleFrames = 150;
    } else if (eat(head, explosiveFood)) {
      let radius = 5 * CELL_SIZE;
      let toExplode = s.body.slice(1).filter(seg => distSq(head[0], head[1], seg[0], seg[1]) <= radius * radius);
      s.body = s.body.filter(seg => !toExplode.includes(seg));
      toExplode.forEach(seg => {
        let angle = Math.random() * 2 * Math.PI;
        let dx = Math.round(Math.cos(angle));
        let dy = Math.round(Math.sin(angle));
        if (dx !== 0 && dy !== 0) {
          if (Math.random() < 0.5) dx = 0; else dy = 0;
        }
        collectibleSegments.push({ x: seg[0], y: seg[1], dx, dy, stepsLeft: 20 });
      });
      s.score++;
    } else if (detachedSegments.some(p => p.x === head[0] && p.y === head[1])) {
      detachedSegments = detachedSegments.filter(p => !(p.x === head[0] && p.y === head[1]));
      s.score = Math.max(s.score - 1, 0);
    } else if (nutrientFood.some(f => f[0] === head[0] && f[1] === head[1])) {
      nutrientFood = nutrientFood.filter(f => !(f[0] === head[0] && f[1] === head[1]));
      s.score += 10;
    } else {
      s.body.pop();
    }

    // Effets temporaires
    if (s.blueEffectFrames > 0) {
      attractTo(head, food);
      s.blueEffectFrames--;
    }

    if (s.invincibleFrames > 0) {
      s.invincibleFrames--;
    }

    if (s.superSpeedFrames > 0) {
      s.superSpeedFrames--;
    }
  }

  // Mise à jour des crottes
  detachedSegments = detachedSegments.filter(p => --p.timer > 0);

  // Mise à jour des morceaux explosés
  for (let i = collectibleSegments.length - 1; i >= 0; i--) {
    let seg = collectibleSegments[i];
    if (seg.stepsLeft > 0) {
      seg.x += seg.dx * CELL_SIZE;
      seg.y += seg.dy * CELL_SIZE;
      seg.stepsLeft--;
    }
  }

  io.emit('state', {
    snakes,
    food,
    rottenFood,
    yellowFood,
    flashingFood,
    blueFood,
    explosiveFood,
    nutrientFood,
    detachedSegments,
    collectibleSegments
  });

}, TICK_INTERVAL);

server.listen(3000, () => {
  console.log('Serveur lancé sur http://localhost:3000');
});
