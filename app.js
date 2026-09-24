
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
  $('incidentBtn').addEventListener('click',openIncident);
  $('incidentBackBtn').addEventListener('click',()=>showView('mainView'));
  $('refreshIncidentsBtn').addEventListener('click',loadTodayIncidents);
  $('submitIncidentBtn').addEventListener('click',submitIncident);
  $('incidentPhoto').addEventListener('change',handleIncidentPhotoChange);
  $('removePhotoBtn').addEventListener('click',clearIncidentPhoto);
  $('incidentDoneBtn').addEventListener('click',()=>{
    hideIncidentSuccess();
    showView('mainView');
  });
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

  checkApi();

  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  }
});

function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");}
function status(id,msg,type='info'){$(id).innerHTML=msg?`<div class="status ${type}">${esc(msg)}</div>`:'';}

function showView(id){
  ['mainView','patrolView','recordsView','incidentView'].forEach(v=>$(v).classList.add('hidden'));
  $(id).classList.remove('hidden');
  if(id!=='patrolView')stopScanner();
}

function apiCall(action,payload={}){
  return new Promise((resolve,reject)=>{
    const requestId='r_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const frame='f_'+requestId;
    const iframe=document.createElement('iframe');
    iframe.name=frame; iframe.style.display='none';
    const form=document.createElement('form');
    form.method='POST'; form.action=API_URL; form.target=frame; form.style.display='none';

    for(const [name,value] of Object.entries({requestId,action,payload:JSON.stringify(payload)})){
      const input=document.createElement('input');
      input.type='hidden'; input.name=name; input.value=value; form.appendChild(input);
    }

    let done=false;
    const cleanup=()=>{
      if(done)return;
      done=true;
      window.removeEventListener('message',onMessage);
      clearTimeout(timer);
      setTimeout(()=>{try{form.remove()}catch(e){} try{iframe.remove()}catch(e){}},50);
    };

    const onMessage=e=>{
      const d=e.data;
      if(!d||d.source!=='ksp-api'||d.requestId!==requestId)return;
      cleanup();
      if(d.response&&d.response.ok)resolve(d.response);
      else{
        const err=new Error(d.response?.message||'API執行失敗');
        err.apiResponse=d.response;
        reject(err);
      }
    };

    window.addEventListener('message',onMessage);

    const timer=setTimeout(()=>{
      cleanup();
      reject(new Error('API連線逾時。'));
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
  ['mainView','patrolView','recordsView','incidentView'].forEach(id=>$(id).classList.add('hidden'));
  $('loginView').classList.remove('hidden');
}

function getGps(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation){
      reject(new Error('此裝置不支援 GPS。'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy}),
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
  $('cameraStatus').textContent='正在開啟後置鏡頭…';
  $('cameraControls').classList.add('hidden');
  startScanner();
}

function qrBoxSize(w,h){
  const size=Math.floor(Math.min(w,h)*0.72);
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

  scanner=new Html5Qrcode('reader',{
    formatsToSupport:[Html5QrcodeSupportedFormats.QR_CODE],
    useBarCodeDetectorIfSupported:true
  });

  const scanConfig={
    fps:15,
    qrbox:qrBoxSize,
    disableFlip:true
  };

  const onScan=text=>{
    if(scanBusy)return;
    scanBusy=true;
    processQr(text);
  };

  // 第9步沿用目前成功設定：只啟動後置鏡頭。
  try{
    await scanner.start(
      {facingMode:{exact:'environment'}},
      scanConfig,
      onScan,
      ()=>{}
    );

    if(!(await verifyRearCamera())){
      throw new Error('偵測到前置鏡頭');
    }

    $('cameraStatus').textContent='後置鏡頭已啟動';
    $('cameraControls').classList.remove('hidden');
    await configureCamera();
    return;

  }catch(e){
    try{await stopScanner();}catch(x){}
  }

  try{
    scanner=new Html5Qrcode('reader',{
      formatsToSupport:[Html5QrcodeSupportedFormats.QR_CODE],
      useBarCodeDetectorIfSupported:true
    });

    await scanner.start(
      {facingMode:'environment'},
      scanConfig,
      onScan,
      ()=>{}
    );

    if(!(await verifyRearCamera())){
      throw new Error('偵測到前置鏡頭');
    }

    $('cameraStatus').textContent='後置鏡頭已啟動';
    $('cameraControls').classList.remove('hidden');
    await configureCamera();
    return;

  }catch(e){
    try{await stopScanner();}catch(x){}
  }

  // 只有標籤明確為後置鏡頭才採用；不猜測、不退回前置。
  try{
    const cameras=await Html5Qrcode.getCameras();

    const rear=cameras.find(c=>{
      const label=String(c.label||'').toLowerCase();

      return (
        /back|rear|environment|後置|背面|後鏡/.test(label) &&
        !/front|user|facetime|前置|自拍/.test(label)
      );
    });

    if(!rear){
      throw new Error('找不到可辨識的後置鏡頭');
    }

    scanner=new Html5Qrcode('reader',{
      formatsToSupport:[Html5QrcodeSupportedFormats.QR_CODE],
      useBarCodeDetectorIfSupported:true
    });

    await scanner.start(
      rear.id,
      scanConfig,
      onScan,
      ()=>{}
    );

    if(!(await verifyRearCamera())){
      throw new Error('偵測到前置鏡頭');
    }

    $('cameraStatus').textContent=
      `後置鏡頭已啟動${rear.label?'｜'+rear.label:''}`;

    $('cameraControls').classList.remove('hidden');
    await configureCamera();

  }catch(e){
    try{await stopScanner();}catch(x){}

    $('cameraStatus').textContent='後置鏡頭無法啟動';

    status(
      'patrolMessage',
      '無法啟動後置鏡頭。系統不會切換到前置鏡頭。請確認網站相機權限後再試。',
      'err'
    );
  }
}

async function verifyRearCamera(){
  try{
    const settings=
      scanner?.getRunningTrackSettings?.()||{};

    // 若瀏覽器明確回報 user，即為前鏡頭，拒絕。
    if(settings.facingMode==='user'){
      return false;
    }

    // environment 或未提供 facingMode 時，
    // 已由 environment 條件／明確後鏡頭ID啟動，可接受。
    return true;

  }catch(e){
    return true;
  }
}

async function configureCamera(){
  if(!scanner)return;

  try{
    cameraCaps=scanner.getRunningTrackCapabilities?.()||{};
  }catch(e){
    cameraCaps={};
  }

  try{
    const modes=Array.isArray(cameraCaps.focusMode)?cameraCaps.focusMode:[];

    if(modes.includes('continuous')){
      await scanner.applyVideoConstraints({
        advanced:[{focusMode:'continuous'}]
      });
      $('cameraStatus').textContent+='｜連續對焦';
    }
  }catch(e){}

  setupZoomButtons();
  setupTorchButton();
}

function getZoomCapability(){
  const z=cameraCaps?.zoom;
  if(!z||typeof z!=='object')return null;

  const min=Number(z.min),max=Number(z.max);
  if(!Number.isFinite(min)||!Number.isFinite(max))return null;

  return {min,max};
}

function setupZoomButtons(){
  const z=getZoomCapability();

  [['zoom1Btn',1],['zoom15Btn',1.5],['zoom2Btn',2]].forEach(([id,v])=>{
    const b=$(id);
    b.disabled=!z || v<z.min || v>z.max;
  });
}

function setupTorchButton(){
  const supported=
    cameraCaps?.torch===true ||
    (Array.isArray(cameraCaps?.torch)&&cameraCaps.torch.includes(true));

  $('torchBtn').classList.toggle('hidden',!supported);
}

async function refocusCamera(){
  if(!scanner)return;

  const btn=$('refocusBtn');
  btn.disabled=true;
  btn.textContent='🎯 對焦中…';

  try{
    const modes=Array.isArray(cameraCaps?.focusMode)?cameraCaps.focusMode:[];

    if(modes.includes('single-shot')){
      await scanner.applyVideoConstraints({advanced:[{focusMode:'single-shot'}]});
      await new Promise(r=>setTimeout(r,450));
    }

    if(modes.includes('continuous')){
      await scanner.applyVideoConstraints({advanced:[{focusMode:'continuous'}]});
      $('cameraStatus').textContent='已重新要求後鏡頭自動對焦';
    }else{
      $('cameraStatus').textContent='此手機瀏覽器不支援手動控制對焦';
    }
  }catch(e){
    $('cameraStatus').textContent='此手機目前無法手動重新對焦';
  }finally{
    btn.disabled=false;
    btn.textContent='🎯 重新對焦';
  }
}

async function setCameraZoom(value){
  const z=getZoomCapability();
  if(!z){
    $('cameraStatus').textContent='此手機不支援相機縮放控制';
    return;
  }

  try{
    const actual=Math.max(z.min,Math.min(z.max,value));

    await scanner.applyVideoConstraints({
      advanced:[{zoom:actual}]
    });

    currentZoom=actual;
    $('cameraStatus').textContent=`後置鏡頭縮放：${actual.toFixed(1)}×`;

    document.querySelectorAll('.zoom-btn').forEach(b=>b.classList.remove('active'));
    const map={1:'zoom1Btn',1.5:'zoom15Btn',2:'zoom2Btn'};
    if(map[value])$(map[value]).classList.add('active');

  }catch(e){
    $('cameraStatus').textContent='此手機無法套用指定縮放倍率';
  }
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
  }
}

async function stopScanner(){
  torchOn=false;
  cameraCaps=null;

  if(scanner){
    try{
      if(scanner.isScanning)await scanner.stop();
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
    result.distanceMeters===null||typeof result.distanceMeters==='undefined'
      ? ''
      : `GPS距離：約 ${result.distanceMeters} 公尺`;
  $('successTime').textContent=result.timestamp||'';

  document.documentElement.style.overflow='hidden';
  document.body.style.overflow='hidden';
  $('successModal').classList.remove('hidden');
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


let incidentPhotoDataUrl='';

async function openIncident(){
  showView('incidentView');

  status(
    'incidentMessage',
    ''
  );

  clearIncidentForm();

  await Promise.all([
    loadIncidentCheckpoints(),
    loadTodayIncidents()
  ]);
}


async function loadIncidentCheckpoints(){
  const select=
    $('incidentCheckpoint');

  select.innerHTML=
    '<option value="">請選擇（可不選）</option>';

  try{
    const r=
      await apiCall(
        'checkpoints',
        {}
      );

    for(
      const cp of
      (r.checkpoints||[])
    ){
      const option=
        document.createElement(
          'option'
        );

      option.value=
        cp.checkpointName ||
        cp.checkpointId;

      option.textContent=
        `${cp.checkpointId}｜${cp.checkpointName}`;

      select.appendChild(
        option
      );
    }

  }catch(e){
    status(
      'incidentMessage',
      '巡查點清單讀取失敗，可不選巡查點直接回報。',
      'warn'
    );
  }
}


function handleIncidentPhotoChange(e){
  const file=
    e.target.files &&
    e.target.files[0];

  if(!file){
    clearIncidentPhoto();
    return;
  }

  if(
    !file.type.startsWith(
      'image/'
    )
  ){
    status(
      'incidentMessage',
      '請選擇照片檔案。',
      'warn'
    );

    clearIncidentPhoto();
    return;
  }

  const reader=
    new FileReader();

  reader.onload=()=>{
    $('photoPreview').src=
      reader.result;

    $('photoPreviewWrap')
      .classList
      .remove('hidden');
  };

  reader.readAsDataURL(
    file
  );
}


function clearIncidentPhoto(){
  incidentPhotoDataUrl='';

  $('incidentPhoto').value=
    '';

  $('photoPreview').src=
    '';

  $('photoPreviewWrap')
    .classList
    .add('hidden');
}


function clearIncidentForm(){
  $('incidentCheckpoint').value=
    '';

  $('incidentType').value=
    '';

  $('incidentDescription').value=
    '';

  clearIncidentPhoto();
}


async function compressIncidentPhoto(file){
  if(!file){
    return '';
  }

  const bitmap=
    await loadImageFile(file);

  const maxSide=1280;

  let width=
    bitmap.width;

  let height=
    bitmap.height;

  const scale=
    Math.min(
      1,
      maxSide /
      Math.max(
        width,
        height
      )
    );

  width=
    Math.round(
      width *
      scale
    );

  height=
    Math.round(
      height *
      scale
    );

  const canvas=
    document.createElement(
      'canvas'
    );

  canvas.width=
    width;

  canvas.height=
    height;

  const ctx=
    canvas.getContext(
      '2d'
    );

  ctx.drawImage(
    bitmap,
    0,
    0,
    width,
    height
  );

  return canvas.toDataURL(
    'image/jpeg',
    0.68
  );
}


function loadImageFile(file){
  return new Promise(
    (resolve,reject)=>{
      const reader=
        new FileReader();

      reader.onerror=()=>{
        reject(
          new Error(
            '照片讀取失敗。'
          )
        );
      };

      reader.onload=()=>{
        const img=
          new Image();

        img.onerror=()=>{
          reject(
            new Error(
              '照片格式無法處理。'
            )
          );
        };

        img.onload=()=>{
          resolve(img);
        };

        img.src=
          reader.result;
      };

      reader.readAsDataURL(
        file
      );
    }
  );
}


async function submitIncident(){
  if(!currentStaff){
    return;
  }

  const incidentType=
    $('incidentType')
      .value
      .trim();

  const description=
    $('incidentDescription')
      .value
      .trim();

  const checkpoint=
    $('incidentCheckpoint')
      .value
      .trim();

  if(!incidentType){
    status(
      'incidentMessage',
      '請選擇異常類型。',
      'warn'
    );
    return;
  }

  if(!description){
    status(
      'incidentMessage',
      '請填寫異常說明。',
      'warn'
    );
    return;
  }

  const btn=
    $('submitIncidentBtn');

  btn.disabled=
    true;

  btn.textContent=
    '異常回報送出中…';

  try{
    status(
      'incidentMessage',
      '正在取得 GPS 位置…',
      'info'
    );

    const gps=
      await getGps();

    const file=
      $('incidentPhoto')
        .files &&
      $('incidentPhoto')
        .files[0];

    let photoDataUrl='';

    if(file){
      status(
        'incidentMessage',
        '正在壓縮現場照片…',
        'info'
      );

      photoDataUrl=
        await compressIncidentPhoto(
          file
        );
    }

    status(
      'incidentMessage',
      '正在送出異常事件…',
      'info'
    );

    const r=
      await apiCall(
        'incidentSubmit',
        {
          personId:
            currentStaff.personId,

          checkpoint:
            checkpoint,

          incidentType:
            incidentType,

          description:
            description,

          latitude:
            gps.latitude,

          longitude:
            gps.longitude,

          photoDataUrl:
            photoDataUrl
        }
      );

    $('incidentSuccessType')
      .textContent=
      r.incidentType ||
      incidentType;

    $('incidentSuccessId')
      .textContent=
      `事件編號：${r.eventId}`;

    $('incidentSuccessTime')
      .textContent=
      r.timestamp ||
      '';

    document
      .documentElement
      .style
      .overflow=
      'hidden';

    document
      .body
      .style
      .overflow=
      'hidden';

    $('incidentSuccessModal')
      .classList
      .remove('hidden');

    clearIncidentForm();

    await loadTodayIncidents();

    status(
      'incidentMessage',
      '',
      'ok'
    );

  }catch(e){
    status(
      'incidentMessage',
      e.message,
      'err'
    );

  }finally{
    btn.disabled=
      false;

    btn.textContent=
      '送出異常回報';
  }
}


function hideIncidentSuccess(){
  $('incidentSuccessModal')
    .classList
    .add('hidden');

  document
    .documentElement
    .style
    .overflow=
    '';

  document
    .body
    .style
    .overflow=
    '';
}


async function loadTodayIncidents(){
  if(!currentStaff){
    return;
  }

  const box=
    $('incidentList');

  box.innerHTML=
    '<div class="empty">讀取中…</div>';

  try{
    const r=
      await apiCall(
        'todayIncidents',
        {
          personId:
            currentStaff.personId
        }
      );

    renderIncidentList(
      r.incidents ||
      []
    );

  }catch(e){
    box.innerHTML=
      `<div class="empty">${esc(e.message)}</div>`;
  }
}


function renderIncidentList(items){
  const box=
    $('incidentList');

  if(!items.length){
    box.innerHTML=
      '<div class="empty">今日尚無異常回報。</div>';
    return;
  }

  box.innerHTML=
    items.map(
      x=>`
        <div class="incident-item">
          <div class="record-top">
            <div>
              <div class="incident-type">${esc(x.incidentType||'異常事件')}</div>
              <div class="eyebrow">${esc(x.checkpoint||'未指定位置')}</div>
            </div>
            <div class="record-time">${esc((x.dateTime||'').split(' ')[1]||'')}</div>
          </div>

          <div class="incident-desc">${esc(x.description||'')}</div>

          <span class="incident-status">${esc(x.status||'待處理')}</span>
        </div>
      `
    ).join('');
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
