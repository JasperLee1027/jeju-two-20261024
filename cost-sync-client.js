/* Acknowledged writes, offline recovery and optimistic concurrency for shared costs. */
'use strict';
var JejuCostClient=(()=>{
  const M=typeof module!=='undefined'&&module.exports?require('./cost-sync-model.js'):JejuCostModel;
  function create(options){
    const {adapter,transport,store,onState}=options;
    const editing=options.isEditing||(()=>false),uid=options.uid||(()=>crypto.randomUUID().replace(/-/g,''));
    let meta=store.load(),pending=null,busy=null,generation=0,repeat=false,lastPhase='local',choosing=false;
    function emit(phase,detail={}){lastPhase=phase;onState({phase,connected:!!meta?.config,updatedAt:meta?.updatedAt,...detail});}
    function persist(){try{store.save(meta);}catch{throw new Error('LOCAL_STORAGE_UNAVAILABLE');}}
    function backup(reason){try{store.backup({at:new Date().toISOString(),reason,snapshot:M.copy(adapter.get())});}catch{throw new Error('LOCAL_STORAGE_UNAVAILABLE');}}
    function local(){return M.normalize(adapter.get());}
    function checkRemote(remote){
      if(!remote||remote.ok!==true)throw new Error(remote?.error||'COSTS_CONNECTION_FAILED');
      if(remote.service!=='jeju-shared-costs'||remote.version!==1||!Number.isSafeInteger(remote.revision)||remote.revision<0||!Array.isArray(remote.writes))throw new Error('COSTS_INVALID_RESPONSE');
      if(remote.data!==null)remote.data=M.normalize(remote.data);
      else if(remote.revision!==0)throw new Error('COSTS_INVALID_RESPONSE');
      return remote;
    }
    function active(g){if(g!==generation||!meta?.config)throw new Error('CANCELLED');}
    async function read(g){const response=await transport.read(meta.config);active(g);return checkRemote(response);}
    function apply(snapshot){if(!M.same(local(),snapshot))adapter.apply(snapshot);}
    function acknowledge(remote){
      if(!meta.inflight)return false;
      const ack=remote.writes.find(w=>w.id===meta.inflight.id&&Number.isSafeInteger(w.revision));
      if(!ack)return false;
      meta.base=M.copy(meta.inflight.snapshot);meta.revision=ack.revision;meta.inflight=null;persist();return true;
    }
    async function run(){
      if(!meta?.config){emit('local');return;}
      if(options.isOnline&&!options.isOnline()){emit('offline');return;}
      const g=generation;emit('syncing');let remote=await read(g);
      for(let pass=0;pass<4;pass++){
        active(g);
        if(meta.inflight&&!acknowledge(remote)){
          if(remote.revision<meta.inflight.expectedRevision)throw new Error('COSTS_STALE_RESPONSE');
          if(remote.revision===meta.inflight.expectedRevision){
            await transport.write(meta.config,meta.inflight);active(g);remote=await read(g);
            if(!acknowledge(remote)&&remote.revision===meta.inflight.expectedRevision)throw new Error('COSTS_WRITE_NOT_VERIFIED');
            continue;
          }
          // Another writer won the compare-and-swap; the local draft remains untouched.
          meta.inflight=null;persist();
        }
        if(!meta.base){pending={remote};emit(remote.data?'join':'empty',{remote,local:local()});return;}
        if(remote.data===null)throw new Error('COSTS_SHARED_DATA_MISSING');
        if(remote.revision<meta.revision)throw new Error('COSTS_STALE_RESPONSE');
        const current=local(),result=M.merge(meta.base,current,remote.data);
        if(result.conflicts.length){pending={remote,result};emit('conflict',{conflicts:result.conflicts});return;}
        if(!M.same(current,result.snapshot)&&editing()){pending=null;emit('editing');return;}
        // The server becomes the baseline before committing our still-pending local edits.
        meta.base=M.copy(remote.data);meta.revision=remote.revision;meta.updatedAt=remote.updatedAt;persist();apply(result.snapshot);
        if(M.same(result.snapshot,remote.data)){pending=null;emit('synced');return;}
        const job={id:uid(),snapshot:M.copy(result.snapshot),expectedRevision:remote.revision};
        meta.inflight=job;persist();await transport.write(meta.config,job);active(g);remote=await read(g);
        if(!acknowledge(remote)&&remote.revision===job.expectedRevision)throw new Error('COSTS_WRITE_NOT_VERIFIED');
      }
      emit('pending');
    }
    function fail(error){if(error.message==='CANCELLED')return;emit(options.isOnline&&!options.isOnline()?'offline':'error',{error:error.message});}
    function sync(){
      if(choosing){repeat=true;return Promise.resolve();}
      if(busy){repeat=true;return busy;}
      repeat=false;busy=run().catch(fail).finally(()=>{busy=null;if(repeat){repeat=false;Promise.resolve().then(sync);}});return busy;
    }
    async function connect(config){
      if(busy)return;
      if(meta?.config&&M.same(meta.config,config))return sync();
      try{backup('加入共用前');generation++;pending=null;meta={config:M.copy(config),base:null,revision:0,updatedAt:null,inflight:null};persist();await sync();}catch(e){fail(e);}
    }
    async function choose(mode){
      if(busy||choosing||!meta?.config)return;
      const g=generation;let needsSync=false;choosing=true;
      try{
        backup('套用共用資料前');emit('syncing');const remote=await read(g),current=local();
        if(remote.data===null){
          if(mode!=='local'){emit('empty',{remote,local:current});return;}
          meta.inflight={id:uid(),snapshot:current,expectedRevision:0};persist();needsSync=true;return;
        }
        if(mode==='local'){pending={remote};emit('join',{remote,local:current});return;}
        if(mode==='remote'){
          adapter.apply(remote.data);meta.base=M.copy(remote.data);meta.revision=remote.revision;meta.updatedAt=remote.updatedAt;meta.inflight=null;pending=null;persist();emit('synced');return;
        }
        if(mode!=='merge')throw new Error('INVALID_RESOLUTION');
        const result=M.merge(adapter.defaults(),current,remote.data);
        if(result.conflicts.length){pending={remote,result};emit('conflict',{conflicts:result.conflicts});return;}
        adapter.apply(result.snapshot);meta.base=M.copy(remote.data);meta.revision=remote.revision;meta.updatedAt=remote.updatedAt;pending=null;persist();needsSync=true;
      }catch(e){fail(e);}
      finally{choosing=false;if(needsSync||repeat){repeat=false;await sync();}}
    }
    async function resolve(side){
      if(!pending?.result||busy)return;
      try{backup('處理同時修改前');const snapshot=M.resolve(pending.result,side);adapter.apply(snapshot);meta.base=M.copy(pending.remote.data);meta.revision=pending.remote.revision;meta.updatedAt=pending.remote.updatedAt;meta.inflight=null;pending=null;persist();await sync();}catch(e){fail(e);}
    }
    function changed(){
      if(!meta?.config)return;
      if(lastPhase==='join'||lastPhase==='empty')return;
      if(lastPhase==='conflict'){pending=null;emit('pending');return;}
      emit('pending');
    }
    function leave(){
      try{backup('停止共用前');generation++;meta=null;pending=null;persist();emit('local');}catch(e){fail(e);}
    }
    return {sync,connect,choose,resolve,changed,leave,getConfig:()=>meta?.config?M.copy(meta.config):null,getPhase:()=>lastPhase};
  }
  return {create};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=JejuCostClient;
