
const express  = require('express');
const router   = express.Router();
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const fs       = require('fs');
const path     = require('path');

const JWT_SECRET   = process.env.JWT_SECRET || 'geoventa_super_secret_key_2026';
const JWT_EXPIRES  = '7d';
const USERS_FILE   = path.join(__dirname, '../data/users.json');

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch { return []; }
}

function saveUsers(users) {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized — no token' });
  try {
    const decoded = verifyToken(token);
    const users   = loadUsers();
    const user    = users.find(u => u.id === decoded.sub);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = { id: user.id, email: user.email, firstName: user.firstName };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function safeUser(u) {
  return { id: u.id, email: u.email, firstName: u.firstName, createdAt: u.createdAt };
}

router.post('/register', async (req, res) => {
  const { email = '', password = '', firstName = '' } = req.body;

  if (!email || !password || !firstName) {
    return res.status(400).json({ error: 'firstName, email, and password are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const users = loadUsers();
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const hash = await bcrypt.hash(password, 12);
  const user = {
    id        : `u_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    email     : email.toLowerCase(),
    firstName,
    password  : hash,
    createdAt : new Date().toISOString()
  };

  users.push(user);
  saveUsers(users);

  const token = signToken(user.id);
  res.status(201).json({ token, user: safeUser(user) });
});

/* ── POST /api/auth/login ────────────────────────────────────────────── */
router.post('/login', async (req, res) => {
  const { email = '', password = '' } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const users = loadUsers();
  const user  = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'No account found with that email.' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Incorrect password. Please try again.' });
  }

  const token = signToken(user.id);
  res.json({ token, user: safeUser(user) });
});

/* ── GET /api/auth/verify ────────────────────────────────────────────── */
router.get('/verify', requireAuth, (req, res) => {
  res.json({ valid: true, user: req.user });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});


router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out — please delete your token client-side.' });
});

module.exports = { router, requireAuth };
