const API_BASE = determineApiBase();
const CART_STORAGE_KEY = 'logiport_cart';
let cartCount = 0;
let authToken = null;
let currentUser = null;
let cartItems = [];
const orderDatabase = [
  { code: 'LG20260620-001', customer: 'Nguyễn Văn A', role: 'Khách hàng', status: 'Đang giao', eta: '45 phút', driver: 'Nguyễn Văn A', route: 'Cảng Cát Lái → Thủ Đức → Bình Dương', email: 'nguyenvana@example.com', note: 'Hàng đang được cập nhật vị trí GPS.' },
  { code: 'LG20260620-002', customer: 'Trần Thị B', role: 'Nhân viên kho', status: 'Chờ xuất kho', eta: 'Trước 18:00', driver: 'Chưa phân', route: 'Kho Cát Lái → Kho Bình Dương', email: 'tranthib@example.com', note: 'Đơn hàng chuẩn bị lên xe.' },
  { code: 'LG20260620-003', customer: 'Lê Minh C', role: 'Khách hàng', status: 'Hoàn tất', eta: 'Đã giao', driver: 'Nguyễn Văn C', route: 'Kho Quận 9 → Nhà khách', email: 'leminhc@example.com', note: 'Khách đã nhận hàng thành công.' }
];

function determineApiBase() {
  const backendUrl = 'http://localhost:4000';
  const origin = window.location.origin;
  if (!origin || origin === 'null' || origin === 'file://') {
    return `${backendUrl}/api`;
  }
  return '/api';
}

function initAuth() {
  authToken = localStorage.getItem('logiport_token');
  const storedUser = localStorage.getItem('logiport_user');
  if (storedUser) {
    try {
      currentUser = JSON.parse(storedUser);
    } catch {
      currentUser = null;
    }
  }
  updateAuthUI();
  protectAdminPage();
  if (document.getElementById('userListContainer')) {
    loadUserList();
  }
}

function initCart() {
  const storedCart = localStorage.getItem(CART_STORAGE_KEY);
  if (storedCart) {
    try {
      cartItems = JSON.parse(storedCart) || [];
    } catch {
      cartItems = [];
    }
  }
  updateCartCount();
  renderCart();
  renderOrderHistory();
}

function saveCart() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
}

function saveOrder(order) {
  const orders = JSON.parse(localStorage.getItem('logiport_orders') || '[]');
  orders.push(order);
  localStorage.setItem('logiport_orders', JSON.stringify(orders));
  renderOrderHistory();
}

function getSavedOrders() {
  try {
    return JSON.parse(localStorage.getItem('logiport_orders') || '[]');
  } catch {
    return [];
  }
}

function getOrderByCode(code) {
  const normalized = code.trim().toLowerCase();
  const savedOrders = getSavedOrders();
  const order = [...savedOrders, ...orderDatabase].find(item => item.code.toLowerCase() === normalized);
  return order;
}

function updateCartCount() {
  cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cart = document.getElementById('cartCount');
  if (cart) cart.innerText = cartCount;
}

function formatVND(value) {
  return '₫' + value.toLocaleString('vi-VN');
}

function addToCart(buttonElement) {
  const button = buttonElement || (typeof event !== 'undefined' ? event.currentTarget || event.target : null);
  if (!button) return;
  const card = button.closest('.product-card');
  if (!card) return;

  const productName = card.getAttribute('data-name') || card.querySelector('.name')?.innerText || 'Sản phẩm';
  const priceText = card.querySelector('.price')?.innerText || '0';
  const price = parseInt(priceText.replace(/[^\d]/g, '')) || 0;
  const productId = card.getAttribute('data-product-id') || productName;

  const existing = cartItems.find(item => item.id === productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    cartItems.push({ id: productId, name: productName, price, quantity: 1 });
  }

  saveCart();
  updateCartCount();
  renderCart();
  alert(`${productName} đã được thêm vào giỏ hàng!`);
}

