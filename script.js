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
  cartCount = currentUser && authToken ? cartItems.reduce((sum, item) => sum + item.quantity, 0) : 0;
  const cart = document.getElementById('cartCount');
  if (cart) cart.innerText = cartCount;
  updateUserInfoPanel();
}

function formatVND(value) {
  return '₫' + value.toLocaleString('vi-VN');
}

function requireLogin(actionName = 'thực hiện thao tác này') {
  if (currentUser && authToken) return true;
  alert(`Vui lòng đăng nhập để ${actionName}.`);
  if (!window.location.pathname.endsWith('auth.html')) {
    window.location.href = 'auth.html';
  }
  return false;
}

function addToCart(buttonElement) {
  if (!requireLogin('thêm sản phẩm vào giỏ hàng')) return;
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

  if (!currentUser || !authToken) {
    content.innerHTML = '<p>Vui lòng đăng nhập để xem và thao tác giỏ hàng.</p>';
    summary.innerHTML = '';
    return;
  }

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
  if (!requireLogin('xóa sản phẩm khỏi giỏ hàng')) return;
  const decodedId = decodeURIComponent(productId);
  cartItems = cartItems.filter(item => item.id !== decodedId);
  saveCart();
  updateCartCount();
  renderCart();
}

function updateCartQuantity(productId, change) {
  if (!requireLogin('cập nhật số lượng giỏ hàng')) return;
  const decodedId = decodeURIComponent(productId);
  cartItems = cartItems
    .map(item => item.id === decodedId ? { ...item, quantity: item.quantity + change } : item)
    .filter(item => item.quantity > 0);
  saveCart();
  updateCartCount();
  renderCart();
}

function clearCart() {
  if (!requireLogin('xóa giỏ hàng')) return;
  cartItems = [];
  saveCart();
  updateCartCount();
  renderCart();
}

function checkoutCart() {
  if (!requireLogin('thanh toán đơn hàng')) return;
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

  if (!currentUser || !authToken) {
    history.innerHTML = '<p>Vui lòng đăng nhập để xem lịch sử đặt hàng.</p>';
    return;
  }

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
  updateCartCount();
  renderCart();
  protectAdminPage();
  initAdminData();
}

function clearAuth() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('logiport_token');
  localStorage.removeItem('logiport_user');
  clearChatHistory();
  closeUserInfo();
  updateAuthUI();
  updateCartCount();
  renderCart();
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
  updateUserInfoPanel();
}

function toggleUserInfo(event) {
  if (!currentUser || !authToken) return true;
  event.preventDefault();
  const popover = document.getElementById('userInfoPopover');
  if (!popover) return false;
  closeHeaderPanels();
  updateUserInfoPanel();
  const isOpen = popover.classList.toggle('open');
  popover.setAttribute('aria-hidden', String(!isOpen));
  return false;
}

function closeUserInfo() {
  const popover = document.getElementById('userInfoPopover');
  if (!popover) return;
  popover.classList.remove('open');
  popover.setAttribute('aria-hidden', 'true');
}

function updateUserInfoPanel() {
  const displayName = document.getElementById('profileDisplayName');
  const username = document.getElementById('profileUsername');
  const role = document.getElementById('profileRole');
  const profileCartCount = document.getElementById('profileCartCount');
  if (!displayName || !username || !role || !profileCartCount) return;

  displayName.textContent = currentUser?.displayName || currentUser?.username || 'Khách hàng';
  username.textContent = currentUser?.username ? `@${currentUser.username}` : 'Chưa đăng nhập';
  role.textContent = currentUser?.role || 'Khách hàng';
  profileCartCount.textContent = String(cartCount);
}

function toggleHeaderPanel(panelId) {
  closeUserInfo();
  closeCategoryMenu();
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const shouldOpen = !panel.classList.contains('open');
  closeHeaderPanels();
  if (panelId === 'cartPanel') {
    renderCart();
    renderOrderHistory();
  }
  if (shouldOpen) {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
  }
}

function closeHeaderPanels() {
  document.querySelectorAll('.header-popover.open').forEach(panel => {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
  });
}

function toggleCategoryMenu() {
  closeUserInfo();
  closeHeaderPanels();
  const menu = document.getElementById('categoryMenu');
  if (!menu) return;
  const isOpen = menu.classList.toggle('open');
  menu.setAttribute('aria-hidden', String(!isOpen));
}

function closeCategoryMenu() {
  const menu = document.getElementById('categoryMenu');
  if (!menu) return;
  menu.classList.remove('open');
  menu.setAttribute('aria-hidden', 'true');
}

