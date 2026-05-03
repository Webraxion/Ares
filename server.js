const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const WebSocket = require('ws');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'ares.db');
const JWT_SECRET = process.env.JWT_SECRET || 'ares_secret_passphrase';
const ADMIN_USERNAME = 'Admin';
const ADMIN_PASSWORD = 'Wolodymer1994';

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_FILE);

function initDb() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT,
      rank TEXT,
      avatar TEXT,
      color TEXT,
      font TEXT,
      background TEXT,
      effects TEXT,
      about TEXT,
      experience INTEGER DEFAULT 0,
      favoriteTank TEXT,
      currency INTEGER DEFAULT 1500,
      createdAt TEXT,
      lastSeen TEXT,
      isBanned INTEGER DEFAULT 0,
      isMuted INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS publicMessages (
      id TEXT PRIMARY KEY,
      authorId TEXT,
      authorName TEXT,
      text TEXT,
      createdAt TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS directMessages (
      id TEXT PRIMARY KEY,
      fromId TEXT,
      toId TEXT,
      text TEXT,
      createdAt TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS friends (
      id TEXT PRIMARY KEY,
      ownerId TEXT,
      friendId TEXT,
      status TEXT,
      createdAt TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      authorId TEXT,
      authorName TEXT,
      text TEXT,
      media TEXT,
      likes INTEGER DEFAULT 0,
      createdAt TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      postId TEXT,
      authorId TEXT,
      authorName TEXT,
      text TEXT,
      createdAt TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      userId TEXT,
      type TEXT,
      payload TEXT,
      isRead INTEGER DEFAULT 0,
      createdAt TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS shopItems (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      price INTEGER,
      rarity TEXT,
      availableFor TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      condition TEXT,
      rewardCurrency INTEGER
    )`);

    db.get(`SELECT id FROM users WHERE username = ?`, [ADMIN_USERNAME], (err, row) => {
      if (err) {
        console.error(err);
        return;
      }
      if (!row) {
        const adminId = generateId();
        const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
        db.run(`INSERT INTO users (id, username, password, role, rank, avatar, createdAt, lastSeen, currency) VALUES (?, ?, ?, 'admin', 'Основатель', 'ares-core', ?, ?, 999999)`,
          [adminId, ADMIN_USERNAME, hash, new Date().toISOString(), new Date().toISOString()], err => {
            if (err) console.error('Admin create error:', err);
            else console.log('Created default admin account:', ADMIN_USERNAME);
          });
      }
    });

    db.get(`SELECT id FROM shopItems LIMIT 1`, (err, row) => {
      if (!row) {
        const items = [
          ['item-avatar-ares', 'Аватар ARES', 'Уникальная эмблема для профиля.', 300, 'rare', 'all'],
          ['item-bg-fire', 'Фон "Огненная броня"', 'Огненный фон профиля.', 500, 'epic', 'veterans'],
          ['item-effect-glow', 'Свечение ника', 'Динамический светящийся эффект.', 450, 'epic', 'all'],
          ['item-font-metal', 'Шрифт "Стальной"', 'Кастомный стиль для ника.', 250, 'rare', 'all']
        ];
        const stmt = db.prepare(`INSERT INTO shopItems (id, name, description, price, rarity, availableFor) VALUES (?, ?, ?, ?, ?, ?)`);
        items.forEach(item => stmt.run(item));
        stmt.finalize();
      }
    });

    db.get(`SELECT id FROM achievements LIMIT 1`, (err, row) => {
      if (!row) {
        const achievements = [
          ['achv-1', 'Новобранец', 'Зарегистрироваться и войти в личный кабинет.', 'register', 100],
          ['achv-2', 'Огненный голос', 'Написать 10 сообщений в чате клана.', 'chat_10', 250],
          ['achv-3', 'Маршал ARES', 'Получить звание офицера.', 'rank_officer', 500]
        ];
        const stmt = db.prepare(`INSERT INTO achievements (id, name, description, condition, rewardCurrency) VALUES (?, ?, ?, ?, ?)`);
        achievements.forEach(item => stmt.run(item));
        stmt.finalize();
      }
    });
  });
}

function generateId() {
  return [...Array(20)].map(() => Math.random().toString(36)[2]).join('');
}

function createToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = auth.slice(7);
  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    db.get(`SELECT * FROM users WHERE id = ?`, [payload.id], (err2, user) => {
      if (err2 || !user) return res.status(401).json({ error: 'User not found' });
      if (user.isBanned) return res.status(403).json({ error: 'User banned' });
      req.user = user;
      next();
    });
  });
}

function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function curatorMiddleware(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'curator')) {
    return res.status(403).json({ error: 'Curator or admin access required' });
  }
  next();
}

function sendNotification(userId, type, payload) {
  const id = generateId();
  db.run(`INSERT INTO notifications (id, userId, type, payload, createdAt) VALUES (?, ?, ?, ?, ?)`, [id, userId, type, JSON.stringify(payload), new Date().toISOString()]);
}

initDb();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const normalized = username.trim();
  const id = generateId();
  const hash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();

  db.run(`INSERT INTO users (id, username, password, role, rank, avatar, createdAt, lastSeen) VALUES (?, ?, ?, 'member', 'Новобранец', 'ares-sigil', ?, ?)`,
    [id, normalized, hash, now, now], err => {
      if (err) {
        return res.status(400).json({ error: 'Имя пользователя уже занято' });
      }
      const token = createToken({ id, username: normalized, role: 'member' });
      res.json({ token, user: { id, username: normalized, role: 'member', rank: 'Новобранец' } });
    });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

  db.get(`SELECT * FROM users WHERE username = ?`, [username.trim()], (err, user) => {
    if (err || !user) return res.status(400).json({ error: 'Неверный логин или пароль' });
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(400).json({ error: 'Неверный логин или пароль' });
    }
    const token = createToken(user);
    db.run(`UPDATE users SET lastSeen = ? WHERE id = ?`, [new Date().toISOString(), user.id]);
    res.json({ token, user: sanitizeUser(user) });
  });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

app.get('/api/users', authMiddleware, (req, res) => {
  const query = req.query.q || req.query.id || '';
  if (!query) {
    return res.status(400).json({ error: 'Search query is required' });
  }
  db.all(`SELECT id, username, role, rank, avatar, color, favoriteTank FROM users WHERE id = ? OR username LIKE ? LIMIT 20`, [query, `%${query}%`], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Search error' });
    res.json({ users: rows });
  });
});

app.put('/api/user/profile', authMiddleware, (req, res) => {
  const fields = ['avatar', 'color', 'font', 'background', 'effects', 'about', 'experience', 'favoriteTank'];
  const updates = [];
  const values = [];
  fields.forEach(field => {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  });
  if (!updates.length) {
    return res.status(400).json({ error: 'No profile fields provided' });
  }
  values.push(req.user.id);
  db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values, function (err) {
    if (err) return res.status(500).json({ error: 'Update failed' });
    db.get(`SELECT * FROM users WHERE id = ?`, [req.user.id], (err2, user) => {
      res.json({ user: sanitizeUser(user) });
    });
  });
});

app.get('/api/chat/public', authMiddleware, (req, res) => {
  db.all(`SELECT * FROM publicMessages ORDER BY createdAt DESC LIMIT 60`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Could not load messages' });
    res.json({ messages: rows.reverse() });
  });
});

app.post('/api/chat/public', authMiddleware, (req, res) => {
  if (req.user.isMuted) return res.status(403).json({ error: 'Вы замучены и не можете писать в чате.' });
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Text is required' });
  const id = generateId();
  const createdAt = new Date().toISOString();
  db.run(`INSERT INTO publicMessages (id, authorId, authorName, text, createdAt) VALUES (?, ?, ?, ?, ?)`, [id, req.user.id, req.user.username, text, createdAt], err => {
    if (err) return res.status(500).json({ error: 'Send failed' });
    const message = { id, authorId: req.user.id, authorName: req.user.username, text, createdAt };
    broadcast({ type: 'public-message', message });
    res.json({ message });
  });
});

app.get('/api/messages/:targetId', authMiddleware, (req, res) => {
  const targetId = req.params.targetId;
  db.all(`SELECT * FROM directMessages WHERE (fromId = ? AND toId = ?) OR (fromId = ? AND toId = ?) ORDER BY createdAt ASC`, [req.user.id, targetId, targetId, req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Could not load direct messages' });
    res.json({ messages: rows });
  });
});

app.post('/api/messages/:targetId', authMiddleware, (req, res) => {
  const targetId = req.params.targetId;
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Text is required' });
  const id = generateId();
  const createdAt = new Date().toISOString();
  db.run(`INSERT INTO directMessages (id, fromId, toId, text, createdAt) VALUES (?, ?, ?, ?, ?)`, [id, req.user.id, targetId, text, createdAt], err => {
    if (err) return res.status(500).json({ error: 'Send failed' });
    const msg = { id, fromId: req.user.id, toId: targetId, text, createdAt };
    sendDirectEvent(targetId, { type: 'direct-message', message: msg });
    res.json({ message: msg });
  });
});

app.get('/api/friends', authMiddleware, (req, res) => {
  db.all(`SELECT * FROM friends WHERE ownerId = ? ORDER BY createdAt DESC`, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Could not load friends' });
    res.json({ friends: rows });
  });
});

app.post('/api/friends/request', authMiddleware, (req, res) => {
  const friendId = req.body.friendId;
  if (!friendId) return res.status(400).json({ error: 'friendId is required' });
  const id = generateId();
  const now = new Date().toISOString();
  db.run(`INSERT INTO friends (id, ownerId, friendId, status, createdAt) VALUES (?, ?, ?, 'pending', ?)`, [id, req.user.id, friendId, now], err => {
    if (err) return res.status(500).json({ error: 'Request failed' });
    sendNotification(friendId, 'friend-request', { from: req.user.id, username: req.user.username });
    res.json({ success: true });
  });
});

app.post('/api/friends/accept', authMiddleware, (req, res) => {
  const requestId = req.body.requestId;
  if (!requestId) return res.status(400).json({ error: 'requestId is required' });
  db.get(`SELECT * FROM friends WHERE id = ? AND friendId = ? AND status = 'pending'`, [requestId, req.user.id], (err, request) => {
    if (err || !request) return res.status(404).json({ error: 'Request not found' });
    db.run(`UPDATE friends SET status = 'accepted' WHERE id = ?`, [requestId], err => {
      if (err) return res.status(500).json({ error: 'Accept failed' });
      const id = generateId();
      const now = new Date().toISOString();
      db.run(`INSERT INTO friends (id, ownerId, friendId, status, createdAt) VALUES (?, ?, ?, 'accepted', ?)`, [id, req.user.id, request.ownerId, now]);
      sendNotification(request.ownerId, 'friend-accepted', { from: req.user.id, username: req.user.username });
      res.json({ success: true });
    });
  });
});

app.get('/api/posts', authMiddleware, (req, res) => {
  db.all(`SELECT * FROM posts ORDER BY createdAt DESC LIMIT 40`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Could not load posts' });
    res.json({ posts: rows });
  });
});

app.post('/api/posts', authMiddleware, (req, res) => {
  const text = String(req.body.text || '').trim();
  const media = req.body.media || '';
  if (!text) return res.status(400).json({ error: 'Text is required' });
  const id = generateId();
  const now = new Date().toISOString();
  db.run(`INSERT INTO posts (id, authorId, authorName, text, media, createdAt) VALUES (?, ?, ?, ?, ?, ?)`, [id, req.user.id, req.user.username, text, media, now], err => {
    if (err) return res.status(500).json({ error: 'Could not post' });
    res.json({ post: { id, authorId: req.user.id, authorName: req.user.username, text, media, likes: 0, createdAt: now } });
  });
});

app.post('/api/posts/:postId/comment', authMiddleware, (req, res) => {
  const postId = req.params.postId;
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Text is required' });
  const id = generateId();
  const now = new Date().toISOString();
  db.run(`INSERT INTO comments (id, postId, authorId, authorName, text, createdAt) VALUES (?, ?, ?, ?, ?, ?)`, [id, postId, req.user.id, req.user.username, text, now], err => {
    if (err) return res.status(500).json({ error: 'Could not add comment' });
    res.json({ comment: { id, postId, authorId: req.user.id, authorName: req.user.username, text, createdAt: now } });
  });
});

app.get('/api/notifications', authMiddleware, (req, res) => {
  db.all(`SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 40`, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Could not load notifications' });
    res.json({ notifications: rows.map(row => ({ ...row, payload: JSON.parse(row.payload) })) });
  });
});

app.get('/api/shop', authMiddleware, (req, res) => {
  db.all(`SELECT * FROM shopItems ORDER BY price ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Could not load shop items' });
    res.json({ items: rows });
  });
});

