// --- STATE & STORAGE ---
let localChanges = {
  added: [],
  modified: {},
  deleted: [],
  favorites: {}
};

let baseRecipes = []; // Static database (recipes.json)
let allRecipes = [];  // Merged recipes list (base + modifications)

// IndexedDB Helper Wrapper
const DB_NAME = 'BistroGemDB';
const STORE_NAME = 'user_changes';

function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getChange(key) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveChange(key, value) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Load changes from IndexedDB
async function loadLocalChanges() {
  try {
    localChanges.added = (await getChange('added')) || [];
    localChanges.modified = (await getChange('modified')) || {};
    localChanges.deleted = (await getChange('deleted')) || [];
    localChanges.favorites = (await getChange('favorites')) || {};
  } catch (e) {
    console.error("Eroare la încărcarea modificărilor locale din IndexedDB, se folosesc valorile implicite.", e);
  }
}

// Save all changes back to IndexedDB
async function persistLocalChanges() {
  await saveChange('added', localChanges.added);
  await saveChange('modified', localChanges.modified);
  await saveChange('deleted', localChanges.deleted);
  await saveChange('favorites', localChanges.favorites);
}

// --- DATABASE MERGE ALGORITHM ---
function mergeRecipes(staticList, changes) {
  const map = new Map();
  
  // 1. Process static recipes from base database
  for (const r of staticList) {
    if (changes.deleted.includes(r.Id)) continue; // Skip deleted recipes
    
    const merged = { ...r };
    
    // Parse JSON strings to objects if they are strings (typical of sqlite dump outputs)
    if (typeof merged.Ingredients === 'string') {
      try { merged.Ingredients = JSON.parse(merged.Ingredients); }
      catch(e) { merged.Ingredients = []; }
    }
    if (typeof merged.Instructions === 'string') {
      try { merged.Instructions = JSON.parse(merged.Instructions); }
      catch(e) { merged.Instructions = []; }
    }
    
    // Apply field modifications (diffs) if present
    if (changes.modified[r.Id]) {
      Object.assign(merged, changes.modified[r.Id]);
    }
    
    // Apply favorite state override
    if (r.Id in changes.favorites) {
      merged.IsFavorite = changes.favorites[r.Id];
    } else {
      merged.IsFavorite = !!merged.IsFavorite;
    }
    
    map.set(r.Id, merged);
  }
  
  // 2. Process added custom recipes
  for (const r of changes.added) {
    if (changes.deleted.includes(r.Id)) continue; // Skip if subsequently deleted
    
    const merged = { ...r };
    
    if (typeof merged.Ingredients === 'string') {
      try { merged.Ingredients = JSON.parse(merged.Ingredients); }
      catch(e) { merged.Ingredients = []; }
    }
    if (typeof merged.Instructions === 'string') {
      try { merged.Instructions = JSON.parse(merged.Instructions); }
      catch(e) { merged.Instructions = []; }
    }
    
    if (r.Id in changes.favorites) {
      merged.IsFavorite = changes.favorites[r.Id];
    } else {
      merged.IsFavorite = !!merged.IsFavorite;
    }
    
    map.set(r.Id, merged);
  }
  
  return Array.from(map.values());
}

async function initDatabase() {
  await loadLocalChanges();
  try {
    const res = await fetch('recipes.json');
    baseRecipes = await res.json();
  } catch (e) {
    console.error("Nu s-a putut încărca recipes.json static, se folosește doar starea locală", e);
    baseRecipes = [];
  }
  allRecipes = mergeRecipes(baseRecipes, localChanges);
}

// --- UTILITIES & PARSERS ---
function parseTimeSpan(ts) {
  if (!ts) return 0;
  // Format is "HH:MM:SS" or integer/decimal minutes
  if (typeof ts === 'number') return ts;
  if (!ts.includes(':')) return parseFloat(ts) || 0;
  
  const parts = ts.split(':');
  const hrs = parseInt(parts[0], 10) || 0;
  const mins = parseInt(parts[1], 10) || 0;
  const secs = parseInt(parts[2], 10) || 0;
  return hrs * 60 + mins + secs / 60;
}

function formatTimeSpan(totalMinutes) {
  const hrs = Math.floor(totalMinutes / 60);
  const mins = Math.floor(totalMinutes % 60);
  const secs = Math.round((totalMinutes % 1) * 60);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

function getDifficultyName(difficulty) {
  const diff = parseInt(difficulty, 10);
  switch (diff) {
    case 0: return "Ușor";
    case 1: return "Mediu";
    case 2: return "Greu";
    case 3: return "Expert";
    default: return typeof difficulty === 'string' ? difficulty : "Ușor";
  }
}

function getDifficultyColor(difficulty) {
  const diff = parseInt(difficulty, 10);
  switch (diff) {
    case 0: return "bg-green-50 text-green-600";
    case 1: return "bg-yellow-50 text-yellow-600";
    case 2: return "bg-orange-50 text-orange-600";
    case 3: return "bg-red-50 text-red-600";
    default: return "bg-gray-50 text-gray-600";
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generateUUID() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16).toUpperCase()
  );
}