function goToCategory(categoryId) {
  const section = document.getElementById(categoryId);
  closeCategoryMenu();
  if (!section) return;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function initCategoryProductToggles() {
  document.querySelectorAll('.view-all-link').forEach(link => {
    const section = link.closest('.section');
    const cards = Array.from(section?.querySelectorAll('.product-grid > .product-card') || []);
    cards.forEach((card, index) => {
      card.classList.toggle('is-extra-product', index >= 5);
    });
    section?.classList.remove('show-all-products');
    link.textContent = cards.length > 5 ? 'Xem tất cả >' : '';
    link.style.display = cards.length > 5 ? 'inline-flex' : 'none';
  });
}

function toggleCategoryProducts(sectionId, linkElement) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  const isExpanded = section.classList.toggle('show-all-products');
  const link = linkElement || section.querySelector('.view-all-link');
  if (link) link.textContent = isExpanded ? 'Thu gọn ˄' : 'Xem tất cả >';
  if (!isExpanded) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

document.addEventListener('click', event => {
  const popover = document.getElementById('userInfoPopover');
  const authAction = document.getElementById('authAction');
  const clickedHeaderPanel = event.target.closest?.('.header-popover');
  const clickedHeaderButton = event.target.closest?.('.header-action-button');
  const clickedCategoryMenu = event.target.closest?.('#categoryMenu');
  const clickedLogisticsMenu = event.target.closest?.('#logisticsMenu');
  const clickedCategoryButton = event.target.closest?.('.menu-btn');

  if (popover && authAction && popover.classList.contains('open') && !popover.contains(event.target) && !authAction.contains(event.target)) {
    closeUserInfo();
  }

  if (!clickedHeaderPanel && !clickedHeaderButton) {
    closeHeaderPanels();
  }

  if (!clickedCategoryMenu && !clickedCategoryButton) {
    closeCategoryMenu();
  }

  if (!clickedLogisticsMenu && !clickedCategoryButton) {
    closeLogisticsMenu();
  }
});

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
  if (!requireLogin('tra cứu đơn hàng')) return;
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

function scrollToLogisticsPanel(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const TRANSPORT_REQUESTS_KEY = 'logiport_transport_requests';

function toggleLogisticsMenu() {
  const menu = document.getElementById('logisticsMenu');
  if (!menu) return;
  const isOpen = menu.classList.toggle('open');
  menu.setAttribute('aria-hidden', String(!isOpen));
}

function closeLogisticsMenu() {
  const menu = document.getElementById('logisticsMenu');
  if (!menu) return;
  menu.classList.remove('open');
  menu.setAttribute('aria-hidden', 'true');
}

function goToLogisticsPanel(id) {
  closeLogisticsMenu();
  scrollToLogisticsPanel(id);
}

function updateGoogleMap() {
  const origin = document.getElementById('mapOrigin')?.value.trim() || 'Cảng Cát Lái, TP Hồ Chí Minh';
  const destination = document.getElementById('mapDestination')?.value.trim() || 'Thủ Đức, TP Hồ Chí Minh';
  const frame = document.getElementById('googleMapFrame');
  const eta = document.getElementById('mapEta');
  if (!frame) return;

  const query = `${origin} to ${destination}`;
  frame.src = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  if (eta) {
    eta.innerHTML = `<strong>Tuyến đang xem</strong>${escapeHtml(origin)} → ${escapeHtml(destination)}<br>ETA tham khảo: 45-90 phút`;
  }
}

function initLogisticsPage() {
  if (document.getElementById('googleMapFrame')) {
    updateGoogleMap();
  }
  renderTransportRequests();
}

function submitTransportRequest() {
  if (!requireLogin('gửi yêu cầu vận chuyển')) return;
  const pickup = document.getElementById('pickupPoint')?.value.trim();
  const delivery = document.getElementById('deliveryPoint')?.value.trim();
  const vehicle = document.getElementById('vehicleType')?.value || 'Xe tải nhỏ';
  const weight = Number(document.getElementById('cargoWeight')?.value || 0);
  const note = document.getElementById('cargoNote')?.value.trim();
  const result = document.getElementById('transportResult');
  if (!result) return;
  result.style.display = 'block';

  if (!pickup || !delivery || !weight) {
    result.innerHTML = 'Vui lòng nhập điểm lấy hàng, điểm giao hàng và khối lượng hàng.';
    return;
  }

  const baseFee = vehicle.includes('Container 40') ? 2200000 : vehicle.includes('Container 20') ? 1500000 : 450000;
  const weightFee = Math.ceil(weight / 100) * 25000;
  const quote = baseFee + weightFee;
  const requestCode = `VC${Date.now().toString().slice(-6)}`;
  const createdAt = new Date().toLocaleString('vi-VN');

  const mapOrigin = document.getElementById('mapOrigin');
  const mapDestination = document.getElementById('mapDestination');
  if (mapOrigin) mapOrigin.value = pickup;
  if (mapDestination) mapDestination.value = delivery;
  updateGoogleMap();

  result.innerHTML =
    `<strong>Đã tạo yêu cầu vận chuyển:</strong> ${requestCode}<br>` +
    `<strong>Tuyến:</strong> ${escapeHtml(pickup)} → ${escapeHtml(delivery)}<br>` +
    `<strong>Phương tiện:</strong> ${escapeHtml(vehicle)}<br>` +
    `<strong>Khối lượng:</strong> ${weight.toLocaleString('vi-VN')} kg<br>` +
    `<strong>Báo giá tạm tính:</strong> ${formatVND(quote)}<br>` +
    `<strong>Ghi chú:</strong> ${escapeHtml(note || 'Không có')}<br>` +
    `<button class="btn btn-secondary" type="button" onclick="copyText('${requestCode}')">Copy mã yêu cầu</button>`;

  saveTransportRequest({ requestCode, pickup, delivery, vehicle, weight, note, quote, createdAt, status: 'Chờ điều phối' });
  renderTransportRequests();
}

function getTransportRequests() {
  try {
    return JSON.parse(localStorage.getItem(TRANSPORT_REQUESTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveTransportRequest(request) {
  const requests = getTransportRequests();
  requests.push(request);
  localStorage.setItem(TRANSPORT_REQUESTS_KEY, JSON.stringify(requests.slice(-20)));
}

function renderTransportRequests() {
  const container = document.getElementById('transportHistory');
  if (!container) return;
  const query = document.getElementById('logisticsSearchInput')?.value.trim().toLowerCase() || '';
  const requests = getTransportRequests()
    .slice()
    .reverse()
    .filter(item => !query || Object.values(item).some(value => String(value ?? '').toLowerCase().includes(query)));

  if (!requests.length) {
    container.innerHTML = '<p>Chưa có yêu cầu vận chuyển nào.</p>';
    return;
  }

  container.innerHTML = requests.map(item => `
    <div class="transport-history-item">
      <div>
        <strong>${escapeHtml(item.requestCode)}</strong>
        <span class="status pending">${escapeHtml(item.status || 'Chờ điều phối')}</span>
        <p>${escapeHtml(item.pickup)} → ${escapeHtml(item.delivery)}</p>
        <small>${escapeHtml(item.vehicle)} · ${Number(item.weight || 0).toLocaleString('vi-VN')} kg · ${formatVND(item.quote || 0)} · ${escapeHtml(item.createdAt || '')}</small>
      </div>
      <div class="admin-row-actions">
        <button class="btn btn-secondary" type="button" onclick="reuseTransportRequest('${escapeHtml(item.requestCode)}')">Dùng lại</button>
        <button class="btn btn-primary" type="button" onclick="copyText('${escapeHtml(item.requestCode)}')">Copy mã</button>
      </div>
    </div>
  `).join('');
}

function reuseTransportRequest(requestCode) {
  const request = getTransportRequests().find(item => item.requestCode === requestCode);
  if (!request) return;
  const pickup = document.getElementById('pickupPoint');
  const delivery = document.getElementById('deliveryPoint');
  const vehicle = document.getElementById('vehicleType');
  const weight = document.getElementById('cargoWeight');
  const note = document.getElementById('cargoNote');
  if (pickup) pickup.value = request.pickup || '';
  if (delivery) delivery.value = request.delivery || '';
  if (vehicle) vehicle.value = request.vehicle || 'Xe tải nhỏ';
  if (weight) weight.value = request.weight || '';
  if (note) note.value = request.note || '';
  goToLogisticsPanel('transportForm');
}

function clearTransportRequests() {
  if (!confirm('Xóa toàn bộ lịch sử yêu cầu vận chuyển?')) return;
  localStorage.removeItem(TRANSPORT_REQUESTS_KEY);
  renderTransportRequests();
}

function resetTransportForm() {
  const fields = ['pickupPoint', 'deliveryPoint', 'cargoWeight', 'cargoNote'];
  fields.forEach(id => {
    const field = document.getElementById(id);
    if (field) field.value = '';
  });
  const vehicle = document.getElementById('vehicleType');
  if (vehicle) vehicle.selectedIndex = 0;
  const result = document.getElementById('transportResult');
  if (result) {
    result.style.display = 'none';
    result.innerHTML = '';
  }
}

function fillSampleTrackingCode() {
  const input = document.getElementById('trackingCode');
  if (input) input.value = 'LG20260620-001';
  trackOrder();
}

function filterLogisticsPanels() {
  const query = document.getElementById('logisticsSearchInput')?.value.trim().toLowerCase() || '';
  renderTransportRequests();
  document.querySelectorAll('.panel, #transportHistoryPanel').forEach(panel => {
    panel.style.display = !query || panel.innerText.toLowerCase().includes(query) ? '' : 'none';
  });
}

function copyText(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => alert(`Đã copy: ${text}`)).catch(() => alert(text));
  } else {
    alert(text);
  }
}

function calculateWarehouseFee() {
  if (!requireLogin('tính phí lưu kho')) return;
  const pallets = Number(document.getElementById('warehousePallets')?.value || 0);
  const days = Number(document.getElementById('warehouseDays')?.value || 0);
  const result = document.getElementById('warehouseResult');
  if (!result) return;
  result.style.display = 'block';

  if (!pallets || !days) {
    result.innerHTML = 'Vui lòng nhập số pallet và số ngày lưu kho.';
    return;
  }

  const dailyRate = 35000;
  const handlingFee = pallets * 20000;
  const total = pallets * days * dailyRate + handlingFee;
  result.innerHTML =
    `<strong>Phí lưu kho tạm tính:</strong> ${formatVND(total)}<br>` +
    `<strong>Chi tiết:</strong> ${pallets} pallet × ${days} ngày × ${formatVND(dailyRate)} + phí nhập/xuất ${formatVND(handlingFee)}.`;
}

function checkCustomsDocs() {
  if (!requireLogin('kiểm tra hồ sơ hải quan')) return;
  const required = ['Hóa đơn thương mại', 'Packing list', 'Vận đơn', 'Tờ khai hải quan'];
  const selected = Array.from(document.querySelectorAll('.customs-doc:checked')).map(input => input.value);
  const missing = required.filter(item => !selected.includes(item));
  const result = document.getElementById('customsResult');
  if (!result) return;
  result.style.display = 'block';

  if (!missing.length) {
    result.innerHTML = '<strong>Hồ sơ cơ bản đã đủ.</strong><br>Có thể chuyển sang bước khai báo và đối chiếu mã HS.';
    return;
  }

  result.innerHTML =
    '<strong>Hồ sơ còn thiếu:</strong><br>' +
    missing.map(item => `- ${escapeHtml(item)}`).join('<br>');
}

function runGreedy(){
  if (!requireLogin('tối ưu tuyến giao hàng')) return;
  const result = document.getElementById('greedyResult');
  const input = document.getElementById('greedyPoints');
  const points = (input?.value || 'Cảng Cát Lái\nQuận 7\nThủ Đức\nBình Dương')
    .split(/\n|,/)
    .map(item => item.trim())
    .filter(Boolean);
  const route = buildGreedyRoute(points).join(' → ');
  if(result){
    result.style.display = 'block';
    result.innerHTML =
      '<strong>Tuyến gợi ý theo Greedy:</strong><br>' +
      route + '<br><br>' +
      'Nguyên tắc: ở mỗi bước chọn điểm giao gần nhất với vị trí hiện tại theo điểm demo.';
  } else {
    alert('Demo Greedy Route:\n\n' + route);
  }
}

function buildGreedyRoute(points) {
  if (points.length <= 2) return points;
  const remaining = points.slice(1);
  const route = [points[0]];
  while (remaining.length) {
    const current = route[route.length - 1];
    let bestIndex = 0;
    let bestScore = Infinity;
    remaining.forEach((point, index) => {
      const score = Math.abs(point.length - current.length) + index;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    route.push(remaining.splice(bestIndex, 1)[0]);
  }
  return route;
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
      adminUsersCache = [];
      updateAdminStats();
      userListContainer.innerHTML = '<p>Không có tài khoản nào trong hệ thống.</p>';
      return;
    }

    adminUsersCache = data.users;
    renderAdminUsers();
    updateAdminStats();
  } catch (err) {
    console.error(err);
    userListContainer.innerHTML = '<p>Lỗi kết nối. Vui lòng thử lại.</p>';
  }
}

function renderAdminUsers() {
  const userListContainer = document.getElementById('userListContainer');
  if (!userListContainer) return;
  const query = getAdminSearchQuery();
  const users = adminUsersCache.filter(user => adminMatches(user, query));
  if (!users.length) {
    userListContainer.innerHTML = '<p>Không có tài khoản phù hợp.</p>';
    return;
  }
  userListContainer.innerHTML = users.map(user => `
    <div class="user-row">
      <div>
        <strong>${escapeHtml(user.displayName)}</strong><br>
        <span>${escapeHtml(user.username)}</span>
      </div>
      <div class="admin-row-actions">
        <select onchange="updateAdminUserRole('${escapeHtml(user.id)}', this.value)" ${user.id === currentUser?.id ? 'disabled' : ''}>
          <option value="customer" ${user.role === 'customer' ? 'selected' : ''}>Khách hàng</option>
          <option value="staff" ${user.role === 'staff' ? 'selected' : ''}>Nhân viên</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
        <button class="btn btn-red" type="button" onclick="deleteAdminUser('${escapeHtml(user.id)}')" ${user.id === currentUser?.id ? 'disabled' : ''}>Xóa</button>
      </div>
    </div>
  `).join('');
}

async function createAdminUser() {
  const displayName = document.getElementById('adminUserDisplayName')?.value.trim();
  const username = document.getElementById('adminUsername')?.value.trim();
  const password = document.getElementById('adminUserPassword')?.value.trim();
  const role = document.getElementById('adminUserRole')?.value;

  if (!authToken || !currentUser || currentUser.role !== 'admin') {
    showAdminFeedback('adminUserResult', 'Bạn cần đăng nhập Admin để tạo tài khoản.', true);
    return;
  }
  if (!displayName || !username || !password) {
    showAdminFeedback('adminUserResult', 'Vui lòng nhập họ tên, username và mật khẩu.', true);
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ displayName, username, password, role })
    });
    const data = await response.json();
    if (!response.ok) {
      showAdminFeedback('adminUserResult', data.message || 'Không thể tạo tài khoản.', true);
      return;
    }
    document.getElementById('adminUserDisplayName').value = '';
    document.getElementById('adminUsername').value = '';
    document.getElementById('adminUserPassword').value = '';
    showAdminFeedback('adminUserResult', data.message || 'Đã tạo tài khoản.');
    loadUserList();
  } catch (err) {
    console.error(err);
    showAdminFeedback('adminUserResult', 'Lỗi kết nối server. Vui lòng thử lại.', true);
  }
}

