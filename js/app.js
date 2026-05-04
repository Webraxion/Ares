const GITHUB_CONFIG = {
  gistId: localStorage.getItem('ares_gist_id') || null,
  token: localStorage.getItem('ares_github_token') || null,
  password: localStorage.getItem('ares_encrypt_password') || null
};

const ADMIN_CREDENTIALS = { username: 'Admin', password: 'Wolodymer1994' };
const ranks = ['Новобранец', 'Ветеран', 'Офицер', 'Командир', 'Легенда'];

const state = {
  currentUserId: null,
  users: [],
  messages: [],
  direct: [],
  posts: [],
  comments: [],
  notifications: [],
  requests: [],
  shop: [],
  achievements: []
};

let autoSyncTimeout = null;
const currentPath = window.location.pathname;
const rawPage = currentPath.split('/').pop();
const page = (!rawPage || rawPage === '' || !rawPage.includes('.')) ? 'index.html' : rawPage;
const ROOT_PATH = currentPath.includes('/pages/') ? '../' : 'pages/';

// Криптография и GitHub интеграция
async function deriveKey(password) {
  const enc = new TextEncoder();
  const data = enc.encode(password);
  return crypto.subtle.importKey('raw', data, { name: 'PBKDF2' }, false, ['deriveBits', 'deriveKey']);
}

async function encryptData(text, password) {
  try {
    const key = await deriveKey(password);
    const derived = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: new TextEncoder().encode('ares-salt'), iterations: 100000, hash: 'SHA-256' },
      key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      derived,
      enc.encode(text)
    );
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
  } catch(e) {
    console.error('Encryption error:', e);
    return null;
  }
}

async function decryptData(encrypted, password) {
  try {
    const key = await deriveKey(password);
    const derived = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: new TextEncoder().encode('ares-salt'), iterations: 100000, hash: 'SHA-256' },
      key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    const combined = new Uint8Array(atob(encrypted).split('').map(c => c.charCodeAt(0)));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      derived,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  } catch(e) {
    console.error('Decryption error:', e);
    return null;
  }
}

async function saveToGitHub(allData, password) {
  if (!GITHUB_CONFIG.token || !password) {
    showToast('Нужны GitHub токен и пароль для сохранения');
    return false;
  }
  const jsonStr = JSON.stringify(allData);
  const encrypted = await encryptData(jsonStr, password);
  if (!encrypted) {
    showToast('Ошибка шифрования');
    return false;
  }
  const gistData = {
    description: 'ARES Clan Hub - Encrypted Database',
    public: false,
    files: {
      'ares-database.json.aes': { content: encrypted }
    }
  };
  try {
    const method = GITHUB_CONFIG.gistId ? 'PATCH' : 'POST';
    const url = GITHUB_CONFIG.gistId 
      ? `https://api.github.com/gists/${GITHUB_CONFIG.gistId}`
      : 'https://api.github.com/gists';
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `token ${GITHUB_CONFIG.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(gistData)
    });
    if (!response.ok) {
      showToast('Ошибка сохранения на GitHub: ' + response.status);
      return false;
    }
    const result = await response.json();
    if (!GITHUB_CONFIG.gistId) {
      GITHUB_CONFIG.gistId = result.id;
      localStorage.setItem('ares_gist_id', result.id);
    }
    showToast('Данные зашифрованы и сохранены на GitHub');
    return true;
  } catch(e) {
    showToast('Ошибка сохранения: ' + e.message);
    return false;
  }
}

async function loadFromGitHub(password) {
  if (!GITHUB_CONFIG.token || !GITHUB_CONFIG.gistId || !password) {
    showToast('Не найдены GitHub токен, ID гиста или пароль');
    return null;
  }
  try {
    const response = await fetch(`https://api.github.com/gists/${GITHUB_CONFIG.gistId}`, {
      headers: { 'Authorization': `token ${GITHUB_CONFIG.token}` }
    });
    if (!response.ok) {
      showToast('Ошибка загрузки с GitHub: ' + response.status);
      return null;
    }
    const gist = await response.json();
    const file = gist.files['ares-database.json.aes'];
    if (!file) {
      showToast('Файл не найден в гисте');
      return null;
    }
    const encrypted = file.content;
    const decrypted = await decryptData(encrypted, password);
    if (!decrypted) {
      showToast('Ошибка расшифровки (неверный пароль?)');
      return null;
    }
    return JSON.parse(decrypted);
  } catch(e) {
    showToast('Ошибка загрузки: ' + e.message);
    return null;
  }
}

function setGitHubCredentials(token, password) {
  GITHUB_CONFIG.token = token;
  GITHUB_CONFIG.password = password;
  localStorage.setItem('ares_github_token', token);
  localStorage.setItem('ares_encrypt_password', password);
  showToast('GitHub учётные данные сохранены');
}