function getCategoryIconIndex(category) {
  const norm = category.trim().toLowerCase();
  if (norm === "desert") return 1;
  if (norm === "franceză" || norm === "franceza") return 2;
  if (norm === "generală" || norm === "generala") return 0;
  if (norm === "indiană" || norm === "indiana") return 6;
  if (norm === "italiană" || norm === "italiana") return 3;
  if (norm === "mic dejun") return 4;
  if (norm === "românească" || norm === "romaneasca") return 0;
  if (norm === "supă" || norm === "supa") return 5;
  
  // Custom categories: hash name to pick from 10 icons
  let hash = 0;
  for (let i = 0; i < norm.length; i++) {
    hash = norm.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 10;
}

function getCategoryIconSvg(category) {
  const index = getCategoryIconIndex(category);
  const svgs = [
    // 0: Utensils
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"/><path d="m2.1 21.8 6.4-6.3"/><path d="m19 5-7 7"/></svg>`,
    // 1: Cake
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16h16"/><path d="M10 9V5a2 2 0 0 1 4 0v4"/><path d="M12 5V3"/></svg>`,
    // 2: Croissant
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.6 11.5 9.4 17.1a1 1 0 0 0 1.5 0l4.8-5.6c.7-.8.5-2-.4-2.5l-4.5-2.5a1.5 1.5 0 0 0-1.6 0l-4.5 2.5c-.9.5-1.1 1.7-.4 2.5z"/><path d="m8.5 7.5 1 2.5 1-2.5"/></svg>`,
    // 3: Pizza
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 11h.01M11 15h.01M16 16h.01M12 11h.01"/><path d="M2 12C2 6.5 6.5 2 12 2c5.5 0 10 4.5 10 10s-4.5 10-10 10C6.5 22 2 17.5 2 12z"/><path d="M12 2v20M2 12h20"/></svg>`,
    // 4: Coffee
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><path d="M6 2v2M10 2v2M14 2v2"/></svg>`,
    // 5: Soup
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M18 6v3M6 6v3"/><path d="M22 17a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5v-2h20Z"/></svg>`,
    // 6: Flame
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
    // 7: Wine
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 22h8M12 11v11M19 8a7 7 0 0 1-14 0V2h14v6zM5 8h14"/></svg>`,
    // 8: Apple
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c4.97 0 9-4.03 9-9 0-4.02-2.58-7.7-6.5-8.87a1 1 0 0 0-1 0L12 5l-1.5-.87a1 1 0 0 0-1 0C5.58 5.3 3 8.98 3 13c0 4.97 4.03 9 9 9z"/><path d="M12 5V2"/></svg>`,
    // 9: Fish
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 16s9-15 20-4C11 23 2 16 2 16z"/><path d="M22 12c-2.5 2.5-6 .5-6-2.5s3.5-5 6-2.5z"/><path d="M16 16c-1.5 1.5-4 1.5-6 0"/><path d="M8 8c.5-.5 1.5-.5 2 0"/></svg>`
  ];
  return svgs[index];
}

// --- SIDEBAR & MENU ---
function renderSidebarCategories() {
  const cuisines = new Set();
  for (const r of allRecipes) {
    if (r.CuisineType) cuisines.add(r.CuisineType);
  }
  const sortedCuisines = Array.from(cuisines).sort();
  
  const listContainer = document.getElementById('categories-list');
  const area = document.getElementById('categories-area');
  
  if (sortedCuisines.length > 0) {
    area.classList.remove('hidden');
    listContainer.innerHTML = sortedCuisines.map(c => `
      <a href="#/cuisine/${encodeURIComponent(c)}" id="nav-cuisine-${c.replace(/\s+/g, '-')}" class="flex items-center gap-3 px-4 py-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-600 text-sm">
        ${getCategoryIconSvg(c)}
        <span class="nav-text">${escapeHtml(c)}</span>
      </a>
    `).join('');
  } else {
    area.classList.add('hidden');
  }
}

function updateSidebarActiveState() {
  const hash = window.location.hash || '#/';
  
  document.querySelectorAll('#sidebar nav a').forEach(el => {
    el.classList.remove('bg-accent/10', 'text-accent', 'font-semibold');
    el.classList.add('text-gray-700', 'text-gray-600');
  });
  
  let activeEl = null;
  if (hash === '#/') {
    activeEl = document.getElementById('nav-home');
  } else if (hash === '#/recipes/new') {
    activeEl = document.getElementById('nav-new');
  } else if (hash === '#/favorites') {
    activeEl = document.getElementById('nav-favorites');
  } else if (hash === '#/local-changes') {
    activeEl = document.getElementById('nav-changes');
  } else if (hash.startsWith('#/cuisine/')) {
    const cuisine = decodeURIComponent(hash.substring(10));
    activeEl = document.getElementById(`nav-cuisine-${cuisine.replace(/\s+/g, '-')}`);
  }
  
  if (activeEl) {
    activeEl.classList.add('bg-accent/10', 'text-accent', 'font-semibold');
    activeEl.classList.remove('text-gray-700', 'text-gray-600');
  }
}

// Tip system
const cookingTips = [
  "Cuțitele ascuțite sunt mai sigure decât cele tocite.",
  "Sarea alimentelor în timpul gătirii, nu la final, pentru gust mai bogat.",
  "Lasă carnea să se odihnească 5-10 minute după prăjire pentru a păstra sucurile.",
  "Adaugă o linguriță de zahăr în sosurile de roșii pentru a echilibra aciditatea.",
  "Gătește usturoiul doar 30 de secunde pentru a evita gustul amar.",
  "Folosește apă rece pentru fierberea ouălor - previn crăparea.",
  "Adaugă o lingură de oțet în apa de fiert pentru ouă pochate perfecte.",
  "Prăjește condimentele în ulei pentru a elibera aromele.",
  "Nu îngrămădi tigaia - carnea se va fierbe în loc să se rumene.",
  "Gustă mâncarea în timpul gătirii - ajustează condimentele din mers.",
  "Pasta se adaugă în apă clocotită și sărată - ar trebui să aibă gust de mare.",
  "Lasă aluatul de plăcintă să se odihnească în frigider pentru crustă perfectă.",
  "Prăjește nucile și semințele pentru aromă intensificată.",
  "Adaugă verdeață proaspătă la final pentru culoare și gust vibrant."
];

function initTips() {
  const tipText = document.getElementById('tip-text');
  let index = 0;
  if (tipText) {
    tipText.textContent = cookingTips[0];
    setInterval(() => {
      index = (index + 1) % cookingTips.length;
      tipText.textContent = cookingTips[index];
    }, 30000);
  }
}

// Mobile sidebar Toggle
function initMobileMenu() {
  const menuBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  
  function toggle() {
    sidebar.classList.toggle('-translate-x-full');
    overlay.classList.toggle('hidden');
  }
  
  if (menuBtn && sidebar && overlay) {
    menuBtn.addEventListener('click', toggle);
    overlay.addEventListener('click', toggle);
    
    // Close on navigation
    window.addEventListener('hashchange', () => {
      sidebar.classList.add('-translate-x-full');
      overlay.classList.add('hidden');
    });
  }
}

// --- ACTIONS & MUTATORS ---
async function toggleFavorite(recipeId) {
  const recipe = allRecipes.find(r => r.Id === recipeId);
  if (!recipe) return;
  
  const newState = !recipe.IsFavorite;
  recipe.IsFavorite = newState;
  localChanges.favorites[recipeId] = newState;
  
  await saveChange('favorites', localChanges.favorites);
  allRecipes = mergeRecipes(baseRecipes, localChanges);
  
  // Re-run router to update view instantly
  router();
}

async function deleteRecipe(recipeId) {
  if (confirm("Sigur doriți să ștergeți această rețetă?")) {
    if (!localChanges.deleted.includes(recipeId)) {
      localChanges.deleted.push(recipeId);
    }
    // Clean up if it was a local added recipe
    localChanges.added = localChanges.added.filter(r => r.Id !== recipeId);
    delete localChanges.modified[recipeId];
    
    await persistLocalChanges();
    allRecipes = mergeRecipes(baseRecipes, localChanges);
    renderSidebarCategories();
    window.location.hash = '#/';
  }
}

async function addRecipe(recipeData) {
  const newId = generateUUID();
  const newRecipe = {
    Id: newId,
    LastModified: new Date().toISOString(),
    ...recipeData
  };
  localChanges.added.push(newRecipe);
  await persistLocalChanges();
  allRecipes = mergeRecipes(baseRecipes, localChanges);
  renderSidebarCategories();
  window.location.hash = '#/recipes/' + newId;
}

async function updateRecipe(recipeId, recipeData) {
  const nowStr = new Date().toISOString();
  
  // Check if it's an added custom recipe
  const addedIndex = localChanges.added.findIndex(r => r.Id === recipeId);
  if (addedIndex !== -1) {
    localChanges.added[addedIndex] = {
      ...localChanges.added[addedIndex],
      ...recipeData,
      LastModified: nowStr
    };
  } else {
    // If not, it is a modified base recipe
    localChanges.modified[recipeId] = {
      ...localChanges.modified[recipeId],
      ...recipeData,
      LastModified: nowStr
    };
  }
  
  await persistLocalChanges();
  allRecipes = mergeRecipes(baseRecipes, localChanges);
  renderSidebarCategories();
  window.location.hash = '#/recipes/' + recipeId;
}

// --- VIEW CARD TEMPLATE ---
function recipeCardHtml(recipe) {
  const prepTimeMins = parseTimeSpan(recipe.PrepTime);
  const cookTimeMins = parseTimeSpan(recipe.CookTime);
  const totalMins = Math.round(prepTimeMins + cookTimeMins);
  
  const favColor = recipe.IsFavorite ? 'text-red-500' : 'text-gray-400 hover:text-red-500';
  const favFill = recipe.IsFavorite ? 'currentColor' : 'none';
  
  const imageTag = recipe.ImageUrl 
    ? `<img src="${recipe.ImageUrl}" alt="${escapeHtml(recipe.Title)}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />`
    : `<div class="w-full h-full bg-gray-100 flex items-center justify-center text-gray-300">
         <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
         </svg>
       </div>`;

  return `
    <div class="break-inside-avoid mb-6 bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 group cursor-pointer relative"
         onclick="window.location.hash='#/recipes/${recipe.Id}'">
        <div class="relative overflow-hidden aspect-[4/3]">
            ${imageTag}
            
            <!-- Cuisine Badge -->
            <span class="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-primary uppercase tracking-wider shadow-sm z-10">
                ${escapeHtml(recipe.CuisineType)}
            </span>

            <!-- Quick View Overlay -->
            <div class="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px] z-10">
                <span class="bg-white text-primary font-bold px-4 py-2 rounded-full transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 shadow-lg">
                    Vezi Rețeta
                </span>
            </div>
        </div>

        <div class="p-5">
            <h3 class="font-title font-bold text-lg mb-2 text-primary leading-tight group-hover:text-accent transition-colors">${escapeHtml(recipe.Title)}</h3>
            
            <p class="text-sm text-gray-500 line-clamp-2 mb-4">${escapeHtml(recipe.Description)}</p>
            
            <div class="flex items-center justify-between text-xs text-gray-400 font-medium border-t border-gray-100 pt-4">
                <div class="flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <span>${totalMins} min</span>
                </div>
                <div class="flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    </svg>
                    <span>${recipe.Servings} porții</span>
                </div>
                <div class="flex items-center gap-1.5">
                    <button class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors pointer-events-auto ${favColor}"
                            onclick="event.stopPropagation(); toggleFavorite('${recipe.Id}')"
                            title="${recipe.IsFavorite ? 'Elimină din favorite' : 'Adaugă la favorite'}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="${favFill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    </div>
  `;
}

function renderMasonryGrid(recipes) {
  if (!recipes || recipes.length === 0) {
    return `
      <div class="text-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm p-10 max-w-lg mx-auto">
        <h3 class="font-title text-xl font-bold mb-2">Nicio rețetă găsită</h3>
        <p class="text-gray-500">Încearcă alte cuvinte cheie sau adaugă o rețetă nouă.</p>
      </div>
    `;
  }
  return `
    <div class="columns-1 sm:columns-2 lg:columns-3 gap-6 animate-fade-in-up">
      ${recipes.map(recipeCardHtml).join('')}
    </div>
  `;
}

// --- RENDERERS FOR VIEWS ---

// 1. HOME VIEW
let currentSearchQuery = "";
function renderHome() {
  const container = document.getElementById('app-view');
  
  const performFiltering = () => {
    const filtered = filterRecipes(currentSearchQuery);
    document.getElementById('grid-container').innerHTML = renderMasonryGrid(filtered);
  };
  
  container.innerHTML = `
    <div class="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
            <h2 class="font-title text-3xl font-bold text-primary mb-2">Cartea Mea de Bucate</h2>
            <p class="text-gray-500 font-medium">Descoperă și organizează-ți călătoria culinară.</p>
        </div>
        
        <div class="relative w-full md:w-80">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/>
                </svg>
            </div>
            <input type="text" id="search-input"
                   class="block w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-shadow"
                   placeholder="Caută rețete, ingrediente..."
                   value="${escapeHtml(currentSearchQuery)}" />
        </div>
    </div>
    
    <div id="grid-container"></div>
  `;
  
  // Setup realtime search with debounce
  const searchInput = document.getElementById('search-input');
  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(performFiltering, 200);
  });
  
  performFiltering();
}

