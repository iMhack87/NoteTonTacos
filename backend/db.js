const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

const dbPromise = open({
  filename: path.join(__dirname, 'tacos.sqlite'),
  driver: sqlite3.Database
}).then(async (db) => {
  await db.exec('PRAGMA foreign_keys = ON');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(100) NOT NULL,
      author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      size VARCHAR(20) NOT NULL,
      gratinnage VARCHAR(50),
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
      type VARCHAR(20) NOT NULL, -- 'meat' or 'sauce'
      ingredient_name VARCHAR(100) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(recipe_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
      type VARCHAR(20) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, recipe_id, type)
    );
  `);

  try {
    await db.get('SELECT password_hash FROM users LIMIT 1');
  } catch (e) {
    if (e.message.includes('no such column')) {
      console.log('Migrating database: adding password_hash column');
      await db.exec('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)');
    }
  }

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);
    CREATE INDEX IF NOT EXISTS idx_ratings_recipe_id ON ratings(recipe_id);
    CREATE INDEX IF NOT EXISTS idx_comments_recipe_id ON comments(recipe_id);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
    CREATE INDEX IF NOT EXISTS idx_recipes_author_id ON recipes(author_id);
  `);

  await db.run('INSERT OR IGNORE INTO users (username, password_hash) VALUES (?, ?)', ['ChefTacos', '$2a$10$wIX.bT9HhGz7N/rNxtt06.J4O7v7.2zW8L..BZbJq4XjJ.Yt/O26m']);
  await db.run('INSERT OR IGNORE INTO users (username, password_hash) VALUES (?, ?)', ['Gourmand87', '$2a$10$wIX.bT9HhGz7N/rNxtt06.J4O7v7.2zW8L..BZbJq4XjJ.Yt/O26m']);

  return db;
});

module.exports = dbPromise;