async function updateAdminUserRole(userId, role) {
  try {
    const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ role })
    });
    const data = await response.json();
    if (!response.ok) {
      showAdminFeedback('adminUserResult', data.message || 'Không thể cập nhật tài khoản.', true);
      loadUserList();
      return;
    }
    showAdminFeedback('adminUserResult', data.message || 'Đã cập nhật tài khoản.');
    loadUserList();
  } catch (err) {
    console.error(err);
    showAdminFeedback('adminUserResult', 'Lỗi kết nối server. Vui lòng thử lại.', true);
    loadUserList();
  }
}

async function deleteAdminUser(userId) {
  if (!confirm('Xóa tài khoản này khỏi hệ thống?')) return;
  try {
    const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const data = await response.json();
    if (!response.ok) {
      showAdminFeedback('adminUserResult', data.message || 'Không thể xóa tài khoản.', true);
      return;
    }
    showAdminFeedback('adminUserResult', data.message || 'Đã xóa tài khoản.');
    loadUserList();
  } catch (err) {
    console.error(err);
    showAdminFeedback('adminUserResult', 'Lỗi kết nối server. Vui lòng thử lại.', true);
  }
}

function getAdminSearchQuery() {
  return document.getElementById('adminSearchInput')?.value.trim().toLowerCase() || '';
}

