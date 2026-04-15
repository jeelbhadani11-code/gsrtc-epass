if (window.location.protocol === 'file:') {
  window.location.replace('http://localhost:5050/');
}

const BACKEND_ORIGIN = window.location.protocol === 'file:' ? 'http://localhost:5050' : window.location.origin;
const API_BASE = `${BACKEND_ORIGIN}/api`;

let currentPage = 'landing';
let toastTimer;
let _accessToken = localStorage.getItem('gsrtc_access_token') || null;
let _refreshToken = localStorage.getItem('gsrtc_refresh_token') || null;
let _adminAccess = sessionStorage.getItem('gsrtc_admin_access') || null;
let _adminRefresh = sessionStorage.getItem('gsrtc_admin_refresh') || null;
let _currentUser = JSON.parse(localStorage.getItem('gsrtc_current_user') || 'null');
let _isAdmin = sessionStorage.getItem('gsrtc_admin_flag') === '1';
let passTypesCache = [];
let validityCache = [];

const DB = {
  getCurrentUser() {
    return _currentUser;
  },
  setCurrentUser(user) {
    _currentUser = user;
    localStorage.setItem('gsrtc_current_user', JSON.stringify(user));
  },
  clearCurrentUser() {
    _currentUser = null;
    _accessToken = null;
    _refreshToken = null;
    localStorage.removeItem('gsrtc_current_user');
    localStorage.removeItem('gsrtc_access_token');
    localStorage.removeItem('gsrtc_refresh_token');
  },
  isAdmin() {
    return _isAdmin;
  },
  setAdmin() {
    _isAdmin = true;
    sessionStorage.setItem('gsrtc_admin_flag', '1');
  },
  clearAdmin() {
    _isAdmin = false;
    _adminAccess = null;
    _adminRefresh = null;
    sessionStorage.removeItem('gsrtc_admin_flag');
    sessionStorage.removeItem('gsrtc_admin_access');
    sessionStorage.removeItem('gsrtc_admin_refresh');
  },
};

function seedData() {}

async function apiFetch(path, options = {}, isAdmin = false) {
  const token = isAdmin ? _adminAccess : _accessToken;
  const headers = { ...(options.headers || {}) };

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response = await fetch(API_BASE + path, { ...options, headers });

  if (response.status === 401) {
    const refreshToken = isAdmin ? _adminRefresh : _refreshToken;
    if (!refreshToken) return response;

    const refreshPath = isAdmin ? '/admin/refresh' : '/auth/refresh';
    const refreshResponse = await fetch(API_BASE + refreshPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!refreshResponse.ok) {
      if (isAdmin) DB.clearAdmin();
      else DB.clearCurrentUser();
      updateNav(currentPage);
      return response;
    }

    const refreshData = await safeJson(refreshResponse);
    if (isAdmin) {
      _adminAccess = refreshData.data.accessToken;
      _adminRefresh = refreshData.data.refreshToken;
      sessionStorage.setItem('gsrtc_admin_access', _adminAccess);
      sessionStorage.setItem('gsrtc_admin_refresh', _adminRefresh);
      headers.Authorization = `Bearer ${_adminAccess}`;
    } else {
      _accessToken = refreshData.data.accessToken;
      _refreshToken = refreshData.data.refreshToken;
      localStorage.setItem('gsrtc_access_token', _accessToken);
      localStorage.setItem('gsrtc_refresh_token', _refreshToken);
      headers.Authorization = `Bearer ${_accessToken}`;
    }

    response = await fetch(API_BASE + path, { ...options, headers });
  }

  return response;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(date, withTime = false) {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString(
    'en-IN',
    withTime
      ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: 'short', year: 'numeric' }
  );
}