function generateId(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 12)}-${Date.now().toString(36)}`;
}

function currentUser() {
  return state.users.find(user => user.id === state.currentUserId) || null;
}

function requireLogin() {
  if (!currentUser()) {
    window.location.href = ROOT_PATH + 'index.html';
  }
}

function persist() {
  saveStorage(DB.users, state.users);
  saveStorage(DB.messages, state.messages);
  saveStorage(DB.direct, state.direct);
  saveStorage(DB.posts, state.posts);
  saveStorage(DB.comments, state.comments);
  saveStorage(DB.notifications, state.notifications);
  saveStorage(DB.requests, state.requests);
  saveStorage(DB.shop, state.shop);
  saveStorage(DB.achievements, state.achievements);
  
  // Автосохранение на GitHub с дебаунсом
  if (GITHUB_CONFIG.token && GITHUB_CONFIG.password) {
    clearTimeout(autoSyncTimeout);
    autoSyncTimeout = setTimeout(() => {
      persistToGitHub().catch(e => console.error('Auto-sync error:', e));
    }, 3000); // Сохранить на GitHub через 3 секунды после последнего изменения
  }
}

async function persistToGitHub() {
  const allData = {
    users: state.users,
    messages: state.messages,
    direct: state.direct,
    posts: state.posts,
    comments: state.comments,
    notifications: state.notifications,
    requests: state.requests,
    shop: state.shop,
    achievements: state.achievements
  };
  return await saveToGitHub(allData, GITHUB_CONFIG.password);
}

function initData() {
  state.users = loadStorage(DB.users, []);
  state.messages = loadStorage(DB.messages, []);
  state.direct = loadStorage(DB.direct, []);
  state.posts = loadStorage(DB.posts, []);
  state.comments = loadStorage(DB.comments, []);
  state.notifications = loadStorage(DB.notifications, []);
  state.requests = loadStorage(DB.requests, []);
  state.shop = loadStorage(DB.shop, DEFAULT_SHOP);
  state.achievements = loadStorage(DB.achievements, DEFAULT_ACHIEVEMENTS);
  state.currentUserId = localStorage.getItem(DB.session);

  if (!state.users.length) {
    const admin = {
      id: generateId('user'),
      username: ADMIN_CREDENTIALS.username,
      password: ADMIN_CREDENTIALS.password,
      role: 'admin',
      rank: 'Основатель',
      avatar: 'ARES',
      color: '#ff5500',
      font: 'Arial Black',
      background: 'dark-fire',
      effects: 'glow',
      about: 'Главный администратор клана ARES. Следит за порядком и эмитирует стратегию битвы.',
      experience: 9999,
      favoriteTank: 'T-110E5',
      currency: 999999,
      isBanned: false,
      isMuted: false,
      friends: [],
      inventory: [],
      achievements: [],
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    };
    state.users.push(admin);
    persist();
  }

  // Загрузка с GitHub в фоне (если подключен)
  if (GITHUB_CONFIG.token && GITHUB_CONFIG.password) {
    if (GITHUB_CONFIG.gistId) {
      loadFromGitHub(GITHUB_CONFIG.password).then(data => {
        if (data) {
          state.users = data.users;
          state.messages = data.messages;
          state.direct = data.direct;
          state.posts = data.posts;
          state.comments = data.comments;
          state.notifications = data.notifications;
          state.requests = data.requests;
          state.shop = data.shop;
          state.achievements = data.achievements;
          persist();
          location.reload(); // Перезагрузить страницу с актуальными данными
        }
      }).catch(e => console.log('GitHub load on init failed:', e));
    } else {
      persistToGitHub().catch(e => console.log('GitHub create gist on init failed:', e));
    }
  }

  if (page === 'index.html' && currentUser()) {
    window.location.href = ROOT_PATH + 'dashboard.html';
  }
}

function saveSession(userId) {
  state.currentUserId = userId;
  if (userId) {
    localStorage.setItem(DB.session, userId);
  } else {
    localStorage.removeItem(DB.session);
  }
}

function formatDate(value) {
  return new Date(value).toLocaleString('ru-RU', { hour12: false });
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('visible'), 10);
  setTimeout(() => toast.classList.remove('visible'), 3600);
  setTimeout(() => toast.remove(), 4200);
}

function findUserByUsername(username) {
  return state.users.find(user => user.username.toLowerCase() === username.toLowerCase());
}

function findUserById(id) {
  return state.users.find(user => user.id === id);
}

function login(username, password) {
  const user = findUserByUsername(username);
  if (!user || user.password !== password) {
    showToast('Неверный ник или пароль');
    return;
  }
  if (user.isBanned) {
    showToast('Ваш аккаунт заблокирован');
    return;
  }
  saveSession(user.id);
  user.lastSeen = new Date().toISOString();
  persist();
  showToast(`Добро пожаловать, ${user.username}`);
  window.location.href = ROOT_PATH + 'dashboard.html';
}

function register(username, password) {
  if (!username || !password) {
    showToast('Ник и пароль обязательны');
    return;
  }
  if (findUserByUsername(username)) {
    showToast('Никнейм уже занят');
    return;
  }
  const user = {
    id: generateId('user'),
    username,
    password,
    role: 'member',
    rank: 'Новобранец',
    avatar: username.slice(0, 2).toUpperCase(),
    color: '#ff6a00',
    font: 'Segoe UI',
    background: 'dark',
    effects: 'none',
    about: '',
    experience: 0,
    favoriteTank: '',
    currency: 1500,
    isBanned: false,
    isMuted: false,
    friends: [],
    inventory: [],
    achievements: [],
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString()
  };
  state.users.push(user);
  saveSession(user.id);
  awardAchievement(user.id, 'achv-1');
  persist();
  showToast('Аккаунт создан. Добро пожаловать в ARES!');
  window.location.href = ROOT_PATH + 'dashboard.html';
}

function awardAchievement(userId, achievementId) {
  const user = findUserById(userId);
  if (!user || user.achievements.includes(achievementId)) return;
  const achievement = state.achievements.find(a => a.id === achievementId);
  if (!achievement) return;
  user.achievements.push(achievementId);
  user.currency += achievement.reward;
  state.notifications.unshift({
    id: generateId('note'),
    userId,
    type: 'achievement',
    text: `Достижение получено: ${achievement.name} (+${achievement.reward} кредитов)` ,
    createdAt: new Date().toISOString()
  });
  persist();
  showToast(`Достижение: ${achievement.name}`);
}

function updateAchievements(userId) {
  const user = findUserById(userId);
  if (!user) return;
  const countMessages = state.messages.filter(msg => msg.authorId === userId).length;
  const ownPosts = state.posts.filter(post => post.authorId === userId).length;
  const friendsAccepted = user.friends.length;
  if (countMessages >= 10) awardAchievement(userId, 'achv-2');
  if (ownPosts >= 5) awardAchievement(userId, 'achv-3');
  if (friendsAccepted >= 3) awardAchievement(userId, 'achv-4');
  if (['Офицер', 'Командир', 'Легенда'].includes(user.rank)) awardAchievement(userId, 'achv-5');
}

function renderBaseLayout() {
  const nav = document.querySelector('.main-nav');
  if (!nav) return;
  const user = currentUser();
  if (!user) return;
  const adminLink = document.getElementById('adminLink');
  if (adminLink) {
    adminLink.style.display = user.role === 'admin' || user.role === 'curator' ? 'inline-flex' : 'none';
  }
  const memberName = document.querySelector('.current-user-name');
  if (memberName) {
    memberName.textContent = user.username;
  }
  const balance = document.querySelector('.current-user-balance');
  if (balance) {
    balance.textContent = `${user.currency} кредитов`;
  }
  const rank = document.querySelector('.current-user-rank');
  if (rank) rank.textContent = `${user.rank}`;
}

function initIndex() {
  const loginBtn = document.getElementById('loginBtn');
  const registerBtn = document.getElementById('registerBtn');
  const switchToRegister = document.getElementById('switch-to-register');
  const switchToLogin = document.getElementById('switch-to-login');
  const loginBlock = document.querySelector('.login-block');
  const registerBlock = document.querySelector('.register-block');
  const toggleGithub = document.getElementById('toggle-github');
  const githubBlock = document.getElementById('github-block');
  const setupGithubBtn = document.getElementById('setupGithubBtn');

  loginBtn.addEventListener('click', () => {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    login(username, password);
  });

  registerBtn.addEventListener('click', () => {
    const username = document.getElementById('registerUsername').value.trim();
    const password = document.getElementById('registerPassword').value;
    register(username, password);
  });

  switchToRegister.addEventListener('click', () => {
    loginBlock.classList.add('hidden');
    registerBlock.classList.remove('hidden');
  });
  switchToLogin.addEventListener('click', () => {
    registerBlock.classList.add('hidden');
    loginBlock.classList.remove('hidden');
  });

  if (toggleGithub) {
    toggleGithub.addEventListener('click', (e) => {
      e.preventDefault();
      githubBlock.classList.toggle('hidden');
    });
  }

  if (setupGithubBtn) {
    setupGithubBtn.addEventListener('click', async () => {
      const token = document.getElementById('githubToken').value.trim();
      const password = document.getElementById('encryptPassword').value.trim();
      if (!token || !password) return showToast('Заполните оба поля');
      setGitHubCredentials(token, password);
      const success = await persistToGitHub();
      if (success) showToast('База данных синхронизирована на GitHub');
      setTimeout(() => githubBlock.classList.add('hidden'), 800);
    });
  }
}

function initDashboard() {
  requireLogin();
  renderBaseLayout();
  renderDashboard();
  bindLogout();
  const syncToBtn = document.getElementById('syncToGithubBtn');
  const syncFromBtn = document.getElementById('syncFromGithubBtn');
  if (syncToBtn) syncToBtn.addEventListener('click', () => persistToGitHub());
  if (syncFromBtn) syncFromBtn.addEventListener('click', async () => {
    if (!GITHUB_CONFIG.token || !GITHUB_CONFIG.gistId || !GITHUB_CONFIG.password) {
      showToast('Нужно подключить GitHub в настройках');
      return;
    }
    const data = await loadFromGitHub(GITHUB_CONFIG.password);
    if (data) {
      state.users = data.users;
      state.messages = data.messages;
      state.direct = data.direct;
      state.posts = data.posts;
      state.comments = data.comments;
      state.notifications = data.notifications;
      state.requests = data.requests;
      state.shop = data.shop;
      state.achievements = data.achievements;
      persist();
      renderDashboard();
      showToast('Данные загружены с GitHub');
    }
  });
}

function renderDashboard() {
  const user = currentUser();
  if (!user) return;
  const quick = document.getElementById('quick-stats');
  const recentMessages = document.getElementById('recent-chat');
  const recentPosts = document.getElementById('recent-posts');
  const notifications = document.getElementById('recent-notifications');
  const achievements = document.getElementById('recent-achievements');

  quick.innerHTML = `
    <div class="dash-card"><strong>Звание</strong><span>${user.rank}</span></div>
    <div class="dash-card"><strong>Опыт</strong><span>${user.experience}</span></div>
    <div class="dash-card"><strong>Друзей</strong><span>${user.friends.length}</span></div>
    <div class="dash-card"><strong>Баланс</strong><span>${user.currency} кредитов</span></div>
  `;

  recentMessages.innerHTML = state.messages.slice(-5).reverse().map(msg => `
    <div class="mini-row"><strong>${escapeHtml(msg.authorName)}</strong> ${escapeHtml(msg.text.slice(0, 60))}</div>
  `).join('') || '<p class="empty">Пока нет сообщений.</p>';

  recentPosts.innerHTML = state.posts.slice(0, 4).map(post => `
    <div class="mini-row"><strong>${escapeHtml(post.authorName)}</strong> ${escapeHtml(post.text.slice(0, 70))}</div>
  `).join('') || '<p class="empty">Пока нет постов.</p>';

  notifications.innerHTML = state.notifications.filter(note => note.userId === user.id).slice(0, 4).map(note => `
    <div class="mini-row"><span>${escapeHtml(note.type)}</span> ${escapeHtml(note.text)}</div>
  `).join('') || '<p class="empty">Уведомлений нет.</p>';

  achievements.innerHTML = user.achievements.map(id => {
    const item = state.achievements.find(a => a.id === id);
    return item ? `<div class="mini-row">${escapeHtml(item.name)} — ${escapeHtml(item.description)}</div>` : '';
  }).join('') || '<p class="empty">Нет достижений.</p>';
}

function initProfile() {
  requireLogin();
  bindLogout();
  renderBaseLayout();
  renderProfilePage();
  updateGitHubStatus();
  const setupBtn = document.getElementById('setupGithubProfileBtn');
  const syncToBtn = document.getElementById('syncToGithubProfileBtn');
  const syncFromBtn = document.getElementById('syncFromGithubProfileBtn');
  if (setupBtn) setupBtn.addEventListener('click', () => {
    const token = document.getElementById('github-token-new').value.trim();
    const password = document.getElementById('encrypt-password-new').value.trim();
    if (!token || !password) return showToast('Заполните оба поля');
    setGitHubCredentials(token, password);
    updateGitHubStatus();
  });
  if (syncToBtn) syncToBtn.addEventListener('click', () => persistToGitHub());
  if (syncFromBtn) syncFromBtn.addEventListener('click', async () => {
    if (!GITHUB_CONFIG.token || !GITHUB_CONFIG.gistId || !GITHUB_CONFIG.password) {
      showToast('Нужно подключить GitHub');
      return;
    }
    const data = await loadFromGitHub(GITHUB_CONFIG.password);
    if (data) {
      state.users = data.users;
      state.messages = data.messages;
      state.direct = data.direct;
      state.posts = data.posts;
      state.comments = data.comments;
      state.notifications = data.notifications;
      state.requests = data.requests;
      state.shop = data.shop;
      state.achievements = data.achievements;
      persist();
      renderProfilePage();
      showToast('Данные загружены с GitHub');
    }
  });
}

function updateGitHubStatus() {
  const statusText = document.getElementById('github-status-text');
  if (!statusText) return;
  if (GITHUB_CONFIG.token && GITHUB_CONFIG.gistId) {
    statusText.textContent = `подключен (${GITHUB_CONFIG.gistId.slice(0, 8)}...)`;
    statusText.style.color = 'rgba(63, 191, 129, 0.9)';
  } else {
    statusText.textContent = 'не подключен';
    statusText.style.color = 'var(--muted)';
  }
}

function renderProfilePage() {
  const user = currentUser();
  if (!user) return;
  document.getElementById('profile-preview-avatar').textContent = user.avatar;
  document.getElementById('profile-preview-name').textContent = user.username;
  document.getElementById('profile-preview-rank').textContent = user.rank;
  document.getElementById('profile-username').textContent = user.username;
  document.getElementById('profile-id').textContent = user.id;
  document.getElementById('profile-role').textContent = user.role === 'admin' ? 'Администратор' : user.role === 'curator' ? 'Куратор' : 'Участник';
  document.getElementById('profile-color').value = user.color;
  document.getElementById('profile-font').value = user.font;
  document.getElementById('profile-background').value = user.background;
  document.getElementById('profile-effects').value = user.effects;
  document.getElementById('profile-about').value = user.about;
  document.getElementById('profile-experience').textContent = user.experience;
  document.getElementById('profile-favorite').value = user.favoriteTank;
  document.getElementById('profile-currency').textContent = `${user.currency} кредитов`;
  document.getElementById('profile-achievements').innerHTML = state.achievements.map(ach => {
    return `<div class="mini-row ${user.achievements.includes(ach.id) ? 'active' : ''}"><strong>${escapeHtml(ach.name)}</strong> ${escapeHtml(ach.description)}</div>`;
  }).join('');
  document.querySelector('.profile-preview-card').style.background = user.background === 'dark-fire' ? 'linear-gradient(180deg, rgba(18,16,16,0.96), rgba(60,16,16,0.93))' : 'linear-gradient(180deg, rgba(18,18,24,0.96), rgba(36,36,48,0.94))';
}

function saveProfilePage() {
  const user = currentUser();
  if (!user) return;
  user.avatar = document.getElementById('profile-avatar').value.trim() || user.avatar;
  user.color = document.getElementById('profile-color').value.trim() || user.color;
  user.font = document.getElementById('profile-font').value.trim() || user.font;
  user.background = document.getElementById('profile-background').value.trim() || user.background;
  user.effects = document.getElementById('profile-effects').value.trim() || user.effects;
  user.about = document.getElementById('profile-about').value.trim();
  user.favoriteTank = document.getElementById('profile-favorite').value.trim();
  persist();
  renderProfilePage();
  showToast('Профиль обновлён');
}

function initChat() {
  requireLogin();
  bindLogout();
  renderBaseLayout();
  renderChatPage();
  document.getElementById('sendChatBtn').addEventListener('click', sendChatMessage);
  document.getElementById('sendDirectBtn').addEventListener('click', sendDirectMessage);
  document.getElementById('openDmBtn').addEventListener('click', openDirectChat);
}

function renderChatPage() {
  const list = document.getElementById('public-chat-messages');
  list.innerHTML = state.messages.slice(-40).map(message => `
    <div class="chat-message ${message.authorId === currentUser().id ? 'own' : ''}">
      <div class="chat-author"><strong>${escapeHtml(message.authorName)}</strong> <span>${formatDate(message.createdAt)}</span></div>
      <div>${escapeHtml(message.text)}</div>
    </div>
  `).join('') || '<p class="empty">Пока нет сообщений в общем чате.</p>';
  renderDirectList();
}

function sendChatMessage() {
  const textarea = document.getElementById('publicChatText');
  const text = textarea.value.trim();
  const user = currentUser();
  if (!text || !user) return;
  if (user.isMuted) {
    showToast('Вы замучены и не можете писать в чате');
    return;
  }
  state.messages.push({ id: generateId('msg'), authorId: user.id, authorName: user.username, text, createdAt: new Date().toISOString() });
  persist();
  updateAchievements(user.id);
  textarea.value = '';
  renderChatPage();
}

function renderDirectList() {
  const friends = currentUser().friends.map(id => findUserById(id)).filter(Boolean);
  const container = document.getElementById('direct-friends');
  container.innerHTML = friends.map(friend => `
    <button class="friend-item" data-id="${friend.id}">${escapeHtml(friend.username)} <span>${friend.rank}</span></button>
  `).join('') || '<p class="empty">Нет друзей. Найдите их на странице друзей.</p>';
  container.querySelectorAll('.friend-item').forEach(button => {
    button.addEventListener('click', () => openDirectChatWith(button.dataset.id));
  });
}

function openDirectChat() {
  const targetId = document.getElementById('directTargetId').value.trim();
  openDirectChatWith(targetId);
}

function openDirectChatWith(targetId) {
  const target = findUserById(targetId);
  if (!target) {
    showToast('Пользователь не найден');
    return;
  }
  if (target.id === currentUser().id) {
    showToast('Нельзя отправлять сообщение самому себе');
    return;
  }
  document.getElementById('direct-with').textContent = target.username;
  document.getElementById('direct-target-id').value = target.id;
  renderDirectConversation(target.id);
}

function renderDirectConversation(targetId) {
  const dialog = document.getElementById('directMessagesList');
  const conversation = state.direct.filter(item =>
    (item.fromId === currentUser().id && item.toId === targetId) ||
    (item.fromId === targetId && item.toId === currentUser().id)
  ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  dialog.innerHTML = conversation.map(item => `
    <div class="dm-message ${item.fromId === currentUser().id ? 'own' : ''}">
      <div class="chat-author"><strong>${escapeHtml(item.fromName)}</strong> <span>${formatDate(item.createdAt)}</span></div>
      <div>${escapeHtml(item.text)}</div>
    </div>
  `).join('') || '<p class="empty">Начните диалог с этим игроком.</p>';
}

function sendDirectMessage() {
  const user = currentUser();
  const targetId = document.getElementById('direct-target-id').value.trim();
  const text = document.getElementById('directChatText').value.trim();
  const target = findUserById(targetId);
  if (!user || !target || !text) return;
  state.direct.push({ id: generateId('dm'), fromId: user.id, toId: target.id, fromName: user.username, toName: target.username, text, createdAt: new Date().toISOString() });
  state.notifications.unshift({ id: generateId('note'), userId: target.id, type: 'Сообщение', text: `Новое сообщение от ${user.username}` , createdAt: new Date().toISOString() });
  persist();
  document.getElementById('directChatText').value = '';
  renderDirectConversation(targetId);
  showToast('Сообщение отправлено');
}

function initFeed() {
  requireLogin();
  bindLogout();
  renderBaseLayout();
  renderFeedPage();
  document.getElementById('publishPostBtn').addEventListener('click', publishPost);
}

function renderFeedPage() {
  const user = currentUser();
  if (!user) return;
  document.getElementById('feed-welcome').textContent = `Привет, ${user.username}`;
  const container = document.getElementById('feedPosts');
  container.innerHTML = state.posts.map(post => {
    const likes = post.likes || 0;
    const own = post.authorId === user.id;
    const postComments = state.comments.filter(c => c.postId === post.id);
    return `
      <div class="post-card">
        <div class="post-header"><strong>${escapeHtml(post.authorName)}</strong> <span>${formatDate(post.createdAt)}</span></div>
        <div class="post-body">${escapeHtml(post.text)}</div>
        <div class="post-actions">
          <button class="btn btn-secondary" data-action="like" data-id="${post.id}">❤ ${likes}</button>
          <button class="btn btn-secondary" data-action="comment" data-id="${post.id}">Комментарий</button>
          ${own ? `<button class="btn btn-secondary" data-action="delete" data-id="${post.id}">Удалить</button>` : ''}
        </div>
        <div class="post-comments">${postComments.map(comment => `<div><strong>${escapeHtml(comment.authorName)}</strong> ${escapeHtml(comment.text)}</div>`).join('')}</div>
      </div>
    `;
  }).join('') || '<p class="empty">Пока нет публикаций. Создайте первую.</p>';
  container.querySelectorAll('button').forEach(button => {
    const action = button.dataset.action;
    const id = button.dataset.id;
    button.addEventListener('click', () => {
      if (action === 'like') toggleLikePost(id);
      if (action === 'comment') promptComment(id);
      if (action === 'delete') deletePost(id);
    });
  });
}

function publishPost() {
  const text = document.getElementById('postContent').value.trim();
  if (!text) return showToast('Введите текст поста');
  const user = currentUser();
  state.posts.unshift({ id: generateId('post'), authorId: user.id, authorName: user.username, text, likes: 0, createdAt: new Date().toISOString() });
  persist();
  updateAchievements(user.id);
  document.getElementById('postContent').value = '';
  renderFeedPage();
  showToast('Пост опубликован');
}

function toggleLikePost(postId) {
  const post = state.posts.find(p => p.id === postId);
  if (!post) return;
  post.likes = (post.likes || 0) + 1;
  persist();
  renderFeedPage();
}

function promptComment(postId) {
  const text = prompt('Введите комментарий');
  if (!text) return;
  const user = currentUser();
  state.comments.push({ id: generateId('cmt'), postId, authorId: user.id, authorName: user.username, text, createdAt: new Date().toISOString() });
  persist();
  showToast('Комментарий добавлен');
  renderFeedPage();
}

function deletePost(postId) {
  if (!confirm('Удалить этот пост?')) return;
  state.posts = state.posts.filter(post => post.id !== postId);
  state.comments = state.comments.filter(comment => comment.postId !== postId);
  persist();
  renderFeedPage();
  showToast('Пост удален');
}

function initFriends() {
  requireLogin();
  bindLogout();
  renderBaseLayout();
  renderFriendsPage();
  document.getElementById('sendRequestBtn').addEventListener('click', sendFriendRequest);
  document.getElementById('acceptRequestsBtn').addEventListener('click', acceptFriendRequests);
}

function renderFriendsPage() {
  const user = currentUser();
  document.getElementById('friend-user-id').textContent = user.id;
  document.getElementById('friend-user-name').textContent = user.username;

  const friends = user.friends.map(id => findUserById(id)).filter(Boolean);
  document.getElementById('friendList').innerHTML = friends.map(friend => `
    <div class="friend-card">
      <div><strong>${escapeHtml(friend.username)}</strong> <span>${friend.rank}</span></div>
      <div>ID: ${friend.id}</div>
    </div>
  `).join('') || '<p class="empty">У вас пока нет друзей.</p>';

  const incoming = state.requests.filter(req => req.toId === user.id && req.status === 'pending');
  document.getElementById('incomingRequests').innerHTML = incoming.map(req => {
    const from = findUserById(req.fromId);
    return `<div class="friend-card"><div>${escapeHtml(from.username)} просит дружбы</div><button class="btn btn-secondary" data-id="${req.id}">Принять</button></div>`;
  }).join('') || '<p class="empty">Нет новых заявок.</p>';
  document.querySelectorAll('#incomingRequests button').forEach(button => {
    button.addEventListener('click', () => acceptFriendRequest(button.dataset.id));
  });
}

function sendFriendRequest() {
  const targetId = document.getElementById('friendTargetId').value.trim();
  const target = findUserById(targetId);
  const user = currentUser();
  if (!target || target.id === user.id) return showToast('Неверный ID пользователя');
  if (user.friends.includes(target.id)) return showToast('Этот пользователь уже в друзьях');
  if (state.requests.some(req => req.fromId === user.id && req.toId === target.id && req.status === 'pending')) return showToast('Заявка уже отправлена');
  state.requests.push({ id: generateId('req'), fromId: user.id, toId: target.id, status: 'pending', createdAt: new Date().toISOString() });
  state.notifications.unshift({ id: generateId('note'), userId: target.id, type: 'Дружба', text: `Запрос в друзья от ${user.username}`, createdAt: new Date().toISOString() });
  persist();
  renderFriendsPage();
  showToast('Запрос отправлен');
}

function acceptFriendRequest(requestId) {
  const request = state.requests.find(req => req.id === requestId);
  if (!request) return;
  const user = currentUser();
  if (request.toId !== user.id) return;
  request.status = 'accepted';
  const fromUser = findUserById(request.fromId);
  if (fromUser && !fromUser.friends.includes(user.id)) fromUser.friends.push(user.id);
  if (!user.friends.includes(fromUser.id)) user.friends.push(fromUser.id);
  state.notifications.unshift({ id: generateId('note'), userId: fromUser.id, type: 'Дружба', text: `${user.username} принял вашу заявку`, createdAt: new Date().toISOString() });
  persist();
  updateAchievements(user.id);
  showToast('Заявка принята');
  renderFriendsPage();
}

function acceptFriendRequests() {
  const incoming = state.requests.filter(req => req.toId === currentUser().id && req.status === 'pending');
  incoming.forEach(req => acceptFriendRequest(req.id));
}

function initShop() {
  requireLogin();
  bindLogout();
  renderBaseLayout();
  renderShopPage();
}

function renderShopPage() {
  const user = currentUser();
  if (!user) return;
  document.getElementById('shop-balance').textContent = `${user.currency} кредитов`;
  const inventory = user.inventory.map(itemId => state.shop.find(item => item.id === itemId)).filter(Boolean);
  document.getElementById('shopInventory').innerHTML = inventory.map(item => `
    <div class="shop-item bought"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.rarity)}</span></div>
  `).join('') || '<p class="empty">В инвентаре пока нет вещей.</p>';
  document.getElementById('shopItems').innerHTML = state.shop.map(item => `
    <div class="shop-item">
      <div><strong>${escapeHtml(item.name)}</strong></div>
      <div>${escapeHtml(item.description)}</div>
      <div class="shop-meta"><span>${escapeHtml(item.rarity)}</span><span>${item.price} кр.</span></div>
      <button class="btn btn-secondary" data-id="${item.id}">Купить</button>
    </div>
  `).join('');
  document.querySelectorAll('#shopItems button').forEach(btn => btn.addEventListener('click', () => purchaseItem(btn.dataset.id)));
}

function purchaseItem(itemId) {
  const user = currentUser();
  const item = state.shop.find(i => i.id === itemId);
  if (!user || !item) return;
  if (user.currency < item.price) return showToast('Недостаточно кредитов');
  if (user.inventory.includes(item.id)) return showToast('У вас уже есть этот предмет');
  user.currency -= item.price;
  user.inventory.push(item.id);
  state.notifications.unshift({ id: generateId('note'), userId: user.id, type: 'Магазин', text: `Вы приобрели ${item.name}`, createdAt: new Date().toISOString() });
  persist();
  renderShopPage();
  showToast('Покупка совершена');
}

function initAdmin() {
  requireLogin();
  bindLogout();
  renderBaseLayout();
  renderAdminPage();
}

function renderAdminPage() {
  const user = currentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'curator')) {
    showToast('Доступ запрещён');
    window.location.href = ROOT_PATH + 'dashboard.html';
    return;
  }
  const container = document.getElementById('adminUsers');
  container.innerHTML = state.users.map(member => `
    <div class="admin-row ${member.role === 'admin' ? 'admin-root' : ''}">
      <div>
        <h3>${escapeHtml(member.username)} ${member.role === 'admin' ? '(Admin)' : member.role === 'curator' ? '(Куратор)' : ''}</h3>
        <p>ID: ${member.id}</p>
        <p>Звание: ${member.rank} | Баланс: ${member.currency} | ${member.isBanned ? 'Забанен' : member.isMuted ? 'Замучен' : 'Активен'}</p>
      </div>
      <div class="admin-actions">
        <button class="btn btn-secondary" data-action="rank" data-id="${member.id}">Ранг</button>
        <button class="btn btn-secondary" data-action="role" data-id="${member.id}">Роль</button>
        <button class="btn btn-secondary" data-action="ban" data-id="${member.id}">Бан</button>
        <button class="btn btn-secondary" data-action="mute" data-id="${member.id}">Мут</button>
        <button class="btn btn-secondary" data-action="delete" data-id="${member.id}">Удалить</button>
      </div>
    </div>
  `).join('');
  container.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => handleAdminAction(btn.dataset.action, btn.dataset.id)));
}

function handleAdminAction(action, targetId) {
  const admin = currentUser();
  const target = findUserById(targetId);
  if (!admin || !target) return;
  if (target.id === admin.id) { showToast('Нельзя изменить себя'); return; }
  if (admin.role === 'curator' && target.role === 'admin') { showToast('Куратор не может управлять администратором'); return; }
  if (action === 'rank') {
    const rank = prompt('Введите новое звание', target.rank);
    if (!rank) return;
    target.rank = rank;
    if (rank !== 'Новобранец') updateAchievements(target.id);
  }
  if (action === 'role') {
    let role = prompt('Введите роль (member, curator, admin)', target.role);
    if (!role) return;
    if (admin.role === 'curator' && role === 'admin') { showToast('Куратор не может назначить администратора'); return; }
    target.role = role;
  }
  if (action === 'ban') {
    if (!confirm(`Забанить ${target.username}?`)) return;
    target.isBanned = true;
  }
  if (action === 'mute') {
    if (!confirm(`Замутить ${target.username}?`)) return;
    target.isMuted = true;
  }
  if (action === 'delete') {
    if (!confirm(`Удалить ${target.username}?`)) return;
    state.users = state.users.filter(user => user.id !== target.id);
    state.messages = state.messages.filter(msg => msg.authorId !== target.id);
    state.direct = state.direct.filter(dm => dm.fromId !== target.id && dm.toId !== target.id);
    state.posts = state.posts.filter(post => post.authorId !== target.id);
    state.comments = state.comments.filter(comment => comment.authorId !== target.id);
    state.requests = state.requests.filter(req => req.fromId !== target.id && req.toId !== target.id);
    state.notifications = state.notifications.filter(note => note.userId !== target.id);
    state.users.forEach(user => user.friends = user.friends.filter(id => id !== target.id));
    persist();
    renderAdminPage();
    showToast('Пользователь удалён');
    return;
  }
  persist();
  renderAdminPage();
  showToast('Действие выполнено');
}

function bindLogout() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    saveSession(null);
    showToast('Вы вышли из аккаунта');
    window.location.href = ROOT_PATH + 'index.html';
  });
}

function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function handleStorageEvent(event) {
  if (!event.key) return;
  initData();
  if (['dashboard.html', 'profile.html', 'chat.html', 'feed.html', 'friends.html', 'shop.html', 'admin.html'].includes(page)) {
    window.location.reload();
  }
}

window.addEventListener('storage', handleStorageEvent);

function initPage() {
  initData();
  if (page === 'index.html') initIndex();
  if (page === 'dashboard.html') initDashboard();
  if (page === 'profile.html') initProfile();
  if (page === 'chat.html') initChat();
  if (page === 'feed.html') initFeed();
  if (page === 'friends.html') initFriends();
  if (page === 'shop.html') initShop();
  if (page === 'admin.html') initAdmin();
  const saveBtn = document.getElementById('saveProfileBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveProfilePage);
}

initPage();