function renderCart() {
  const content = document.getElementById('cartContent');
  const summary = document.getElementById('cartSummary');
  if (!content || !summary) return;

  if (cartItems.length === 0) {
    content.innerHTML = '<p>Giỏ hàng đang trống. Thêm sản phẩm vào giỏ để xem chi tiết ở đây.</p>';
    summary.innerHTML = '';
    return;
  }

  let html = '<div class="cart-items">';
  cartItems.forEach(item => {
    html += `
      <div class="cart-item">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <div>${formatVND(item.price)} × ${item.quantity}</div>
        </div>
        <div class="cart-actions">
          <button class="qty-btn" type="button" onclick="updateCartQuantity('${encodeURIComponent(item.id)}', -1)">-</button>
          <span>${item.quantity}</span>
          <button class="qty-btn" type="button" onclick="updateCartQuantity('${encodeURIComponent(item.id)}', 1)">+</button>
          <button class="btn btn-secondary" type="button" onclick="removeCartItem('${encodeURIComponent(item.id)}')">Xóa</button>
        </div>
      </div>`;
  });
  html += '</div>';
  content.innerHTML = html;

  const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  summary.innerHTML = `
    <div class="cart-total"><strong>Tổng tiền:</strong> ${formatVND(total)}</div>
    <div class="checkout-form">
      <div class="form-row">
        <div>
          <label for="checkoutName">Họ và tên người nhận</label>
          <input id="checkoutName" type="text" placeholder="Nhập họ tên" value="${currentUser?.displayName || ''}">
        </div>
        <div>
          <label for="checkoutPhone">Số điện thoại</label>
          <input id="checkoutPhone" type="tel" placeholder="Nhập số điện thoại">
        </div>
      </div>
      <div class="form-row">
        <div style="grid-column: 1 / -1;">
          <label for="checkoutAddress">Địa chỉ giao hàng</label>
          <input id="checkoutAddress" type="text" placeholder="Nhập địa chỉ nhận hàng">
        </div>
      </div>
      <div class="form-row">
        <div style="grid-column: 1 / -1;">
          <label for="checkoutPayment">Phương thức thanh toán</label>
          <select id="checkoutPayment">
            <option>Thanh toán khi nhận hàng</option>
            <option>Chuyển khoản ngân hàng</option>
            <option>Thẻ tín dụng / Visa</option>
          </select>
        </div>
      </div>
      <button class="btn btn-primary" type="button" onclick="checkoutCart()">Thanh toán</button>
    </div>
  `;
}

function removeCartItem(productId) {
  const decodedId = decodeURIComponent(productId);
  cartItems = cartItems.filter(item => item.id !== decodedId);
  saveCart();
  updateCartCount();
  renderCart();
}

function updateCartQuantity(productId, change) {
  const decodedId = decodeURIComponent(productId);
  cartItems = cartItems
    .map(item => item.id === decodedId ? { ...item, quantity: item.quantity + change } : item)
    .filter(item => item.quantity > 0);
  saveCart();
  updateCartCount();
  renderCart();
}

function clearCart() {
  cartItems = [];
  saveCart();
  updateCartCount();
  renderCart();
}

