// ─── Global State ────────────────────────────────────────────────────────────
let currentUser = null;
const API_URL = '/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function showToast(message, type = 'default') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = message;
  if (type === 'success') toast.style.borderLeftColor = 'var(--secondary-color)';
  if (type === 'error') toast.style.borderLeftColor = 'var(--accent-color)';
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function renderStars(rating) {
  const rounded = Math.round(rating);
  return Array.from({ length: 5 }, (_, i) => i < rounded ? '★' : '☆').join('');
}

// Deterministic color from username
function avatarColor(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 60%, 55%)`;
}

function avatarHTML(username, size = 36) {
  const color = avatarColor(username);
  const letter = username[0].toUpperCase();
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${color};color:#fff;font-weight:800;font-size:${Math.round(size * 0.45)}px;flex-shrink:0;">${letter}</span>`;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function initUser() {
  const storedId = localStorage.getItem('userId');
  const storedUsername = localStorage.getItem('username');
  if (storedId && storedUsername) {
    currentUser = { id: parseInt(storedId), username: storedUsername };
    updateUserUI();
  } else {
    const modal = document.getElementById('login-modal');
    if (modal) modal.classList.add('active');
  }
}

function setupLogin() {
  const form = document.getElementById('login-form');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const authTitle = document.getElementById('auth-title');
  const authDesc = document.getElementById('auth-desc');
  const authSubmit = document.getElementById('auth-submit');
  const warning = document.getElementById('register-warning');

  document.getElementById('close-modal')?.addEventListener('click', () => {
    document.getElementById('login-modal')?.classList.remove('active');
  });

  let isLoginMode = true;

  function setMode(login) {
    isLoginMode = login;
    tabLogin.className = login ? 'btn btn-primary' : 'btn btn-secondary';
    tabRegister.className = login ? 'btn btn-secondary' : 'btn btn-primary';
    authTitle.innerText = login ? 'Bon retour Gourmet !' : 'Rejoignez-nous !';
    authDesc.innerText = login ? 'Entrez vos identifiants pour vous connecter.' : 'Créez votre compte pour noter et partager.';
    authSubmit.innerText = login ? 'Se connecter' : 'Créer mon compte';
    warning.style.display = login ? 'none' : 'block';
  }

  tabLogin?.addEventListener('click', () => setMode(true));
  tabRegister?.addEventListener('click', () => setMode(false));

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pseudo = document.getElementById('pseudo').value.trim();
    const password = document.getElementById('password')?.value || '';
    if (!pseudo || !password) { showToast('Pseudo et mot de passe requis', 'error'); return; }

    const endpoint = isLoginMode ? '/users/login' : '/users/register';
    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: pseudo, password })
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Erreur', 'error'); return; }

      localStorage.setItem('userId', data.id);
      localStorage.setItem('username', data.username);
      currentUser = { id: data.id, username: data.username };
      document.getElementById('login-modal').classList.remove('active');
      showToast(isLoginMode ? `Re-bonjour ${data.username} !` : `Compte créé pour ${data.username} !`, 'success');
      updateUserUI();
    } catch {
      showToast('Erreur de connexion', 'error');
    }
  });
}

function updateUserUI() {
  const ui = document.getElementById('user-ui');
  if (!ui || !currentUser) return;
  ui.innerHTML = `
    <div class="user-info" style="display:flex;align-items:center;gap:0.5rem;">
      <a href="profile.html?id=${currentUser.id}" class="btn btn-secondary" style="padding:0.4rem 0.8rem;font-size:0.8rem;display:flex;align-items:center;gap:0.5rem;">
        ${avatarHTML(currentUser.username, 24)}${currentUser.username}
      </a>
      <button id="logout-btn" class="btn btn-secondary" style="padding:0.4rem 0.8rem;font-size:0.8rem;">Déconnexion</button>
    </div>`;
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch(`${API_URL}/users/logout`, { method: 'POST', credentials: 'include' });
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    location.reload();
  });
}

// ─── Feed (index.html) ───────────────────────────────────────────────────────

let feedPage = 1;
let feedSearch = '';
let feedSize = '';

