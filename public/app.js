const state = {
  token: null,
  user: null,
  ws: null,
  messages: [],
  posts: [],
  notifications: [],
  shop: [],
  adminUsers: []
};

const elements = {
  showLogin: document.getElementById('show-login'),
  showRegister: document.getElementById('show-register'),
  authPanel: document.getElementById('auth-panel'),
  authForms: document.getElementById('auth-forms'),
  hideAuth: document.getElementById('hide-auth'),
  dashboard: document.getElementById('dashboard'),
  logoutBtn: document.getElementById('logoutBtn'),
  profileAvatar: document.getElementById('profile-avatar'),
  profileName: document.getElementById('profile-name'),
  profileRank: document.getElementById('profile-rank'),
  profileId: document.getElementById('profile-id'),
  profileRole: document.getElementById('profile-role'),
  profileAvatarInput: document.getElementById('profile-avatar-input'),
  profileColorInput: document.getElementById('profile-color-input'),
  profileFontInput: document.getElementById('profile-font-input'),
  profileBgInput: document.getElementById('profile-bg-input'),
  profileEffectsInput: document.getElementById('profile-effects-input'),
  profileAboutInput: document.getElementById('profile-about-input'),
  profileTankInput: document.getElementById('profile-tank-input'),
  saveProfileBtn: document.getElementById('saveProfileBtn'),
  chatMessages: document.getElementById('chatMessages'),
  chatInput: document.getElementById('chatInput'),
  sendChatBtn: document.getElementById('sendChatBtn'),
  postsList: document.getElementById('postsList'),
  postText: document.getElementById('postText'),
  postBtn: document.getElementById('postBtn'),
  notificationsList: document.getElementById('notificationsList'),
  currencyValue: document.getElementById('currencyValue'),
  shopList: document.getElementById('shopList'),
  adminPanel: document.getElementById('adminPanel'),
  adminUsers: document.getElementById('adminUsers')
};

function api(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  return fetch(url, { ...options, headers });
}

function showAuthForm(type) {
  elements.authPanel.classList.remove('hidden');
  if (type === 'login') {
    elements.authForms.innerHTML = `
      <h2>Вход</h2>
      <label>Никнейм<input id="loginUsername" /></label>
      <label>Пароль<input id="loginPassword" type="password" /></label>
      <button id="loginBtn" class="btn btn-primary">Войти</button>
      <p class="note">Используйте Admin / Wolodymer1994 для администратора.</p>
    `;
    document.getElementById('loginBtn').addEventListener('click', doLogin);
  } else {
    elements.authForms.innerHTML = `
      <h2>Регистрация</h2>
      <label>Никнейм<input id="registerUsername" /></label>
      <label>Пароль<input id="registerPassword" type="password" /></label>
      <button id="registerBtn" class="btn btn-primary">Создать аккаунт</button>
    `;
    document.getElementById('registerBtn').addEventListener('click', doRegister);
  }
}

function hideAuth() {
  elements.authPanel.classList.add('hidden');
}

async function doLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const response = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  const data = await response.json();
  if (!response.ok) return alert(data.error || 'Ошибка входа');
  state.token = data.token;
  state.user = data.user;
  hideAuth();
  await loadDashboard();
}

async function doRegister() {
  const username = document.getElementById('registerUsername').value.trim();
  const password = document.getElementById('registerPassword').value;
  const response = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) });
  const data = await response.json();
  if (!response.ok) return alert(data.error || 'Ошибка регистрации');
  state.token = data.token;
  state.user = data.user;
  hideAuth();
  await loadDashboard();
}

async function loadDashboard() {
  elements.dashboard.classList.remove('hidden');
  document.body.classList.add('dashboard-open');
  await refreshUser();
  await loadChat();
  await loadPosts();
  await loadNotifications();
  await loadShop();
  if (state.user.role === 'admin' || state.user.role === 'curator') {
    await loadAdmin();
    elements.adminPanel.classList.remove('hidden');
  } else {
    elements.adminPanel.classList.add('hidden');
  }
  connectSocket();
}

async function refreshUser() {
  const resp = await api('/api/auth/me');
  const data = await resp.json();
  if (resp.ok) {
    state.user = data.user;
    renderProfile();
  }
}

