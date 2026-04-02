const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const dbPromise = require('./db');
const leoProfanity = require('leo-profanity');
const sanitizeHtml = require('sanitize-html');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set');
  process.exit(1);
}

// Load bilingual profanity dictionaries
leoProfanity.loadDictionary('en');
const enDict = leoProfanity.list();
leoProfanity.loadDictionary('fr');
const frDict = leoProfanity.list();
leoProfanity.clearList();
leoProfanity.add(enDict);
leoProfanity.add(frDict);
leoProfanity.add([
  'sperme', 'spermes', 'foutre', 'zizi', 'bite', 'chatte', 'couille', 'couilles',
  'pisse', 'vomi', 'caca', 'chiasse', 'smen', 'smegma'
]);

function cleanText(text, maxLength = 500) {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text.substring(0, maxLength);
  cleaned = sanitizeHtml(cleaned, { allowedTags: [], allowedAttributes: {} });
  cleaned = leoProfanity.clean(cleaned);
  return cleaned.trim();
}

function verifyToken(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expirée, reconnectez-vous' });
  }
}

const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Trop de tentatives, réessayez dans 15 minutes' }
});

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: ['https://tacos.akiraa.xyz', 'http://localhost:3000'], credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Separator unlikely to appear in ingredient names
const SEP = '|';
function parseList(str) {
  if (!str) return [];
  return str.split(SEP).filter(Boolean);
}

// ─── Auth ────────────────────────────────────────────────────────────────────