// 2. CUISINE CATEGORY VIEW
function renderCuisine(cuisineName) {
  const container = document.getElementById('app-view');
  let searchQuery = "";
  
  const performFiltering = () => {
    const filtered = filterRecipes(searchQuery, cuisineName);
    document.getElementById('grid-container').innerHTML = renderMasonryGrid(filtered);
  };
  
  container.innerHTML = `
    <div class="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
            <h2 class="font-title text-3xl font-bold text-primary mb-2">${escapeHtml(cuisineName)}</h2>
            <p class="text-gray-500 font-medium">Rețete din categoria ${escapeHtml(cuisineName)}.</p>
        </div>
        
        <div class="relative w-full md:w-80">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/>
                </svg>
            </div>
            <input type="text" id="search-input"
                   class="block w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-shadow"
                   placeholder="Caută în această categorie..."
                   value="" />
        </div>
    </div>
    
    <div id="grid-container"></div>
  `;
  
  const searchInput = document.getElementById('search-input');
  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(performFiltering, 200);
  });
  
  performFiltering();
}

// 3. FAVORITES VIEW
function renderFavorites() {
  const container = document.getElementById('app-view');
  let searchQuery = "";
  
  const performFiltering = () => {
    const filtered = filterRecipes(searchQuery, null, true);
    document.getElementById('grid-container').innerHTML = renderMasonryGrid(filtered);
  };
  
  container.innerHTML = `
    <div class="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
            <h2 class="font-title text-3xl font-bold text-primary mb-2">Rețete Favorite</h2>
            <p class="text-gray-500 font-medium">Rețetele tale cele mai apreciate.</p>
        </div>
        
        <div class="relative w-full md:w-80">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/>
                </svg>
            </div>
            <input type="text" id="search-input"
                   class="block w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-shadow"
                   placeholder="Caută în favorite..."
                   value="" />
        </div>
    </div>
    
    <div id="grid-container"></div>
  `;
  
  const searchInput = document.getElementById('search-input');
  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(performFiltering, 200);
  });
  
  performFiltering();
}

// 4. RECIPE DETAIL VIEW (with Scale & Focus & Checkboxes)
let currentRecipeServings = 4;
let checkedIngredientsSet = new Set();
let focusModeStepIndex = 0;