function injectFeedControls() {
  const main = document.querySelector('main .container > div:first-child');
  if (!main || document.getElementById('feed-controls')) return;
  const ctrl = document.createElement('div');
  ctrl.id = 'feed-controls';
  ctrl.style.cssText = 'display:flex;gap:1rem;margin-bottom:2rem;flex-wrap:wrap;justify-content:center;';
  ctrl.innerHTML = `
    <input id="search-input" type="text" class="form-control" placeholder="Rechercher une recette..." style="max-width:300px;flex:1;">
    <select id="size-filter" class="form-control" style="max-width:160px;">
      <option value="">Toutes les tailles</option>
      <option value="Simple">Simple</option>
      <option value="Double">Double</option>
      <option value="Maxi">Maxi</option>
      <option value="Giga">Giga</option>
    </select>
    <button id="search-btn" class="btn btn-primary">Rechercher</button>
  `;
  const grid = document.getElementById('tacos-grid');
  grid.parentNode.insertBefore(ctrl, grid);

  document.getElementById('search-btn').addEventListener('click', () => {
    feedSearch = document.getElementById('search-input').value.trim();
    feedSize = document.getElementById('size-filter').value;
    feedPage = 1;
    loadFeed();
  });
  document.getElementById('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('search-btn').click();
  });
}

function injectPagination(total, pages) {
  let pag = document.getElementById('feed-pagination');
  if (!pag) {
    pag = document.createElement('div');
    pag.id = 'feed-pagination';
    pag.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:1rem;margin-top:2rem;';
    document.getElementById('tacos-grid').insertAdjacentElement('afterend', pag);
  }
  pag.innerHTML = pages <= 1 ? '' : `
    <button class="btn btn-secondary" id="pag-prev" ${feedPage <= 1 ? 'disabled' : ''}>← Précédent</button>
    <span style="color:var(--text-secondary);font-size:0.9rem;">Page ${feedPage} / ${pages} &nbsp;(${total} recettes)</span>
    <button class="btn btn-secondary" id="pag-next" ${feedPage >= pages ? 'disabled' : ''}>Suivant →</button>
  `;
  document.getElementById('pag-prev')?.addEventListener('click', () => { feedPage--; loadFeed(); });
  document.getElementById('pag-next')?.addEventListener('click', () => { feedPage++; loadFeed(); });
}

async function loadFeed() {
  injectFeedControls();
  const grid = document.getElementById('tacos-grid');
  if (!grid) return;

  const params = new URLSearchParams({ page: feedPage, limit: 20 });
  if (feedSearch) params.set('search', feedSearch);
  if (feedSize) params.set('size', feedSize);

  try {
    const res = await fetch(`${API_URL}/recipes?${params}`);
    const { recipes, total, pages } = await res.json();

    if (recipes.length === 0) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><h3>Aucun Tacos trouvé.</h3><p>Soyez le premier à partager votre recette !</p></div>';
      injectPagination(0, 0);
      return;
    }

    grid.innerHTML = recipes.map(r => `
      <div class="taco-card" onclick="window.location.href='recipe.html?id=${r.id}'">
        <div class="taco-card-header">
          <div>
            <h3 class="taco-title">${r.name}</h3>
            <span class="taco-author" style="display:flex;align-items:center;gap:0.4rem;">
              ${avatarHTML(r.author_name, 20)}
              <a href="profile.html?id=${r.author_id}" style="color:inherit;text-decoration:underline;" onclick="event.stopPropagation()">${r.author_name}</a>
            </span>
          </div>
          <div class="taco-rating">${renderStars(r.avg_rating)} (${r.rating_count})</div>
        </div>
        <div class="taco-tags">
          <span class="tag tag-size">${r.size}</span>
          ${r.meats.slice(0, 2).map(m => `<span class="tag tag-meat">${m}</span>`).join('')}
          ${r.sauces.slice(0, 2).map(s => `<span class="tag tag-sauce">${s}</span>`).join('')}
          ${r.supplements.slice(0, 2).map(s => `<span class="tag tag-sup">${s}</span>`).join('')}
          ${(r.meats.length > 2 || r.sauces.length > 2 || r.supplements.length > 2) ? '<span class="tag">+</span>' : ''}
        </div>
        <p class="taco-desc">${r.description ? r.description.substring(0, 80) + '…' : 'Pas de description'}</p>
        <div style="margin-top:auto;display:flex;justify-content:space-between;color:var(--text-muted);font-size:0.85rem;">
          <span>💬 ${r.comment_count}</span>
          <span>🧀 ${r.gratinnage || 'Sans gratinnage'}</span>
        </div>
      </div>
    `).join('');

    injectPagination(total, pages);
  } catch {
    grid.innerHTML = '<div class="empty-state">Erreur lors du chargement.</div>';
  }
}