app.post('/api/shop/purchase', authMiddleware, (req, res) => {
  const itemId = req.body.itemId;
  if (!itemId) return res.status(400).json({ error: 'itemId is required' });
  db.get(`SELECT * FROM shopItems WHERE id = ?`, [itemId], (err, item) => {
    if (err || !item) return res.status(404).json({ error: 'Item not found' });
    if (req.user.currency < item.price) return res.status(400).json({ error: 'Not enough currency' });
    db.run(`UPDATE users SET currency = currency - ? WHERE id = ?`, [item.price, req.user.id], err => {
      if (err) return res.status(500).json({ error: 'Purchase failed' });
      sendNotification(req.user.id, 'shop-purchase', { item: item.name, price: item.price });
      res.json({ success: true, item: item.name, balance: req.user.currency - item.price });
    });
  });
});

app.get('/api/achievements', authMiddleware, (req, res) => {
  db.all(`SELECT * FROM achievements`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Could not load achievements' });
    res.json({ achievements: rows });
  });
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  db.all(`SELECT id, username, role, rank, avatar, color, experience, currency, isBanned, isMuted, createdAt FROM users ORDER BY createdAt DESC LIMIT 100`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Could not load users' });
    res.json({ users: rows });
  });
});

app.post('/api/admin/user/:id/role', authMiddleware, curatorMiddleware, (req, res) => {
  const targetId = req.params.id;
  const role = req.body.role;
  if (!role) return res.status(400).json({ error: 'role is required' });
  if (targetId === req.user.id) return res.status(400).json({ error: 'Cannot change your own role' });
  db.run(`UPDATE users SET role = ? WHERE id = ?`, [role, targetId], err => {
    if (err) return res.status(500).json({ error: 'Could not update role' });
    res.json({ success: true });
  });
});

