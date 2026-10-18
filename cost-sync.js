'use strict';
(()=>{
  const M=JejuCostModel,byId=id=>document.getElementById(id),storageKey='jeju-20261024-cost-sync-v1',backupKey='jeju-20261024-cost-backups-v1';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const random=()=>crypto.randomUUID().replace(/-/g,'');
  function validConfig(value){
    if(!value||typeof value.endpoint!=='string'||typeof value.room!=='string'||typeof value.key!=='string')throw new Error('INVALID_SHARE_LINK');
    const url=new URL(value.endpoint);
    if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url.pathname)||url.username||url.password||url.port||url.search||url.hash||!/^[a-f0-9]{32}$/.test(value.room)||!/^[a-f0-9]{64}$/.test(value.key))throw new Error('INVALID_SHARE_LINK');
    return {endpoint:url.href,room:value.room,key:value.key};
  }
  function encode(config){const bytes=new TextEncoder().encode(JSON.stringify(validConfig(config)));let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
  function decode(text){
    if(typeof text!=='string'||text.length>2000||!/^[a-zA-Z0-9_-]+$/.test(text))throw new Error('INVALID_SHARE_LINK');
    try{const raw=atob(text.replace(/-/g,'+').replace(/_/g,'/'));return validConfig(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(raw,c=>c.charCodeAt(0)))));}catch{throw new Error('INVALID_SHARE_LINK');}
  }
  function fromLink(value){
    try{const url=new URL(value.trim());if(url.origin!==location.origin||url.pathname!==location.pathname||!url.hash.startsWith('#costshare='))throw new Error();return decode(url.hash.slice(11));}catch{throw new Error('INVALID_SHARE_LINK');}
  }
  function shareLink(config){const url=new URL(location.href);url.searchParams.delete('wishlist');url.hash='costshare='+encode(config);return url.href;}
  const transport={
    // JSONP runs in an opaque sandbox, never with access to the website's DOM or storage.
    read(config){return new Promise((resolve,reject)=>{
      const nonce=random(),callback='__jejuCosts'+nonce,url=new URL(config.endpoint);url.search=new URLSearchParams({action:'costRead',room:config.room,key:config.key,callback,nonce}).toString();
      const frame=document.createElement('iframe');frame.hidden=true;frame.sandbox='allow-scripts';frame.referrerPolicy='no-referrer';
      let timer;
      const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',receive);frame.remove();};
      const receive=event=>{if(event.source!==frame.contentWindow||event.origin!=='null'||event.data?.channel!=='jeju-cost-read'||event.data.nonce!==nonce)return;cleanup();event.data.failed?reject(new Error('COSTS_CONNECTION_FAILED')):resolve(event.data.value);};
      window.addEventListener('message',receive);timer=setTimeout(()=>{cleanup();reject(new Error('COSTS_TIMEOUT'));},20000);
      frame.srcdoc='<!doctype html><meta name="referrer" content="no-referrer"><script>function '+callback+'(value){parent.postMessage({channel:"jeju-cost-read",nonce:'+JSON.stringify(nonce)+',value:value},'+JSON.stringify(location.origin)+');}function failed(){parent.postMessage({channel:"jeju-cost-read",nonce:'+JSON.stringify(nonce)+',failed:true},'+JSON.stringify(location.origin)+');}</script><script src="'+esc(url.href)+'" onerror="failed()"></script>';
      document.body.append(frame);
    });},
    async write(config,job){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
      try{await fetch(config.endpoint,{method:'POST',mode:'no-cors',credentials:'omit',referrerPolicy:'no-referrer',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({action:'costWrite',room:config.room,key:config.key,writeId:job.id,expectedRevision:job.expectedRevision,data:job.snapshot}),signal:controller.signal});}
      finally{clearTimeout(timer);}
      // An opaque POST is never treated as success: the client verifies its write ID by reading.
    }
  };
  const store={
    load(){try{const meta=JSON.parse(localStorage.getItem(storageKey)||'null');if(!meta)return null;meta.config=validConfig(meta.config);if(meta.base)meta.base=M.normalize(meta.base);if(meta.inflight)meta.inflight.snapshot=M.normalize(meta.inflight.snapshot);if(!Number.isSafeInteger(meta.revision)||meta.revision<0)return null;return meta;}catch{return null;}},
    save(meta){if(meta)localStorage.setItem(storageKey,JSON.stringify(meta));else localStorage.removeItem(storageKey);},
    backup(entry){let entries=[];try{entries=JSON.parse(localStorage.getItem(backupKey)||'[]');}catch{}if(!Array.isArray(entries))entries=[];entries.push(entry);localStorage.setItem(backupKey,JSON.stringify(entries.slice(-10)));}
  };
  let client,pollTimer,saveTimer,actionSignature='';
  const money=n=>'NT$'+Math.round(n).toLocaleString('zh-TW');
  function summary(snapshot){return snapshot.customExpenses.length+'個自訂項目；已填小計 '+money(snapshot.customExpenses.reduce((sum,row)=>sum+(Number(row.amount)||0),0));}
  function time(value){try{return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value));}catch{return '';}}
  const labels={fare:'機票比較','car-model':'租車比較',days:'比較日數',rate:'韓元匯率',insurance:'比較CDW',extras:'油資／停車／交通','cost-hotel':'住宿比較','cost-hotel-custom':'住宿自訂總額','cost-esim':'上網方案','cost-esim-count':'eSIM張數','cost-esim-custom':'上網自訂總額','cost-usd':'美元匯率','cost-jpy':'日圓匯率'};
  function conflictValue(c,side){const value=c[side];if(value===undefined)return '已刪除';if(value&&typeof value==='object')return value.name+'／'+(value.amount===''?'待填':money(Number(value.amount)));if(value==='')return '待填';const el=byId(c.field);if(el?.tagName==='SELECT')return [...el.options].find(o=>o.value===value)?.textContent||value;return String(value);}
  function render(state){
    const messages={local:'目前只保存在這個瀏覽器。每台先加入同一個共用連結，之後便會自動同步。',syncing:'正在核對共用資料；這台原本的花費仍保留。',empty:'共用花費尚未建立。請先在有完整紀錄的電腦，用下方按鈕建立起始資料。',join:'共用已有資料。套用前會保留這台原本的備份，請選擇開啟或合併。',synced:'已同步'+(state.updatedAt?'・'+time(state.updatedAt)+'（台灣時間）':'')+'。另一台加入相同共用連結後，也能讀到這份資料。',pending:'這台有待同步的修改，會自動核對並儲存。',editing:'旅伴有新修改；離開正在輸入的欄位後，會自動合併並同步。',offline:'目前離線。修改先留在這台，恢復連線後會繼續同步。',conflict:'兩台同時修改了相同內容，請選擇衝突欄位要用哪一份；其他修改會保留。'};
    const errors={INVALID_SHARE_LINK:'共用連結格式不正確，請貼上旅伴提供的完整連結。',LOCAL_STORAGE_UNAVAILABLE:'瀏覽器無法保存本機備份與連線設定，尚未完成共用；請先下載備份並允許網站儲存資料。',COSTS_UNAUTHORIZED:'共用連結已失效，請使用最新的共用連結。',COSTS_TIMEOUT:'共用服務尚未回應。請確認已完成一次性部署設定，或稍後按「立即同步」重試。',INVALID_AMOUNT:'請先修正無效的花費金額，原資料仍在這台。',TOO_MANY_EXPENSES:'自訂費用超過200項，請先減少項目再同步。',UNSUPPORTED_PLAN:'共用資料包含這個版本不認識的方案，請重新整理到最新版後重試。',COSTS_SHARED_DATA_MISSING:'共用資料目前找不到，這台紀錄已保留；請先確認共用服務，勿重建覆蓋。',COSTS_WRITE_NOT_VERIFIED:'尚未確認雲端已儲存，修改仍保留在這台，稍後會自動再核對。'};
    byId('cost-sync-status').textContent=state.phase==='error'?(errors[state.error]||'連線尚未完成，這台的修改仍保留，稍後會自動重試。'):(messages[state.phase]||messages.local);
    byId('cost-sync-panel').dataset.state=state.phase;byId('cost-sync-panel').dataset.error=state.error||'';
    byId('cost-sync-connected-actions').hidden=!state.connected;
    byId('cost-sync-join-details').open=!state.connected;
    byId('cost-sync-connect').disabled=state.phase==='syncing';
    const signature=JSON.stringify({phase:state.phase,remote:state.remote?.data,local:state.local,conflicts:state.conflicts});
    if(signature===actionSignature)return;actionSignature=signature;
    let html='';
    if(state.phase==='empty')html='<p>請先用這台現有的完整花費建立共用資料，另一台之後選「開啟共用花費」。</p><button type="button" data-cost-choice="local">用這台的花費建立共用資料</button>';
    if(state.phase==='join')html='<div class="cost-sync-comparison"><p><strong>這台目前</strong><br>'+esc(summary(state.local))+'</p><p><strong>共用資料</strong><br>'+esc(summary(state.remote.data))+'</p></div><div class="cost-sync-buttons"><button type="button" data-cost-choice="remote">開啟共用花費・保留這台備份</button><button type="button" data-cost-choice="merge">合併這台已有的花費</button></div>';
    if(state.phase==='conflict')html='<h4>需要處理的同時修改</h4><div class="cost-table-scroll"><table class="cost-table"><thead><tr><th>項目</th><th>這台內容</th><th>共用內容</th></tr></thead><tbody>'+state.conflicts.map(c=>'<tr><td>'+esc(c.kind==='field'?(labels[c.field]||c.label):c.label)+'</td><td>'+esc(conflictValue(c,'local'))+'</td><td>'+esc(conflictValue(c,'remote'))+'</td></tr>').join('')+'</tbody></table></div><div class="cost-sync-buttons"><button type="button" data-cost-resolve="local">衝突欄位保留這台內容</button><button type="button" data-cost-resolve="remote">衝突欄位使用共用內容</button></div>';
    byId('cost-sync-decisions').innerHTML=html;
  }
  function editing(){const el=document.activeElement;return el?.tagName==='INPUT'&&(el.matches('#cost-extra-rows input')||M.fields.includes(el.id));}
  function schedulePoll(){clearTimeout(pollTimer);if(!client.getConfig())return;pollTimer=setTimeout(()=>{if(!document.hidden)run();else schedulePoll();},byId('estimated-costs').hidden?45000:15000);}
  async function run(){clearTimeout(saveTimer);await client.sync();schedulePoll();}
  function download(){
    let previous=[];try{previous=JSON.parse(localStorage.getItem(backupKey)||'[]');}catch{}
    const data={type:'jeju-budget-backup',version:1,createdAt:new Date().toISOString(),current:window.JejuCostsAdapter.get(),previous};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='濟州島花費備份.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    byId('cost-sync-message').textContent='已產生本機花費備份，包含加入共用前保留的紀錄；不含共用連線金鑰。';
  }
  function start(){
    client=JejuCostClient.create({adapter:window.JejuCostsAdapter,transport,store,onState:render,isEditing:editing,isOnline:()=>navigator.onLine});
    byId('cost-sync-form').addEventListener('submit',async event=>{event.preventDefault();try{const config=fromLink(byId('cost-sync-link').value);byId('cost-sync-link').value='';await client.connect(config);schedulePoll();}catch(e){render({phase:'error',error:e.message,connected:!!client.getConfig()});}});
    byId('cost-sync-panel').addEventListener('click',async event=>{const choice=event.target.closest('[data-cost-choice]'),resolution=event.target.closest('[data-cost-resolve]');if(choice)await client.choose(choice.dataset.costChoice);if(resolution)await client.resolve(resolution.dataset.costResolve);if(choice||resolution)schedulePoll();});
    byId('cost-sync-now').addEventListener('click',run);
    byId('cost-sync-backup').addEventListener('click',download);
    byId('cost-sync-stop').addEventListener('click',()=>{clearTimeout(pollTimer);clearTimeout(saveTimer);client.leave();});
    byId('cost-sync-copy').addEventListener('click',async()=>{try{const config=client.getConfig();if(!config)return;await navigator.clipboard.writeText(shareLink(config));byId('cost-sync-message').textContent='共用連結已複製。只傳給旅伴；每台第一次開啟加入後，後續修改會自動同步。';}catch{byId('cost-sync-message').textContent='瀏覽器不允許複製，請允許剪貼簿後再試。';}});
    document.addEventListener('jeju-costs-local-change',()=>{client.changed();clearTimeout(saveTimer);if(client.getConfig()&&!['empty','join'].includes(client.getPhase()))saveTimer=setTimeout(run,1000);});
    document.addEventListener('focusout',event=>{if(event.target.matches('#cost-extra-rows input')||M.fields.includes(event.target.id)){clearTimeout(saveTimer);saveTimer=setTimeout(run,150);}});
    window.addEventListener('online',run);window.addEventListener('offline',()=>client.sync());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)run();});window.addEventListener('focus',run);
    window.addEventListener('storage',event=>{if(event.key==='jeju-20261024-costs-v1'&&client.getConfig()){byId('cost-sync-message').textContent='偵測到同一瀏覽器另一分頁的花費修改，請讓原分頁完成同步；此分頁會核對共用資料。';run();}});
    if(location.hash.startsWith('#costshare=')){
      let config,error;try{config=decode(location.hash.slice(11));}catch(e){error=e;}
      const clean=new URL(location.href);clean.hash='estimated-costs';history.replaceState(null,'',clean);window.dispatchEvent(new HashChangeEvent('hashchange'));
      if(error)render({phase:'error',error:error.message,connected:!!client.getConfig()});else client.connect(config).then(schedulePoll);
    }else run();
  }
  if(window.JejuCostsAdapter)start();else document.addEventListener('jeju-costs-ready',start,{once:true});
})();