function adminMatches(item, query) {
  if (!query) return true;
  return Object.values(item || {}).some(value => String(value ?? '').toLowerCase().includes(query));
}

function filterAdminData() {
  renderAdminProducts();
  renderAdminOrders();
  renderAdminUsers();
}

function updateAdminStats() {
  const totalOrders = document.getElementById('adminTotalOrders');
  const shippingOrders = document.getElementById('adminShippingOrders');
  const totalProducts = document.getElementById('adminTotalProducts');
  const totalUsers = document.getElementById('adminTotalUsers');
  if (totalOrders) totalOrders.textContent = String(adminOrdersCache.length);
  if (shippingOrders) shippingOrders.textContent = String(adminOrdersCache.filter(order => getStatusClass(order.status) === 'ship').length);
  if (totalProducts) totalProducts.textContent = String(adminProductsCache.length);
  if (totalUsers) totalUsers.textContent = String(adminUsersCache.length);
}

async function loadPublicProducts() {
  const section = document.getElementById('adminProductsSection');
  const grid = document.getElementById('adminProductsGrid');
  if (!section || !grid) return;

  try {
    const response = await fetch(`${API_BASE}/public-products`);
    const data = await response.json();
    if (!response.ok || !data.products?.length) {
      section.style.display = 'none';
      return;
    }

    grid.innerHTML = data.products.map(product => `
      <div class="product-card" data-product-id="${escapeHtml(product.id)}" data-name="${escapeHtml(product.name.toLowerCase())}">
        <span class="tag">${escapeHtml(product.category || 'Mới')}</span>
        <div class="thumb">${getProductIcon(product.category)}</div>
        <div class="heart">♡</div>
        <div>
          <div class="brand">ADMIN</div>
          <div class="name">${escapeHtml(product.name)}</div>
          <div class="promo">${escapeHtml(product.description || 'Sản phẩm mới')}</div>
          <div class="price">${formatVND(product.price).replace('₫', '')}đ</div>
        </div>
        <button class="add-btn" onclick="addToCart(this)">Thêm vào giỏ</button>
      </div>
    `).join('');
    section.style.display = 'block';
  } catch (err) {
    console.error(err);
    section.style.display = 'none';
  }
}