app.post('/api/users/register', authLimiter, async (req, res) => {
  const username = cleanText(req.body.username, 40);
  const password = req.body.password;

  if (!username) return res.status(400).json({ error: 'Pseudo requis' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Mot de passe requis (min 8 caractères)' });

  try {
    const db = await dbPromise;
    if (await db.get('SELECT id FROM users WHERE username = ?', [username])) {
      return res.status(400).json({ error: 'Ce pseudo est déjà pris' });
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash]);
    const user = await db.get('SELECT id, username, created_at FROM users WHERE id = ?', [result.lastID]);
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, COOKIE_OPTS);
    res.json({ id: user.id, username: user.username, created_at: user.created_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/users/login', authLimiter, async (req, res) => {
  const username = cleanText(req.body.username, 40);
  const password = req.body.password;

  if (!username || !password) return res.status(400).json({ error: 'Pseudo et mot de passe requis' });

  try {
    const db = await dbPromise;
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user?.password_hash || !await bcrypt.compare(password, user.password_hash)) {
      return res.status(400).json({ error: 'Pseudo ou mot de passe incorrect' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, COOKIE_OPTS);
    res.json({ id: user.id, username: user.username, created_at: user.created_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/users/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'strict' });
  res.json({ ok: true });
});

app.get('/api/me', verifyToken, async (req, res) => {
  try {
    const db = await dbPromise;
    const user = await db.get('SELECT id, username, created_at FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Users ───────────────────────────────────────────────────────────────────

app.get('/api/users/:id/profile', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await dbPromise;
    const user = await db.get('SELECT id, username, created_at FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const stats = await db.get(`
      SELECT
        (SELECT COUNT(*) FROM recipes WHERE author_id = ?) as recipe_count,
        (SELECT COUNT(*) FROM ratings WHERE user_id = ?) as rating_count,
        (SELECT ROUND(COALESCE(AVG(r.score), 0), 1) FROM ratings r JOIN recipes rec ON r.recipe_id = rec.id WHERE rec.author_id = ?) as avg_received
    `, [id, id, id]);

    const rows = await db.all(`
      SELECT r.*, u.username as author_name,
        COALESCE((SELECT AVG(score) FROM ratings WHERE recipe_id = r.id), 0) as avg_rating,
        (SELECT COUNT(*) FROM ratings WHERE recipe_id = r.id) as rating_count,
        (SELECT COUNT(*) FROM comments WHERE recipe_id = r.id) as comment_count,
        (SELECT GROUP_CONCAT(ingredient_name, '${SEP}') FROM recipe_ingredients WHERE recipe_id = r.id AND type='meat') as meats,
        (SELECT GROUP_CONCAT(ingredient_name, '${SEP}') FROM recipe_ingredients WHERE recipe_id = r.id AND type='sauce') as sauces,
        (SELECT GROUP_CONCAT(ingredient_name, '${SEP}') FROM recipe_ingredients WHERE recipe_id = r.id AND type='supplement') as supplements
      FROM recipes r JOIN users u ON r.author_id = u.id
      WHERE r.author_id = ? ORDER BY r.created_at DESC
    `, [id]);

    rows.forEach(r => { r.meats = parseList(r.meats); r.sauces = parseList(r.sauces); r.supplements = parseList(r.supplements); });
    res.json({ user, stats, recipes: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/users/:id/bookmarks', async (req, res) => {
  const { id } = req.params;
  const { type } = req.query;
  try {
    const db = await dbPromise;
    const params = [id];
    let typeFilter = '';
    if (type) { typeFilter = 'AND b.type = ?'; params.push(type); }

    const rows = await db.all(`
      SELECT r.*, u.username as author_name,
        COALESCE((SELECT AVG(score) FROM ratings WHERE recipe_id = r.id), 0) as avg_rating,
        (SELECT COUNT(*) FROM ratings WHERE recipe_id = r.id) as rating_count,
        (SELECT COUNT(*) FROM comments WHERE recipe_id = r.id) as comment_count,
        (SELECT GROUP_CONCAT(ingredient_name, '${SEP}') FROM recipe_ingredients WHERE recipe_id = r.id AND type='meat') as meats,
        (SELECT GROUP_CONCAT(ingredient_name, '${SEP}') FROM recipe_ingredients WHERE recipe_id = r.id AND type='sauce') as sauces,
        (SELECT GROUP_CONCAT(ingredient_name, '${SEP}') FROM recipe_ingredients WHERE recipe_id = r.id AND type='supplement') as supplements
      FROM bookmarks b JOIN recipes r ON b.recipe_id = r.id JOIN users u ON r.author_id = u.id
      WHERE b.user_id = ? ${typeFilter} ORDER BY b.created_at DESC
    `, params);

    rows.forEach(r => { r.meats = parseList(r.meats); r.sauces = parseList(r.sauces); r.supplements = parseList(r.supplements); });
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Recipes ─────────────────────────────────────────────────────────────────

app.get('/api/recipes', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const search = req.query.search ? `%${req.query.search.trim()}%` : null;
  const size = req.query.size || null;

  try {
    const db = await dbPromise;
    const conditions = [];
    const params = [];

    if (search) { conditions.push("(r.name LIKE ? OR r.description LIKE ?)"); params.push(search, search); }
    if (size) { conditions.push("r.size = ?"); params.push(size); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { total } = await db.get(`SELECT COUNT(*) as total FROM recipes r ${where}`, params);

    const rows = await db.all(`
      SELECT r.*, u.username as author_name,
        COALESCE((SELECT AVG(score) FROM ratings WHERE recipe_id = r.id), 0) as avg_rating,
        (SELECT COUNT(*) FROM ratings WHERE recipe_id = r.id) as rating_count,
        (SELECT COUNT(*) FROM comments WHERE recipe_id = r.id) as comment_count,
        (SELECT GROUP_CONCAT(ingredient_name, '${SEP}') FROM recipe_ingredients WHERE recipe_id = r.id AND type='meat') as meats,
        (SELECT GROUP_CONCAT(ingredient_name, '${SEP}') FROM recipe_ingredients WHERE recipe_id = r.id AND type='sauce') as sauces,
        (SELECT GROUP_CONCAT(ingredient_name, '${SEP}') FROM recipe_ingredients WHERE recipe_id = r.id AND type='supplement') as supplements
      FROM recipes r JOIN users u ON r.author_id = u.id
      ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    rows.forEach(r => { r.meats = parseList(r.meats); r.sauces = parseList(r.sauces); r.supplements = parseList(r.supplements); });
    res.json({ recipes: rows, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/recipes/:id', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.query;
  try {
    const db = await dbPromise;
    const row = await db.get(`
      SELECT r.*, u.username as author_name,
        COALESCE((SELECT AVG(score) FROM ratings WHERE recipe_id = r.id), 0) as avg_rating,
        (SELECT COUNT(*) FROM ratings WHERE recipe_id = r.id) as rating_count,
        (SELECT GROUP_CONCAT(ingredient_name, '${SEP}') FROM recipe_ingredients WHERE recipe_id = r.id AND type='meat') as meats,
        (SELECT GROUP_CONCAT(ingredient_name, '${SEP}') FROM recipe_ingredients WHERE recipe_id = r.id AND type='sauce') as sauces,
        (SELECT GROUP_CONCAT(ingredient_name, '${SEP}') FROM recipe_ingredients WHERE recipe_id = r.id AND type='supplement') as supplements
        ${userId ? `, (SELECT type FROM bookmarks WHERE recipe_id = r.id AND user_id = ${parseInt(userId)}) as user_bookmark` : ''}
      FROM recipes r JOIN users u ON r.author_id = u.id WHERE r.id = ?
    `, [id]);

    if (!row) return res.status(404).json({ error: 'Not found' });
    row.meats = parseList(row.meats);
    row.sauces = parseList(row.sauces);
    row.supplements = parseList(row.supplements);
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/recipes', verifyToken, async (req, res) => {
  let { name, size, gratinnage, description, meats, sauces, supplements } = req.body;
  const author_id = req.user.id;

  name = cleanText(name, 60);
  size = cleanText(size, 30);
  gratinnage = cleanText(gratinnage, 50);
  description = cleanText(description, 1500);

  if (!name || !size) return res.status(400).json({ error: 'Champs requis manquants' });

  const safeMeats = Array.isArray(meats) ? meats.map(m => cleanText(m, 40)).filter(Boolean) : [];
  const safeSauces = Array.isArray(sauces) ? sauces.map(s => cleanText(s, 40)).filter(Boolean) : [];
  const safeSupplements = Array.isArray(supplements) ? supplements.map(s => cleanText(s, 40)).filter(Boolean) : [];

  const limitMap = { Simple: 1, Double: 2, Maxi: 3, Giga: 10 };
  if (safeMeats.length > (limitMap[size] || 10)) {
    return res.status(400).json({ error: `Trop de viandes pour la taille ${size}` });
  }

  try {
    const db = await dbPromise;
    await db.run('BEGIN TRANSACTION');
    const { lastID: recipeId } = await db.run(
      'INSERT INTO recipes (name, author_id, size, gratinnage, description) VALUES (?, ?, ?, ?, ?)',
      [name, author_id, size, gratinnage, description]
    );
    for (const m of safeMeats) await db.run('INSERT INTO recipe_ingredients (recipe_id, type, ingredient_name) VALUES (?, ?, ?)', [recipeId, 'meat', m]);
    for (const s of safeSauces) await db.run('INSERT INTO recipe_ingredients (recipe_id, type, ingredient_name) VALUES (?, ?, ?)', [recipeId, 'sauce', s]);
    for (const s of safeSupplements) await db.run('INSERT INTO recipe_ingredients (recipe_id, type, ingredient_name) VALUES (?, ?, ?)', [recipeId, 'supplement', s]);
    await db.run('COMMIT');
    res.json({ id: recipeId, message: 'Recipe created successfully!' });
  } catch (err) {
    (await dbPromise).run('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/recipes/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  let { name, size, gratinnage, description, meats, sauces, supplements } = req.body;

  name = cleanText(name, 60);
  size = cleanText(size, 30);
  gratinnage = cleanText(gratinnage, 50);
  description = cleanText(description, 1500);

  if (!name || !size) return res.status(400).json({ error: 'Champs requis manquants' });

  const safeMeats = Array.isArray(meats) ? meats.map(m => cleanText(m, 40)).filter(Boolean) : [];
  const safeSauces = Array.isArray(sauces) ? sauces.map(s => cleanText(s, 40)).filter(Boolean) : [];
  const safeSupplements = Array.isArray(supplements) ? supplements.map(s => cleanText(s, 40)).filter(Boolean) : [];

  const limitMap = { Simple: 1, Double: 2, Maxi: 3, Giga: 10 };
  if (safeMeats.length > (limitMap[size] || 10)) {
    return res.status(400).json({ error: `Trop de viandes pour la taille ${size}` });
  }

  try {
    const db = await dbPromise;
    const recipe = await db.get('SELECT author_id FROM recipes WHERE id = ?', [id]);
    if (!recipe) return res.status(404).json({ error: 'Recette introuvable' });
    if (recipe.author_id !== req.user.id) return res.status(403).json({ error: 'Non autorisé' });

    await db.run('BEGIN TRANSACTION');
    await db.run('UPDATE recipes SET name=?, size=?, gratinnage=?, description=? WHERE id=?', [name, size, gratinnage, description, id]);
    await db.run('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [id]);
    for (const m of safeMeats) await db.run('INSERT INTO recipe_ingredients (recipe_id, type, ingredient_name) VALUES (?, ?, ?)', [id, 'meat', m]);
    for (const s of safeSauces) await db.run('INSERT INTO recipe_ingredients (recipe_id, type, ingredient_name) VALUES (?, ?, ?)', [id, 'sauce', s]);
    for (const s of safeSupplements) await db.run('INSERT INTO recipe_ingredients (recipe_id, type, ingredient_name) VALUES (?, ?, ?)', [id, 'supplement', s]);
    await db.run('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    (await dbPromise).run('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/recipes/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    const db = await dbPromise;
    const recipe = await db.get('SELECT author_id FROM recipes WHERE id = ?', [id]);
    if (!recipe) return res.status(404).json({ error: 'Recette introuvable' });
    if (recipe.author_id !== req.user.id) return res.status(403).json({ error: 'Non autorisé' });
    await db.run('DELETE FROM recipes WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Bookmarks ───────────────────────────────────────────────────────────────

app.post('/api/recipes/:id/bookmark', verifyToken, async (req, res) => {
  const recipe_id = req.params.id;
  const user_id = req.user.id;
  const { type } = req.body;
  if (!type) return res.status(400).json({ error: 'Missing type' });

  try {
    const db = await dbPromise;
    const existing = await db.get('SELECT type FROM bookmarks WHERE user_id = ? AND recipe_id = ?', [user_id, recipe_id]);
    if (existing) {
      if (existing.type === type) {
        await db.run('DELETE FROM bookmarks WHERE user_id = ? AND recipe_id = ?', [user_id, recipe_id]);
        return res.json({ status: 'removed' });
      }
      await db.run('UPDATE bookmarks SET type = ? WHERE user_id = ? AND recipe_id = ?', [type, user_id, recipe_id]);
      return res.json({ status: 'updated' });
    }
    await db.run('INSERT INTO bookmarks (user_id, recipe_id, type) VALUES (?, ?, ?)', [user_id, recipe_id, type]);
    res.json({ status: 'added' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Ratings ─────────────────────────────────────────────────────────────────

app.get('/api/recipes/:id/ratings', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await dbPromise;
    const rows = await db.all(`
      SELECT r.score, r.created_at, u.id as user_id, u.username
      FROM ratings r JOIN users u ON r.user_id = u.id
      WHERE r.recipe_id = ?
      ORDER BY r.created_at DESC
    `, [id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/recipes/:id/rating', verifyToken, async (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;
  const { score } = req.body;
  if (!score || score < 1 || score > 5) return res.status(400).json({ error: 'Note invalide' });

  try {
    const db = await dbPromise;
    if (await db.get('SELECT id FROM ratings WHERE recipe_id = ? AND user_id = ?', [id, user_id])) {
      return res.status(400).json({ error: 'Vous avez déjà noté cette recette' });
    }
    await db.run('INSERT INTO ratings (recipe_id, user_id, score) VALUES (?, ?, ?)', [id, user_id, score]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Comments ────────────────────────────────────────────────────────────────

app.get('/api/recipes/:id/comments', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await dbPromise;
    const rows = await db.all(`
      SELECT c.*, u.username as author_name
      FROM comments c JOIN users u ON c.user_id = u.id
      WHERE c.recipe_id = ? ORDER BY c.created_at DESC
    `, [id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/recipes/:id/comments', verifyToken, async (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;
  const content = cleanText(req.body.content, 1000);
  if (!content) return res.status(400).json({ error: 'Commentaire vide' });

  try {
    const db = await dbPromise;
    if (await db.get('SELECT id FROM comments WHERE recipe_id = ? AND user_id = ?', [id, user_id])) {
      return res.status(400).json({ error: 'Vous avez déjà commenté cette recette' });
    }
    const { lastID } = await db.run('INSERT INTO comments (recipe_id, user_id, content) VALUES (?, ?, ?)', [id, user_id, content]);
    const comment = await db.get('SELECT c.*, u.username as author_name FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?', [lastID]);
    res.json(comment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/recipes/:id/comments/:commentId', verifyToken, async (req, res) => {
  const { commentId } = req.params;
  try {
    const db = await dbPromise;
    const comment = await db.get('SELECT user_id FROM comments WHERE id = ?', [commentId]);
    if (!comment) return res.status(404).json({ error: 'Commentaire introuvable' });
    if (comment.user_id !== req.user.id) return res.status(403).json({ error: 'Non autorisé' });
    await db.run('DELETE FROM comments WHERE id = ?', [commentId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
