const express = require('express');
const cors = require('cors');
const path = require('path');
const dbPromise = require('./db');
const leoProfanity = require('leo-profanity');
const sanitizeHtml = require('sanitize-html');
const bcrypt = require('bcryptjs');

// Load bilingual profanity dictionaries
leoProfanity.loadDictionary('en');
const enDict = leoProfanity.list();
leoProfanity.loadDictionary('fr');
const frDict = leoProfanity.list();
leoProfanity.clearList();
leoProfanity.add(enDict);
leoProfanity.add(frDict);

// Add extra custom "troll" or anatomical words missing from standard dictionary
const customBadWords = [
  'sperme', 'spermes', 'foutre', 'zizi', 'bite', 'chatte', 'couille', 'couilles',
  'pisse', 'vomi', 'caca', 'chiasse', 'smen', 'smegma'
];
leoProfanity.add(customBadWords);

function cleanText(text, maxLength = 500) {
  if (!text || typeof text !== 'string') return '';
  // Truncate to avoid huge texts
  let cleaned = text.substring(0, maxLength);
  // Strip out ALL HTML
  cleaned = sanitizeHtml(cleaned, { allowedTags: [], allowedAttributes: {} });
  // Censor bad words
  cleaned = leoProfanity.clean(cleaned);
  return cleaned.trim();
}

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, '../frontend')));

function parseCSV(str) {
  if (!str) return [];
  return str.split(',');
}