app.post('/api/admin/user/:id/rank', authMiddleware, curatorMiddleware, (req, res) => {
  const targetId = req.params.id;
  const rank = req.body.rank;
  if (!rank) return res.status(400).json({ error: 'rank is required' });
  db.run(`UPDATE users SET rank = ? WHERE id = ?`, [rank, targetId], err => {
    if (err) return res.status(500).json({ error: 'Could not update rank' });
    res.json({ success: true });
  });
});

app.post('/api/admin/user/:id/ban', authMiddleware, curatorMiddleware, (req, res) => {
  const targetId = req.params.id;
  db.run(`UPDATE users SET isBanned = 1 WHERE id = ?`, [targetId], err => {
    if (err) return res.status(500).json({ error: 'Ban failed' });
    res.json({ success: true });
  });
});

app.post('/api/admin/user/:id/mute', authMiddleware, curatorMiddleware, (req, res) => {
  const targetId = req.params.id;
  db.run(`UPDATE users SET isMuted = 1 WHERE id = ?`, [targetId], err => {
    if (err) return res.status(500).json({ error: 'Mute failed' });
    res.json({ success: true });
  });
});

app.delete('/api/admin/user/:id', authMiddleware, curatorMiddleware, (req, res) => {
  const targetId = req.params.id;
  if (targetId === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  db.run(`DELETE FROM users WHERE id = ?`, [targetId], err => {
    if (err) return res.status(500).json({ error: 'Delete failed' });
    res.json({ success: true });
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });
const sockets = new Map();

function broadcast(payload) {
  const string = JSON.stringify(payload);
  sockets.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(string);
    }
  });
}

function sendDirectEvent(userId, payload) {
  const ws = sockets.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

wss.on('connection', (ws, req) => {
  const params = new URLSearchParams(req.url.replace('/ws?', ''));
  const token = params.get('token');
  if (!token) {
    ws.close();
    return;
  }
  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) {
      ws.close();
      return;
    }
    sockets.set(payload.id, ws);
    ws.on('close', () => sockets.delete(payload.id));
    ws.on('message', message => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (e) {
        console.error('WS parse error', e);
      }
    });
  });
});

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    rank: user.rank,
    avatar: user.avatar,
    color: user.color,
    font: user.font,
    background: user.background,
    effects: user.effects,
    about: user.about,
    experience: user.experience,
    favoriteTank: user.favoriteTank,
    currency: user.currency,
    createdAt: user.createdAt,
    lastSeen: user.lastSeen,
    isBanned: user.isBanned,
    isMuted: user.isMuted
  };
}

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`ARES hub server started on http://localhost:${PORT}`);
});