function checkoutCart() {
  if (cartItems.length === 0) {
    showCheckoutFeedback('Giỏ hàng trống. Vui lòng thêm sản phẩm trước khi thanh toán.', true);
    return;
  }

  const nameInput = document.getElementById('checkoutName');
  const phoneInput = document.getElementById('checkoutPhone');
  const addressInput = document.getElementById('checkoutAddress');
  const paymentInput = document.getElementById('checkoutPayment');
  const checkoutResult = document.getElementById('checkoutResult');

  const name = nameInput?.value.trim() || '';
  const phone = phoneInput?.value.trim() || '';
  const address = addressInput?.value.trim() || '';
  const payment = paymentInput?.value || 'Thanh toán khi nhận hàng';

  if (!name || !phone || !address) {
    showCheckoutFeedback('Vui lòng điền đầy đủ họ tên, số điện thoại và địa chỉ giao hàng.', true);
    return;
  }

  const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const orderCode = generateOrderCode();
  const orderDate = new Date().toLocaleString('vi-VN');

  const order = {
    code: orderCode,
    customer: name,
    role: currentUser?.role || 'Khách hàng',
    status: 'Chờ xác nhận',
    eta: 'Chưa có',
    driver: 'Chưa phân',
    route: 'Chưa xác định',
    email: currentUser?.username ? `${currentUser.username}@example.com` : '',
    note: 'Đơn hàng mới vừa được đặt.',
    phone,
    address,
    payment,
    total,
    placedAt: orderDate,
    items: cartItems.map(item => ({ ...item }))
  };

  saveOrder(order);

  const orderHtml = `
    <h3>Đặt hàng thành công!</h3>
    <p><strong>Mã đơn:</strong> ${orderCode}</p>
    <p><strong>Người nhận:</strong> ${name}</p>
    <p><strong>Điện thoại:</strong> ${phone}</p>
    <p><strong>Địa chỉ giao:</strong> ${address}</p>
    <p><strong>Phương thức thanh toán:</strong> ${payment}</p>
    <p><strong>Thành tiền:</strong> ${formatVND(total)}</p>
    <p><strong>Ngày đặt:</strong> ${orderDate}</p>
    <p><strong>Thông tin đơn hàng đã lưu.</strong></p>
  `;

  if (checkoutResult) {
    checkoutResult.style.display = 'block';
    checkoutResult.innerHTML = orderHtml;
  }

  clearCart();
}

function generateOrderCode() {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(100 + Math.random() * 900);
  return `LG${y}${m}${d}${random}`;
}

function showCheckoutFeedback(message, isError) {
  const checkoutResult = document.getElementById('checkoutResult');
  if (!checkoutResult) return;
  checkoutResult.style.display = 'block';
  checkoutResult.innerHTML = `<p style="color:${isError ? '#b91c1c' : '#047857'}; margin:0">${message}</p>`;
}

function renderOrderHistory() {
  const history = document.getElementById('orderHistory');
  if (!history) return;

  const orders = getSavedOrders().slice().reverse();
  if (!orders.length) {
    history.innerHTML = '<p>Chưa có đơn hàng nào được đặt trên trình duyệt này.</p>';
    return;
  }

  history.innerHTML = orders.map(order => `
    <div class="order-history-item">
      <div>
        <strong>${escapeHtml(order.code)}</strong>
        <div>${escapeHtml(order.customer || 'Khách hàng')} - ${formatVND(order.total || 0)}</div>
        <small>${escapeHtml(order.placedAt || '')}</small>
      </div>
      <button class="btn btn-secondary" type="button" onclick="fillAndTrackOrder('${escapeHtml(order.code)}')">Tra cứu</button>
    </div>
  `).join('');
}