function getProductIcon(category = '') {
  const normalized = category.toLowerCase();
  if (normalized.includes('điện') || normalized.includes('dien')) return '💻';
  if (normalized.includes('thời') || normalized.includes('thoi')) return '👕';
  if (normalized.includes('mô') || normalized.includes('mo')) return '🚢';
  if (normalized.includes('gia')) return '🏠';
  if (normalized.includes('đóng') || normalized.includes('dong')) return '📦';
  return '🛒';
}

function showAdminFeedback(elementId, message, isError = false) {
  const result = document.getElementById(elementId);
  if (!result) return;
  result.style.display = 'block';
  result.style.color = isError ? '#b91c1c' : '#047857';
  result.innerHTML = escapeHtml(message);
}

let adminProductsCache = [];
let adminOrdersCache = [];
let adminUsersCache = [];

async function createAdminProduct() {
  const productId = document.getElementById('adminProductId')?.value;
  const name = document.getElementById('adminProductName')?.value.trim();
  const price = document.getElementById('adminProductPrice')?.value;
  const category = document.getElementById('adminProductCategory')?.value;
  const description = document.getElementById('adminProductDescription')?.value.trim();

  if (!authToken || !currentUser || !['admin', 'staff'].includes(currentUser.role)) {
    showAdminFeedback('adminProductResult', 'Bạn cần đăng nhập Admin hoặc nhân viên để thêm sản phẩm.', true);
    return;
  }
  if (!name || !price) {
    showAdminFeedback('adminProductResult', 'Vui lòng nhập tên sản phẩm và giá bán.', true);
    return;
  }

  try {
    const response = await fetch(productId ? `${API_BASE}/products/${encodeURIComponent(productId)}` : `${API_BASE}/products`, {
      method: productId ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ name, price, category, description })
    });
    const data = await response.json();
    if (!response.ok) {
      showAdminFeedback('adminProductResult', data.message || 'Không thể lưu sản phẩm.', true);
      return;
    }

    resetAdminProductForm();
    showAdminFeedback('adminProductResult', data.message || 'Sản phẩm đã được lưu.');
    loadAdminProducts();
    loadPublicProducts();
  } catch (err) {
    console.error(err);
    showAdminFeedback('adminProductResult', 'Lỗi kết nối server. Vui lòng thử lại.', true);
  }
}