// ─── Create Recipe (create.html) ─────────────────────────────────────────────

function setupCreateForm(prefill = null) {
  const form = document.getElementById('create-form');
  if (!form) return;

  if (prefill) {
    document.getElementById('taco-name').value = prefill.name || '';
    document.getElementById('description').value = prefill.description || '';
    document.querySelector(`input[name="size"][value="${prefill.size}"]`)?.click();
    if (prefill.gratinnage) document.querySelector(`input[name="gratinnage"][value="${prefill.gratinnage}"]`)?.click();

    // Pre-check or add meats
    prefill.meats?.forEach(m => {
      const existing = document.querySelector(`input[name="meats"][value="${m}"]`);
      if (existing) { existing.checked = true; }
      else {
        const id = 'cm-' + Date.now() + Math.random();
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        div.innerHTML = `<input type="checkbox" name="meats" id="${id}" value="${m}" checked><label for="${id}">${m}</label>`;
        document.getElementById('meats-grid').appendChild(div);
      }
    });
    prefill.sauces?.forEach(s => {
      const existing = document.querySelector(`input[name="sauces"][value="${s}"]`);
      if (existing) { existing.checked = true; }
      else {
        const id = 'cs-' + Date.now() + Math.random();
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        div.innerHTML = `<input type="checkbox" name="sauces" id="${id}" value="${s}" checked><label for="${id}">${s}</label>`;
        document.getElementById('sauces-grid').appendChild(div);
      }
    });
    prefill.supplements?.forEach(s => {
      const existing = document.querySelector(`input[name="supplements"][value="${s}"]`);
      if (existing) { existing.checked = true; }
      else {
        const id = 'csup-' + Date.now() + Math.random();
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        div.innerHTML = `<input type="checkbox" name="supplements" id="${id}" value="${s}" checked><label for="${id}">${s}</label>`;
        document.getElementById('supplements-grid').appendChild(div);
      }
    });
  }

  function getMaxMeats() {
    const size = document.querySelector('input[name="size"]:checked')?.value;
    return { Simple: 1, Double: 2, Maxi: 3 }[size] || 10;
  }

  document.getElementById('meats-grid').addEventListener('change', (e) => {
    if (e.target.name === 'meats' && e.target.checked) {
      const max = getMaxMeats();
      if (document.querySelectorAll('input[name="meats"]:checked').length > max) {
        e.target.checked = false;
        showToast(`Taille choisie : ${max} viande(s) maximum.`, 'error');
      }
    }
  });

  document.querySelectorAll('input[name="size"]').forEach(i => {
    i.addEventListener('change', () => {
      const max = getMaxMeats();
      const checked = Array.from(document.querySelectorAll('input[name="meats"]:checked'));
      for (let j = max; j < checked.length; j++) checked[j].checked = false;
      if (checked.length > max) showToast(`Viandes en trop retirées (limite: ${max}).`, 'error');
    });
  });

  const addBtn = (btnId, inputId, gridId, name) => {
    document.getElementById(btnId)?.addEventListener('click', () => {
      const input = document.getElementById(inputId);
      const val = input.value.trim();
      if (!val) return;
      const id = name + '-' + Date.now();
      const div = document.createElement('div');
      div.className = 'checkbox-item';
      div.innerHTML = `<input type="checkbox" name="${name}" id="${id}" value="${val}" checked><label for="${id}">${val}</label>`;
      document.getElementById(gridId).appendChild(div);
      input.value = '';
    });
  };
  addBtn('btn-add-meat', 'custom-meat-input', 'meats-grid', 'meats');
  addBtn('btn-add-sauce', 'custom-sauce-input', 'sauces-grid', 'sauces');
  addBtn('btn-add-sup', 'custom-sup-input', 'supplements-grid', 'supplements');

  const editId = new URLSearchParams(window.location.search).get('edit');
  const isEdit = !!editId;
  if (isEdit) {
    document.querySelector('h1')?.classList.remove('text-gradient');
    document.querySelector('h1').innerText = 'Modifier votre Recette';
    document.querySelector('[type="submit"]').innerText = 'Sauvegarder les modifications';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return showToast('Vous devez être connecté !', 'error');

    const name = document.getElementById('taco-name').value;
    const size = document.querySelector('input[name="size"]:checked')?.value;
    const gratinnage = document.querySelector('input[name="gratinnage"]:checked')?.value || null;
    const description = document.getElementById('description').value;
    const meats = Array.from(document.querySelectorAll('input[name="meats"]:checked')).map(i => i.value);
    const sauces = Array.from(document.querySelectorAll('input[name="sauces"]:checked')).map(i => i.value);
    const supplements = Array.from(document.querySelectorAll('input[name="supplements"]:checked')).map(i => i.value);

    const url = isEdit ? `${API_URL}/recipes/${editId}` : `${API_URL}/recipes`;
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, size, gratinnage, description, meats, sauces, supplements })
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Erreur', 'error'); return; }
      showToast(isEdit ? 'Recette modifiée !' : 'Tacos créé avec succès !', 'success');
      setTimeout(() => window.location.href = isEdit ? `recipe.html?id=${editId}` : 'index.html', 1200);
    } catch {
      showToast('Erreur serveur', 'error');
    }
  });
}