function fillAndTrackOrder(code) {
  const input = document.getElementById('orderCodeInput') || document.getElementById('trackingCode');
  if (input) input.value = code;
  trackOrder(input?.id || 'orderCodeInput', input?.id === 'trackingCode' ? 'trackingResult' : 'orderLookupResult');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function openLoginModal() {
  const modal = document.getElementById('loginModal');
  const error = document.getElementById('loginError');
  if (!modal) return;
  if (error) error.textContent = '';
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeLoginModal() {
  const modal = document.getElementById('loginModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function setAuthState(user, token) {
  authToken = token;
  currentUser = user;
  localStorage.setItem('logiport_token', token);
  localStorage.setItem('logiport_user', JSON.stringify(user));
  updateAuthUI();
  protectAdminPage();
}

function clearAuth() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('logiport_token');
  localStorage.removeItem('logiport_user');
  updateAuthUI();
  protectAdminPage();
}

function updateAuthUI() {
  const authText = document.getElementById('authActionText');
  const logoutButtons = Array.from(document.querySelectorAll('.logout-button'));
  const adminLink = document.getElementById('adminLink');

  if (currentUser) {
    const shortName = currentUser.displayName || currentUser.username;
    if (authText) authText.innerHTML = `Xin chào<br>${shortName}`;
    logoutButtons.forEach(btn => btn.style.display = 'inline-flex');
    if (adminLink) adminLink.style.display = currentUser.role === 'admin' ? 'inline-flex' : 'none';
  } else {
    if (authText) authText.innerHTML = 'Đăng<br>nhập';
    logoutButtons.forEach(btn => btn.style.display = 'none');
    if (adminLink) adminLink.style.display = 'inline-flex';
  }
}

function protectAdminPage() {
  const guard = document.getElementById('adminGuard');
  if (!guard) return;
  if (currentUser && currentUser.role === 'admin') {
    guard.style.display = 'none';
  } else {
    guard.style.display = 'flex';
  }
}

async function performLogin() {
  const usernameInput = document.getElementById('loginUsername');
  const passwordInput = document.getElementById('loginPassword');
  const loginError = document.getElementById('loginError');
  const authFeedback = document.getElementById('authFeedback');
  if (!usernameInput || !passwordInput) return;

  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  if (!username || !password) {
    if (loginError) {
      loginError.textContent = 'Vui lòng điền username và password.';
    } else {
      showAuthFeedback('Vui lòng điền username và password.', true);
    }
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const result = await response.json();
    if (!response.ok) {
      if (loginError) {
        loginError.textContent = result.message || 'Đăng nhập thất bại.';
      } else {
        showAuthFeedback(result.message || 'Đăng nhập thất bại.', true);
      }
      return;
    }

    setAuthState(result.user, result.token);
    if (loginError) loginError.textContent = '';
    if (authFeedback) showAuthFeedback('Đăng nhập thành công!', false);
    if (window.location.pathname.endsWith('auth.html')) {
      window.location.href = 'index.html';
      return;
    }
    closeLoginModal();
  } catch (err) {
    if (loginError) {
      loginError.textContent = 'Lỗi kết nối server. Vui lòng thử lại.';
    }
    showAuthFeedback('Lỗi kết nối server. Vui lòng thử lại.', true);
    console.error(err);
  }
}

function switchAuthTab(tab) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  if (!loginForm || !registerForm || !tabLogin || !tabRegister) return;

  if (tab === 'register') {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    tabLogin.classList.remove('active');
    tabRegister.classList.add('active');
    showAuthFeedback('', false);
  } else {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    showAuthFeedback('', false);
  }
}

async function performRegister() {
  const nameInput = document.getElementById('registerName');
  const usernameInput = document.getElementById('registerUsername');
  const passwordInput = document.getElementById('registerPassword');
  const confirmInput = document.getElementById('registerConfirmPassword');
  if (!nameInput || !usernameInput || !passwordInput || !confirmInput) return;

  const displayName = nameInput.value.trim();
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  const confirm = confirmInput.value.trim();

  if (!displayName || !username || !password || !confirm) {
    showAuthFeedback('Vui lòng điền đầy đủ thông tin.', true);
    return;
  }
  if (password !== confirm) {
    showAuthFeedback('Mật khẩu xác nhận không khớp.', true);
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, username, password })
    });

    const result = await response.json();
    if (!response.ok) {
      showAuthFeedback(result.message || 'Đăng ký thất bại.', true);
      return;
    }

    setAuthState(result.user, result.token);
    showAuthFeedback('Đăng ký thành công! Bạn đã được đăng nhập tự động.', false);
    if (window.location.pathname.endsWith('auth.html')) {
      window.location.href = 'index.html';
      return;
    }
    switchAuthTab('login');
  } catch (err) {
    console.error(err);
    showAuthFeedback('Lỗi kết nối server. Vui lòng thử lại.', true);
  }
}

