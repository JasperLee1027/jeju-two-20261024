/** Shared budgets use their own keys; they never accept the Doc token in a browser. */
const JEJU_COST_PREFIX='JEJU_COSTS_ROOM_';
const JEJU_COST_DATA='JEJU_COSTS_DATA_';

function jejuCostsSetup_(props,probe) {
  let room=probe?null:props.getProperty('JEJU_COSTS_MAIN_ROOM');
  if(room){const existing=jejuCostsMeta_(props,room);return {ok:true,service:'jeju-shared-costs',room:room,key:existing.key,existing:true};}
  room=Utilities.getUuid().replace(/-/g,'');
  const key=(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,'');
  props.setProperty(JEJU_COST_PREFIX+room,JSON.stringify({key:key,probe:!!probe,revision:0,chunks:0,previousRevision:null,previousChunks:0,updatedAt:null,writes:[]}));
  if(!probe)props.setProperty('JEJU_COSTS_MAIN_ROOM',room);
  return {ok:true,service:'jeju-shared-costs',room:room,key:key,existing:false};
}
function jejuCostsMeta_(props,room){
  if(typeof room!=='string'||!/^[a-f0-9]{32}$/.test(room))throw new Error('COSTS_UNAUTHORIZED');
  const raw=props.getProperty(JEJU_COST_PREFIX+room);if(!raw)throw new Error('COSTS_UNAUTHORIZED');return JSON.parse(raw);
}
function jejuCostsAuthorized_(given,expected){
  if(typeof given!=='string'||given.length!==expected.length)return false;
  let diff=0;for(let i=0;i<expected.length;i++)diff|=given.charCodeAt(i)^expected.charCodeAt(i);return diff===0;
}
function jejuCostsState_(props,room,meta){
  let data=null;
  if(meta.chunks){let text='';for(let n=0;n<meta.chunks;n++){const chunk=props.getProperty(JEJU_COST_DATA+room+'_'+meta.revision+'_'+n);if(chunk===null)throw new Error('COSTS_STORAGE_INCOMPLETE');text+=chunk;}data=JejuCostModel.normalize(JSON.parse(text));}
  return {ok:true,service:'jeju-shared-costs',version:1,revision:meta.revision,updatedAt:meta.updatedAt,data:data,writes:meta.writes};
}
function jejuCostsRequest_(request){
  let lock;
  try{
    const props=PropertiesService.getScriptProperties();let meta=jejuCostsMeta_(props,request.room);
    if(!jejuCostsAuthorized_(request.key,meta.key))throw new Error('COSTS_UNAUTHORIZED');
    if(!['costRead','costWrite'].includes(request.action))throw new Error('COSTS_UNKNOWN_ACTION');
    lock=LockService.getScriptLock();lock.waitLock(15000);meta=jejuCostsMeta_(props,request.room);
    if(request.action==='costRead')return jejuCostsState_(props,request.room,meta);
    if(typeof request.writeId!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(request.writeId))throw new Error('COSTS_INVALID_WRITE');
    // An acknowledged retry never overwrites a later partner edit.
    if(meta.writes.some(w=>w.id===request.writeId))return jejuCostsState_(props,request.room,meta);
    if(!Number.isSafeInteger(request.expectedRevision)||request.expectedRevision!==meta.revision)return {ok:false,error:'COSTS_CONFLICT',revision:meta.revision};
    const data=JejuCostModel.normalize(request.data),text=JSON.stringify(data);
    if(Utilities.newBlob(text).getBytes().length>65000)throw new Error('COSTS_TOO_LARGE');
    const revision=meta.revision+1,chunkSize=1200,characters=Array.from(text),chunks=Math.ceil(characters.length/chunkSize),values={};
    for(let n=0;n<chunks;n++)values[JEJU_COST_DATA+request.room+'_'+revision+'_'+n]=characters.slice(n*chunkSize,(n+1)*chunkSize).join('');
    // Commit a new generation first, then atomically move the small metadata pointer.
    props.setProperties(values);
    const next={key:meta.key,probe:meta.probe,revision:revision,chunks:chunks,previousRevision:meta.revision,previousChunks:meta.chunks,updatedAt:new Date().toISOString(),writes:meta.writes.concat([{id:request.writeId,revision:revision}]).slice(-16)};
    props.setProperty(JEJU_COST_PREFIX+request.room,JSON.stringify(next));
    // Keep one previous generation; cleanup failure must not invalidate a committed write.
    try{if(meta.previousRevision!==null)for(let n=0;n<meta.previousChunks;n++)props.deleteProperty(JEJU_COST_DATA+request.room+'_'+meta.previousRevision+'_'+n);}catch(_){}
    return jejuCostsState_(props,request.room,next);
  }catch(error){const code=String(error&&error.message||'COSTS_REQUEST_FAILED');return {ok:false,error:/^[A-Z_]+$/.test(code)?code:'COSTS_REQUEST_FAILED'};}
  finally{if(lock&&lock.hasLock())lock.releaseLock();}
}
function jejuCostsGet_(e){
  const p=e&&e.parameter||{},result=jejuCostsRequest_({action:'costRead',room:p.room,key:p.key});
  if(typeof p.callback==='string'&&/^__jejuCosts[a-zA-Z0-9_]{1,100}$/.test(p.callback))return ContentService.createTextOutput(p.callback+'('+JSON.stringify(result).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')+');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
function jejuCostsRemoveProbe_(props,room){
  const meta=jejuCostsMeta_(props,room);if(!meta.probe||props.getProperty('JEJU_COSTS_MAIN_ROOM')===room)throw new Error('COSTS_NOT_A_PROBE');
  const prefix=JEJU_COST_DATA+room+'_';Object.keys(props.getProperties()).filter(k=>k.indexOf(prefix)===0).forEach(k=>props.deleteProperty(k));props.deleteProperty(JEJU_COST_PREFIX+room);return {ok:true,removed:true};
}