function formatAmount(amount) {
  const numeric = Number(amount || 0);
  return `₹${numeric.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function statusBadge(status) {
  const cls = { Approved: 'badge-green', Pending: 'badge-yellow', Rejected: 'badge-red' }[status] || 'badge-orange';
  const icon = { Approved: '✅', Pending: '⏳', Rejected: '❌' }[status] || '•';
  return `<span class="badge ${cls}">${icon} ${escapeHtml(status)}</span>`;
}

function adminBadge(status) {
  return statusBadge(status);
}

function goTo(page) {
  document.querySelectorAll('.page-section').forEach((section) => section.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  currentPage = page;
  if (window.location.protocol !== 'file:') {
    const nextPath = page === 'landing' ? '/' : `/${page}`;
    if (window.location.pathname !== nextPath) {
      window.history.replaceState(null, '', nextPath);
    }
  }
  window.scrollTo(0, 0);
  updateBodyBg(page);
  updateNav(page);
  if (page === 'portal') initPortalPage();
  if (page === 'admin') initAdminPage();
  closeMenu();
}

function updateBodyBg(page) {
  document.body.classList.remove('dark-bg', 'light-bg');
  if (page === 'portal') {
    document.body.classList.add('dark-bg');
    return;
  }
  if (page === 'admin') {
    const dashboardVisible = DB.isAdmin() && document.getElementById('adminDashView').style.display !== 'none';
    document.body.classList.add(dashboardVisible ? 'light-bg' : 'dark-bg');
  }
}

function updateNav(page) {
  const links = document.getElementById('navLinks');
  const mobile = document.getElementById('mobileNav');
  if (page === 'landing') {
    links.innerHTML = `<a href="#features">Features</a><a href="#how-it-works">How It Works</a><button class="nav-cta" onclick="goTo('portal')">🎫 User Portal</button><button class="nav-admin-pill" onclick="goTo('admin')" style="padding:.5rem 1rem;border-radius:8px">🛡 Admin</button>`;
    mobile.innerHTML = `<button onclick="goTo('landing');closeMenu()">🏠 Home</button><a href="#features" onclick="closeMenu()">✨ Features</a><a href="#how-it-works" onclick="closeMenu()">📋 How It Works</a><button class="mobile-cta" onclick="goTo('portal');closeMenu()">🎫 User Portal</button><button onclick="goTo('admin');closeMenu()">🛡 Admin Panel</button>`;
    return;
  }

  if (page === 'portal') {
    const user = DB.getCurrentUser();
    if (user) {
      links.innerHTML = `<div class="nav-user-badge">👤 <span>${escapeHtml(user.name.split(' ')[0])}</span></div><button onclick="goTo('landing')">🏠 Home</button><button onclick="goTo('admin')">🛡 Admin</button><button class="nav-logout" onclick="logoutUser()">🚪 Logout</button>`;
      mobile.innerHTML = `<button onclick="goTo('landing');closeMenu()">🏠 Home</button><button onclick="goTo('admin');closeMenu()">🛡 Admin Panel</button><button onclick="logoutUser();closeMenu()">🚪 Logout</button>`;
    } else {
      links.innerHTML = `<button onclick="goTo('landing')">🏠 Home</button><button onclick="goTo('admin')">🛡 Admin</button>`;
      mobile.innerHTML = `<button onclick="goTo('landing');closeMenu()">🏠 Home</button><button onclick="goTo('admin');closeMenu()">🛡 Admin Panel</button>`;
    }
    return;
  }

  if (DB.isAdmin()) {
    links.innerHTML = `<span class="admin-badge-hd" style="font-size:.75rem">● Admin</span><button onclick="goTo('landing')">🏠 Home</button><button onclick="goTo('portal')">👤 User Portal</button><button class="nav-logout" onclick="adminLogout()">🚪 Logout</button>`;
    mobile.innerHTML = `<button onclick="goTo('landing');closeMenu()">🏠 Home</button><button onclick="goTo('portal');closeMenu()">👤 User Portal</button><button onclick="adminLogout();closeMenu()">🚪 Logout</button>`;
  } else {
    links.innerHTML = `<button onclick="goTo('landing')">🏠 Home</button><button onclick="goTo('portal')">👤 User Portal</button>`;
    mobile.innerHTML = `<button onclick="goTo('landing');closeMenu()">🏠 Home</button><button onclick="goTo('portal');closeMenu()">👤 User Portal</button>`;
  }
}

async function initPortalPage() {
  const user = DB.getCurrentUser();
  if (user) {
    document.getElementById('authView').style.display = 'none';
    document.getElementById('portalView').style.display = 'block';
    document.getElementById('portal-username').textContent = user.name.split(' ')[0];
    await Promise.all([renderMyApps(), renderDownloads(), loadConfig()]);
  } else {
    document.getElementById('authView').style.display = 'flex';
    document.getElementById('portalView').style.display = 'none';
  }
  updatePreview();
}

function switchAuthTab(id, button) {
  document.querySelectorAll('.auth-form').forEach((form) => form.classList.remove('active'));
  document.querySelectorAll('.auth-tab').forEach((tab) => tab.classList.remove('active'));
  document.getElementById(`auth-${id}`).classList.add('active');
  button.classList.add('active');
}

function switchAuthTabByName(id) {
  const tabs = document.querySelectorAll('.auth-tab');
  switchAuthTab(id, tabs[id === 'login' ? 0 : 1]);
}

async function handleLogin() {
  const mobile = document.getElementById('l-mobile').value.trim();
  const password = document.getElementById('l-pwd').value;
  document.getElementById('l-mobile-msg').classList.remove('show');
  document.getElementById('l-pwd-msg').classList.remove('show');

  if (!/^[6-9]\d{9}$/.test(mobile)) {
    document.getElementById('l-mobile-msg').classList.add('show');
    return;
  }
  if (!password) {
    document.getElementById('l-pwd-msg').classList.add('show');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, password }),
    });
    const data = await safeJson(response);
    if (!response.ok) {
      showToast('❌ Login Failed', data.message || 'Invalid credentials. Demo user: 9876543210 / rahul123', 'error');
      return;
    }

    _accessToken = data.data.accessToken;
    _refreshToken = data.data.refreshToken;
    localStorage.setItem('gsrtc_access_token', _accessToken);
    localStorage.setItem('gsrtc_refresh_token', _refreshToken);
    DB.setCurrentUser(data.data.user);
    showToast('✅ Login Successful', `Welcome back, ${data.data.user.name.split(' ')[0]}!`, 'success');
    setTimeout(() => {
      initPortalPage();
      updateNav('portal');
      updateBodyBg('portal');
    }, 500);
  } catch {
    showToast('❌ Network Error', 'Could not reach the backend.', 'error');
  }
}

function loginDemoUser() {
  document.getElementById('l-mobile').value = '9876543210';
  document.getElementById('l-pwd').value = 'rahul123';
  handleLogin();
}

async function handleRegister() {
  const name = document.getElementById('r-name');
  const mobile = document.getElementById('r-mobile');
  const email = document.getElementById('r-email');
  const aadhaar = document.getElementById('r-aadhaar');
  const password = document.getElementById('r-pwd');
  const confirmPassword = document.getElementById('r-cpwd');

  validateName(name, 'r-name-msg');
  validateMobile(mobile, 'r-mobile-msg');
  validateEmail(email, 'r-email-msg');
  validateAadhaar(aadhaar, 'r-aadhaar-msg');
  validatePassword(password, 'r-pwd-msg');
  checkCpwd(confirmPassword);

  if (![name, mobile, email, aadhaar, password, confirmPassword].every((input) => input.classList.contains('valid'))) {
    showToast('⚠️ Incomplete Form', 'Please fix the highlighted fields.', 'warn');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.value.trim(),
        mobile: mobile.value.trim(),
        email: email.value.trim(),
        aadhaar: aadhaar.value.replace(/\s/g, ''),
        password: password.value,
      }),
    });
    const data = await safeJson(response);
    if (!response.ok) {
      showToast('⚠️ Registration Failed', data.message || 'Please try again.', 'error');
      return;
    }

    _accessToken = data.data.accessToken;
    _refreshToken = data.data.refreshToken;
    localStorage.setItem('gsrtc_access_token', _accessToken);
    localStorage.setItem('gsrtc_refresh_token', _refreshToken);
    DB.setCurrentUser(data.data.user);
    showToast('✅ Account Created!', `Welcome to GSRTC E-Pass, ${data.data.user.name.split(' ')[0]}!`, 'success');
    setTimeout(() => {
      initPortalPage();
      updateNav('portal');
      updateBodyBg('portal');
    }, 500);
  } catch {
    showToast('❌ Network Error', 'Could not reach the backend.', 'error');
  }
}

async function logoutUser() {
  try {
    await apiFetch('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: _refreshToken }),
    });
  } catch {}
  DB.clearCurrentUser();
  initPortalPage();
  updateNav('portal');
  showToast('👋 Logged Out', 'You have been signed out.', 'success');
}

function switchPTab(id, button) {
  document.querySelectorAll('.ptab-panel').forEach((panel) => panel.classList.remove('active'));
  document.querySelectorAll('.ptab').forEach((tab) => tab.classList.remove('active'));
  document.getElementById(`ptab-${id}`).classList.add('active');
  button.classList.add('active');
  if (id === 'myapps') renderMyApps();
  if (id === 'download') renderDownloads();
}

async function loadConfig() {
  try {
    const [passTypesResponse, validityResponse] = await Promise.all([
      fetch(`${API_BASE}/config/pass-types`),
      fetch(`${API_BASE}/config/validity-options`),
    ]);
    const [passTypesData, validityData] = await Promise.all([
      safeJson(passTypesResponse),
      safeJson(validityResponse),
    ]);

    if (passTypesResponse.ok) {
      passTypesCache = passTypesData.data || [];
      const select = document.getElementById('ap-type');
      const currentValue = select.value;
      select.innerHTML = '<option value="">Select Pass Type</option>' +
        passTypesCache.map((passType) => `<option value="${escapeHtml(passType.name)}">${escapeHtml(passType.name)}</option>`).join('');
      select.value = currentValue;
    }

    if (validityResponse.ok) {
      validityCache = validityData.data || [];
      const select = document.getElementById('ap-validity');
      const currentValue = select.value;
      select.innerHTML = '<option value="">Select Duration</option>' +
        validityCache.map((option) => `<option value="${escapeHtml(option.label)}">${escapeHtml(option.label)}</option>`).join('');
      select.value = currentValue;
      await refreshValidityLabels();
    }
  } catch {}
}

async function refreshValidityLabels() {
  const type = document.getElementById('ap-type').value;
  const select = document.getElementById('ap-validity');
  const currentValue = select.value;

  if (!validityCache.length) return;

  if (!type) {
    select.innerHTML = '<option value="">Select Duration</option>' +
      validityCache.map((option) => `<option value="${escapeHtml(option.label)}">${escapeHtml(option.label)}</option>`).join('');
    select.value = currentValue;
    updatePreview();
    return;
  }

  const optionMarkup = await Promise.all(
    validityCache.map(async (option) => {
      try {
        const response = await fetch(`${API_BASE}/config/calculate-amount?passType=${encodeURIComponent(type)}&validity=${encodeURIComponent(option.label)}`);
        const data = await safeJson(response);
        if (!response.ok) return `<option value="${escapeHtml(option.label)}">${escapeHtml(option.label)}</option>`;
        return `<option value="${escapeHtml(option.label)}">${escapeHtml(option.label)} — ${formatAmount(data.data.amount)}</option>`;
      } catch {
        return `<option value="${escapeHtml(option.label)}">${escapeHtml(option.label)}</option>`;
      }
    })
  );

  select.innerHTML = `<option value="">Select Duration</option>${optionMarkup.join('')}`;
  select.value = currentValue;
  updatePreview();
}

async function handleApply() {
  const name = document.getElementById('ap-name').value.trim();
  const passType = document.getElementById('ap-type').value;
  const mobile = document.getElementById('ap-mobile').value.trim();
  const fromCity = document.getElementById('ap-from').value.trim();
  const toCity = document.getElementById('ap-to').value.trim();
  const validity = document.getElementById('ap-validity').value;

  if (!name || name.length < 2) {
    document.getElementById('ap-name').classList.add('error');
    showToast('⚠️ Missing Fields', 'Please fill all required fields.', 'warn');
    return;
  }
  if (!passType) {
    showToast('⚠️ Select Pass Type', 'Please select a pass type.', 'warn');
    return;
  }
  if (!/^[6-9]\d{9}$/.test(mobile)) {
    showToast('⚠️ Invalid Mobile', 'Enter a valid 10-digit mobile number.', 'warn');
    return;
  }
  if (!fromCity || fromCity.length < 2) {
    document.getElementById('ap-from').classList.add('error');
    showToast('⚠️ Missing Fields', 'Please enter origin city.', 'warn');
    return;
  }
  if (!toCity || toCity.length < 2) {
    document.getElementById('ap-to').classList.add('error');
    showToast('⚠️ Missing Fields', 'Please enter destination city.', 'warn');
    return;
  }
  if (!validity) {
    showToast('⚠️ Select Duration', 'Please select pass validity.', 'warn');
    return;
  }

  const formData = new FormData();
  formData.append('applicantName', name);
  formData.append('passType', passType);
  formData.append('mobile', mobile);
  formData.append('email', document.getElementById('ap-email').value.trim());
  formData.append('collegeOrg', document.getElementById('ap-college').value.trim());
  formData.append('fromCity', fromCity);
  formData.append('toCity', toCity);
  formData.append('validity', validity);

  const photoFile = document.getElementById('ap-photo').files[0];
  const documentFile = document.getElementById('ap-document').files[0];
  if (photoFile) formData.append('photo', photoFile);
  if (documentFile) formData.append('document', documentFile);

  try {
    const response = await apiFetch('/applications', { method: 'POST', body: formData });
    const data = await safeJson(response);
    if (!response.ok) {
      const message = data.errors?.[0]?.msg || data.message || 'Please try again.';
      showToast('❌ Submission Failed', message, 'error');
      return;
    }
    showToast('📨 Application Submitted!', `Your App ID is ${data.data.id}. Approval within 24 hours.`, 'success');
    clearApplyForm();
    renderMyApps();
    setTimeout(() => {
      const tab = document.querySelectorAll('.ptab')[1];
      if (tab) tab.click();
    }, 700);
  } catch {
    showToast('❌ Network Error', 'Could not reach the backend.', 'error');
  }
}

function clearApplyForm() {
  ['ap-name', 'ap-mobile', 'ap-from', 'ap-to', 'ap-email', 'ap-college'].forEach((id) => {
    const input = document.getElementById(id);
    input.value = '';
    input.classList.remove('valid', 'error');
  });
  document.getElementById('ap-type').value = '';
  document.getElementById('ap-validity').value = '';
  document.getElementById('ap-photo').value = '';
  document.getElementById('ap-document').value = '';
  document.getElementById('ap-photo-name').textContent = 'No photo selected';
  document.getElementById('ap-document-name').textContent = 'No document selected';
  refreshValidityLabels();
  updatePreview();
}

async function renderMyApps() {
  const user = DB.getCurrentUser();
  if (!user) return;

  const container = document.getElementById('myapps-list');
  container.innerHTML = '<div style="text-align:center;padding:2rem;color:rgba(255,255,255,.4)">Loading...</div>';

  try {
    const response = await apiFetch('/applications/my?limit=100');
    const data = await safeJson(response);
    if (!response.ok) throw new Error();

    const apps = data.data || [];
    document.getElementById('myapps-count').textContent = `(${apps.length})`;
    if (!apps.length) {
      container.innerHTML = `<div class="empty-state"><div class="ei">📭</div><p>No applications yet.<br><button onclick="document.querySelectorAll('.ptab')[0].click()" style="color:var(--orange);background:none;border:none;cursor:pointer;font-size:inherit;font-family:inherit">Apply for your first pass →</button></p></div>`;
      return;
    }

    container.innerHTML = apps.map((app) => `
      <div class="app-card">
        <div class="app-card-hd">
          <div>
            <div class="app-id">${escapeHtml(app.id)}</div>
            <div class="app-name">${escapeHtml(app.applicant_name)}</div>
          </div>
          ${statusBadge(app.status)}
        </div>
        <div class="app-meta">
          <strong>Pass Type:</strong> ${escapeHtml(app.pass_type)} &nbsp;|&nbsp;
          <strong>Validity:</strong> ${escapeHtml(app.validity)} &nbsp;|&nbsp;
          <strong>Amount:</strong> ${formatAmount(app.amount)}<br>
          <strong>College/Org:</strong> ${escapeHtml(app.college_org || '—')} &nbsp;|&nbsp;
          <strong>Applied:</strong> ${formatDate(app.submitted_at)}
        </div>
        <div style="margin-top:.8rem;display:flex;align-items:center;gap:.8rem;flex-wrap:wrap">
          <div class="app-route-pill">${escapeHtml(app.from_city)} ⟶ ${escapeHtml(app.to_city)}</div>
          ${app.status === 'Approved' ? '<button class="btn btn-sm btn-outline" onclick="document.querySelectorAll(\'.ptab\')[3].click();renderDownloads()">📥 Download Pass</button>' : ''}
        </div>
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:#f87171">Failed to load applications. Is the backend running?</div>';
  }
}

