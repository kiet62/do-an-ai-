const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'logiport_demo_secret';
const DB_PATH = process.env.SQLITE_DB_PATH || path.join(__dirname, 'database.sqlite');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Could not open SQLite database:', err);
    process.exit(1);
  }
});

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve(this);
  });
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

const rolePermissions = {
  admin: ['manage_users', 'view_reports', 'manage_products', 'assign_orders'],
  staff: ['manage_products', 'view_orders'],
  customer: ['view_products', 'create_orders']
};

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token không được cung cấp.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token không hợp lệ.' });
    req.user = user;
    next();
  });
}

function authorizeRole(requiredRoles) {
  return (req, res, next) => {
    if (!req.user || !requiredRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập.' });
    }
    next();
  };
}

app.get('/', (req, res) => {
  res.json({ message: 'LogiPort backend is running' });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Vui lòng cung cấp username và password.' });
  }

  const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ message: 'Username hoặc password không đúng.' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, displayName: user.displayName },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({ token, user: { id: user.id, username: user.username, role: user.role, displayName: user.displayName } });
});

async function initDatabase() {
  await dbRun(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    passwordHash TEXT,
    role TEXT,
    displayName TEXT
  )`);

  const defaults = [
    { username: 'admin', password: 'admin123', role: 'admin', displayName: 'Nguyễn Quản Trị' },
    { username: 'nhanvien', password: 'nv123456', role: 'staff', displayName: 'Lê Nhân Viên' },
    { username: 'khachhang', password: 'kh123456', role: 'customer', displayName: 'Trần Khách Hàng' }
  ];

  for (const item of defaults) {
    const existingUser = await dbGet('SELECT id FROM users WHERE username = ?', [item.username]);
    if (!existingUser) {
      await dbRun(
        'INSERT INTO users (id, username, passwordHash, role, displayName) VALUES (?, ?, ?, ?, ?)',
        [`${Date.now()}-${Math.random()}`, item.username, bcrypt.hashSync(item.password, 10), item.role, item.displayName]
      );
      console.log(`Created default user ${item.username}`);
    }
  }
}

app.post('/api/register', async (req, res) => {
  const { displayName, username, password } = req.body;
  if (!displayName || !username || !password) {
    return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ họ tên, username và password.' });
  }

  const existingUser = await dbGet('SELECT id FROM users WHERE username = ?', [username]);
  if (existingUser) {
    return res.status(409).json({ message: 'Username đã tồn tại. Vui lòng chọn username khác.' });
  }

  const newUser = {
    id: `${Date.now()}-${Math.random()}`,
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    role: 'customer',
    displayName
  };

  await dbRun(
    'INSERT INTO users (id, username, passwordHash, role, displayName) VALUES (?, ?, ?, ?, ?)',
    [newUser.id, newUser.username, newUser.passwordHash, newUser.role, newUser.displayName]
  );

  const token = jwt.sign(
    { id: newUser.id, username: newUser.username, role: newUser.role, displayName: newUser.displayName },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.status(201).json({ token, user: { id: newUser.id, username: newUser.username, role: newUser.role, displayName: newUser.displayName } });
});

app.get('/api/profile', authenticateToken, async (req, res) => {
  const user = await dbGet('SELECT id, username, role, displayName FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
  res.json(user);
});

app.get('/api/products', authenticateToken, (req, res) => {
  if (!rolePermissions[req.user.role].includes('view_products')) {
    return res.status(403).json({ message: 'Bạn không có quyền xem sản phẩm.' });
  }

  res.json({ products: [{ id: 1, name: 'Bàn phím cơ', price: 790000 }, { id: 2, name: 'Giày sneaker', price: 450000 }] });
});

app.post('/api/products', authenticateToken, authorizeRole(['admin', 'staff']), (req, res) => {
  const { name, price } = req.body;
  if (!name || !price) return res.status(400).json({ message: 'Thiếu tên sản phẩm hoặc giá bán.' });
  res.status(201).json({ message: 'Sản phẩm đã được thêm (demo).', product: { id: Date.now(), name, price } });
});

app.get('/api/orders', authenticateToken, (req, res) => {
  if (req.user.role === 'customer') {
    return res.json({ orders: [{ orderId: 'LG20260620-010', status: 'Đang xử lý', total: 129000 }] });
  }
  if (req.user.role === 'staff' || req.user.role === 'admin') {
    return res.json({ orders: [{ orderId: 'LG20260620-001', status: 'Đang giao', assignee: 'Tài xế A' }, { orderId: 'LG20260620-002', status: 'Chờ xuất kho', assignee: 'Chưa phân' }] });
  }
  res.status(403).json({ message: 'Bạn không có quyền xem đơn hàng.' });
});

app.post('/api/assign', authenticateToken, authorizeRole(['admin']), (req, res) => {
  const { orderId, driver } = req.body;
  if (!orderId || !driver) return res.status(400).json({ message: 'Thiếu orderId hoặc driver.' });
  res.json({ message: `Đã phân công ${driver} cho đơn ${orderId} (demo).` });
});

app.get('/api/users', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  const usersList = await dbAll('SELECT id, username, role, displayName FROM users');
  res.json({ users: usersList });
});

app.post('/api/chat', async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ message: 'Vui lòng nhập nội dung cần hỗ trợ.' });
  }

  if (!OPENAI_API_KEY) {
    return res.status(503).json({
      message: 'Chat AI chưa được cấu hình OPENAI_API_KEY trên server.'
    });
  }

  const safeHistory = Array.isArray(history)
    ? history.slice(-8).filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
    : [];

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: [
          {
            role: 'system',
            content: 'Bạn là trợ lý chăm sóc khách hàng cho LogiPort Mart. Trả lời ngắn gọn bằng tiếng Việt, hỗ trợ tìm sản phẩm, giỏ hàng, thanh toán, tra cứu đơn hàng và dịch vụ logistics. Nếu khách hỏi thông tin ngoài phạm vi web, hãy hướng dẫn lịch sự.'
          },
          ...safeHistory,
          { role: 'user', content: message }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('OpenAI API error:', data);
      return res.status(502).json({ message: 'Chat AI đang bận. Vui lòng thử lại sau.' });
    }

    const reply = data.output_text
      || data.output?.flatMap(item => item.content || []).map(item => item.text || '').join('').trim()
      || 'Mình chưa có câu trả lời phù hợp. Bạn vui lòng hỏi lại ngắn hơn nhé.';

    res.json({ reply });
  } catch (error) {
    console.error('Chat API error:', error);
    res.status(500).json({ message: 'Không thể kết nối Chat AI lúc này.' });
  }
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server đang chạy tại http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Server init error:', error);
    process.exit(1);
  });