function renderRecipeDetail(recipeId) {
  const container = document.getElementById('app-view');
  const recipe = allRecipes.find(r => r.Id === recipeId);
  
  if (!recipe) {
    container.innerHTML = `
      <div class="text-center py-20 max-w-lg mx-auto">
          <h3 class="font-title text-2xl font-bold text-primary mb-4">Rețeta nu a fost găsită</h3>
          <p class="text-gray-500 mb-8 font-medium">Ne pare rău, rețeta pe care o cauți nu există sau a fost ștearsă.</p>
          <a href="#/" class="inline-flex items-center gap-2 bg-accent text-white px-6 py-3 rounded-xl font-bold hover:bg-accent/90 transition-colors">
              Înapoi la Rețete
          </a>
      </div>
    `;
    return;
  }
  
  // Set initial state
  currentRecipeServings = recipe.Servings;
  checkedIngredientsSet.clear();
  
  const prepTimeMins = parseTimeSpan(recipe.PrepTime);
  const cookTimeMins = parseTimeSpan(recipe.CookTime);
  const totalMins = Math.round(prepTimeMins + cookTimeMins);
  
  const difficultyName = getDifficultyName(recipe.Difficulty);
  
  const favClass = recipe.IsFavorite ? 'text-red-500' : 'text-gray-400 hover:text-red-500';
  
  const renderDetailDom = () => {
    const isAdded = localChanges.added.some(r => r.Id === recipeId);
    const isModified = recipeId in localChanges.modified;
    const isCustom = isAdded || isModified;

    return `
      <!-- Hero Header -->
      <div class="grid lg:grid-cols-2 gap-10 mb-12 animate-fade-in-up">
          <div class="rounded-3xl overflow-hidden shadow-xl aspect-[4/3] relative group bg-gray-50">
               ${recipe.ImageUrl 
                 ? `<img src="${recipe.ImageUrl}" alt="${escapeHtml(recipe.Title)}" class="w-full h-full object-cover" />`
                 : `<div class="w-full h-full flex items-center justify-center text-gray-300">
                      <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                      </svg>
                    </div>`
               }
              <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-8">
                   <button class="bg-white/20 backdrop-blur-md hover:bg-white/30 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-3 transition-colors border border-white/30"
                           onclick="openFocusMode()">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                      </svg> 
                      Modul Gătit (Focus)
                  </button>
              </div>
          </div>
          
          <div class="flex flex-col justify-center">
              <div class="flex items-center gap-3 mb-2">
                <span class="text-accent font-bold uppercase tracking-wider">${escapeHtml(recipe.CuisineType)}</span>
                ${isCustom ? `<span class="bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded font-semibold uppercase tracking-wider">Modificat Local</span>` : ''}
              </div>
              <div class="flex items-start gap-4 mb-6">
                  <h1 class="font-title text-4xl md:text-5xl font-bold text-primary leading-tight flex-1">${escapeHtml(recipe.Title)}</h1>
                  <button class="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-md hover:shadow-lg active:shadow-sm transition-all text-gray-400 hover:text-accent"
                          onclick="window.location.hash='#/recipes/edit/${recipe.Id}'"
                          title="Editează rețeta">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                  </button>
                  <button class="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-md hover:shadow-lg active:shadow-sm transition-all text-gray-400 hover:text-red-500"
                          onclick="deleteRecipe('${recipe.Id}')"
                          title="Șterge rețeta">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>
                      </svg>
                  </button>
                  <button class="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-all ${favClass}"
                          onclick="toggleFavorite('${recipe.Id}')">
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="${recipe.IsFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                      </svg>
                  </button>
              </div>
              <p class="text-gray-500 text-lg leading-relaxed mb-8">${escapeHtml(recipe.Description)}</p>
              
              <div class="grid grid-cols-3 gap-4 border-t border-b border-gray-100 py-6">
                  <div>
                      <span class="block text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Timp</span>
                      <span class="font-title font-bold text-xl text-primary">${totalMins} min</span>
                  </div>
                  <div>
                       <span class="block text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Dificultate</span>
                      <span class="font-title font-bold text-xl text-primary">${difficultyName}</span>
                  </div>
                   <div>
                       <span class="block text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Porții Originale</span>
                      <span class="font-title font-bold text-xl text-primary">${recipe.Servings}</span>
                  </div>
              </div>
          </div>
      </div>
      
      <div class="grid md:grid-cols-12 gap-12">
          <!-- Ingredients Column -->
          <div class="md:col-span-4 space-y-8">
               <div class="sticky top-8">
                  <h3 class="font-title text-2xl font-bold text-primary mb-6">Ingrediente</h3>
                  
                  <!-- Scaling Component -->
                  <div class="mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center justify-between">
                      <span class="text-sm font-semibold text-gray-700">Porții</span>
                      <div class="flex items-center gap-3">
                          <button class="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100 hover:border-gray-300 font-bold"
                                  onclick="scaleServings(-1)">−</button>
                          <span id="servings-display" class="font-bold text-lg text-primary w-8 text-center">${currentRecipeServings}</span>
                          <button class="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100 hover:border-gray-300 font-bold"
                                  onclick="scaleServings(1)">+</button>
                      </div>
                  </div>
                  
                  <ul id="ingredients-list" class="space-y-4">
                      ${renderIngredientsList(recipe)}
                  </ul>
              </div>
          </div>
          
          <!-- Instructions Column -->
          <div class="md:col-span-8">
              <h3 class="font-title text-2xl font-bold text-primary mb-8">Instrucțiuni</h3>
              
              <div class="space-y-12 relative before:absolute before:left-4 before:top-4 before:bottom-0 before:w-0.5 before:bg-gray-100">
                  ${recipe.Instructions.sort((a,b) => a.StepNumber - b.StepNumber).map(inst => `
                       <div class="relative pl-12 group">
                           <!-- Step Number Bubble -->
                           <div class="absolute left-0 top-0 w-8 h-8 rounded-full bg-white border-2 border-gray-200 text-gray-400 font-bold flex items-center justify-center text-sm z-10 group-hover:border-accent group-hover:text-accent transition-colors">
                               ${inst.StepNumber}
                           </div>
                           
                           <p class="text-lg text-gray-700 leading-relaxed group-hover:text-primary transition-colors">
                               ${escapeHtml(inst.Text)}
                           </p>
                       </div>
                  `).join('')}
              </div>
          </div>
      </div>
    `;
  };
  
  container.innerHTML = renderDetailDom();
  
  // Helpers in window context for scaling servings & checklist
  window.scaleServings = (delta) => {
    const newServings = currentRecipeServings + delta;
    if (newServings >= 1 && newServings <= 100) {
      currentRecipeServings = newServings;
      document.getElementById('servings-display').textContent = currentRecipeServings;
      document.getElementById('ingredients-list').innerHTML = renderIngredientsList(recipe);
    }
  };
  
  window.toggleIngredientCheck = (ingId) => {
    if (checkedIngredientsSet.has(ingId)) {
      checkedIngredientsSet.delete(ingId);
    } else {
      checkedIngredientsSet.add(ingId);
    }
    document.getElementById('ingredients-list').innerHTML = renderIngredientsList(recipe);
  };
  
  window.openFocusMode = () => {
    focusModeStepIndex = 0;
    renderFocusMode(recipe);
  };
}