// ─── Recipe Details (recipe.html) ────────────────────────────────────────────

async function loadRecipe() {
  const container = document.getElementById('recipe-container');
  if (!container) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) return window.location.href = 'index.html';

  try {
    const url = currentUser ? `${API_URL}/recipes/${id}?userId=${currentUser.id}` : `${API_URL}/recipes/${id}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Not found');
    const recipe = await res.json();

    document.title = `${recipe.name} - Note Ton Tacos`;

    const isAuthor = currentUser && currentUser.id === recipe.author_id;
    const authorActions = isAuthor ? `
      <div style="margin-top:1rem;display:flex;gap:0.8rem;justify-content:center;">
        <a href="create.html?edit=${recipe.id}" class="btn btn-secondary" style="font-size:0.85rem;padding:0.4rem 1rem;">✏️ Modifier</a>
        <button id="btn-delete-recipe" class="btn" style="background:rgba(220,53,69,0.2);color:#ff6b7a;border:1px solid rgba(220,53,69,0.4);font-size:0.85rem;padding:0.4rem 1rem;">🗑️ Supprimer</button>
      </div>` : '';

    document.getElementById('recipe-hero').innerHTML = `
      <h1 class="text-gradient" style="font-size:3rem;margin-bottom:0.5rem;">${recipe.name}</h1>
      <p style="font-size:1.2rem;color:var(--text-secondary);">
        Créé par
        <a href="profile.html?id=${recipe.author_id}" style="color:inherit;text-decoration:underline;display:inline-flex;align-items:center;gap:0.4rem;">
          ${avatarHTML(recipe.author_name, 22)} ${recipe.author_name}
        </a>
        le ${new Date(recipe.created_at).toLocaleDateString()}
      </p>
      <div style="font-size:2rem;margin-top:1rem;color:#ffc107;">${renderStars(recipe.avg_rating)}</div>
      <p style="color:var(--text-muted);">${recipe.rating_count} note(s)</p>
      <div style="margin-top:1.5rem;display:flex;gap:1rem;justify-content:center;">
        <button id="btn-fav" class="btn ${recipe.user_bookmark === 'favorite' ? 'btn-primary' : 'btn-secondary'}">
          ${recipe.user_bookmark === 'favorite' ? '❤️ Favori' : '🤍 Ajouter aux favoris'}
        </button>
        <button id="btn-todo" class="btn ${recipe.user_bookmark === 'todo' ? 'btn-primary' : 'btn-secondary'}">
          ${recipe.user_bookmark === 'todo' ? '📌 À tester (enregistré)' : '📍 À tester'}
        </button>
      </div>
      ${authorActions}
    `;

    document.getElementById('btn-fav').addEventListener('click', () => toggleBookmark(id, 'favorite'));
    document.getElementById('btn-todo').addEventListener('click', () => toggleBookmark(id, 'todo'));
    document.getElementById('btn-delete-recipe')?.addEventListener('click', () => deleteRecipe(id));

    document.getElementById('recipe-details').innerHTML = `
      <div class="glass-panel">
        <h3 style="margin-bottom:1rem;border-bottom:1px solid var(--border-color);padding-bottom:0.5rem;">Composition</h3>
        <p><strong>Taille :</strong> <span class="tag tag-size">${recipe.size}</span></p>
        <p style="margin-top:1rem;"><strong>Viandes & Plats :</strong></p>
        <div class="taco-tags" style="margin-top:0.5rem;">
          ${recipe.meats.length > 0 ? recipe.meats.map(m => `<span class="tag tag-meat">${m}</span>`).join('') : '<span class="text-muted">Aucune</span>'}
        </div>
        <p style="margin-top:1rem;"><strong>Sauces :</strong></p>
        <div class="taco-tags" style="margin-top:0.5rem;">
          ${recipe.sauces.length > 0 ? recipe.sauces.map(s => `<span class="tag tag-sauce">${s}</span>`).join('') : '<span class="text-muted">Aucune</span>'}
        </div>
        <p style="margin-top:1rem;"><strong>Suppléments :</strong></p>
        <div class="taco-tags" style="margin-top:0.5rem;">
          ${recipe.supplements.length > 0 ? recipe.supplements.map(s => `<span class="tag tag-sup">${s}</span>`).join('') : '<span class="text-muted">Aucun</span>'}
        </div>
        <p style="margin-top:1rem;"><strong>Gratinnage :</strong> ${recipe.gratinnage || 'Aucun'}</p>
      </div>
      <div class="glass-panel">
        <h3 style="margin-bottom:1rem;border-bottom:1px solid var(--border-color);padding-bottom:0.5rem;">Description de l'auteur</h3>
        <p>${recipe.description || 'Pas de description fournie.'}</p>
      </div>
    `;

    loadComments(id);
    loadRatings(id);
    setupInteractions(id);
  } catch {
    container.innerHTML = '<div class="empty-state">Recette introuvable</div>';
  }
}

async function deleteRecipe(id) {
  if (!confirm('Supprimer définitivement cette recette ?')) return;
  try {
    const res = await fetch(`${API_URL}/recipes/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
      showToast('Recette supprimée', 'success');
      setTimeout(() => window.location.href = 'index.html', 1000);
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch {
    showToast('Erreur serveur', 'error');
  }
}