function resetAdminProductForm() {
  const productId = document.getElementById('adminProductId');
  const name = document.getElementById('adminProductName');
  const price = document.getElementById('adminProductPrice');
  const description = document.getElementById('adminProductDescription');
  const saveButton = document.getElementById('adminProductSaveButton');
  if (productId) productId.value = '';
  if (name) name.value = '';
  if (price) price.value = '';
  if (description) description.value = '';
  if (saveButton) saveButton.textContent = 'Lưu sản phẩm';
}

function editAdminProduct(productId) {
  const product = adminProductsCache.find(item => item.id === productId);
  if (!product) return;
  document.getElementById('adminProductId').value = product.id;
  document.getElementById('adminProductName').value = product.name || '';
  document.getElementById('adminProductPrice').value = product.price || '';
  document.getElementById('adminProductCategory').value = product.category || 'Điện tử';
  document.getElementById('adminProductDescription').value = product.description || '';
  document.getElementById('adminProductSaveButton').textContent = 'Cập nhật sản phẩm';
  document.getElementById('adminProductName')?.focus();
}

async function deleteAdminProduct(productId) {
  if (!confirm('Xóa sản phẩm này khỏi hệ thống?')) return;
  try {
    const response = await fetch(`${API_BASE}/products/${encodeURIComponent(productId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const data = await response.json();
    if (!response.ok) {
      showAdminFeedback('adminProductResult', data.message || 'Không thể xóa sản phẩm.', true);
      return;
    }
    showAdminFeedback('adminProductResult', data.message || 'Đã xóa sản phẩm.');
    loadAdminProducts();
    loadPublicProducts();
  } catch (err) {
    console.error(err);
    showAdminFeedback('adminProductResult', 'Lỗi kết nối server. Vui lòng thử lại.', true);
  }
}

async function loadAdminProducts() {
  const list = document.getElementById('adminProductList');
  if (!list) return;
  if (!authToken || !currentUser || !['admin', 'staff'].includes(currentUser.role)) {
    list.innerHTML = '<p>Đăng nhập Admin hoặc nhân viên để xem sản phẩm đã thêm.</p>';
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/products`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const data = await response.json();
    if (!response.ok) {
      list.innerHTML = `<p>${escapeHtml(data.message || 'Không tải được sản phẩm.')}</p>`;
      return;
    }
    if (!data.products?.length) {
      adminProductsCache = [];
      updateAdminStats();
      list.innerHTML = '<p>Chưa có sản phẩm nào được thêm từ Admin.</p>';
      return;
    }
    adminProductsCache = data.products;
    renderAdminProducts();
    updateAdminStats();
  } catch (err) {
    console.error(err);
    list.innerHTML = '<p>Lỗi kết nối server. Vui lòng thử lại.</p>';
  }
}

function renderAdminProducts() {
  const list = document.getElementById('adminProductList');
  if (!list) return;
  const query = getAdminSearchQuery();
  const products = adminProductsCache.filter(product => adminMatches(product, query));
  if (!products.length) {
    list.innerHTML = '<p>Không có sản phẩm phù hợp.</p>';
    return;
  }
  list.innerHTML = products.map(product => `
      <div class="admin-list-row">
        <div><strong>${escapeHtml(product.name)}</strong><br><span>${escapeHtml(product.category || 'Khác')}</span></div>
        <div class="admin-row-actions">
          <strong>${formatVND(product.price)}</strong>
          <button class="btn btn-secondary" type="button" onclick="editAdminProduct('${escapeHtml(product.id)}')">Sửa</button>
          <button class="btn btn-red" type="button" onclick="deleteAdminProduct('${escapeHtml(product.id)}')">Xóa</button>
        </div>
      </div>
    `).join('');
}

async function loadAdminOrders() {
  const tableBody = document.getElementById('adminOrderTableBody');
  if (!tableBody) return;
  if (!authToken || !currentUser || !['admin', 'staff'].includes(currentUser.role)) return;

  try {
    const response = await fetch(`${API_BASE}/admin/orders`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const data = await response.json();
    if (!response.ok) {
      tableBody.innerHTML = `<tr><td colspan="6">${escapeHtml(data.message || 'Không tải được đơn hàng.')}</td></tr>`;
      return;
    }
    adminOrdersCache = data.orders || [];
    renderAdminOrders();
    updateAdminStats();
  } catch (err) {
    console.error(err);
    tableBody.innerHTML = '<tr><td colspan="6">Lỗi kết nối server. Vui lòng thử lại.</td></tr>';
  }
}

function renderAdminOrders() {
  const tableBody = document.getElementById('adminOrderTableBody');
  if (!tableBody) return;
  const query = getAdminSearchQuery();
  const orders = adminOrdersCache.filter(order => adminMatches(order, query));
  if (!orders.length) {
    tableBody.innerHTML = '<tr><td colspan="6">Không có đơn hàng phù hợp.</td></tr>';
    return;
  }
  tableBody.innerHTML = orders.map(order => `
      <tr>
        <td>${escapeHtml(order.orderId)}</td>
        <td>${escapeHtml(order.customer || 'Khách hàng')}</td>
        <td>${escapeHtml(order.department || 'Điều phối')}</td>
        <td><span class="status ${getStatusClass(order.status)}">${escapeHtml(order.status)}</span></td>
        <td>${escapeHtml(order.driver || 'Chưa phân')}</td>
        <td><button class="btn btn-secondary" type="button" onclick="selectOrderForAssignment('${escapeHtml(order.orderId)}')">Chọn</button></td>
      </tr>
    `).join('');
}

function selectOrderForAssignment(orderId) {
  const order = adminOrdersCache.find(item => item.orderId === orderId);
  const input = document.getElementById('assignOrderId');
  const route = document.getElementById('assignRoute');
  if (input) input.value = orderId;
  if (route && order?.route) route.value = order.route;
  document.getElementById('assignDriver')?.focus();
}

function getStatusClass(status = '') {
  const normalized = status.toLowerCase();
  if (normalized.includes('hoàn') || normalized.includes('hoan')) return 'ok';
  if (normalized.includes('giao')) return 'ship';
  return 'pending';
}

async function assignDelivery() {
  const orderId = document.getElementById('assignOrderId')?.value.trim();
  const driver = document.getElementById('assignDriver')?.value;
  const vehicle = document.getElementById('assignVehicle')?.value;
  const route = document.getElementById('assignRoute')?.value.trim();

  if (!authToken || !currentUser || currentUser.role !== 'admin') {
    showAdminFeedback('assignResult', 'Bạn cần đăng nhập Admin để phân công giao hàng.', true);
    return;
  }
  if (!orderId || !driver) {
    showAdminFeedback('assignResult', 'Vui lòng nhập mã đơn hàng và chọn tài xế.', true);
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ orderId, driver, vehicle, route })
    });
    const data = await response.json();
    if (!response.ok) {
      showAdminFeedback('assignResult', data.message || 'Không thể phân công.', true);
      return;
    }

    updateLocalAssignedOrder(data.assignment);
    showAdminFeedback('assignResult', data.message || 'Đã phân công giao hàng.');
    loadAdminOrders();
  } catch (err) {
    console.error(err);
    showAdminFeedback('assignResult', 'Lỗi kết nối server. Vui lòng thử lại.', true);
  }
}