function renderProfile() {
  const user = state.user;
  elements.profileAvatar.textContent = user.avatar?.slice(0, 2).toUpperCase() || user.username.slice(0,2).toUpperCase();
  elements.profileAvatar.style.background = user.color || 'linear-gradient(135deg, #ff6a00, #ffb84d)';
  elements.profileName.textContent = user.username;
  elements.profileRank.textContent = `Звание: ${user.rank || 'Новобранец'}`;
  elements.profileId.textContent = `ID: ${user.id}`;
  elements.profileRole.textContent = `Роль: ${user.role === 'admin' ? 'Администратор' : user.role === 'curator' ? 'Куратор' : 'Участник'}`;
  elements.profileAvatarInput.value = user.avatar || '';
  elements.profileColorInput.value = user.color || '#ff6a00';
  elements.profileFontInput.value = user.font || '';
  elements.profileBgInput.value = user.background || '';
  elements.profileEffectsInput.value = user.effects || '';
  elements.profileAboutInput.value = user.about || '';
  elements.profileTankInput.value = user.favoriteTank || '';
  elements.currencyValue.textContent = user.currency || 0;
}

async function saveProfile() {
  const body = {
    avatar: elements.profileAvatarInput.value.trim(),
    color: elements.profileColorInput.value.trim(),
    font: elements.profileFontInput.value.trim(),
    background: elements.profileBgInput.value.trim(),
    effects: elements.profileEffectsInput.value.trim(),
    about: elements.profileAboutInput.value.trim(),
    favoriteTank: elements.profileTankInput.value.trim()
  };
  const resp = await api('/api/user/profile', { method: 'PUT', body: JSON.stringify(body) });
  const data = await resp.json();
  if (!resp.ok) return alert(data.error || 'Ошибка сохранения');
  state.user = data.user;
  renderProfile();
  alert('Профиль обновлён');
}

function renderChat() {
  elements.chatMessages.innerHTML = state.messages.map(msg => `
    <div class="chat-message">
      <div><strong>${msg.authorName}</strong> <span>${new Date(msg.createdAt).toLocaleTimeString()}</span></div>
      <div>${escapeHtml(msg.text)}</div>
    </div>`).join('');
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

async function loadChat() {
  const resp = await api('/api/chat/public');
  const data = await resp.json();
  if (resp.ok) {
    state.messages = data.messages;
    renderChat();
  }
}

async function sendChat() {
  const text = elements.chatInput.value.trim();
  if (!text) return;
  const resp = await api('/api/chat/public', { method: 'POST', body: JSON.stringify({ text }) });
  const data = await resp.json();
  if (!resp.ok) return alert(data.error || 'Ошибка отправки');
  elements.chatInput.value = '';
  state.messages.push(data.message);
  renderChat();
}

function renderPosts() {
  elements.postsList.innerHTML = state.posts.map(post => `
    <div class="post-card">
      <div><strong>${post.authorName}</strong> <span>${new Date(post.createdAt).toLocaleString()}</span></div>
      <p>${escapeHtml(post.text)}</p>
    </div>
  `).join('');
}

async function loadPosts() {
  const resp = await api('/api/posts');
  const data = await resp.json();
  if (resp.ok) {
    state.posts = data.posts;
    renderPosts();
  }
}

async function publishPost() {
  const text = elements.postText.value.trim();
  if (!text) return;
  const resp = await api('/api/posts', { method: 'POST', body: JSON.stringify({ text }) });
  const data = await resp.json();
  if (!resp.ok) return alert(data.error || 'Ошибка публикации');
  elements.postText.value = '';
  state.posts.unshift(data.post);
  renderPosts();
}

function renderNotifications() {
  elements.notificationsList.innerHTML = state.notifications.map(note => `
    <div class="notification-card">
      <div><strong>${note.type.replace(/-/g, ' ')}</strong> <span>${new Date(note.createdAt).toLocaleString()}</span></div>
      <p>${escapeHtml(JSON.stringify(note.payload))}</p>
    </div>
  `).join('');
}

async function loadNotifications() {
  const resp = await api('/api/notifications');
  const data = await resp.json();
  if (resp.ok) {
    state.notifications = data.notifications;
    renderNotifications();
  }
}

function renderShop() {
  elements.shopList.innerHTML = state.shop.map(item => `
    <div class="shop-item">
      <div><strong>${escapeHtml(item.name)}</strong></div>
      <div>${escapeHtml(item.description)}</div>
      <div class="meta"><span>${item.rarity.toUpperCase()}</span><span>${item.price} кредитов</span></div>
      <button class="btn btn-secondary" data-item-id="${item.id}">Купить</button>
    </div>
  `).join('');
  elements.shopList.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => purchaseItem(button.dataset.itemId));
  });
}