function showAuthFeedback(message, isError) {
  const feedback = document.getElementById('authFeedback');
  if (!feedback) return;
  feedback.textContent = message;
  feedback.style.color = isError ? '#b91c1c' : '#047857';
}

function searchProduct(){
  const keyword = document.getElementById('searchInput').value.trim().toLowerCase();
  const cards = document.querySelectorAll('.product-card');
  if(keyword === ''){
    cards.forEach(card => card.style.display = 'flex');
    return;
  }
  cards.forEach(card => {
    const name = card.getAttribute('data-name') || '';
    const text = card.innerText.toLowerCase();
    card.style.display = (name.includes(keyword) || text.includes(keyword)) ? 'flex' : 'none';
  });
}

function trackOrder(inputId = 'trackingCode', resultId = 'trackingResult') {
  const input = document.getElementById(inputId);
  const code = input ? input.value.trim() : '';
  const result = document.getElementById(resultId);
  if (result) result.style.display = 'block';

  if (code === '') {
    if (result) result.innerHTML = 'Vui lòng nhập mã đơn hàng để tra cứu.';
    return;
  }

  const order = getOrderByCode(code);
  if (!order) {
    if (result) result.innerHTML = `<strong>Không tìm thấy đơn hàng:</strong> ${escapeHtml(code)}. Vui lòng kiểm tra lại mã đơn.`;
    return;
  }

  const itemsHtml = order.items?.length
    ? `<br><strong>Sản phẩm:</strong><ul>${order.items.map(item => `<li>${escapeHtml(item.name)} × ${item.quantity} - ${formatVND(item.price * item.quantity)}</li>`).join('')}</ul>`
    : '';
  const totalHtml = order.total ? `<br><strong>Tổng tiền:</strong> ${formatVND(order.total)}` : '';
  const contactHtml = [
    order.phone ? `<br><strong>Điện thoại:</strong> ${escapeHtml(order.phone)}` : '',
    order.address ? `<br><strong>Địa chỉ:</strong> ${escapeHtml(order.address)}` : '',
    order.payment ? `<br><strong>Thanh toán:</strong> ${escapeHtml(order.payment)}` : ''
  ].join('');

  if (result) result.innerHTML =
    `<strong>Mã đơn:</strong> ${escapeHtml(order.code)}<br>` +
    `<strong>Người nhận:</strong> ${escapeHtml(order.customer)} (${escapeHtml(order.role)})<br>` +
    `<strong>Trạng thái:</strong> ${escapeHtml(order.status)}<br>` +
    `<strong>Tuyến đường:</strong> ${escapeHtml(order.route)}<br>` +
    `<strong>Tài xế:</strong> ${escapeHtml(order.driver)}<br>` +
    `<strong>ETA:</strong> ${escapeHtml(order.eta)}<br>` +
    `<strong>Email thông báo:</strong> ${escapeHtml(order.email || 'Chưa có')}<br>` +
    `<strong>Ghi chú:</strong> ${escapeHtml(order.note)}` +
    contactHtml +
    totalHtml +
    itemsHtml;
}

function runGreedy(){
  const result = document.getElementById('greedyResult');
  const route = 'Cảng Cát Lái → Quận 7 → Thủ Đức → Bình Dương';
  if(result){
    result.style.display = 'block';
    result.innerHTML =
      '<strong>Tuyến gợi ý theo Greedy:</strong><br>' +
      route + '<br><br>' +
      'Nguyên tắc: ở mỗi bước chọn điểm giao gần nhất với vị trí hiện tại.';
  } else {
    alert('Demo Greedy Route:\n\n' + route);
  }
}

