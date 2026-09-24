
let currentStaff=null;
let scanner=null;
let scanBusy=false;
let cameraCaps=null;
let torchOn=false;
let currentZoom=1;

const $=id=>document.getElementById(id);

document.addEventListener('DOMContentLoaded',()=>{
  const saved=localStorage.getItem('ksp_guard_person_id');
  if(saved)$('personId').value=saved;

  $('loginBtn').addEventListener('click',login);
  $('logoutBtn').addEventListener('click',logout);
  $('clockInBtn').addEventListener('click',clockIn);
  $('patrolBtn').addEventListener('click',openPatrol);
  $('recordsBtn').addEventListener('click',openRecords);
  $('refreshRecordsBtn').addEventListener('click',loadTodayRecords);
  $('manualQrBtn').addEventListener('click',()=>processQr($('manualQr').value));
  $('backBtn').addEventListener('click',()=>showView('mainView'));
  $('patrolBackTopBtn').addEventListener('click',()=>showView('mainView'));
  $('recordsBackBtn').addEventListener('click',()=>showView('mainView'));
  $('continuePatrolBtn').addEventListener('click',continuePatrol);
  $('successHomeBtn').addEventListener('click',()=>{
    hideSuccessModal();
    showView('mainView');
  });

  $('refocusBtn').addEventListener('click',refocusCamera);
  $('zoom1Btn').addEventListener('click',()=>setCameraZoom(1));
  $('zoom15Btn').addEventListener('click',()=>setCameraZoom(1.5));
  $('zoom2Btn').addEventListener('click',()=>setCameraZoom(2));
  $('torchBtn').addEventListener('click',toggleTorch);

  $('password').addEventListener('keydown',e=>{
    if(e.key==='Enter')login();
  });

  checkApi();

  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  }
});