async function loadComments(id) {
  const list = document.getElementById('comments-list');
  try {
    const res = await fetch(`${API_URL}/recipes/${id}/comments`);
    const comments = await res.json();

    if (comments.length === 0) {
      list.innerHTML = '<p class="text-muted">Soyez le premier à commenter !</p>';
      return;
    }

    list.innerHTML = comments.map(c => {
      const isOwn = currentUser && currentUser.id === c.user_id;
      return `
        <div class="comment-box" style="display:flex;gap:0.8rem;align-items:flex-start;">
          ${avatarHTML(c.author_name, 32)}
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
              <strong style="color:var(--secondary-color)">${c.author_name}</strong>
              <span style="font-size:0.8rem;color:var(--text-muted);">${new Date(c.created_at).toLocaleDateString()}</span>
              ${isOwn ? `<button onclick="deleteComment(${id}, ${c.id})" style="margin-left:auto;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.8rem;padding:0;" title="Supprimer">🗑️</button>` : ''}
            </div>
            <p style="margin-top:0.3rem;">${c.content}</p>
          </div>
        </div>`;
    }).join('');
  } catch {
    list.innerHTML = '<p>Erreur.</p>';
  }
}

async function loadRatings(id) {
  try {
    const res = await fetch(`${API_URL}/recipes/${id}/ratings`);
    const ratings = await res.json();
    if (!ratings.length) return;

    const starsMap = { 1: '★☆☆☆☆', 2: '★★☆☆☆', 3: '★★★☆☆', 4: '★★★★☆', 5: '★★★★★' };

    const section = document.createElement('div');
    section.style.cssText = 'margin-top:1.5rem;border-top:1px solid var(--border-color);padding-top:1.5rem;';
    section.innerHTML = `
      <h4 style="margin-bottom:1rem;color:var(--text-secondary);font-size:0.95rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">
        Notes des gourmet·e·s (${ratings.length})
      </h4>
      <div style="display:flex;flex-direction:column;gap:0.5rem;">
        ${ratings.map(r => `
          <div style="display:flex;align-items:center;gap:0.75rem;">
            ${avatarHTML(r.username, 26)}
            <a href="profile.html?id=${r.user_id}" style="color:var(--text-primary);text-decoration:none;font-weight:600;font-size:0.9rem;">${r.username}</a>
            <span style="color:#ffc107;font-size:0.95rem;letter-spacing:1px;">${starsMap[r.score] || ''}</span>
            <span style="color:var(--text-muted);font-size:0.8rem;margin-left:auto;">${new Date(r.created_at).toLocaleDateString()}</span>
          </div>
        `).join('')}
      </div>
    `;

    document.getElementById('rating-form')?.closest('div')?.appendChild(section);
  } catch {}
}

