const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const model=require('../cost-sync-model.js');
const fixture=()=>Object.assign(Object.fromEntries(model.fields.map(f=>[f,''])),{fare:'booked','car-model':'booked-orcar-mini-20261024-v1',days:'4',rate:'0.024',customExpenses:[{id:'meals',name:'兩人餐飲',amount:'6000'},{id:'shopping',name:'購物',amount:'1000'}]});

test('different device edits merge amounts, new rows and deletions without dropping unrelated changes',()=>{
 const base=fixture(),local=model.copy(base),remote=model.copy(base);
 local.customExpenses[0].amount='6500';local.customExpenses.push({id:'local-row',name:'機場接送',amount:'800'});
 remote.customExpenses=remote.customExpenses.filter(r=>r.id!=='shopping');remote['cost-esim-custom']='500';
 const result=model.merge(base,local,remote);assert.equal(result.conflicts.length,0);
 assert.deepEqual(result.snapshot.customExpenses,[{id:'meals',name:'兩人餐飲',amount:'6500'},{id:'local-row',name:'機場接送',amount:'800'}]);assert.equal(result.snapshot['cost-esim-custom'],'500');
});
test('same amount changes require a deliberate choice, while other fields stay merged',()=>{
 const base=fixture(),local=model.copy(base),remote=model.copy(base);local.customExpenses[0].amount='7000';remote.customExpenses[0].amount='9000';remote.customExpenses[0].name='餐飲新名稱';
 const result=model.merge(base,local,remote);assert.equal(result.conflicts.length,1);
 assert.equal(model.resolve(result,'local').customExpenses[0].amount,'7000');assert.equal(model.resolve(result,'local').customExpenses[0].name,'餐飲新名稱');assert.equal(model.resolve(result,'remote').customExpenses[0].amount,'9000');
});
test('deletion versus an edited row is a conflict, not silent loss',()=>{
 const base=fixture(),local=model.copy(base),remote=model.copy(base);local.customExpenses.shift();remote.customExpenses[0].amount='8000';const result=model.merge(base,local,remote);
 assert.equal(result.conflicts[0].kind,'row-presence');assert.ok(!model.resolve(result,'local').customExpenses.some(r=>r.id==='meals'));assert.equal(model.resolve(result,'remote').customExpenses[0].amount,'8000');
});
test('duplicate IDs and invalid amounts cannot enter shared financial data',()=>{
 const value=fixture();value.customExpenses.push({...value.customExpenses[0]});assert.throws(()=>model.normalize(value),/INVALID_EXPENSE/);
 value.customExpenses.pop();value.customExpenses[0].amount='-100';assert.throws(()=>model.normalize(value),/INVALID_AMOUNT/);
 value.customExpenses[0].amount='Infinity';assert.throws(()=>model.normalize(value),/INVALID_AMOUNT/);
});
function service(){
 const values=new Map();let uid=0;let failMetadata=false;
 const props={getProperty:k=>values.has(k)?values.get(k):null,setProperty(k,v){if(failMetadata&&k.startsWith('JEJU_COSTS_ROOM_')){failMetadata=false;throw new Error('SIMULATED_FAILURE');}assert.ok(Buffer.byteLength(v)<9000,'Google property value limit');values.set(k,Buffer.from(v).toString());},setProperties(p){for(const [k,v]of Object.entries(p))props.setProperty(k,v);},deleteProperty:k=>values.delete(k),getProperties:()=>Object.fromEntries(values)};
 const sandbox={JejuCostModel:model,PropertiesService:{getScriptProperties:()=>props},Utilities:{getUuid:()=>String(++uid).padStart(32,'0'),newBlob:s=>({getBytes:()=>Buffer.from(s)})},LockService:{getScriptLock:()=>({waitLock(){},hasLock:()=>true,releaseLock(){}})},console};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync('integrations/cost-sync/CostsService.gs','utf8'),sandbox);
 const room=sandbox.jejuCostsSetup_(props,false);const call=r=>JSON.parse(JSON.stringify(sandbox.jejuCostsRequest_({...room,...r})));
 return {call,room,props,values,sandbox,failNextMetadata:()=>failMetadata=true};
}
test('backend rejects wrong keys and old revisions; retried writes do not overwrite newer edits',()=>{
 const s=service(),data=fixture();assert.equal(s.call({action:'costRead',key:'wrong'}).error,'COSTS_UNAUTHORIZED');
 const first=s.call({action:'costWrite',writeId:'first-write-12345678',expectedRevision:0,data});assert.equal(first.revision,1);
 data.customExpenses[0].amount='7000';assert.equal(s.call({action:'costWrite',writeId:'second-write-12345678',expectedRevision:0,data}).error,'COSTS_CONFLICT');
 assert.equal(s.call({action:'costWrite',writeId:'second-write-12345678',expectedRevision:1,data}).revision,2);
 const retry=s.call({action:'costWrite',writeId:'first-write-12345678',expectedRevision:0,data:fixture()});assert.equal(retry.revision,2);assert.equal(retry.data.customExpenses[0].amount,'7000');
 assert.equal('key'in retry,false);assert.equal('token'in retry,false);
});
test('multi-property storage preserves emoji and the previous commit after a failed pointer update',()=>{
 const s=service(),data=fixture();data.customExpenses=Array.from({length:100},(_,i)=>({id:'row-'+i,name:'共用花費🍊'.repeat(8),amount:String(i*10)}));
 let result=s.call({action:'costWrite',writeId:'unicode-write-12345678',expectedRevision:0,data});assert.deepEqual(result.data,data);
 s.failNextMetadata();const changed=model.copy(data);changed.customExpenses[0].amount='999';assert.equal(s.call({action:'costWrite',writeId:'interrupted-12345678',expectedRevision:1,data:changed}).ok,false);
 result=s.call({action:'costRead'});assert.equal(result.revision,1);assert.deepEqual(result.data,data);
});
test('a probe room is isolated and cleanup cannot remove the main shared budget',()=>{
 const s=service();const probe=s.sandbox.jejuCostsSetup_(s.props,true);assert.notEqual(probe.room,s.room.room);
 assert.throws(()=>s.sandbox.jejuCostsRemoveProbe_(s.props,s.room.room),/COSTS_NOT_A_PROBE/);assert.equal(s.sandbox.jejuCostsRemoveProbe_(s.props,probe.room).removed,true);assert.equal(s.call({action:'costRead'}).revision,0);
});
