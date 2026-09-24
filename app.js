
let currentStaff = null;

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => {
  const rememberedId = localStorage.getItem('ksp_guard_person_id');
  if (rememberedId) $('personId').value = rememberedId;

  $('loginBtn').addEventListener('click', login);
  $('logoutBtn').addEventListener('click', logout);

  $('password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login();
  });

  checkApiHealth();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
});

function setStatus(targetId, message, type='info') {
  const el = $(targetId);
  el.innerHTML = message
    ? `<div class="status ${type}">${escapeHtml(message)}</div>`
    : '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

/**
 * 第5步 doGet() 健康檢查。
 * Apps Script ContentService 可能發生 redirect，因此直接 fetch。
 */
async function checkApiHealth() {
  const badge = $('apiStatus');
  badge.className = 'badge waiting';
  badge.textContent = '檢查中';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(API_URL, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal
    });

    clearTimeout(timer);

    const data = await response.json();

    if (data && data.ok && data.service === 'KSP Security PWA API') {
      badge.className = 'badge ok';
      badge.textContent = '已連線';
    } else {
      throw new Error('API回傳格式不正確');
    }
  } catch (err) {
    badge.className = 'badge err';
    badge.textContent = '未連線';
  }
}

/**
 * PWA → Apps Script POST bridge
 *
 * 使用 hidden iframe + form POST，
 * Apps Script doPost() 再以 window.top.postMessage()
 * 把結果送回 GitHub Pages。
 */
function apiCall(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const requestId =
      'req_' + Date.now() + '_' +
      Math.random().toString(36).slice(2);

    const iframeName = 'api_frame_' + requestId;

    const iframe = document.createElement('iframe');
    iframe.name = iframeName;
    iframe.style.display = 'none';

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = API_URL;
    form.target = iframeName;
    form.style.display = 'none';

    const fields = {
      requestId,
      action,
      payload: JSON.stringify(payload)
    };

    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });

    let finished = false;

    const cleanup = () => {
      if (finished) return;
      finished = true;

      window.removeEventListener('message', onMessage);
      clearTimeout(timer);

      setTimeout(() => {
        try { form.remove(); } catch(e) {}
        try { iframe.remove(); } catch(e) {}
      }, 50);
    };

    const onMessage = (event) => {
      const data = event.data;

      if (!data || data.source !== 'ksp-api') return;
      if (data.requestId !== requestId) return;

      const response = data.response;

      cleanup();

      if (response && response.ok) {
        resolve(response);
      } else {
        reject(
          new Error(
            response && response.message
              ? response.message
              : 'API執行失敗'
          )
        );
      }
    };

    window.addEventListener('message', onMessage);

    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          '登入逾時。請確認 Apps Script /exec 已部署為第5步最新版本。'
        )
      );
    }, API_TIMEOUT_MS);

    document.body.appendChild(iframe);
    document.body.appendChild(form);

    form.submit();
  });
}

async function login() {
  const personId = $('personId').value.trim().toUpperCase();
  const password = $('password').value.trim();
  const btn = $('loginBtn');

  if (!personId || !password) {
    setStatus(
      'loginMessage',
      '請輸入人員編號及密碼。',
      'warn'
    );
    return;
  }

  btn.disabled = true;
  btn.textContent = '登入驗證中…';
  setStatus('loginMessage', '正在連線驗證帳號…', 'info');

  try {
    const result = await apiCall('login', {
      personId,
      password
    });

    currentStaff = result.staff;

    localStorage.setItem(
      'ksp_guard_person_id',
      currentStaff.personId
    );

    renderDashboard(result);

    $('loginView').classList.add('hidden');
    $('dashboardView').classList.remove('hidden');

    setStatus('loginMessage', '');

  } catch (err) {
    setStatus(
      'loginMessage',
      err.message || '登入失敗。',
      'err'
    );

  } finally {
    btn.disabled = false;
    btn.textContent = '登入系統';
  }
}

function renderDashboard(result) {
  const s = result.staff || {};

  $('staffLabel').textContent =
    `${s.name || '未填姓名'}｜${s.personId || ''}`;

  $('staffId').textContent = s.personId || '—';
  $('staffName').textContent = s.name || '—';
  $('todayShift').textContent = s.todayShift || '今日無排班';
  $('dutyDate').textContent = s.dutyDate || '—';
  $('dutyStart').textContent = s.dutyStart || '—';
  $('dutyEnd').textContent = s.dutyEnd || '—';
  $('dutyType').textContent = s.dutyType || '—';
  $('staffStatus').textContent = s.status || '—';

  if (result.warning) {
    setStatus(
      'dashboardMessage',
      result.warning,
      'warn'
    );
  } else {
    setStatus(
      'dashboardMessage',
      '登入成功，今日勤務資料已載入。',
      'ok'
    );
  }
}

function logout() {
  currentStaff = null;

  $('password').value = '';
  $('dashboardView').classList.add('hidden');
  $('loginView').classList.remove('hidden');

  setStatus('dashboardMessage', '');
}