async function trackApplication() {
  const appId = document.getElementById('track-input').value.trim();
  const result = document.getElementById('track-result');
  const empty = document.getElementById('track-empty');

  if (!appId) {
    showToast('⚠️ Enter ID', 'Please enter an application ID.', 'warn');
    return;
  }

  result.style.display = 'none';
  empty.style.display = 'block';
  empty.innerHTML = '<div style="color:rgba(255,255,255,.3);font-size:.9rem">Searching...</div>';

  try {
    const response = await fetch(`${API_BASE}/applications/track/${encodeURIComponent(appId)}`);
    const data = await safeJson(response);
    if (!response.ok) {
      empty.innerHTML = `<div style="color:#f87171;font-size:.9rem">❌ No application found with ID <strong>${escapeHtml(appId)}</strong>. Please check and try again.</div>`;
      return;
    }

    const app = data.data;
    const submittedAt = formatDate(app.submitted_at, true);
    const steps = [
      { title: 'Application Submitted', time: submittedAt, state: 'done' },
      { title: 'Payment Confirmed', time: `${submittedAt} — ${formatAmount(app.amount)}`, state: 'done' },
      {
        title: 'Document Verification',
        time: app.status === 'Rejected' ? 'Documents did not pass verification' : app.status === 'Approved' ? 'Verified successfully' : 'In progress — estimated 1-2 days',
        state: app.status === 'Rejected' ? 'rej' : app.status === 'Approved' ? 'done' : 'prog',
      },
      {
        title: 'Approval by GSRTC Officer',
        time: app.status === 'Rejected' ? (app.rejection_reason || 'Application rejected') : app.status === 'Approved' ? `Approved on ${formatDate(app.reviewed_at, true)}` : 'Pending',
        state: app.status === 'Rejected' ? 'rej' : app.status === 'Approved' ? 'done' : 'pend',
      },
      {
        title: 'E-Pass Issued & Ready',
        time: app.status === 'Approved' ? `Valid ${formatDate(app.valid_from)} to ${formatDate(app.valid_until)}` : 'Pending',
        state: app.status === 'Approved' ? 'done' : 'pend',
      },
    ];

    empty.style.display = 'none';
    result.style.display = 'block';
    result.innerHTML = `
      <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:1.5rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;flex-wrap:wrap;gap:.8rem">
          <div>
            <div style="font-size:.72rem;color:rgba(255,255,255,.35);margin-bottom:4px">Application ID</div>
            <div style="font-family:'Rajdhani',sans-serif;font-size:1.2rem;font-weight:700;color:white">${escapeHtml(app.id)}</div>
            <div style="font-size:.78rem;color:rgba(255,255,255,.45);margin-top:3px">${escapeHtml(app.applicant_name)} • ${escapeHtml(app.pass_type)}</div>
          </div>
          ${statusBadge(app.status)}
        </div>
        <div class="timeline">
          ${steps.map((step) => `
            <div class="tl-item">
              <div class="tl-dot ${step.state}">${step.state === 'done' ? '✓' : step.state === 'prog' ? '●' : step.state === 'rej' ? '✕' : ''}</div>
              <div>
                <div class="tl-title">${escapeHtml(step.title)}</div>
                <div class="tl-time">${escapeHtml(step.time)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch {
    empty.innerHTML = '<div style="color:#f87171;font-size:.9rem">❌ Server error. Is the backend running?</div>';
  }
}

async function renderDownloads() {
  const user = DB.getCurrentUser();
  if (!user) return;

  const container = document.getElementById('download-content');
  container.innerHTML = '<div style="text-align:center;padding:2rem;color:rgba(255,255,255,.4)">Loading...</div>';

  try {
    const response = await apiFetch('/applications/downloads');
    const data = await safeJson(response);
    if (!response.ok) throw new Error();

    const approved = data.data || [];
    if (!approved.length) {
      container.innerHTML = '<div style="text-align:center;padding:3rem;color:rgba(255,255,255,.4)"><div style="font-size:3rem;margin-bottom:1rem">📭</div><p>No approved passes yet. Submit an application and wait for approval.</p></div>';
      return;
    }

    container.innerHTML = approved.map((app) => `
      <div style="margin-bottom:2rem">
        <div class="digital-pass">
          <div class="dp-hd">
            <div class="dp-logo">
              <div class="dp-logo-box">🚌</div>
              <div class="dp-logo-txt"><span>GSRTC E-PASS</span><span>Gujarat State Road Transport Corporation</span></div>
            </div>
            <div class="dp-valid">✅ VALID</div>
          </div>
          <div class="dp-body">
            <div class="dp-photo">👤</div>
            <div>
              <div class="dp-name">${escapeHtml(app.applicant_name)}</div>
              <div class="dp-type">${escapeHtml(app.pass_type)}</div>
              <div class="dp-info-txt">
                <strong>Mobile:</strong> ${escapeHtml(app.mobile)}<br>
                ${app.college_org ? `<strong>Org:</strong> ${escapeHtml(app.college_org)}<br>` : ''}
                <strong>Pass ID:</strong> <code style="color:#F5A623">${escapeHtml(app.id)}</code>
              </div>
            </div>
          </div>
          <div class="dp-divider"></div>
          <div class="dp-route">
            <div style="text-align:center"><div style="font-size:.65rem;color:rgba(255,255,255,.4);margin-bottom:2px">FROM</div><div class="dp-city">${escapeHtml(app.from_city)}</div></div>
            <div class="dp-arr">⟶</div>
            <div style="text-align:center"><div style="font-size:.65rem;color:rgba(255,255,255,.4);margin-bottom:2px">TO</div><div class="dp-city">${escapeHtml(app.to_city)}</div></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:.8rem;margin-bottom:1rem;font-size:.78rem">
            <div><div style="color:rgba(255,255,255,.4);font-size:.62rem;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">Valid From</div><div style="color:white;font-weight:600">${formatDate(app.valid_from)}</div></div>
            <div><div style="color:rgba(255,255,255,.4);font-size:.62rem;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">Valid Until</div><div style="color:white;font-weight:600">${formatDate(app.valid_until)}</div></div>
            <div><div style="color:rgba(255,255,255,.4);font-size:.62rem;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">Validity</div><div style="color:white;font-weight:600">${escapeHtml(app.validity)}</div></div>
            <div><div style="color:rgba(255,255,255,.4);font-size:.62rem;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">Amount</div><div style="color:#F5A623;font-weight:700">${formatAmount(app.amount)}</div></div>
          </div>
          <a href="${API_BASE}/applications/${encodeURIComponent(app.id)}/download" target="_blank" class="btn btn-gold btn-full">📥 Download PDF Pass</a>
        </div>
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<div style="text-align:center;padding:3rem;color:#f87171">Failed to load passes. Is the backend running?</div>';
  }
}

function updatePreview() {
  const getValue = (id) => document.getElementById(id)?.value || '';
  const name = getValue('ap-name').trim();
  const type = getValue('ap-type');
  const from = getValue('ap-from').trim();
  const to = getValue('ap-to').trim();
  const college = getValue('ap-college').trim();
  const validity = getValue('ap-validity');
  const element = (id) => document.getElementById(id);

  if (element('prev-name')) element('prev-name').innerHTML = name ? escapeHtml(name) : '<span class="empty-v">Your Name</span>';
  if (element('prev-type')) element('prev-type').textContent = type || 'Pass Type';
  if (element('prev-from')) {
    element('prev-from').textContent = from || '—';
    element('prev-from').className = from ? '' : 'empty-v';
  }
  if (element('prev-to')) {
    element('prev-to').textContent = to || '—';
    element('prev-to').className = to ? '' : 'empty-v';
  }
  if (element('prev-college')) {
    element('prev-college').textContent = college || '—';
    element('prev-college').className = college ? '' : 'empty-v';
  }
  if (element('prev-validity')) {
    element('prev-validity').textContent = validity ? validity.split('—')[0].trim() : '—';
    element('prev-validity').className = validity ? '' : 'empty-v';
  }
  if (element('prev-date')) element('prev-date').textContent = formatDate(new Date());
}

function initAdminPage() {
  if (DB.isAdmin()) {
    document.getElementById('adminLoginView').style.display = 'none';
    document.getElementById('adminDashView').style.display = 'block';
    document.body.classList.remove('dark-bg');
    document.body.classList.add('light-bg');
    renderAdminStats();
    renderAppsTable();
    renderUsersTable();
  } else {
    document.getElementById('adminLoginView').style.display = 'flex';
    document.getElementById('adminDashView').style.display = 'none';
    document.body.classList.add('dark-bg');
    document.body.classList.remove('light-bg');
  }
}

async function handleAdminLogin() {
  const username = document.getElementById('a-user').value.trim();
  const password = document.getElementById('a-pwd').value;
  document.getElementById('a-user-msg').classList.remove('show');
  document.getElementById('a-pwd-msg').classList.remove('show');

  if (!username) {
    document.getElementById('a-user-msg').classList.add('show');
    return;
  }
  if (!password) {
    document.getElementById('a-pwd-msg').classList.add('show');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await safeJson(response);
    if (!response.ok) {
      showToast('❌ Login Failed', data.message || 'Invalid admin credentials. Demo admin: admin / gsrtc@2025', 'error');
      return;
    }

    _adminAccess = data.data.accessToken;
    _adminRefresh = data.data.refreshToken;
    sessionStorage.setItem('gsrtc_admin_access', _adminAccess);
    sessionStorage.setItem('gsrtc_admin_refresh', _adminRefresh);
    DB.setAdmin();
    showToast('✅ Admin Login Successful', 'Welcome to the GSRTC Admin Dashboard.', 'success');
    setTimeout(() => {
      initAdminPage();
      updateNav('admin');
    }, 500);
  } catch {
    showToast('❌ Network Error', 'Could not reach the backend.', 'error');
  }
}

function loginDemoAdmin() {
  document.getElementById('a-user').value = 'admin';
  document.getElementById('a-pwd').value = 'gsrtc@2025';
  handleAdminLogin();
}

async function adminLogout() {
  try {
    await apiFetch('/admin/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: _adminRefresh }),
    }, true);
  } catch {}
  DB.clearAdmin();
  initAdminPage();
  updateNav('admin');
  showToast('👋 Logged Out', 'Admin session ended.', 'success');
}

function switchDTab(id, button) {
  document.querySelectorAll('.dtab-panel').forEach((panel) => panel.classList.remove('active'));
  document.querySelectorAll('.dtab').forEach((tab) => tab.classList.remove('active'));
  document.getElementById(`dtab-${id}`).classList.add('active');
  button.classList.add('active');
  if (id === 'analytics') renderAnalytics();
}

async function renderAdminStats() {
  try {
    const response = await apiFetch('/applications/admin/stats', {}, true);
    const data = await safeJson(response);
    if (!response.ok || !data.data) return;

    const overview = data.data.overview;
    const totalApplications = Number(overview.totalApplications || 0);
    const approved = Number(overview.approved || 0);
    const pending = Number(overview.pending || 0);
    const rejected = Number(overview.rejected || 0);
    const totalRevenue = Number(overview.totalRevenue || 0);
    const totalUsers = Number(overview.totalUsers || 0);

    const stats = [
      { icon: '📋', bg: 'rgba(232,84,26,.1)', value: totalApplications, label: 'Total Applications', change: `↑ ${pending} pending`, cls: 'down' },
      { icon: '✅', bg: 'rgba(16,185,129,.1)', value: approved, label: 'Approved Passes', change: `${totalApplications ? Math.round((approved / totalApplications) * 100) : 0}% approval`, cls: 'up' },
      { icon: '⏳', bg: 'rgba(245,158,11,.1)', value: pending, label: 'Pending Review', change: `${rejected} rejected`, cls: 'down' },
      { icon: '💰', bg: 'rgba(139,92,246,.1)', value: formatAmount(totalRevenue), label: 'Revenue Collected', change: `from ${approved} approved passes`, cls: 'up' },
    ];

    document.getElementById('statsGrid').innerHTML = stats.map((stat) => `
      <div class="stat-card">
        <div class="stat-card-ico" style="background:${stat.bg}">${stat.icon}</div>
        <div>
          <div class="stat-card-num">${escapeHtml(stat.value)}</div>
          <div class="stat-card-label">${escapeHtml(stat.label)}</div>
          <div class="stat-card-change ${stat.cls}">${escapeHtml(stat.change)}</div>
        </div>
      </div>
    `).join('');

    document.getElementById('apps-count-badge').textContent = `${totalApplications} total`;
    document.getElementById('users-count-badge').textContent = `${totalUsers} total`;

    if (data.data.byPassType?.length) {
      const max = Math.max(...data.data.byPassType.map((item) => Number(item.count)), 1);
      document.getElementById('type-chart').innerHTML = data.data.byPassType.map((item) => `
        <div class="bar-item">
          <div class="bar-label" style="font-size:.72rem">${escapeHtml(item.pass_type)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((Number(item.count) / max) * 100)}%"></div></div>
          <div class="bar-val">${Number(item.count)}</div>
        </div>
      `).join('');
    }

    const statusRows = [
      { status: 'Pending', count: pending, color: 'rgba(245,158,11,1)' },
      { status: 'Approved', count: approved, color: 'rgba(16,185,129,1)' },
      { status: 'Rejected', count: rejected, color: 'rgba(239,68,68,1)' },
    ];
    const statusMax = Math.max(...statusRows.map((row) => row.count), 1);
    document.getElementById('status-chart').innerHTML = statusRows.map((row) => `
      <div class="bar-item">
        <div class="bar-label">${row.status}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round((row.count / statusMax) * 100)}%;background:${row.color}"></div></div>
        <div class="bar-val">${row.count}</div>
      </div>
    `).join('');

    if (data.data.topRoutes?.length) {
      const routeMax = Math.max(...data.data.topRoutes.map((item) => Number(item.count)), 1);
      document.getElementById('route-chart').innerHTML = data.data.topRoutes.map((item) => `
        <div class="bar-item">
          <div class="bar-label" style="font-size:.72rem">${escapeHtml(item.route)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((Number(item.count) / routeMax) * 100)}%"></div></div>
          <div class="bar-val">${Number(item.count)}</div>
        </div>
      `).join('');
    }
  } catch {}
}

async function renderAppsTable() {
  const search = document.getElementById('apps-search').value || '';
  const filter = document.getElementById('apps-filter').value;
  const tbody = document.getElementById('apps-tbody');
  tbody.innerHTML = '<tr class="empty-row"><td colspan="9">Loading...</td></tr>';

  try {
    const params = new URLSearchParams({ limit: '50' });
    if (filter) params.set('status', filter);
    if (search.trim()) params.set('search', search.trim());
    const response = await apiFetch(`/applications/admin/all?${params.toString()}`, {}, true);
    const data = await safeJson(response);
    if (!response.ok) throw new Error();

    const apps = data.data || [];
    if (!apps.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="9">No applications found.</td></tr>';
      return;
    }

    tbody.innerHTML = apps.map((app) => {
      const status = app.status;
      let actions = '<button class="act-btn act-issued">✓ Issued</button>';
      if (status === 'Pending') {
        actions = `<button class="act-btn act-approve" onclick="approveApp('${escapeHtml(app.id)}')">✅ Approve</button><button class="act-btn act-reject" onclick="rejectApp('${escapeHtml(app.id)}')">❌ Reject</button>`;
      }
      return `
        <tr>
          <td><code style="font-size:.72rem;color:#6366f1">${escapeHtml(app.id)}</code></td>
          <td><div style="font-weight:600">${escapeHtml(app.applicant_name)}</div><div style="font-size:.72rem;color:var(--gray-400)">${escapeHtml(app.mobile)}</div></td>
          <td>${escapeHtml(app.pass_type)}</td>
          <td>${escapeHtml(app.from_city)}→${escapeHtml(app.to_city)}</td>
          <td>${escapeHtml(app.validity)}</td>
          <td>${formatAmount(app.amount)}</td>
          <td>${formatDate(app.submitted_at)}</td>
          <td>${adminBadge(status)}</td>
          <td style="white-space:nowrap">${actions}</td>
        </tr>
      `;
    }).join('');
  } catch {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9" style="color:#f87171">Failed to load applications. Is the backend running?</td></tr>';
  }
}

async function approveApp(id) {
  if (!window.confirm(`Approve application ${id}?`)) return;
  try {
    const response = await apiFetch(`/applications/admin/${encodeURIComponent(id)}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Approved' }),
    }, true);
    const data = await safeJson(response);
    if (!response.ok) {
      showToast('❌ Error', data.message || 'Unable to approve application.', 'error');
      return;
    }
    await Promise.all([renderAdminStats(), renderAppsTable()]);
    showToast('✅ Approved!', `Pass ${id} approved successfully.`, 'success');
  } catch {
    showToast('❌ Network Error', 'Could not reach the backend.', 'error');
  }
}