app.post('/api/users/register', async (req, res) => {
  const username = cleanText(req.body.username, 40);
  const password = req.body.password;
  
  if (!username) return res.status(400).json({ error: 'Pseudo requis' });
  if (!password || password.length < 4) return res.status(400).json({ error: 'Mot de passe requis (min 4 caractères)' });

  try {
    const db = await dbPromise;
    let user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (user) {
      return res.status(400).json({ error: 'Ce pseudo est déjà pris' });
    }
    
    const hash = await bcrypt.hash(password, 10);
    const result = await db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash]);
    user = await db.get('SELECT id, username, created_at FROM users WHERE id = ?', [result.lastID]);
    
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/users/login', async (req, res) => {
  const username = cleanText(req.body.username, 40);
  const password = req.body.password;
  
  if (!username || !password) return res.status(400).json({ error: 'Pseudo et mot de passe requis' });

  try {
    const db = await dbPromise;
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    
    if (!user || !user.password_hash) {
      return res.status(400).json({ error: 'Pseudo ou mot de passe incorrect' });
    }
    
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Pseudo ou mot de passe incorrect' });
    }
    
    res.json({
      id: user.id,
      username: user.username,
      created_at: user.created_at
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

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

    const query = `
      SELECT r.*, u.username as author_name,
      (SELECT COALESCE(AVG(score), 0) FROM ratings WHERE recipe_id = r.id) as avg_rating,
      (SELECT COUNT(*) FROM ratings WHERE recipe_id = r.id) as rating_count,
      (SELECT COUNT(*) FROM comments WHERE recipe_id = r.id) as comment_count,
      (SELECT GROUP_CONCAT(ingredient_name, ',') FROM recipe_ingredients WHERE recipe_id = r.id AND type='meat') as meats,
      (SELECT GROUP_CONCAT(ingredient_name, ',') FROM recipe_ingredients WHERE recipe_id = r.id AND type='sauce') as sauces,
      (SELECT GROUP_CONCAT(ingredient_name, ',') FROM recipe_ingredients WHERE recipe_id = r.id AND type='supplement') as supplements
      FROM recipes r
      JOIN users u ON r.author_id = u.id
      WHERE r.author_id = ?
      ORDER BY r.created_at DESC;
    `;
    const rows = await db.all(query, [id]);
    rows.forEach(r => {
      r.meats = parseCSV(r.meats);
      r.sauces = parseCSV(r.sauces);
      r.supplements = parseCSV(r.supplements);
    });

    res.json({
      user,
      stats,
      recipes: rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/recipes', async (req, res) => {
  try {
    const db = await dbPromise;
    const query = `
      SELECT r.*, u.username as author_name,
      (SELECT COALESCE(AVG(score), 0) FROM ratings WHERE recipe_id = r.id) as avg_rating,
      (SELECT COUNT(*) FROM ratings WHERE recipe_id = r.id) as rating_count,
      (SELECT COUNT(*) FROM comments WHERE recipe_id = r.id) as comment_count,
      (SELECT GROUP_CONCAT(ingredient_name, ',') FROM recipe_ingredients WHERE recipe_id = r.id AND type='meat') as meats,
      (SELECT GROUP_CONCAT(ingredient_name, ',') FROM recipe_ingredients WHERE recipe_id = r.id AND type='sauce') as sauces,
      (SELECT GROUP_CONCAT(ingredient_name, ',') FROM recipe_ingredients WHERE recipe_id = r.id AND type='supplement') as supplements
      FROM recipes r
      JOIN users u ON r.author_id = u.id
      ORDER BY r.created_at DESC;
    `;
    const rows = await db.all(query);
    rows.forEach(r => {
      r.meats = parseCSV(r.meats);
      r.sauces = parseCSV(r.sauces);
      r.supplements = parseCSV(r.supplements);
    });
    res.json(rows);
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
    const query = `
      SELECT r.*, u.username as author_name,
      (SELECT COALESCE(AVG(score), 0) FROM ratings WHERE recipe_id = r.id) as avg_rating,
      (SELECT COUNT(*) FROM ratings WHERE recipe_id = r.id) as rating_count,
      (SELECT GROUP_CONCAT(ingredient_name, ',') FROM recipe_ingredients WHERE recipe_id = r.id AND type='meat') as meats,
      (SELECT GROUP_CONCAT(ingredient_name, ',') FROM recipe_ingredients WHERE recipe_id = r.id AND type='sauce') as sauces,
      (SELECT GROUP_CONCAT(ingredient_name, ',') FROM recipe_ingredients WHERE recipe_id = r.id AND type='supplement') as supplements
      ${userId ? `, (SELECT type FROM bookmarks WHERE recipe_id = r.id AND user_id = ?) as user_bookmark` : ''}
      FROM recipes r
      JOIN users u ON r.author_id = u.id
      WHERE r.id = ?;
    `;
    const params = userId ? [userId, id] : [id];
    const row = await db.get(query, params);
    if (!row) return res.status(404).json({ error: 'Not found' });
    
    row.meats = parseCSV(row.meats);
    row.sauces = parseCSV(row.sauces);
    row.supplements = parseCSV(row.supplements);
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Bookmark routes
app.post('/api/recipes/:id/bookmark', async (req, res) => {
  const recipe_id = req.params.id;
  const { user_id, type } = req.body; // type = 'favorite' or 'todo'
  
  if (!user_id || !type) return res.status(400).json({ error: 'Missing user_id or type' });
  
  try {
    const db = await dbPromise;
    // Check if bookmark exists
    const existing = await db.get('SELECT type FROM bookmarks WHERE user_id = ? AND recipe_id = ?', [user_id, recipe_id]);
    
    if (existing) {
      if (existing.type === type) {
        // Remove if it's the exact same type (toggle off)
        await db.run('DELETE FROM bookmarks WHERE user_id = ? AND recipe_id = ?', [user_id, recipe_id]);
        return res.json({ status: 'removed' });
      } else {
        // Switch type
        await db.run('UPDATE bookmarks SET type = ? WHERE user_id = ? AND recipe_id = ?', [type, user_id, recipe_id]);
        return res.json({ status: 'updated' });
      }
    } else {
      // Add new
      await db.run('INSERT INTO bookmarks (user_id, recipe_id, type) VALUES (?, ?, ?)', [user_id, recipe_id, type]);
      return res.json({ status: 'added' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/users/:id/bookmarks', async (req, res) => {
  const { id } = req.params;
  const { type } = req.query; // optional filter
  
  try {
    const db = await dbPromise;
    let typeFilter = '';
    const params = [id];
    if (type) {
      typeFilter = 'AND b.type = ?';
      params.push(type);
    }
    
    const query = `
      SELECT r.*, u.username as author_name,
      (SELECT COALESCE(AVG(score), 0) FROM ratings WHERE recipe_id = r.id) as avg_rating,
      (SELECT COUNT(*) FROM ratings WHERE recipe_id = r.id) as rating_count,
      (SELECT COUNT(*) FROM comments WHERE recipe_id = r.id) as comment_count,
      (SELECT GROUP_CONCAT(ingredient_name, ',') FROM recipe_ingredients WHERE recipe_id = r.id AND type='meat') as meats,
      (SELECT GROUP_CONCAT(ingredient_name, ',') FROM recipe_ingredients WHERE recipe_id = r.id AND type='sauce') as sauces,
      (SELECT GROUP_CONCAT(ingredient_name, ',') FROM recipe_ingredients WHERE recipe_id = r.id AND type='supplement') as supplements
      FROM bookmarks b
      JOIN recipes r ON b.recipe_id = r.id
      JOIN users u ON r.author_id = u.id
      WHERE b.user_id = ? ${typeFilter}
      ORDER BY b.created_at DESC;
    `;
    const rows = await db.all(query, params);
    rows.forEach(r => {
      r.meats = parseCSV(r.meats);
      r.sauces = parseCSV(r.sauces);
      r.supplements = parseCSV(r.supplements);
    });

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/recipes', async (req, res) => {
  let { name, author_id, size, gratinnage, description, meats, sauces, supplements } = req.body;
  
  name = cleanText(name, 60);
  size = cleanText(size, 30);
  gratinnage = cleanText(gratinnage, 50);
  description = cleanText(description, 1500);
  
  if (!name || !author_id || !size) return res.status(400).json({ error: 'Missing required fields or invalid text' });
  
  const safeMeats = Array.isArray(meats) ? meats.map(m => cleanText(m, 40)).filter(m => m) : [];
  const safeSauces = Array.isArray(sauces) ? sauces.map(s => cleanText(s, 40)).filter(s => s) : [];
  const safeSupplements = Array.isArray(supplements) ? supplements.map(s => cleanText(s, 40)).filter(s => s) : [];
  
  // Strict meat count limits per size
  const limitMap = { 'Simple': 1, 'Double': 2, 'Maxi': 3, 'Giga': 10 };
  const maxMeats = limitMap[size] || 10;
  if (safeMeats.length > maxMeats) {
    return res.status(400).json({ error: `Too many meats for size ${size}. Limit is ${maxMeats}.` });
  }
  
  try {
    const db = await dbPromise;
    await db.run('BEGIN TRANSACTION');
    
    const recipeQuery = `
      INSERT INTO recipes (name, author_id, size, gratinnage, description)
      VALUES (?, ?, ?, ?, ?);
    `;
    const result = await db.run(recipeQuery, [name, author_id, size, gratinnage, description]);
    const recipeId = result.lastID;
    
    if (safeMeats && safeMeats.length > 0) {
      for (const m of safeMeats) {
        await db.run('INSERT INTO recipe_ingredients (recipe_id, type, ingredient_name) VALUES (?, ?, ?)', [recipeId, 'meat', m]);
      }
    }
    if (safeSauces && safeSauces.length > 0) {
      for (const s of safeSauces) {
        await db.run('INSERT INTO recipe_ingredients (recipe_id, type, ingredient_name) VALUES (?, ?, ?)', [recipeId, 'sauce', s]);
      }
    }
    if (safeSupplements && safeSupplements.length > 0) {
      for (const s of safeSupplements) {
        await db.run('INSERT INTO recipe_ingredients (recipe_id, type, ingredient_name) VALUES (?, ?, ?)', [recipeId, 'supplement', s]);
      }
    }
    
    await db.run('COMMIT');
    res.json({ id: recipeId, message: 'Recipe created successfully!' });
  } catch (err) {
    const db = await dbPromise;
    await db.run('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error during creation' });
  }
});

app.post('/api/recipes/:id/rating', async (req, res) => {
  const { id } = req.params;
  const { user_id, score } = req.body;
  if (!user_id || !score || score < 1 || score > 5) return res.status(400).json({ error: 'Invalid data' });
  
  try {
    const db = await dbPromise;
    const existing = await db.get('SELECT * FROM ratings WHERE recipe_id = ? AND user_id = ?', [id, user_id]);
    if (existing) {
      return res.status(400).json({ error: 'Vous avez déjà noté cette recette' });
    }
    const query = `
      INSERT INTO ratings (recipe_id, user_id, score) 
      VALUES (?, ?, ?)
    `;
    await db.run(query, [id, user_id, score]);
    
    const rating = await db.get('SELECT * FROM ratings WHERE recipe_id = ? AND user_id = ?', [id, user_id]);
    res.json(rating);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/recipes/:id/comments', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await dbPromise;
    const query = `
      SELECT c.*, u.username as author_name 
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.recipe_id = ?
      ORDER BY c.created_at DESC;
    `;
    const rows = await db.all(query, [id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/recipes/:id/comments', async (req, res) => {
  const { id } = req.params;
  const user_id = req.body.user_id;
  const content = cleanText(req.body.content, 1000);
  if (!user_id || !content) return res.status(400).json({ error: 'Invalid data' });
  
  try {
    const db = await dbPromise;
    const existing = await db.get('SELECT * FROM comments WHERE recipe_id = ? AND user_id = ?', [id, user_id]);
    if (existing) {
      return res.status(400).json({ error: 'Vous avez déjà commenté cette recette' });
    }
    const query = 'INSERT INTO comments (recipe_id, user_id, content) VALUES (?, ?, ?)';
    const result = await db.run(query, [id, user_id, content]);
    
    const fullComment = await db.get(`
      SELECT c.*, u.username as author_name 
      FROM comments c 
      JOIN users u ON c.user_id = u.id 
      WHERE c.id = ?`, [result.lastID]);
    res.json(fullComment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