async function deleteComment(recipeId, commentId) {
  if (!confirm('Supprimer ce commentaire ?')) return;
  try {
    const res = await fetch(`${API_URL}/recipes/${recipeId}/comments/${commentId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (res.ok) loadComments(recipeId);
    else showToast('Erreur lors de la suppression', 'error');
  } catch {
    showToast('Erreur serveur', 'error');
  }
}

function setupInteractions(id) {
  document.getElementById('rating-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) { document.getElementById('login-modal').classList.add('active'); return; }
    const score = document.querySelector('input[name="rating"]:checked')?.value;
    if (!score) return;
    try {
      const res = await fetch(`${API_URL}/recipes/${id}/rating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ score: parseInt(score) })
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Erreur', 'error'); return; }
      showToast('Note enregistrée !', 'success');
      setTimeout(() => location.reload(), 1000);
    } catch {}
  });

  document.getElementById('comment-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) { document.getElementById('login-modal').classList.add('active'); return; }
    const content = document.getElementById('comment-content').value;
    if (!content) return;
    try {
      const res = await fetch(`${API_URL}/recipes/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Erreur', 'error'); return; }
      document.getElementById('comment-content').value = '';
      loadComments(id);
      showToast('Commentaire ajouté', 'success');
    } catch {}
  });
}

async function toggleBookmark(recipeId, type) {
  if (!currentUser) return showToast('Vous devez être connecté !', 'error');
  try {
    const res = await fetch(`${API_URL}/recipes/${recipeId}/bookmark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ type })
    });
    if (res.ok) loadRecipe();
    else showToast("Erreur lors de l'enregistrement", 'error');
  } catch {
    showToast('Erreur serveur', 'error');
  }
}

// ─── Profile (profile.html) ───────────────────────────────────────────────────