async function rejectApp(id) {
  const reason = window.prompt('Reason for rejection (required):');
  if (!reason) return;
  try {
    const response = await apiFetch(`/applications/admin/${encodeURIComponent(id)}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Rejected', rejectionReason: reason }),
    }, true);
    const data = await safeJson(response);
    if (!response.ok) {
      showToast('❌ Error', data.message || 'Unable to reject application.', 'error');
      return;
    }
    await Promise.all([renderAdminStats(), renderAppsTable()]);
    showToast('❌ Rejected', `Application ${id} rejected.`, 'error');
  } catch {
    showToast('❌ Network Error', 'Could not reach the backend.', 'error');
  }
}

async function renderUsersTable() {
  const search = document.getElementById('users-search').value || '';
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Loading...</td></tr>';

  try {
    const params = new URLSearchParams({ limit: '50' });
    if (search.trim()) params.set('search', search.trim());
    const response = await apiFetch(`/applications/admin/users?${params.toString()}`, {}, true);
    const data = await safeJson(response);
    if (!response.ok) throw new Error();

    const users = data.data || [];
    if (!users.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No registered users found.</td></tr>';
      return;
    }

    tbody.innerHTML = users.map((user) => {
      const aadhaar = user.aadhaar ? `XXXX XXXX ${String(user.aadhaar).slice(-4)}` : '—';
      return `
        <tr>
          <td><code style="font-size:.72rem;color:#6366f1">${escapeHtml(String(user.id).slice(0, 12))}</code></td>
          <td><div style="font-weight:600">${escapeHtml(user.name)}</div></td>
          <td>${escapeHtml(user.mobile)}</td>
          <td>${escapeHtml(user.email || '—')}</td>
          <td style="font-family:monospace;font-size:.78rem">${escapeHtml(aadhaar)}</td>
          <td>${formatDate(user.created_at)}</td>
          <td><span class="badge badge-orange">${Number(user.app_count)} app${Number(user.app_count) !== 1 ? 's' : ''}</span></td>
        </tr>
      `;
    }).join('');
  } catch {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7" style="color:#f87171">Failed to load users.</td></tr>';
  }
}

function renderAnalytics() {
  renderAdminStats();
}

function filterName(input) {
  const cursor = input.selectionStart;
  input.value = input.value.replace(/[^A-Za-z\s]/g, '');
  try { input.setSelectionRange(cursor, cursor); } catch {}
  input.classList.remove('valid', 'error');
}

function filterMobile(input) {
  input.value = input.value.replace(/\D/g, '').slice(0, 10);
  input.classList.remove('valid', 'error');
}

function lowercaseEmail(input) {
  const cursor = input.selectionStart;
  input.value = input.value.toLowerCase();
  try { input.setSelectionRange(cursor, cursor); } catch {}
  input.classList.remove('valid', 'error');
}

function filterAadhaar(input) {
  let value = input.value.replace(/\D/g, '').slice(0, 12);
  value = value.replace(/(\d{4})(?=\d)/g, '$1 ');
  input.value = value;
  input.classList.remove('valid', 'error');
}

function setValidity(input, messageId, isValid, errorMessage) {
  input.classList.remove('valid', 'error');
  const message = document.getElementById(messageId);
  if (!input.value.trim()) {
    if (message) message.classList.remove('show');
    return;
  }
  if (isValid) {
    input.classList.add('valid');
    if (message) message.classList.remove('show');
  } else {
    input.classList.add('error');
    if (message) {
      message.textContent = errorMessage;
      message.classList.add('show');
    }
  }
}

function validateName(input, messageId) {
  const value = input.value.trim();
  setValidity(input, messageId, value.length >= 2 && /^[A-Za-z\s]+$/.test(value), 'Name must be at least 2 letters, no numbers.');
}

function validateMobile(input, messageId) {
  setValidity(input, messageId, /^[6-9]\d{9}$/.test(input.value), 'Enter valid 10-digit Indian mobile number.');
}

function validateEmail(input, messageId) {
  setValidity(input, messageId, /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(input.value), 'Enter a valid email address.');
}

function validateAadhaar(input, messageId) {
  setValidity(input, messageId, /^\d{12}$/.test(input.value.replace(/\s/g, '')), 'Aadhaar must be exactly 12 digits.');
}

function validatePassword(input, messageId) {
  const value = input.value;
  setValidity(input, messageId, value.length >= 8 && /[a-zA-Z]/.test(value) && /\d/.test(value), 'Min 8 chars with letters & numbers.');
}

function checkCpwd(input) {
  const password = document.getElementById('r-pwd').value;
  const message = document.getElementById('r-cpwd-msg');
  input.classList.remove('valid', 'error');
  if (!input.value) {
    message.classList.remove('show');
    return;
  }
  if (input.value === password) {
    input.classList.add('valid');
    message.classList.remove('show');
  } else {
    input.classList.add('error');
    message.textContent = 'Passwords do not match.';
    message.classList.add('show');
  }
}

function togglePwd(id, button) {
  const input = document.getElementById(id);
  input.type = input.type === 'password' ? 'text' : 'password';
  button.textContent = input.type === 'password' ? '👁' : '🙈';
}

function checkStrength(input) {
  const value = input.value;
  const bars = document.getElementById('r-pwd-bars');
  if (!value) {
    bars.style.display = 'none';
    return;
  }
  bars.style.display = 'block';
  let score = 0;
  if (value.length >= 8) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;

  const cls = ['', 'weak', 'weak', 'medium', 'strong'];
  const label = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const color = ['', '#f87171', '#f87171', '#fbbf24', '#34d399'];

  [1, 2, 3, 4].forEach((index) => {
    const bar = document.getElementById(`pb${index}`);
    bar.className = 'pwd-bar';
    if (index <= score) bar.classList.add(cls[score]);
  });

  const text = document.getElementById('pwd-lbl');
  text.textContent = label[score] || '';
  text.style.color = color[score] || '';
}

function toggleMenu() {
  document.getElementById('hamburger').classList.toggle('open');
  document.getElementById('mobileNav').classList.toggle('open');
}

function closeMenu() {
  document.getElementById('hamburger').classList.remove('open');
  document.getElementById('mobileNav').classList.remove('open');
}

document.addEventListener('click', (event) => {
  const mobileNav = document.getElementById('mobileNav');
  const hamburger = document.getElementById('hamburger');
  if (mobileNav.classList.contains('open') && !mobileNav.contains(event.target) && !hamburger.contains(event.target)) {
    closeMenu();
  }
});

function showToast(title, message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.className = 'toast';
  if (type === 'error') toast.classList.add('t-error');
  if (type === 'warn') toast.classList.add('t-warn');
  document.getElementById('toast-title').textContent = title;
  document.getElementById('toast-msg').textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

window.addEventListener('scroll', () => {
  const button = document.getElementById('scrollTop');
  if (window.scrollY > 400) button.classList.add('show');
  else button.classList.remove('show');
});

function wireFileInputs() {
  const photoInput = document.getElementById('ap-photo');
  const documentInput = document.getElementById('ap-document');
  const photoName = document.getElementById('ap-photo-name');
  const documentName = document.getElementById('ap-document-name');
  const passType = document.getElementById('ap-type');
  const validity = document.getElementById('ap-validity');

  if (!photoInput || !documentInput || !photoName || !documentName || !passType || !validity) {
    return;
  }

  photoInput.addEventListener('change', () => {
    photoName.textContent = photoInput.files[0]?.name || 'No photo selected';
  });
  documentInput.addEventListener('change', () => {
    documentName.textContent = documentInput.files[0]?.name || 'No document selected';
  });

  passType.addEventListener('change', () => {
    refreshValidityLabels();
    updatePreview();
  });
  validity.addEventListener('change', updatePreview);
}

function init() {
  seedData();
  updatePreview();
  const requestedPage =
    window.location.pathname === '/portal' ? 'portal' :
    window.location.pathname === '/admin' ? 'admin' :
    window.location.pathname === '/' ? 'landing' :
    new URLSearchParams(window.location.search).get('page');
  if (requestedPage === 'portal' || requestedPage === 'admin' || requestedPage === 'landing') {
    goTo(requestedPage);
  } else if (DB.isAdmin()) {
    goTo('admin');
  } else if (DB.getCurrentUser()) {
    goTo('portal');
  } else {
    updateNav('landing');
  }
  wireFileInputs();
  loadConfig();
}

init();