function updateLocalAssignedOrder(assignment) {
  if (!assignment) return;
  const orders = getSavedOrders();
  const order = orders.find(item => item.code?.toLowerCase() === assignment.orderId.toLowerCase());
  if (order) {
    order.status = assignment.status;
    order.driver = assignment.driver;
    order.route = assignment.route;
    order.note = `Đơn hàng đã được phân công cho ${assignment.driver}.`;
    localStorage.setItem('logiport_orders', JSON.stringify(orders));
    renderOrderHistory();
  }
}

function initAdminData() {
  if (!document.getElementById('adminProductList') && !document.getElementById('adminOrderTableBody')) return;
  loadAdminProducts();
  loadAdminOrders();
  loadUserList();
  updateAdminStats();
}

const CHAT_HISTORY_KEY = 'logiport_chat_history';
let chatMessages = [];
const DEFAULT_CHAT_MESSAGE = {
  role: 'assistant',
  content: 'Xin chào! Mình có thể hỗ trợ tìm sản phẩm, kiểm tra giỏ hàng, tra cứu mã đơn hoặc tư vấn dịch vụ logistics.'
};

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
    chatMessages = [{ ...DEFAULT_CHAT_MESSAGE }];
  }
  renderChatMessages();
}

function clearChatHistory() {
  localStorage.removeItem(CHAT_HISTORY_KEY);
  chatMessages = [{ ...DEFAULT_CHAT_MESSAGE }];
  renderChatMessages();
  document.getElementById('aiChatPanel')?.classList.remove('open');
}