async function loadProfile(tab = 'created') {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) return;

  const usernameHeader = document.getElementById('profile-username');
  if (!usernameHeader) return;

  ['created', 'favorite', 'todo'].forEach(t => {
    document.getElementById(`tab-${t}`)?.classList.toggle('btn-primary', t === tab);
    document.getElementById(`tab-${t}`)?.classList.toggle('btn-secondary', t !== tab);
  });

  try {
    let url = `${API_URL}/users/${id}/profile`;
    if (tab === 'favorite') url = `${API_URL}/users/${id}/bookmarks?type=favorite`;
    if (tab === 'todo') url = `${API_URL}/users/${id}/bookmarks?type=todo`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();

    let recipesList = [];
    if (tab === 'created') {
      document.title = `Profil de ${data.user.username} - Note Ton Tacos`;
      usernameHeader.innerHTML = `<span style="display:flex;align-items:center;gap:0.8rem;">${avatarHTML(data.user.username, 48)} ${data.user.username}</span>`;
      document.getElementById('profile-date').innerText = new Date(data.user.created_at).toLocaleDateString();
      document.getElementById('stat-recipes').innerText = data.stats.recipe_count;
      document.getElementById('stat-ratings').innerText = data.stats.rating_count;
      document.getElementById('stat-avg').innerHTML = `${data.stats.avg_received || '0.0'} <span style="font-size:1.5rem;">★</span>`;
      recipesList = data.recipes;
    } else {
      recipesList = data;
    }

    const grid = document.getElementById('tacos-grid');
    if (recipesList.length === 0) {
      grid.innerHTML = `<div class="empty-state"><h3>Rien ici</h3><p>Pas encore de Tacos dans cette liste.</p></div>`;
      return;
    }

    grid.innerHTML = recipesList.map(r => `
      <div class="taco-card" onclick="window.location.href='recipe.html?id=${r.id}'">
        <div class="taco-card-header">
          <div>
            <h3 class="taco-title">${r.name}</h3>
            <span class="taco-author">par ${r.author_name} le ${new Date(r.created_at).toLocaleDateString()}</span>
          </div>
          <div class="taco-rating">${renderStars(r.avg_rating)} (${r.rating_count})</div>
        </div>
        <div class="taco-tags">
          <span class="tag tag-size">${r.size}</span>
          ${r.meats.slice(0, 2).map(m => `<span class="tag tag-meat">${m}</span>`).join('')}
          ${r.sauces.slice(0, 2).map(s => `<span class="tag tag-sauce">${s}</span>`).join('')}
          ${r.supplements.slice(0, 2).map(s => `<span class="tag tag-sup">${s}</span>`).join('')}
          ${(r.meats.length > 2 || r.sauces.length > 2 || r.supplements.length > 2) ? '<span class="tag">+</span>' : ''}
        </div>
        <p class="taco-desc">${r.description ? r.description.substring(0, 80) + '…' : 'Pas de description'}</p>
        <div style="margin-top:auto;display:flex;justify-content:space-between;color:var(--text-muted);font-size:0.85rem;">
          <span>💬 ${r.comment_count}</span>
          <span>🧀 ${r.gratinnage || 'Sans gratinnage'}</span>
        </div>
      </div>
    `).join('');
  } catch {
    if (tab === 'created') document.getElementById('profile-header').innerHTML = '<div class="empty-state">Profil introuvable</div>';
    document.getElementById('tacos-grid').innerHTML = '';
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Permet de masquer le clavier sur mobile lors d'un tap en dehors d'un champ
  document.addEventListener('touchstart', (e) => {
    const active = document.activeElement;
    if (active && ['INPUT', 'TEXTAREA'].includes(active.tagName)) {
      if (!e.target.closest('input, textarea, button, label, select')) {
        active.blur();
      }
    }
  }, { passive: true });

  const tc = document.createElement('div');
  tc.id = 'toast-container';
  document.body.appendChild(tc);

  setupLogin();
  await initUser();

  const path = window.location.pathname;

  if (path.includes('profile.html')) {
    document.getElementById('tab-created')?.addEventListener('click', () => loadProfile('created'));
    document.getElementById('tab-favorite')?.addEventListener('click', () => loadProfile('favorite'));
    document.getElementById('tab-todo')?.addEventListener('click', () => loadProfile('todo'));
    const params = new URLSearchParams(window.location.search);
    if (!params.get('id') && currentUser) window.location.replace(`profile.html?id=${currentUser.id}`);
    else loadProfile('created');

  } else if (path.includes('create.html')) {
    const editId = new URLSearchParams(window.location.search).get('edit');
    if (editId) {
      try {
        const res = await fetch(`${API_URL}/recipes/${editId}`);
        const recipe = await res.json();
        setupCreateForm(recipe);
      } catch {
        setupCreateForm();
      }
    } else {
      setupCreateForm();
    }

  } else if (path.includes('recipe.html')) {
    loadRecipe();

  } else {
    loadFeed();
  }
});