async function loadShop() {
  const resp = await api('/api/shop');
  const data = await resp.json();
  if (resp.ok) {
    state.shop = data.items;
    renderShop();
  }
}

async function purchaseItem(itemId) {
  const resp = await api('/api/shop/purchase', { method: 'POST', body: JSON.stringify({ itemId }) });
  const data = await resp.json();
  if (!resp.ok) return alert(data.error || 'Ошибка покупки');
  await refreshUser();
  alert(`Куплено: ${data.item}`);
}

function renderAdmin() {
  elements.adminUsers.innerHTML = state.adminUsers.map(user => `
    <div class="admin-row">
      <div>
        <h4>${user.username} <span>${user.rank || ''}</span></h4>
        <p>ID: ${user.id}</p>
        <p>Роль: ${user.role} | Баланс: ${user.currency} | ${user.isBanned ? 'Забанен' : user.isMuted ? 'Замучен' : 'Активен'}</p>
      </div>
      <div class="admin-actions">
        <button class="btn btn-secondary" data-action="rank" data-id="${user.id}">Ранг</button>
        <button class="btn btn-secondary" data-action="role" data-id="${user.id}">Роль</button>
        <button class="btn btn-secondary" data-action="ban" data-id="${user.id}">Бан</button>
        <button class="btn btn-secondary" data-action="mute" data-id="${user.id}">Мут</button>
      </div>
    </div>
  `).join('');
  elements.adminUsers.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => handleAdminAction(button.dataset.action, button.dataset.id));
  });
}

async function loadAdmin() {
  const resp = await api('/api/admin/users');
  const data = await resp.json();
  if (resp.ok) {
    state.adminUsers = data.users;
    renderAdmin();
  }
}

async function handleAdminAction(action, id) {
  if (id === state.user.id) return alert('Нельзя менять себя');
  let body = {};
  if (action === 'role') {
    const role = prompt('Введите роль (member, curator, admin)');
    if (!role) return;
    body = { role };
  }
  if (action === 'rank') {
    const rank = prompt('Введите звание');
    if (!rank) return;
    body = { rank };
  }
  const method = action === 'ban' || action === 'mute' ? 'POST' : 'POST';
  const url = `/api/admin/user/${id}/${action}` + (action === 'role' || action === 'rank' ? '' : '');
  const resp = await api(url, { method, body: JSON.stringify(body) });
  const data = await resp.json();
  if (!resp.ok) return alert(data.error || 'Ошибка');
  alert('Операция выполнена');
  await loadAdmin();
}

function connectSocket() {
  if (!state.token) return;
  if (state.ws) state.ws.close();
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  state.ws = new WebSocket(`${proto}://${location.host}/ws?token=${state.token}`);
  state.ws.onopen = () => console.log('WS connected');
  state.ws.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.type === 'public-message') {
      state.messages.push(data.message);
      renderChat();
    }
    if (data.type === 'direct-message') {
      state.notifications.unshift({ id: `dm-${Date.now()}`, type: 'direct-message', payload: data.message, createdAt: new Date().toISOString() });
      renderNotifications();
    }
  };
  state.ws.onclose = () => console.log('WS disconnected');
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function init() {
  elements.showLogin.addEventListener('click', () => showAuthForm('login'));
  elements.showRegister.addEventListener('click', () => showAuthForm('register'));
  elements.hideAuth.addEventListener('click', hideAuth);
  elements.logoutBtn.addEventListener('click', () => { state.token = null; state.user = null; elements.dashboard.classList.add('hidden'); });
  elements.saveProfileBtn.addEventListener('click', saveProfile);
  elements.sendChatBtn.addEventListener('click', sendChat);
  elements.postBtn.addEventListener('click', publishPost);
  window.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.activeElement === elements.chatInput) {
      sendChat();
    }
  });
}

init();
