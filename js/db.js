const DB = {
  users: 'ares_users',
  session: 'ares_session',
  messages: 'ares_messages',
  direct: 'ares_direct_messages',
  posts: 'ares_posts',
  comments: 'ares_comments',
  notifications: 'ares_notifications',
  requests: 'ares_friend_requests',
  shop: 'ares_shop',
  achievements: 'ares_achievements'
};

const DEFAULT_SHOP = [
  { id: 'item-avatar-ares', name: 'Аватар ARES', description: 'Уникальная эмблема профиля, пробуждающая уважение.', price: 300, rarity: 'Редкое' },
  { id: 'item-bg-fire', name: 'Фон "Огненная броня"', description: 'Огненный фон для профиля и мощной истории.', price: 500, rarity: 'Эпическое' },
  { id: 'item-effect-glow', name: 'Свечение ника', description: 'Эффект свечения для ника в чате и профиле.', price: 450, rarity: 'Эпическое' },
  { id: 'item-font-metal', name: 'Шрифт "Стальной"', description: 'Кастомный шрифт для ника, похожий на броню.', price: 250, rarity: 'Редкое' }
];

const DEFAULT_ACHIEVEMENTS = [
  { id: 'achv-1', name: 'Новобранец ARES', description: 'Зарегистрироваться и открыть личный кабинет.', reward: 100 },
  { id: 'achv-2', name: 'Огненный голос', description: 'Отправить 10 сообщений в клановый чат.', reward: 250 },
  { id: 'achv-3', name: 'Мастер постов', description: 'Опубликовать 5 постов в ленте.', reward: 300 },
  { id: 'achv-4', name: 'Верный друг', description: 'Принять 3 запроса в друзья.', reward: 200 },
  { id: 'achv-5', name: 'Офицер ARES', description: 'Получить звание офицера или выше.', reward: 500 }
];

function loadStorage(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function saveStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