async function loadUserList() {
  const userListContainer = document.getElementById('userListContainer');
  if (!userListContainer) return;
  if (!authToken || !currentUser || currentUser.role !== 'admin') {
    userListContainer.innerHTML = '<p>Đăng nhập bằng tài khoản Admin để xem danh sách tài khoản.</p>';
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/users`, {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });
    const data = await response.json();
    if (!response.ok) {
      userListContainer.innerHTML = `<p>${data.message || 'Không thể tải danh sách tài khoản.'}</p>`;
      return;
    }

    if (!data.users || !data.users.length) {
      userListContainer.innerHTML = '<p>Không có tài khoản nào trong hệ thống.</p>';
      return;
    }

    userListContainer.innerHTML = data.users.map(user => 
      `<div class="user-row"><div><strong>${user.displayName}</strong><br><span>${user.username}</span></div><span>${user.role}</span></div>`
    ).join('');
  } catch (err) {
    console.error(err);
    userListContainer.innerHTML = '<p>Lỗi kết nối. Vui lòng thử lại.</p>';
  }
}

const CHAT_HISTORY_KEY = 'logiport_chat_history';
let chatMessages = [];

function initChatBox() {
  if (document.getElementById('aiChatWidget')) return;

  try {
    chatMessages = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]');
  } catch {
    chatMessages = [];
  }

  const widget = document.createElement('div');
  widget.className = 'ai-chat-widget';
  widget.id = 'aiChatWidget';
  widget.innerHTML = `
    <button class="ai-chat-toggle" type="button" onclick="toggleChatBox()" aria-label="Mở chat AI">AI</button>
    <section class="ai-chat-panel" id="aiChatPanel" aria-live="polite">
      <div class="ai-chat-head">
        <div>
          <strong>LogiPort AI</strong>
          <span>Hỗ trợ mua hàng và vận chuyển</span>
        </div>
        <button type="button" onclick="toggleChatBox(false)" aria-label="Đóng chat">×</button>
      </div>
      <div class="ai-chat-messages" id="aiChatMessages"></div>
      <form class="ai-chat-form" onsubmit="sendChatMessage(event)">
        <input id="aiChatInput" type="text" placeholder="Nhập câu hỏi..." autocomplete="off">
        <button type="submit">Gửi</button>
      </form>
    </section>
  `;
  document.body.appendChild(widget);

  if (!chatMessages.length) {
    chatMessages = [{
      role: 'assistant',
      content: 'Xin chào! Mình có thể hỗ trợ tìm sản phẩm, kiểm tra giỏ hàng, tra cứu mã đơn hoặc tư vấn dịch vụ logistics.'
    }];
  }
  renderChatMessages();
}

function toggleChatBox(forceOpen) {
  const panel = document.getElementById('aiChatPanel');
  if (!panel) return;
  const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !panel.classList.contains('open');
  panel.classList.toggle('open', shouldOpen);
  if (shouldOpen) {
    setTimeout(() => document.getElementById('aiChatInput')?.focus(), 50);
  }
}

function renderChatMessages() {
  const box = document.getElementById('aiChatMessages');
  if (!box) return;
  box.innerHTML = chatMessages.map(item => `
    <div class="ai-chat-bubble ${item.role === 'user' ? 'user' : 'assistant'}">${escapeHtml(item.content)}</div>
  `).join('');
  box.scrollTop = box.scrollHeight;
  localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatMessages.slice(-12)));
}

async function sendChatMessage(event) {
  event.preventDefault();
  const input = document.getElementById('aiChatInput');
  const message = input?.value.trim();
  if (!message) return;

  input.value = '';
  chatMessages.push({ role: 'user', content: message });
  chatMessages.push({ role: 'assistant', content: 'Đang trả lời...' });
  renderChatMessages();

  try {
    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history: chatMessages.filter(item => item.content !== 'Đang trả lời...').slice(-8)
      })
    });
    const data = await response.json();
    chatMessages.pop();
    chatMessages.push({ role: 'assistant', content: response.ok ? data.reply : (data.message || 'Chat AI đang bận. Vui lòng thử lại sau.') });
  } catch (error) {
    console.error(error);
    chatMessages.pop();
    chatMessages.push({ role: 'assistant', content: 'Không kết nối được Chat AI. Bạn thử lại sau nhé.' });
  }

  renderChatMessages();
}

window.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initCart();
  initChatBox();
});