function renderIngredientsList(recipe) {
  const factor = currentRecipeServings / recipe.Servings;
  
  return recipe.Ingredients.sort((a,b) => a.Order - b.Order).map(ing => {
    const scaledAmount = ing.Amount * factor;
    const isChecked = checkedIngredientsSet.has(ing.Id);
    
    // Nice rounded display format: max 2 decimal places
    const formattedAmount = (Math.round(scaledAmount * 100) / 100).toString();
    
    const checkBg = isChecked ? 'bg-accent border-accent text-white' : 'border-gray-200 group-hover:border-accent';
    const textStyle = isChecked ? 'text-gray-400 line-through decoration-gray-300' : 'text-gray-700';
    
    const checkIcon = isChecked ? `
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    ` : '';
    
    return `
      <li class="flex items-start gap-3 group cursor-pointer" onclick="toggleIngredientCheck('${ing.Id}')">
           <div class="mt-1 w-5 h-5 rounded-full border-2 transition-colors flex items-center justify-center ${checkBg}">
               ${checkIcon}
           </div>
           <div class="${textStyle} transition-colors flex-1">
               <span class="font-bold">${formattedAmount} ${escapeHtml(ing.Unit)}</span>
               ${escapeHtml(ing.Name)}
           </div>
      </li>
    `;
  }).join('');
}

// 5. FOCUS MODE (Cook mode fullscreen)
function renderFocusMode(recipe) {
  const modal = document.getElementById('modal-container');
  const steps = recipe.Instructions.sort((a,b) => a.StepNumber - b.StepNumber);
  
  // Clean up any existing listeners on the modal before starting a new focus mode session
  if (modal._cleanupFocusMode) {
    modal._cleanupFocusMode();
  }

  // Initial render of the static container shell
  modal.innerHTML = `
    <div class="fixed inset-0 z-50 bg-primary text-white flex flex-col items-center justify-center p-6 md:p-10 animate-fade-in">
        <!-- Close button -->
        <button class="absolute top-6 right-6 p-4 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
                onclick="closeFocusMode()">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/>
            </svg>
        </button>

        <div id="focus-mode-content" class="max-w-4xl w-full flex-1 flex flex-col justify-center text-center p-4">
             <!-- Dynamic content goes here -->
        </div>
        
        <!-- Progress Dots -->
        <div id="focus-mode-dots" class="flex gap-2 mb-4">
             <!-- Dynamic progress dots go here -->
        </div>
    </div>
  `;

  const updateModalContent = () => {
    const currentStep = steps[focusModeStepIndex];
    if (!currentStep) return;
    
    const hasPrevious = focusModeStepIndex > 0;
    const hasNext = focusModeStepIndex < steps.length - 1;

    const contentArea = document.getElementById('focus-mode-content');
    const dotsArea = document.getElementById('focus-mode-dots');
    
    if (contentArea) {
      contentArea.innerHTML = `
           <div class="mb-4 text-accent font-bold uppercase tracking-widest text-sm">Pasul ${currentStep.StepNumber} / ${steps.length}</div>
           <h2 class="font-title text-3xl md:text-5xl lg:text-6xl font-bold leading-tight mb-12">
               ${escapeHtml(currentStep.Text)}
           </h2>
           
           <div class="flex items-center justify-center gap-8">
               <button class="px-8 py-4 rounded-xl border border-white/20 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-3 font-bold text-lg"
                       onclick="focusModePrev()" ${!hasPrevious ? 'disabled' : ''}>
                   <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                     <line x1="19" x2="5" y1="12" y2="12"/><polyline points="12 19 5 12 12 5"/>
                   </svg> 
                   Înapoi
               </button>
               <button class="px-8 py-4 rounded-xl bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-3 font-bold text-lg shadow-lg shadow-accent/20"
                       onclick="focusModeNext()" ${!hasNext ? 'disabled' : ''}>
                   Următorul 
                   <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                     <line x1="5" x2="19" y1="12" y2="12"/><polyline points="12 5 19 12 12 19"/>
                   </svg>
               </button>
           </div>
      `;
    }

    if (dotsArea) {
      dotsArea.innerHTML = steps.map((_, i) => `
        <div class="h-1.5 rounded-full transition-all duration-300 ${i === focusModeStepIndex ? 'w-8 bg-accent' : 'w-1.5 bg-white/20'}"></div>
      `).join('');
    }
  };
  
  // Show modal container
  modal.classList.remove('hidden');
  updateModalContent();
  
  // Try to acquire Wake Lock screen lock
  if (window.wakeLockAPI) {
    window.wakeLockAPI.requestWakeLock();
  }
  
  // Define helper actions in window scope
  window.focusModeNext = () => {
    if (focusModeStepIndex < steps.length - 1) {
      focusModeStepIndex++;
      updateModalContent();
    }
  };
  
  window.focusModePrev = () => {
    if (focusModeStepIndex > 0) {
      focusModeStepIndex--;
      updateModalContent();
    }
  };
  
  window.closeFocusMode = () => {
    if (modal._cleanupFocusMode) {
      modal._cleanupFocusMode();
    }
    modal.classList.add('hidden');
    modal.innerHTML = '';
    if (window.wakeLockAPI) {
      window.wakeLockAPI.releaseWakeLock();
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft') {
      window.focusModePrev();
    } else if (e.key === 'ArrowRight') {
      window.focusModeNext();
    } else if (e.key === 'Escape') {
      window.closeFocusMode();
    }
  };

  // Click / Tap navigation
  const handleModalClick = (e) => {
    const isInteractive = e.target.closest('button, a, input, select, textarea');
    if (isInteractive) return;
    
    const x = e.clientX;
    const width = window.innerWidth;
    if (x < width * 0.35) {
      window.focusModePrev();
    } else {
      window.focusModeNext();
    }
  };

  // Custom hover cursor styling
  const handleMouseMove = (e) => {
    const isInteractive = e.target.closest('button, a, input, select, textarea');
    if (isInteractive) {
      modal.style.cursor = '';
      return;
    }
    const x = e.clientX;
    const width = window.innerWidth;
    if (x < width * 0.35) {
      modal.style.cursor = 'w-resize';
    } else {
      modal.style.cursor = 'e-resize';
    }
  };

  // Cleanup closure
  const cleanup = () => {
    document.removeEventListener('keydown', handleKeyDown);
    modal.removeEventListener('click', handleModalClick);
    modal.removeEventListener('mousemove', handleMouseMove);
    modal.style.cursor = '';
    delete modal._cleanupFocusMode;
  };

  modal._cleanupFocusMode = cleanup;

  document.addEventListener('keydown', handleKeyDown);
  modal.addEventListener('click', handleModalClick);
  modal.addEventListener('mousemove', handleMouseMove);
}

// 6. CREATE / EDIT FORM VIEWS
let uploadedImageBase64 = "";

function renderNewRecipe() {
  renderRecipeForm(null);
}

function renderEditRecipe(recipeId) {
  const recipe = allRecipes.find(r => r.Id === recipeId);
  if (!recipe) {
    window.location.hash = '#/';
    return;
  }
  renderRecipeForm(recipe);
}

