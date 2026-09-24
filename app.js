
let currentStaff = null;
const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => {
  const rememberedId = localStorage.getItem('ksp_guard_person_id');
  if (rememberedId) $('personId').value = rememberedId;

  $('loginBtn').addEventListener('click', login);
  $('logoutBtn').addEventListener('click', logout);
  $('password').addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
  });

  checkApiHealth();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
});

function escapeHtml(v){
  return String(v??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

function setStatus(id,msg,type='info'){
  $(id).innerHTML = msg ? `<div class="status ${type}">${escapeHtml(msg)}</div>` : '';
}

function apiCall(action,payload={}){
  return new Promise((resolve,reject)=>{
    const requestId='req_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const iframeName='api_'+requestId;

    const iframe=document.createElement('iframe');
    iframe.name=iframeName;
    iframe.style.display='none';

    const form=document.createElement('form');
    form.method='POST';
    form.action=API_URL;
    form.target=iframeName;
    form.style.display='none';

    const fields={requestId,action,payload:JSON.stringify(payload)};
    Object.entries(fields).forEach(([name,value])=>{
      const input=document.createElement('input');
      input.type='hidden';
      input.name=name;
      input.value=value;
      form.appendChild(input);
    });

    let done=false;

    const cleanup=()=>{
      if(done)return;
      done=true;
      window.removeEventListener('message',onMessage);
      clearTimeout(timer);
      setTimeout(()=>{
        try{form.remove();}catch(e){}
        try{iframe.remove();}catch(e){}
      },50);
    };

    const onMessage=(event)=>{
      const d=event.data;
      if(!d || d.source!=='ksp-api' || d.requestId!==requestId)return;
      cleanup();
      if(d.response && d.response.ok){
        resolve(d.response);
      }else{
        reject(new Error(d.response?.message || 'API執行失敗'));
      }
    };

    window.addEventListener('message',onMessage);

    const timer=setTimeout(()=>{
      cleanup();
      reject(new Error('API連線逾時。請確認 config.js 的 API_URL 與目前可顯示 step5-v1 JSON 的 /exec 網址完全一致。'));
    },API_TIMEOUT_MS);

    document.body.appendChild(iframe);
    document.body.appendChild(form);
    form.submit();
  });
}

async function checkApiHealth(){
  const badge=$('apiStatus');
  badge.className='badge waiting';
  badge.textContent='檢查中';

  try{
    const result=await apiCall('ping',{});
    if(result && result.ok){
      badge.className='badge ok';
      badge.textContent='已連線';
      setStatus('loginMessage','');
    }else{
      throw new Error('API回傳格式不正確');
    }
  }catch(err){
    badge.className='badge err';
    badge.textContent='未連線';
    setStatus('loginMessage',err.message || 'API無法連線。','err');
  }
}

async function login(){
  const personId=$('personId').value.trim().toUpperCase();
  const password=$('password').value.trim();
  const btn=$('loginBtn');

  if(!personId || !password){
    setStatus('loginMessage','請輸入人員編號及密碼。','warn');
    return;
  }

  btn.disabled=true;
  btn.textContent='登入驗證中…';
  setStatus('loginMessage','正在連線驗證帳號…','info');

  try{
    const result=await apiCall('login',{personId,password});
    currentStaff=result.staff;
    localStorage.setItem('ksp_guard_person_id',currentStaff.personId);
    renderDashboard(result);
    $('loginView').classList.add('hidden');
    $('dashboardView').classList.remove('hidden');
    setStatus('loginMessage','');
  }catch(err){
    setStatus('loginMessage',err.message || '登入失敗。','err');
  }finally{
    btn.disabled=false;
    btn.textContent='登入系統';
  }
}

function renderDashboard(result){
  const s=result.staff || {};
  $('staffLabel').textContent=`${s.name || '未填姓名'}｜${s.personId || ''}`;
  $('staffId').textContent=s.personId || '—';
  $('staffName').textContent=s.name || '—';
  $('todayShift').textContent=s.todayShift || '今日無排班';
  $('dutyDate').textContent=s.dutyDate || '—';
  $('dutyStart').textContent=s.dutyStart || '—';
  $('dutyEnd').textContent=s.dutyEnd || '—';
  $('dutyType').textContent=s.dutyType || '—';
  $('staffStatus').textContent=s.status || '—';

  if(result.warning){
    setStatus('dashboardMessage',result.warning,'warn');
  }else{
    setStatus('dashboardMessage','登入成功，今日勤務資料已載入。','ok');
  }
}

function logout(){
  currentStaff=null;
  $('password').value='';
  $('dashboardView').classList.add('hidden');
  $('loginView').classList.remove('hidden');
  setStatus('dashboardMessage','');
}
