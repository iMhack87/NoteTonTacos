// Global State
let currentUser = null;
const API_URL = 'http://localhost:3000/api';

// Utility: Show Toast Notification
function showToast(message, type = 'default') {
  const container = document.getElementById('toast-container');
  if(!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = message;
  if(type === 'success') toast.style.borderLeftColor = 'var(--secondary-color)';
  
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Utility: Init User
async function initUser() {
  const storedUserId = localStorage.getItem('userId');
  const storedUsername = localStorage.getItem('username');
  if (storedUserId && storedUsername) {
    currentUser = { id: parseInt(storedUserId), username: storedUsername };
    updateUserUI();
  } else {
    // Show login modal
    const modal = document.getElementById('login-modal');
    if(modal) modal.classList.add('active');
  }
}

// Ensure Login DOM loaded
function setupLogin() {
  const form = document.getElementById('login-form');
  if(form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pseudo = document.getElementById('pseudo').value.trim();
      if(!pseudo) return;
      
      try {
        const res = await fetch(`${API_URL}/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: pseudo })
        });
        const data = await res.json();
        
        localStorage.setItem('userId', data.id);
        localStorage.setItem('username', data.username);
        currentUser = data;
        
        document.getElementById('login-modal').classList.remove('active');
        showToast(`Bienvenue ${pseudo} !`, 'success');
        updateUserUI();
      } catch (e) {
        showToast('Erreur de connexion', 'error');
      }
    });
  }
}

function updateUserUI() {
  const ui = document.getElementById('user-ui');
  if(ui && currentUser) {
    ui.innerHTML = `
      <div class="user-info">
        <span class="username-display">${currentUser.username}</span>
        <button id="logout-btn" class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">Déconnexion</button>
      </div>
    `;
    document.getElementById('logout-btn').addEventListener('click', () => {
      localStorage.removeItem('userId');
      localStorage.removeItem('username');
      location.reload();
    });
  }
}

function renderStars(rating) {
  let stars = '';
  const rounded = Math.round(rating);
  for(let i=1; i<=5; i++) {
    if(i <= rounded) stars += '★';
    else stars += '☆';
  }
  return stars;
}

// =====================================
// PAGES LOGIC
// =====================================

// Feed (index.html)
async function loadFeed() {
  const grid = document.getElementById('tacos-grid');
  if(!grid) return;
  
  try {
    const res = await fetch(`${API_URL}/recipes`);
    const recipes = await res.json();
    
    if(recipes.length === 0) {
      grid.innerHTML = '<div class="empty-state"><h3>Aucun Tacos pour le moment.</h3><p>Soyez le premier à partager votre recette !</p></div>';
      return;
    }
    
    grid.innerHTML = recipes.map(r => `
      <div class="taco-card" onclick="window.location.href='recipe.html?id=${r.id}'">
        <div class="taco-card-header">
          <div>
            <h3 class="taco-title">${r.name}</h3>
            <span class="taco-author">par ${r.author_name}</span>
          </div>
          <div class="taco-rating">${renderStars(r.avg_rating)} (${r.rating_count})</div>
        </div>
        <div class="taco-tags">
          <span class="tag tag-size">${r.size}</span>
          ${r.meats && r.meats.length > 0 ? r.meats.slice(0, 2).map(m => `<span class="tag tag-meat">${m}</span>`).join('') : ''}
          ${r.sauces && r.sauces.length > 0 ? r.sauces.slice(0, 2).map(s => `<span class="tag tag-sauce">${s}</span>`).join('') : ''}
          ${(r.meats && r.meats.length > 2) || (r.sauces && r.sauces.length > 2) ? '<span class="tag">+</span>' : ''}
        </div>
        <p class="taco-desc">${r.description ? r.description.substring(0, 80) + '...' : 'Pas de description'}</p>
        <div style="margin-top: auto; display: flex; justify-content: space-between; color: var(--text-muted); font-size: 0.85rem;">
          <span>💬 ${r.comment_count}</span>
          <span>🧀 ${r.gratinnage || 'Sans gratinnage'}</span>
        </div>
      </div>
    `).join('');
  } catch(e) {
    grid.innerHTML = '<div class="empty-state">Erreur lors du chargement. Assurez-vous que le serveur est lancé.</div>';
  }
}

// Create Recipe (create.html)
function setupCreateForm() {
  const form = document.getElementById('create-form');
  if(!form) return;

  // Custom Meats Logic
  const addMeatBtn = document.getElementById('btn-add-meat');
  if(addMeatBtn) {
    addMeatBtn.addEventListener('click', () => {
      const input = document.getElementById('custom-meat-input');
      const val = input.value.trim();
      if(!val) return;
      const id = 'cm-' + Date.now();
      const div = document.createElement('div');
      div.className = 'checkbox-item';
      div.innerHTML = `<input type="checkbox" name="meats" id="${id}" value="${val}" checked><label for="${id}">${val}</label>`;
      document.getElementById('meats-grid').appendChild(div);
      input.value = '';
    });
  }

  // Custom Sauces Logic
  const addSauceBtn = document.getElementById('btn-add-sauce');
  if(addSauceBtn) {
    addSauceBtn.addEventListener('click', () => {
      const input = document.getElementById('custom-sauce-input');
      const val = input.value.trim();
      if(!val) return;
      const id = 'cs-' + Date.now();
      const div = document.createElement('div');
      div.className = 'checkbox-item';
      div.innerHTML = `<input type="checkbox" name="sauces" id="${id}" value="${val}" checked><label for="${id}">${val}</label>`;
      document.getElementById('sauces-grid').appendChild(div);
      input.value = '';
    });
  }
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!currentUser) return showToast('Vous devez être connecté !', 'error');
    
    const name = document.getElementById('taco-name').value;
    const size = document.querySelector('input[name="size"]:checked').value;
    const gratinnage = document.querySelector('input[name="gratinnage"]:checked')?.value || null;
    const description = document.getElementById('description').value;
    
    const meats = Array.from(document.querySelectorAll('input[name="meats"]:checked')).map(i => i.value);
    const sauces = Array.from(document.querySelectorAll('input[name="sauces"]:checked')).map(i => i.value);
    
    const payload = {
      name,
      author_id: currentUser.id,
      size,
      gratinnage,
      description,
      meats,
      sauces
    };
    
    try {
      const res = await fetch(`${API_URL}/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if(res.ok) {
        showToast('Tacos créé avec succès !', 'success');
        setTimeout(() => window.location.href = 'index.html', 1500);
      } else {
        showToast('Erreur lors de la création');
      }
    } catch(e) {
      showToast('Erreur serveur');
    }
  });
}

// Recipe Details (recipe.html)
async function loadRecipe() {
  const container = document.getElementById('recipe-container');
  if(!container) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if(!id) return window.location.href = 'index.html';

  try {
    const res = await fetch(`${API_URL}/recipes/${id}`);
    if(!res.ok) throw new Error('Not found');
    const recipe = await res.json();
    
    document.title = `${recipe.name} - Note Ton Tacos`;
    document.getElementById('recipe-hero').innerHTML = `
      <h1 class="text-gradient" style="font-size: 3rem; margin-bottom: 0.5rem;">${recipe.name}</h1>
      <p style="font-size: 1.2rem; color: var(--text-secondary);">Créé par ${recipe.author_name} le ${new Date(recipe.created_at).toLocaleDateString()}</p>
      <div style="font-size: 2rem; margin-top: 1rem; color: #ffc107;">${renderStars(recipe.avg_rating)}</div>
      <p style="color: var(--text-muted);">${recipe.rating_count} note(s)</p>
    `;
    
    document.getElementById('recipe-details').innerHTML = `
      <div class="glass-panel">
        <h3 style="margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">Composition</h3>
        <p><strong>Taille :</strong> <span class="tag tag-size">${recipe.size}</span></p>
        <p style="margin-top: 1rem;"><strong>Viandes & Plats :</strong></p>
        <div class="taco-tags" style="margin-top: 0.5rem;">
          ${recipe.meats && recipe.meats.length > 0 ? recipe.meats.map(m => `<span class="tag tag-meat">${m}</span>`).join('') : '<span class="text-muted">Aucune</span>'}
        </div>
        <p style="margin-top: 1rem;"><strong>Sauces :</strong></p>
        <div class="taco-tags" style="margin-top: 0.5rem;">
          ${recipe.sauces && recipe.sauces.length > 0 ? recipe.sauces.map(s => `<span class="tag tag-sauce">${s}</span>`).join('') : '<span class="text-muted">Aucune</span>'}
        </div>
        <p style="margin-top: 1rem;"><strong>Gratinnage :</strong> ${recipe.gratinnage || 'Aucun'}</p>
      </div>
      <div class="glass-panel">
        <h3 style="margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">Description de l'auteur</h3>
        <p>${recipe.description || 'Pas de description fournie.'}</p>
      </div>
    `;
    
    loadComments(id);
    setupInteractions(id);
  } catch(e) {
    container.innerHTML = '<div class="empty-state">Recette introuvable</div>';
  }
}

async function loadComments(id) {
  const list = document.getElementById('comments-list');
  try {
    const res = await fetch(`${API_URL}/recipes/${id}/comments`);
    const comments = await res.json();
    
    if(comments.length === 0) {
      list.innerHTML = '<p class="text-muted">Soyez le premier à commenter !</p>';
      return;
    }
    
    list.innerHTML = comments.map(c => `
      <div class="comment-box">
        <strong style="color: var(--secondary-color)">${c.author_name}</strong>
        <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 0.5rem;">${new Date(c.created_at).toLocaleDateString()}</span>
        <p style="margin-top: 0.5rem;">${c.content}</p>
      </div>
    `).join('');
  } catch(e) {
    list.innerHTML = '<p>Erreur.</p>';
  }
}

function setupInteractions(id) {
  // Rating form
  const ratingForm = document.getElementById('rating-form');
  if(ratingForm) {
    ratingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if(!currentUser) {
        document.getElementById('login-modal').classList.add('active');
        return;
      }
      const score = document.querySelector('input[name="rating"]:checked')?.value;
      if(!score) return;
      
      try {
        await fetch(`${API_URL}/recipes/${id}/rating`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: currentUser.id, score: parseInt(score) })
        });
        showToast('Note enregistrée !', 'success');
        setTimeout(() => location.reload(), 1000);
      } catch(e) {}
    });
  }

  // Comment form
  const commentForm = document.getElementById('comment-form');
  if(commentForm) {
    commentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if(!currentUser) {
        document.getElementById('login-modal').classList.add('active');
        return;
      }
      const content = document.getElementById('comment-content').value;
      if(!content) return;
      
      try {
        await fetch(`${API_URL}/recipes/${id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: currentUser.id, content })
        });
        document.getElementById('comment-content').value = '';
        loadComments(id);
        showToast('Commentaire ajouté', 'success');
      } catch(e) {}
    });
  }
}

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
  const tc = document.createElement('div');
  tc.id = 'toast-container';
  document.body.appendChild(tc);

  setupLogin();
  initUser();
  
  loadFeed();
  setupCreateForm();
  loadRecipe();
});