function renderRecipeForm(recipe = null) {
  const container = document.getElementById('app-view');
  const isEdit = !!recipe;
  
  // Initialize dynamic arrays
  let ingredients = isEdit ? [...recipe.Ingredients] : [
    { Id: generateUUID(), Name: "", Amount: 1, Unit: "g", Order: 1 }
  ];
  let instructions = isEdit ? [...recipe.Instructions] : [
    { Id: generateUUID(), StepNumber: 1, Text: "" }
  ];
  uploadedImageBase64 = isEdit ? recipe.ImageUrl : "";
  
  const generateFormHTML = () => {
    return `
      <div class="mb-8">
          <h2 class="font-title text-3xl font-bold text-primary mb-2">${isEdit ? 'Editează Rețeta' : 'Rețetă Nouă'}</h2>
          <p class="text-gray-500">${isEdit ? 'Actualizează detaliile acestei rețete.' : 'Adaugă o rețetă nouă în colecția ta.'}</p>
      </div>
      
      <form id="recipe-form" onsubmit="handleFormSubmit(event)" class="space-y-8 max-w-4xl animate-fade-in-up">
          <div class="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
              <!-- General Info -->
              <div class="grid md:grid-cols-2 gap-6">
                  <div class="space-y-2">
                      <label class="block text-sm font-bold text-gray-700">Titlu rețetă *</label>
                      <input type="text" id="form-title" class="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none" required value="${isEdit ? escapeHtml(recipe.Title) : ''}" />
                  </div>
                  <div class="space-y-2">
                      <label class="block text-sm font-bold text-gray-700">Categorie culinară *</label>
                      <input type="text" id="form-cuisine" class="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none" required placeholder="ex: Desert, Soup, Italian" value="${isEdit ? escapeHtml(recipe.CuisineType) : ''}" />
                  </div>
              </div>

              <div class="space-y-2">
                  <label class="block text-sm font-bold text-gray-700">Descriere</label>
                  <textarea id="form-description" rows="3" class="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none">${isEdit ? escapeHtml(recipe.Description) : ''}</textarea>
              </div>

              <!-- Image Upload -->
              <div class="space-y-2">
                  <label class="block text-sm font-bold text-gray-700">Imagine rețetă</label>
                  <div class="flex items-center gap-6">
                      <div id="image-preview" class="w-24 h-24 rounded-xl border border-gray-200 overflow-hidden flex items-center justify-center bg-gray-50 flex-shrink-0">
                          ${uploadedImageBase64 
                            ? `<img src="${uploadedImageBase64}" class="w-full h-full object-cover" />`
                            : `<svg xmlns="http://www.w3.org/2000/svg" class="text-gray-400" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                 <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                               </svg>`
                          }
                      </div>
                      <div class="space-y-1">
                          <input type="file" id="form-image" accept="image/*" class="hidden" onchange="processFormImage(event)" />
                          <button type="button" class="px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 text-sm font-semibold" onclick="document.getElementById('form-image').click()">
                              Alege fișier...
                          </button>
                          <p class="text-xs text-gray-400">Fișier imagine (JPG, PNG, WebP). Maxim 2MB.</p>
                      </div>
                  </div>
              </div>

              <!-- Metadata metrics -->
              <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div class="space-y-2">
                      <label class="block text-sm font-bold text-gray-700">Porții</label>
                      <input type="number" id="form-servings" min="1" max="100" class="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none" value="${isEdit ? recipe.Servings : 4}" />
                  </div>
                  <div class="space-y-2">
                      <label class="block text-sm font-bold text-gray-700">Dificultate</label>
                      <select id="form-difficulty" class="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none">
                          <option value="0" ${isEdit && recipe.Difficulty == 0 ? 'selected' : ''}>Ușor</option>
                          <option value="1" ${isEdit && recipe.Difficulty == 1 ? 'selected' : ''}>Mediu</option>
                          <option value="2" ${isEdit && recipe.Difficulty == 2 ? 'selected' : ''}>Greu</option>
                          <option value="3" ${isEdit && recipe.Difficulty == 3 ? 'selected' : ''}>Expert</option>
                      </select>
                  </div>
                  <div class="space-y-2">
                      <label class="block text-sm font-bold text-gray-700">Pregătire (min)</label>
                      <input type="number" id="form-preptime" min="0" class="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none" value="${isEdit ? Math.round(parseTimeSpan(recipe.PrepTime)) : 15}" />
                  </div>
                  <div class="space-y-2">
                      <label class="block text-sm font-bold text-gray-700">Gătire (min)</label>
                      <input type="number" id="form-cooktime" min="0" class="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none" value="${isEdit ? Math.round(parseTimeSpan(recipe.CookTime)) : 30}" />
                  </div>
              </div>
          </div>
          
          <!-- Ingredients Section -->
          <div class="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
              <div class="flex items-center justify-between border-b border-gray-100 pb-4">
                  <h3 class="font-title text-xl font-bold text-primary">Ingrediente</h3>
                  <button type="button" class="text-sm text-accent hover:text-accent/90 font-bold flex items-center gap-1.5" onclick="addIngredientRow()">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/>
                      </svg> Adaugă Ingredient
                  </button>
              </div>
              <div id="form-ingredients-container" class="space-y-3">
                  ${renderFormIngredientsRows(ingredients)}
              </div>
          </div>

          <!-- Instructions Section -->
          <div class="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
              <div class="flex items-center justify-between border-b border-gray-100 pb-4">
                  <h3 class="font-title text-xl font-bold text-primary">Instrucțiuni</h3>
                  <button type="button" class="text-sm text-accent hover:text-accent/90 font-bold flex items-center gap-1.5" onclick="addInstructionStep()">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/>
                      </svg> Adaugă Pas
                  </button>
              </div>
              <div id="form-instructions-container" class="space-y-4">
                  ${renderFormInstructionsRows(instructions)}
              </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-4">
              <button type="submit" class="bg-accent hover:bg-accent/90 text-white font-bold px-8 py-3 rounded-xl transition-colors shadow-md">
                  Salvează Rețeta
              </button>
              <button type="button" class="bg-white border border-gray-200 text-gray-700 font-bold px-8 py-3 rounded-xl hover:bg-gray-50 transition-colors"
                      onclick="window.history.back()">
                  Anulează
              </button>
          </div>
      </form>
    `;
  };

  container.innerHTML = generateFormHTML();

  // Window functions for form interactions
  window.processFormImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 2 * 1024 * 1024) {
      alert("Imaginea este prea mare! Dimensiunea maximă este 2MB.");
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      uploadedImageBase64 = event.target.result;
      document.getElementById('image-preview').innerHTML = `<img src="${uploadedImageBase64}" class="w-full h-full object-cover" />`;
    };
    reader.readAsDataURL(file);
  };
  
  window.addIngredientRow = () => {
    // Read current state from inputs to avoid wiping input text
    syncIngredientsState();
    
    ingredients.push({
      Id: generateUUID(),
      Name: "",
      Amount: 1,
      Unit: "g",
      Order: ingredients.length + 1
    });
    document.getElementById('form-ingredients-container').innerHTML = renderFormIngredientsRows(ingredients);
  };
  
  window.removeIngredientRow = (id) => {
    syncIngredientsState();
    ingredients = ingredients.filter(i => i.Id !== id);
    document.getElementById('form-ingredients-container').innerHTML = renderFormIngredientsRows(ingredients);
  };
  
  window.addInstructionStep = () => {
    syncInstructionsState();
    instructions.push({
      Id: generateUUID(),
      StepNumber: instructions.length + 1,
      Text: ""
    });
    document.getElementById('form-instructions-container').innerHTML = renderFormInstructionsRows(instructions);
  };
  
  window.removeInstructionStep = (id) => {
    syncInstructionsState();
    instructions = instructions.filter(i => i.Id !== id);
    // Reorder step numbers
    instructions.forEach((inst, i) => inst.StepNumber = i + 1);
    document.getElementById('form-instructions-container').innerHTML = renderFormInstructionsRows(instructions);
  };
  
  function syncIngredientsState() {
    ingredients = [];
    document.querySelectorAll('.ingredient-row').forEach((el, index) => {
      const id = el.dataset.id;
      const name = el.querySelector('.ing-name').value;
      const amount = parseFloat(el.querySelector('.ing-amount').value) || 0;
      const unit = el.querySelector('.ing-unit').value;
      ingredients.push({ Id: id, Name: name, Amount: amount, Unit: unit, Order: index + 1 });
    });
  }
  
  function syncInstructionsState() {
    instructions = [];
    document.querySelectorAll('.instruction-row').forEach((el, index) => {
      const id = el.dataset.id;
      const text = el.querySelector('.inst-text').value;
      instructions.push({ Id: id, StepNumber: index + 1, Text: text });
    });
  }
  
  window.handleFormSubmit = async (e) => {
    e.preventDefault();
    
    syncIngredientsState();
    syncInstructionsState();
    
    const title = document.getElementById('form-title').value.trim();
    const cuisine = document.getElementById('form-cuisine').value.trim();
    const desc = document.getElementById('form-description').value.trim();
    const servings = parseInt(document.getElementById('form-servings').value, 10) || 4;
    const diff = parseInt(document.getElementById('form-difficulty').value, 10) || 0;
    
    const prepMinutes = parseFloat(document.getElementById('form-preptime').value) || 0;
    const cookMinutes = parseFloat(document.getElementById('form-cooktime').value) || 0;
    
    const prepSpan = formatTimeSpan(prepMinutes);
    const cookSpan = formatTimeSpan(cookMinutes);
    
    const filteredIng = ingredients.filter(i => i.Name.trim() !== '');
    const filteredInst = instructions.filter(i => i.Text.trim() !== '');
    
    if (filteredIng.length === 0) {
      alert("Adăugați cel puțin un ingredient valid.");
      return;
    }
    
    const formFields = {
      Title: title,
      CuisineType: cuisine,
      Description: desc,
      Servings: servings,
      Difficulty: diff,
      PrepTime: prepSpan,
      CookTime: cookSpan,
      ImageUrl: uploadedImageBase64,
      Ingredients: filteredIng,
      Instructions: filteredInst
    };
    
    if (isEdit) {
      await updateRecipe(recipe.Id, formFields);
    } else {
      await addRecipe(formFields);
    }
    
    renderSidebarCategories();
  };
}