function toggleChatBox(forceOpen) {
  if (!currentUser || !authToken) {
    requireLogin('sử dụng chat AI');
    return;
  }
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
  if (!requireLogin('sử dụng chat AI')) return;
  const input = document.getElementById('aiChatInput');
  const message = input?.value.trim();
  if (!message) return;

  input.value = '';
  chatMessages.push({ role: 'user', content: message });

  const localReply = getLocalChatReply(message);
  if (localReply) {
    chatMessages.push({ role: 'assistant', content: localReply });
    renderChatMessages();
    return;
  }

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

function getLocalChatReply(message) {
  const normalized = message.toLowerCase();
  if (normalized.includes('giỏ') || normalized.includes('gio')) {
    if (!cartItems.length) {
      return 'Giỏ hàng của bạn hiện đang trống. Bạn có thể bấm "Thêm vào giỏ" ở sản phẩm muốn mua.';
    }
    const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const list = cartItems.map(item => `- ${item.name} × ${item.quantity}: ${formatVND(item.price * item.quantity)}`).join('\n');
    return `Trong giỏ hàng của bạn có:\n${list}\nTổng tạm tính: ${formatVND(total)}.`;
  }

  if (normalized.includes('lịch sử') || normalized.includes('lich su') || normalized.includes('đã đặt') || normalized.includes('da dat')) {
    const orders = getSavedOrders().slice(-5).reverse();
    if (!orders.length) {
      return 'Bạn chưa có đơn hàng nào trong lịch sử đặt hàng trên trình duyệt này.';
    }
    return 'Các đơn gần đây của bạn:\n' + orders.map(order => `- ${order.code}: ${order.status}, ${formatVND(order.total || 0)}`).join('\n');
  }

  const orderCodeMatch = message.match(/LG\d{6,}-?\d*/i);
  if (orderCodeMatch || normalized.includes('tra cứu') || normalized.includes('tra cuu')) {
    const code = orderCodeMatch?.[0];
    if (!code) {
      return 'Bạn nhập mã đơn vào ô "Tra cứu đơn hàng nhanh" hoặc gửi mã đơn dạng LG20260620-001 để mình kiểm tra.';
    }
    const order = getOrderByCode(code);
    if (!order) {
      return `Mình chưa tìm thấy đơn ${code}. Bạn kiểm tra lại mã đơn giúp mình nhé.`;
    }
    return `Đơn ${order.code}: ${order.status}. Người nhận: ${order.customer}. Tuyến đường: ${order.route}. ETA: ${order.eta}.`;
  }

  return '';
}

window.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initCart();
  loadPublicProducts();
  initCategoryProductToggles();
  initAdminData();
  initLogisticsPage();
  initChatBox();
});
