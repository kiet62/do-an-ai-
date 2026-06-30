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
  admin: ['manage_users', 'view_reports', 'manage_products', 'assign_orders', 'view_products', 'view_orders'],
  staff: ['manage_products', 'view_orders', 'view_products'],
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

  await dbRun(`CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    category TEXT,
    description TEXT,
    createdAt TEXT
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS delivery_assignments (
    orderId TEXT PRIMARY KEY,
    driver TEXT NOT NULL,
    vehicle TEXT,
    route TEXT,
    status TEXT,
    assignedAt TEXT
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

app.get('/api/public-products', async (req, res) => {
  const products = await dbAll('SELECT * FROM products ORDER BY createdAt DESC');
  res.json({ products });
});

app.get('/api/products', authenticateToken, async (req, res) => {
  if (!rolePermissions[req.user.role].includes('view_products')) {
    return res.status(403).json({ message: 'Bạn không có quyền xem sản phẩm.' });
  }

  const products = await dbAll('SELECT * FROM products ORDER BY createdAt DESC');
  res.json({ products });
});

app.post('/api/products', authenticateToken, authorizeRole(['admin', 'staff']), async (req, res) => {
  const { name, price, category, description } = req.body;
  const numericPrice = Number(price);
  if (!name || !numericPrice || numericPrice < 0) {
    return res.status(400).json({ message: 'Thiếu tên sản phẩm hoặc giá bán không hợp lệ.' });
  }

  const product = {
    id: `PRD-${Date.now()}`,
    name: name.trim(),
    price: Math.round(numericPrice),
    category: category || 'Khác',
    description: description || '',
    createdAt: new Date().toISOString()
  };

  await dbRun(
    'INSERT INTO products (id, name, price, category, description, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    [product.id, product.name, product.price, product.category, product.description, product.createdAt]
  );

  res.status(201).json({ message: 'Sản phẩm đã được lưu.', product });
});

app.put('/api/products/:id', authenticateToken, authorizeRole(['admin', 'staff']), async (req, res) => {
  const { name, price, category, description } = req.body;
  const numericPrice = Number(price);
  if (!name || !numericPrice || numericPrice < 0) {
    return res.status(400).json({ message: 'Thiếu tên sản phẩm hoặc giá bán không hợp lệ.' });
  }

  const existing = await dbGet('SELECT id FROM products WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });

  const product = {
    id: req.params.id,
    name: name.trim(),
    price: Math.round(numericPrice),
    category: category || 'Khác',
    description: description || ''
  };

  await dbRun(
    'UPDATE products SET name = ?, price = ?, category = ?, description = ? WHERE id = ?',
    [product.name, product.price, product.category, product.description, product.id]
  );

  res.json({ message: 'Sản phẩm đã được cập nhật.', product });
});

app.delete('/api/products/:id', authenticateToken, authorizeRole(['admin', 'staff']), async (req, res) => {
  const result = await dbRun('DELETE FROM products WHERE id = ?', [req.params.id]);
  if (!result.changes) return res.status(404).json({ message: 'Không tìm thấy sản phẩm.' });
  res.json({ message: 'Sản phẩm đã được xóa.' });
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

app.get('/api/admin/orders', authenticateToken, authorizeRole(['admin', 'staff']), async (req, res) => {
  const assignments = await dbAll('SELECT * FROM delivery_assignments ORDER BY assignedAt DESC');
  const assignmentMap = new Map(assignments.map(item => [item.orderId, item]));
  const demoOrders = [
    { orderId: 'LG20260620-001', customer: 'Nguyễn Văn A', department: 'Điều phối', status: 'Đang giao', driver: 'Tài xế A' },
    { orderId: 'LG20260620-002', customer: 'Trần Thị B', department: 'Kho vận', status: 'Chờ xuất kho', driver: 'Chưa phân' },
    { orderId: 'LG20260620-003', customer: 'Lê Minh C', department: 'CSKH', status: 'Hoàn tất', driver: 'Tài xế B' }
  ];

  const orders = demoOrders.map(order => {
    const assignment = assignmentMap.get(order.orderId);
    return assignment ? {
      ...order,
      status: assignment.status,
      driver: assignment.driver,
      vehicle: assignment.vehicle,
      route: assignment.route,
      assignedAt: assignment.assignedAt
    } : order;
  });

  assignments.forEach(assignment => {
    if (!orders.some(order => order.orderId === assignment.orderId)) {
      orders.push({
        orderId: assignment.orderId,
        customer: 'Khách hàng',
        department: 'Điều phối',
        status: assignment.status,
        driver: assignment.driver,
        vehicle: assignment.vehicle,
        route: assignment.route,
        assignedAt: assignment.assignedAt
      });
    }
  });

  res.json({ orders });
});

app.post('/api/assign', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  const { orderId, driver, vehicle, route } = req.body;
  if (!orderId || !driver) return res.status(400).json({ message: 'Thiếu mã đơn hàng hoặc tài xế.' });

  const assignment = {
    orderId: orderId.trim(),
    driver,
    vehicle: vehicle || '',
    route: route || 'Chưa cập nhật',
    status: 'Đang giao',
    assignedAt: new Date().toISOString()
  };

  await dbRun(
    `INSERT INTO delivery_assignments (orderId, driver, vehicle, route, status, assignedAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(orderId) DO UPDATE SET
       driver = excluded.driver,
       vehicle = excluded.vehicle,
       route = excluded.route,
       status = excluded.status,
       assignedAt = excluded.assignedAt`,
    [assignment.orderId, assignment.driver, assignment.vehicle, assignment.route, assignment.status, assignment.assignedAt]
  );

  res.json({ message: `Đã phân công ${driver} cho đơn ${assignment.orderId}.`, assignment });
});

app.get('/api/users', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  const usersList = await dbAll('SELECT id, username, role, displayName FROM users');
  res.json({ users: usersList });
});

app.post('/api/users', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  const { displayName, username, password, role = 'customer' } = req.body;
  const allowedRoles = ['admin', 'staff', 'customer'];
  if (!displayName || !username || !password || !allowedRoles.includes(role)) {
    return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin tài khoản.' });
  }

  const existingUser = await dbGet('SELECT id FROM users WHERE username = ?', [username]);
  if (existingUser) return res.status(409).json({ message: 'Username đã tồn tại.' });

  const user = {
    id: `${Date.now()}-${Math.random()}`,
    username: username.trim(),
    passwordHash: bcrypt.hashSync(password, 10),
    role,
    displayName: displayName.trim()
  };

  await dbRun(
    'INSERT INTO users (id, username, passwordHash, role, displayName) VALUES (?, ?, ?, ?, ?)',
    [user.id, user.username, user.passwordHash, user.role, user.displayName]
  );

  res.status(201).json({ message: 'Tài khoản đã được tạo.', user: { id: user.id, username: user.username, role: user.role, displayName: user.displayName } });
});

app.patch('/api/users/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  const { role, displayName } = req.body;
  const allowedRoles = ['admin', 'staff', 'customer'];
  if (role && !allowedRoles.includes(role)) return res.status(400).json({ message: 'Vai trò không hợp lệ.' });

  const existing = await dbGet('SELECT id, username, role, displayName FROM users WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });

  const nextRole = role || existing.role;
  const nextDisplayName = displayName?.trim() || existing.displayName;
  await dbRun('UPDATE users SET role = ?, displayName = ? WHERE id = ?', [nextRole, nextDisplayName, req.params.id]);

  res.json({ message: 'Tài khoản đã được cập nhật.', user: { ...existing, role: nextRole, displayName: nextDisplayName } });
});

app.delete('/api/users/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ message: 'Không thể xóa chính tài khoản đang đăng nhập.' });
  }

  const result = await dbRun('DELETE FROM users WHERE id = ?', [req.params.id]);
  if (!result.changes) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
  res.json({ message: 'Tài khoản đã được xóa.' });
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

  const openAiPayload = {
    model: OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: 'Bạn là trợ lý chăm sóc khách hàng cho LogiPort Mart. Trả lời ngắn gọn bằng tiếng Việt, hỗ trợ tìm sản phẩm, giỏ hàng, thanh toán, tra cứu đơn hàng và dịch vụ logistics. Nếu khách hỏi thông tin ngoài phạm vi web, hãy hướng dẫn lịch sự.'
      },
      ...safeHistory,
      { role: 'user', content: message }
    ],
    temperature: 0.4
  };

  try {
    let response;
    let data;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(openAiPayload)
      });

      data = await response.json();
      const errorCode = data.error?.code || data.error?.type || '';
      const shouldRetry = response.status >= 500 || errorCode === 'server_error';
      if (response.ok || !shouldRetry || attempt === 3) break;

      await new Promise(resolve => setTimeout(resolve, attempt * 900));
    }

    if (!response.ok) {
      console.error('OpenAI API error:', data);
      const code = data.error?.code || data.error?.type || '';
      const statusMessage = response.status === 401
        ? 'OpenAI API key không hợp lệ. Vui lòng kiểm tra OPENAI_API_KEY trên Render.'
        : response.status === 429
          ? 'OpenAI API key đang hết quota hoặc bị giới hạn. Vui lòng kiểm tra billing/quota.'
          : code.includes('model')
            ? 'Model OpenAI chưa đúng. Hãy đặt OPENAI_MODEL là gpt-4o-mini.'
            : code === 'server_error'
              ? 'OpenAI đang lỗi tạm thời. Bạn thử gửi lại câu hỏi sau ít phút nhé.'
            : 'Chat AI đang bận. Vui lòng thử lại sau.';
      return res.status(502).json({ message: statusMessage });
    }

    const reply = data.choices?.[0]?.message?.content?.trim()
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