function renderFormIngredientsRows(arr) {
  return arr.map(ing => `
    <div class="flex items-center gap-3 ingredient-row" data-id="${ing.Id}">
        <input type="number" step="any" min="0" class="w-20 px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none text-center ing-amount" placeholder="Cant." value="${ing.Amount}" required />
        <input type="text" class="w-20 px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none text-center ing-unit" placeholder="Unitate" value="${escapeHtml(ing.Unit)}" required />
        <input type="text" class="flex-1 px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none ing-name" placeholder="Nume ingredient" value="${escapeHtml(ing.Name)}" required />
        <button type="button" class="text-gray-400 hover:text-red-500 p-2" onclick="removeIngredientRow('${ing.Id}')" title="Șterge ingredient">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
        </button>
    </div>
  `).join('');
}

function renderFormInstructionsRows(arr) {
  return arr.map(inst => `
    <div class="flex items-start gap-4 instruction-row" data-id="${inst.Id}">
        <div class="mt-2.5 w-8 h-8 rounded-full bg-gray-50 border border-gray-200 text-gray-400 font-bold flex items-center justify-center text-sm flex-shrink-0">
            ${inst.StepNumber}
        </div>
        <textarea rows="2" class="flex-1 px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none inst-text" placeholder="Descrieți pasul de preparare..." required>${escapeHtml(inst.Text)}</textarea>
        <button type="button" class="text-gray-400 hover:text-red-500 p-2 mt-2" onclick="removeInstructionStep('${inst.Id}')" title="Șterge pas">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
        </button>
    </div>
  `).join('');
}