function esc(v){
  return String(v??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

function status(id,msg,type='info'){
  $(id).innerHTML=msg?`<div class="status ${type}">${esc(msg)}</div>`:'';
}

function showView(id){
  ['mainView','patrolView','recordsView'].forEach(v=>$(v).classList.add('hidden'));
  $(id).classList.remove('hidden');
  if(id!=='patrolView')stopScanner();
}

function apiCall(action,payload={}){
  return new Promise((resolve,reject)=>{
    const requestId='r_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const frame='f_'+requestId;

    const iframe=document.createElement('iframe');
    iframe.name=frame;
    iframe.style.display='none';

    const form=document.createElement('form');
    form.method='POST';
    form.action=API_URL;
    form.target=frame;
    form.style.display='none';

    for(const [name,value] of Object.entries({
      requestId,action,payload:JSON.stringify(payload)
    })){
      const input=document.createElement('input');
      input.type='hidden';
      input.name=name;
      input.value=value;
      form.appendChild(input);
    }

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

    const onMessage=e=>{
      const d=e.data;
      if(!d||d.source!=='ksp-api'||d.requestId!==requestId)return;
      cleanup();

      if(d.response&&d.response.ok){
        resolve(d.response);
      }else{
        const err=new Error(d.response?.message||'API執行失敗');
        err.apiResponse=d.response;
        reject(err);
      }
    };

    window.addEventListener('message',onMessage);

    const timer=setTimeout(()=>{
      cleanup();
      reject(new Error('API連線逾時，請確認 Apps Script 已部署為第8步版本。'));
    },API_TIMEOUT_MS);

    document.body.append(iframe,form);
    form.submit();
  });
}

async function checkApi(){
  const b=$('apiStatus');
  try{
    await apiCall('ping',{});
    b.className='badge ok';
    b.textContent='已連線';
  }catch(e){
    b.className='badge err';
    b.textContent='未連線';
  }
}

async function login(){
  const personId=$('personId').value.trim().toUpperCase();
  const password=$('password').value.trim();

  if(!personId||!password){
    status('loginMessage','請輸入人員編號及密碼。','warn');
    return;
  }

  $('loginBtn').disabled=true;
  $('loginBtn').textContent='登入驗證中…';

  try{
    const r=await apiCall('login',{personId,password});
    currentStaff=r.staff;
    localStorage.setItem('ksp_guard_person_id',personId);

    $('staffLabel').textContent=`${currentStaff.name}｜${currentStaff.personId}`;
    $('todayShift').textContent=currentStaff.todayShift||'今日無排班';
    $('dutyDate').textContent=currentStaff.dutyDate||'—';
    $('dutyStart').textContent=currentStaff.dutyStart||'—';
    $('dutyEnd').textContent=currentStaff.dutyEnd||'—';

    $('loginView').classList.add('hidden');
    $('mainView').classList.remove('hidden');

    status('mainMessage',r.warning||'登入成功。',r.warning?'warn':'ok');
  }catch(e){
    status('loginMessage',e.message,'err');
  }finally{
    $('loginBtn').disabled=false;
    $('loginBtn').textContent='登入系統';
  }
}

function logout(){
  currentStaff=null;
  stopScanner();
  $('password').value='';
  ['mainView','patrolView','recordsView'].forEach(id=>$(id).classList.add('hidden'));
  $('loginView').classList.remove('hidden');
}

function getGps(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation){
      reject(new Error('此裝置不支援 GPS。'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      p=>resolve({
        latitude:p.coords.latitude,
        longitude:p.coords.longitude,
        accuracy:p.coords.accuracy
      }),
      e=>{
        let msg='無法取得 GPS 定位。';
        if(e.code===1)msg='定位權限被拒絕，請允許網站使用位置資訊。';
        if(e.code===2)msg='目前無法取得位置資訊。';
        if(e.code===3)msg='GPS 定位逾時，請重新操作。';
        reject(new Error(msg));
      },
      {enableHighAccuracy:true,timeout:20000,maximumAge:0}
    );
  });
}

async function clockIn(){
  if(!currentStaff)return;
  status('mainMessage','正在取得 GPS…','info');

  try{
    const gps=await getGps();
    const r=await apiCall('checkin',{
      personId:currentStaff.personId,
      action:'上班',
      latitude:gps.latitude,
      longitude:gps.longitude
    });
    status('mainMessage',`${r.message}\n${r.timestamp}`,'ok');
  }catch(e){
    status('mainMessage',e.message,'err');
  }
}

function openPatrol(){
  showView('patrolView');
  status('patrolMessage','');
  $('pointCard').classList.add('hidden');
  $('manualQr').value='';
  $('cameraStatus').textContent='正在啟動後鏡頭…';
  $('cameraControls').classList.add('hidden');
  startScanner();
}

function qrBoxSize(viewfinderWidth,viewfinderHeight){
  const size=Math.floor(Math.min(viewfinderWidth,viewfinderHeight)*0.72);
  const bounded=Math.max(210,Math.min(size,320));
  return {width:bounded,height:bounded};
}

async function startScanner(){
  await stopScanner();
  scanBusy=false;
  cameraCaps=null;
  torchOn=false;
  currentZoom=1;

  if(typeof Html5Qrcode==='undefined'){
    status('patrolMessage','QR掃描元件載入失敗，可改用手動輸入。','warn');
    return;
  }

  scanner=new Html5Qrcode(
    'reader',
    {
      formatsToSupport:[Html5QrcodeSupportedFormats.QR_CODE],
      useBarCodeDetectorIfSupported:true
    }
  );

  const scanConfig={
    fps:15,
    qrbox:qrBoxSize,
    disableFlip:true,
    videoConstraints:{
      width:{ideal:1920},
      height:{ideal:1080},
      frameRate:{ideal:30,max:30}
    }
  };

  try{
    await scanner.start(
      {facingMode:{ideal:'environment'}},
      scanConfig,
      text=>{
        if(scanBusy)return;
        scanBusy=true;
        processQr(text);
      },
      ()=>{}
    );

    $('cameraStatus').textContent='後鏡頭已啟動，正在啟用自動對焦…';
    $('cameraControls').classList.remove('hidden');

    await configureCamera();

  }catch(e){
    // 某些舊手機不接受理想後鏡頭條件，退回相機列舉
    try{
      const cameras=await Html5Qrcode.getCameras();
      if(!cameras.length)throw new Error('找不到相機');

      const best=chooseBestCamera(cameras);

      await scanner.start(
        best.id,
        scanConfig,
        text=>{
          if(scanBusy)return;
          scanBusy=true;
          processQr(text);
        },
        ()=>{}
      );

      $('cameraStatus').textContent='相機已啟動，正在啟用自動對焦…';
      $('cameraControls').classList.remove('hidden');

      await configureCamera();

    }catch(err){
      $('cameraStatus').textContent='相機啟動失敗';
      status(
        'patrolMessage',
        '無法啟動後鏡頭：'+(err.message||err)+'。可先使用手動輸入 QR 識別碼。',
        'err'
      );
    }
  }
}

function chooseBestCamera(cameras){
  const scored=cameras.map(c=>{
    const label=String(c.label||'').toLowerCase();
    let score=0;

    if(/back|rear|environment|後置|背面/.test(label))score+=100;
    if(/main|camera 0|主/.test(label))score+=20;

    // 避免選到近距離較難對焦的超廣角/長焦鏡頭
    if(/ultra|ultrawide|超廣角/.test(label))score-=80;
    if(/tele|長焦/.test(label))score-=50;
    if(/front|user|前置/.test(label))score-=120;

    return {camera:c,score};
  });

  scored.sort((a,b)=>b.score-a.score);
  return scored[0].camera;
}

async function configureCamera(){
  if(!scanner)return;

  let focusApplied=false;

  try{
    cameraCaps=scanner.getRunningTrackCapabilities()||{};
  }catch(e){
    cameraCaps={};
  }

  // 連續自動對焦：支援才套用，不支援則略過
  try{
    const modes=Array.isArray(cameraCaps.focusMode)
      ? cameraCaps.focusMode
      : [];

    if(modes.includes('continuous')){
      await scanner.applyVideoConstraints({
        advanced:[{focusMode:'continuous'}]
      });
      focusApplied=true;
    }else if(modes.includes('single-shot')){
      await scanner.applyVideoConstraints({
        advanced:[{focusMode:'single-shot'}]
      });
      focusApplied=true;
    }
  }catch(e){}

  setupZoomButtons();
  setupTorchButton();

  // 若裝置可縮放，預設輕微放大到 1.3x，常可改善小型 QR 的可讀性
  const z=getZoomCapability();
  if(z && z.max>1.3){
    const desired=clamp(1.3,z.min,z.max);
    try{
      await applyZoom(desired);
    }catch(e){}
  }

  const settings=safeCameraSettings();

  if(focusApplied){
    $('cameraStatus').textContent=
      `連續自動對焦已啟用${settings.width?`｜${settings.width}×${settings.height}`:''}`;
  }else{
    $('cameraStatus').textContent=
      '相機已啟動｜此手機瀏覽器未提供可控制的對焦模式';
  }
}

function safeCameraSettings(){
  try{
    return scanner?.getRunningTrackSettings?.()||{};
  }catch(e){
    return {};
  }
}

function getZoomCapability(){
  const z=cameraCaps?.zoom;
  if(!z || typeof z!=='object')return null;

  const min=Number(z.min);
  const max=Number(z.max);
  const step=Number(z.step)||0.1;

  if(!Number.isFinite(min)||!Number.isFinite(max))return null;
  return {min,max,step};
}

function setupZoomButtons(){
  const z=getZoomCapability();
  const buttons=[
    ['zoom1Btn',1],
    ['zoom15Btn',1.5],
    ['zoom2Btn',2]
  ];

  buttons.forEach(([id,value])=>{
    const b=$(id);

    if(!z){
      b.disabled=true;
      return;
    }

    b.disabled=value<z.min || value>z.max;
  });
}

function setupTorchButton(){
  const supported=
    cameraCaps?.torch===true ||
    (Array.isArray(cameraCaps?.torch) && cameraCaps.torch.includes(true));

  $('torchBtn').classList.toggle('hidden',!supported);
}

async function refocusCamera(){
  if(!scanner)return;

  const b=$('refocusBtn');
  b.disabled=true;
  b.textContent='🎯 對焦中…';

  try{
    let modes=Array.isArray(cameraCaps?.focusMode)
      ? cameraCaps.focusMode
      : [];

    if(modes.includes('single-shot')){
      await scanner.applyVideoConstraints({
        advanced:[{focusMode:'single-shot'}]
      });

      await sleep(450);

      if(modes.includes('continuous')){
        await scanner.applyVideoConstraints({
          advanced:[{focusMode:'continuous'}]
        });
      }

      $('cameraStatus').textContent='已重新觸發自動對焦';
    }else if(modes.includes('continuous')){
      // 重新套用 continuous，部分 Android 裝置會觸發重新對焦
      await scanner.applyVideoConstraints({
        advanced:[{focusMode:'continuous'}]
      });
      $('cameraStatus').textContent='已重新要求連續自動對焦';
    }else{
      $('cameraStatus').textContent='此手機瀏覽器無法手動觸發對焦；請將 QR 拉遠至 20～35 公分再試';
    }
  }catch(e){
    $('cameraStatus').textContent='重新對焦不受此手機支援；請調整距離或使用放大';
  }finally{
    b.disabled=false;
    b.textContent='🎯 重新對焦';
  }
}

async function setCameraZoom(value){
  const z=getZoomCapability();

  if(!z){
    $('cameraStatus').textContent='此手機瀏覽器不支援相機縮放控制';
    return;
  }

  try{
    await applyZoom(clamp(value,z.min,z.max));
    $('cameraStatus').textContent=`相機縮放：${currentZoom.toFixed(1)}×`;

    document.querySelectorAll('.zoom-btn').forEach(b=>b.classList.remove('active'));

    const map={1:'zoom1Btn',1.5:'zoom15Btn',2:'zoom2Btn'};
    const id=map[value];
    if(id)$(id).classList.add('active');

  }catch(e){
    $('cameraStatus').textContent='此手機無法套用指定縮放倍率';
  }
}

async function applyZoom(value){
  await scanner.applyVideoConstraints({
    advanced:[{zoom:value}]
  });
  currentZoom=value;
}

async function toggleTorch(){
  if(!scanner)return;

  try{
    torchOn=!torchOn;

    await scanner.applyVideoConstraints({
      advanced:[{torch:torchOn}]
    });

    $('torchBtn').classList.toggle('active',torchOn);
    $('torchBtn').textContent=torchOn?'🔦 關閉補光':'🔦 補光';

  }catch(e){
    torchOn=false;
    $('torchBtn').classList.remove('active');
    $('torchBtn').textContent='🔦 補光';
    $('cameraStatus').textContent='此手機目前無法開啟補光燈';
  }
}

function clamp(v,min,max){
  return Math.max(min,Math.min(max,v));
}

function sleep(ms){
  return new Promise(r=>setTimeout(r,ms));
}

async function stopScanner(){
  torchOn=false;
  cameraCaps=null;

  if(scanner){
    try{
      if(scanner.isScanning){
        await scanner.stop();
      }
      scanner.clear();
    }catch(e){}
    scanner=null;
  }

  if($('reader'))$('reader').innerHTML='';
  if($('cameraControls'))$('cameraControls').classList.add('hidden');
}

function normalizeQr(text){
  text=String(text||'').trim();

  if(/^https?:\/\//i.test(text)){
    try{
      const u=new URL(text);
      return u.searchParams.get('qr')||text;
    }catch(e){}
  }

  return text;
}

async function processQr(raw){
  if(!currentStaff){
    scanBusy=false;
    return;
  }

  const qr=normalizeQr(raw);

  if(!qr){
    status('patrolMessage','請掃描或輸入 QR 識別碼。','warn');
    scanBusy=false;
    return;
  }

  status('patrolMessage','正在辨識巡查點…','info');

  try{
    const r=await apiCall('checkpoint',{qrCode:qr});
    const cp=r.checkpoint;

    $('pointCard').classList.remove('hidden');
    $('pointName').textContent=cp.checkpointName;
    $('pointCode').textContent=`${cp.checkpointId}｜${cp.qrCode}`;
    $('maxDistance').textContent=`${cp.maxDistanceMeters} 公尺`;

    status('patrolMessage','QR辨識成功，正在取得 GPS…','info');

    const gps=await getGps();
    $('gpsAccuracy').textContent=`約 ±${Math.round(gps.accuracy)} 公尺`;

    const result=await apiCall('checkin',{
      personId:currentStaff.personId,
      action:'巡查',
      qrCode:cp.qrCode,
      latitude:gps.latitude,
      longitude:gps.longitude
    });

    await stopScanner();
    showSuccessModal(result);
    status('patrolMessage','');

  }catch(e){
    const api=e.apiResponse;

    if(api&&api.duplicate){
      status('patrolMessage','⚠️ '+api.message,'warn');
      setTimeout(()=>{scanBusy=false;},2500);
      return;
    }

    status('patrolMessage',e.message,'err');
    setTimeout(()=>{scanBusy=false;},1800);
  }
}

function showSuccessModal(result){
  $('successPoint').textContent=result.checkpointName||'巡查點';
  $('successDistance').textContent=
    result.distanceMeters===null ||
    typeof result.distanceMeters==='undefined'
      ? ''
      : `GPS距離：約 ${result.distanceMeters} 公尺`;
  $('successTime').textContent=result.timestamp||'';

  try{
    window.scrollTo({top:0,left:0,behavior:'instant'});
  }catch(e){
    window.scrollTo(0,0);
  }

  document.documentElement.style.overflow='hidden';
  document.body.style.overflow='hidden';

  $('successModal').classList.remove('hidden');
  $('successModal').scrollTop=0;
}

function hideSuccessModal(){
  $('successModal').classList.add('hidden');
  document.documentElement.style.overflow='';
  document.body.style.overflow='';
}

function continuePatrol(){
  hideSuccessModal();
  $('pointCard').classList.add('hidden');
  $('manualQr').value='';
  status('patrolMessage','請掃描下一個巡查點。','info');
  scanBusy=false;
  startScanner();
}

async function openRecords(){
  showView('recordsView');
  await loadTodayRecords();
}

async function loadTodayRecords(){
  if(!currentStaff)return;

  status('recordsMessage','正在讀取今日巡查紀錄…','info');
  $('recordsList').innerHTML='';

  try{
    const r=await apiCall('todayRecords',{personId:currentStaff.personId});
    $('recordsDate').textContent=r.date||'今日';
    $('recordsCount').textContent=`${r.total||0} 筆`;
    renderRecords(r.records||[]);
    status('recordsMessage','');
  }catch(e){
    status('recordsMessage',e.message,'err');
  }
}

function renderRecords(records){
  const box=$('recordsList');

  if(!records.length){
    box.innerHTML='<div class="empty">今日尚無巡查紀錄。</div>';
    return;
  }

  box.innerHTML=records.map(r=>`
    <div class="record-item">
      <div class="record-top">
        <div>
          <h3>${esc(r.checkpointName||r.checkpointId||'巡查點')}</h3>
          <div class="eyebrow">${esc(r.checkpointId||'')}</div>
        </div>
        <div class="record-time">${esc(r.time||'')}</div>
      </div>
      <div class="record-meta">
        <span class="chip">距離 ${esc(r.distanceMeters||'—')} 公尺</span>
        <span class="chip">${esc(r.result||'通過')}</span>
      </div>
    </div>
  `).join('');
}