// 7. LOCAL CHANGES & BACKUP VIEW (Premium/Debug View)
function renderLocalChanges() {
  const container = document.getElementById('app-view');
  
  const modifiedKeys = Object.keys(localChanges.modified);
  
  let changeItemsHtml = "";
  if (localChanges.added.length === 0 && modifiedKeys.length === 0 && localChanges.deleted.length === 0 && Object.keys(localChanges.favorites).length === 0) {
    changeItemsHtml = `
      <div class="text-gray-500 py-6 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
          Nu există modificări locale efectuate în browser.
      </div>
    `;
  } else {
    changeItemsHtml = `
      <div class="space-y-6">
          ${localChanges.added.length > 0 ? `
              <div class="space-y-2">
                  <h4 class="font-bold text-sm text-gray-700">Rețete Adăugate (${localChanges.added.length})</h4>
                  <ul class="divide-y divide-gray-100 bg-gray-50 p-4 rounded-xl border border-gray-200 text-sm">
                      ${localChanges.added.map(r => `
                        <li class="py-2 flex justify-between items-center">
                          <span class="font-medium">${escapeHtml(r.Title)} (${escapeHtml(r.CuisineType)})</span>
                          <a href="#/recipes/${r.Id}" class="text-accent hover:underline">Vizualizează</a>
                        </li>
                      `).join('')}
                  </ul>
              </div>
          ` : ''}

          ${modifiedKeys.length > 0 ? `
              <div class="space-y-2">
                  <h4 class="font-bold text-sm text-gray-700">Rețete Modificate (${modifiedKeys.length})</h4>
                  <ul class="divide-y divide-gray-100 bg-gray-50 p-4 rounded-xl border border-gray-200 text-sm">
                      ${modifiedKeys.map(id => {
                        const original = baseRecipes.find(r => r.Id === id) || { Title: 'Necunoscută' };
                        const mod = localChanges.modified[id];
                        return `
                          <li class="py-2 flex justify-between items-center">
                            <span class="font-medium">${escapeHtml(original.Title)}</span>
                            <div class="flex gap-4">
                              <span class="text-xs text-gray-400">Modificat la ${new Date(mod.LastModified).toLocaleDateString()}</span>
                              <a href="#/recipes/${id}" class="text-accent hover:underline">Vizualizează</a>
                            </div>
                          </li>
                        `;
                      }).join('')}
                  </ul>
              </div>
          ` : ''}

          ${localChanges.deleted.length > 0 ? `
              <div class="space-y-2">
                  <h4 class="font-bold text-sm text-gray-700">Rețete Șterse (${localChanges.deleted.length})</h4>
                  <ul class="divide-y divide-gray-100 bg-gray-50 p-4 rounded-xl border border-gray-200 text-sm">
                      ${localChanges.deleted.map(id => {
                        const original = baseRecipes.find(r => r.Id === id) || { Title: id };
                        return `
                          <li class="py-2 text-gray-500">${escapeHtml(original.Title)} <span class="text-xs font-mono">(${id})</span></li>
                        `;
                      }).join('')}
                  </ul>
              </div>
          ` : ''}
      </div>
    `;
  }
  
  container.innerHTML = `
    <div class="mb-8">
        <h2 class="font-title text-3xl font-bold text-primary mb-2">Modificări Locale și Copii de Siguranță</h2>
        <p class="text-gray-500">Starea actuală a stocării IndexedDB local din browserul tău.</p>
    </div>
    
    <div class="grid lg:grid-cols-12 gap-8">
        <!-- Changes list -->
        <div class="lg:col-span-8 bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
            <h3 class="font-title text-xl font-bold text-primary border-b border-gray-100 pb-4">Diff-uri stocate</h3>
            ${changeItemsHtml}
        </div>
        
        <!-- Backup actions -->
        <div class="lg:col-span-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6 self-start">
            <h3 class="font-title text-xl font-bold text-primary border-b border-gray-100 pb-4">Copie de Siguranță</h3>
            
            <div class="space-y-4">
                <button onclick="exportBackup()" class="w-full bg-primary hover:bg-primary/95 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-colors shadow">
                    Exportă Modificările (.json)
                </button>
                
                <div class="border-t border-gray-100 pt-4">
                    <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Importă Backup</label>
                    <input type="file" id="backup-file" class="hidden" accept=".json" onchange="importBackup(event)" />
                    <button onclick="document.getElementById('backup-file').click()" class="w-full bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 font-bold py-2.5 px-4 rounded-xl text-sm transition-colors">
                        Alege fișier Backup...
                    </button>
                </div>
                
                <div class="border-t border-gray-100 pt-4">
                    <button onclick="resetAllChanges()" class="w-full bg-red-50 hover:bg-red-100 text-red-600 font-bold py-2.5 px-4 rounded-xl text-sm transition-colors border border-red-100">
                        Resetează Toate Modificările
                    </button>
                </div>
            </div>
        </div>
    </div>
  `;
  
  window.exportBackup = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(localChanges, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `camara_culinara_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };
  
  window.importBackup = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed.added && parsed.modified && parsed.deleted && parsed.favorites) {
          localChanges = parsed;
          await persistLocalChanges();
          allRecipes = mergeRecipes(baseRecipes, localChanges);
          renderSidebarCategories();
          alert("Backup importat cu succes!");
          renderLocalChanges();
        } else {
          alert("Fișierul de backup este invalid (lipsesc structuri de bază).");
        }
      } catch (err) {
        alert("Eroare la citirea fișierului de backup: " + err.message);
      }
    };
    reader.readAsText(file);
  };
  
  window.resetAllChanges = async () => {
    if (confirm("ATENȚIE! Aceasta va șterge toate rețetele adăugate, modificările efectuate și favoritele stocate local. Această acțiune este ireversibilă. Continuați?")) {
      localChanges = { added: [], modified: {}, deleted: [], favorites: {} };
      await persistLocalChanges();
      allRecipes = mergeRecipes(baseRecipes, localChanges);
      renderSidebarCategories();
      renderLocalChanges();
    }
  };
}

function renderNotFound() {
  const container = document.getElementById('app-view');
  container.innerHTML = `
    <div class="text-center py-20">
        <h3 class="font-title text-2xl font-bold text-primary mb-4">Pagina nu a fost găsită</h3>
        <p class="text-gray-500 mb-8">Ne pare rău, secțiunea pe care o cauți nu există.</p>
        <a href="#/" class="inline-flex items-center gap-2 bg-accent text-white px-6 py-3 rounded-xl font-bold hover:bg-accent/90 transition-colors">
            Înapoi la Rețete
        </a>
    </div>
  `;
}

// --- CORE FILTER ENGINE ---
function filterRecipes(query, category = null, onlyFavorites = false) {
  let list = allRecipes;
  if (category) {
    list = list.filter(r => r.CuisineType === category);
  }
  if (onlyFavorites) {
    list = list.filter(r => r.IsFavorite);
  }
  
  if (!query) return list;
  
  const q = query.trim().toLowerCase();
  return list.filter(r => {
    const titleMatch = r.Title && r.Title.toLowerCase().includes(q);
    const descMatch = r.Description && r.Description.toLowerCase().includes(q);
    const cuisineMatch = r.CuisineType && r.CuisineType.toLowerCase().includes(q);
    
    // Check ingredients list names
    const ingMatch = r.Ingredients && r.Ingredients.some(ing => ing.Name && ing.Name.toLowerCase().includes(q));
    
    return titleMatch || descMatch || cuisineMatch || ingMatch;
  });
}

// --- CLIENT ROUTER ---
function router() {
  const hash = window.location.hash || '#/';
  
  // Clean focus mode screen lock if leaving details
  if (window.wakeLockAPI) {
    window.wakeLockAPI.releaseWakeLock();
  }
  const modal = document.getElementById('modal-container');
  if (modal) {
    modal.classList.add('hidden');
    modal.innerHTML = '';
  }
  
  // Route matching
  if (hash === '#/' || hash === '') {
    renderHome();
  } else if (hash.startsWith('#/cuisine/')) {
    const cuisine = decodeURIComponent(hash.substring(10));
    renderCuisine(cuisine);
  } else if (hash === '#/favorites') {
    renderFavorites();
  } else if (hash === '#/recipes/new') {
    renderNewRecipe();
  } else if (hash.startsWith('#/recipes/edit/')) {
    const id = hash.substring(15);
    renderEditRecipe(id);
  } else if (hash.startsWith('#/recipes/')) {
    const id = hash.substring(10);
    renderRecipeDetail(id);
  } else if (hash === '#/local-changes') {
    renderLocalChanges();
  } else {
    renderNotFound();
  }
  
  // Highlight active sidebar elements
  updateSidebarActiveState();
  
  // Scroll content container back to top on page navigation
  document.querySelector('main').scrollTop = 0;
}

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', async () => {
  // 1. Load data from Local DB & Static DB
  await initDatabase();
  
  // 2. Setup menu events & Categories List
  renderSidebarCategories();
  initMobileMenu();
  initTips();
  
  // 3. Register routing changes
  window.addEventListener('hashchange', router);
  
  // Run initial routing
  router();
  
  // 4. Register PWA Service Worker for offline support
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('Service Worker: Înregistrat cu succes', reg.scope))
        .catch(err => console.log('Service Worker: Eroare la înregistrare', err));
    });
  }
});
