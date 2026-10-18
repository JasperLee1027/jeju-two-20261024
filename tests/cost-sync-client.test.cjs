const {test}=require('node:test');const assert=require('node:assert/strict');
const M=require('../cost-sync-model.js'),Client=require('../cost-sync-client.js');
const fixture=()=>Object.assign(Object.fromEntries(M.fields.map(f=>[f,''])),{fare:'booked','car-model':'booked-orcar-mini-20261024-v1',days:'4',rate:'0.024',customExpenses:[{id:'meals',name:'餐飲',amount:'6000'},{id:'shopping',name:'購物',amount:'1000'}]});
const config={endpoint:'https://script.google.com/macros/s/test/exec',room:'1'.repeat(32),key:'2'.repeat(64)};
function server(initial=fixture()){
 let data=M.copy(initial),revision=data?1:0,writes=[],offline=false,dropNextRead=false,readFailureAfterWrite=false;
 const reply=()=>M.copy({ok:true,service:'jeju-shared-costs',version:1,revision,data,updatedAt:'2026-10-18T08:00:00.000Z',writes});
 return {reply,goOffline:value=>offline=value,loseAcknowledgement:()=>readFailureAfterWrite=true,replace(value){data=M.copy(value);revision++;},transport:{async read(){if(offline||dropNextRead){dropNextRead=false;throw new Error('NETWORK');}return reply();},async write(_,job){if(offline)throw new Error('NETWORK');if(job.expectedRevision===revision&&!writes.some(w=>w.id===job.id)){data=M.copy(job.snapshot);revision++;writes.push({id:job.id,revision});if(readFailureAfterWrite){dropNextRead=true;readFailureAfterWrite=false;}}}}};
}
let sequence=0;
function device(s,initial=fixture()){
 let data=M.copy(initial),meta=null,phase=null,online=true,editing=false;const backups=[];
 const adapter={get:()=>M.copy(data),defaults:fixture,apply:value=>data=M.copy(value)};
 const client=Client.create({adapter,transport:s.transport,store:{load:()=>meta,save:value=>meta=M.copy(value),backup:value=>backups.push(M.copy(value))},onState:value=>phase=value,isOnline:()=>online,isEditing:()=>editing,uid:()=>('write'+String(++sequence)).padEnd(32,'x')});
 return {client,get:()=>M.copy(data),edit(fn){fn(data);client.changed();},phase:()=>phase,meta:()=>meta,backups,online:value=>online=value,editing:value=>editing=value};
}
async function joined(s){const d=device(s);await d.client.connect(config);await d.client.choose('remote');return d;}

test('first empty-room connection never overwrites local costs or creates a default cloud budget automatically',async()=>{
 const s=server(null),local=fixture();local.customExpenses[0].amount='12345';const d=device(s,local);
 await d.client.connect(config);assert.equal(d.phase().phase,'empty');assert.equal(s.reply().data,null);assert.deepEqual(d.get(),local);
 await d.client.choose('local');assert.equal(d.phase().phase,'synced');assert.equal(s.reply().data.customExpenses[0].amount,'12345');assert.ok(d.backups.length>=1);
});
test('opening an existing shared budget preserves a complete pre-join local backup',async()=>{
 const s=server(),local=fixture();local.customExpenses[0].amount='9999';const d=device(s,local);
 await d.client.connect(config);assert.equal(d.phase().phase,'join');assert.equal(d.get().customExpenses[0].amount,'9999');
 await d.client.choose('remote');assert.equal(d.get().customExpenses[0].amount,'6000');assert.ok(d.backups.some(b=>b.snapshot.customExpenses[0].amount==='9999'));
});
test('two devices editing different rows converge without last-writer loss',async()=>{
 const s=server(),a=await joined(s),b=await joined(s);a.edit(d=>d.customExpenses[0].amount='7000');b.edit(d=>d.customExpenses[1].amount='2500');
 await Promise.all([a.client.sync(),b.client.sync()]);await a.client.sync();await b.client.sync();
 for(const d of [a,b])assert.deepEqual(d.get().customExpenses.map(x=>x.amount),['7000','2500']);
 assert.deepEqual(s.reply().data.customExpenses.map(x=>x.amount),['7000','2500']);
});
test('offline local edits merge with a partner new row on reconnect',async()=>{
 const s=server(),d=await joined(s);d.online(false);d.edit(v=>v.customExpenses[0].amount='8000');await d.client.sync();assert.equal(d.phase().phase,'offline');
 const remote=s.reply().data;remote.customExpenses.push({id:'partner',name:'停車',amount:'300'});s.replace(remote);d.online(true);await d.client.sync();
 assert.equal(d.phase().phase,'synced');assert.equal(d.get().customExpenses[0].amount,'8000');assert.ok(d.get().customExpenses.some(r=>r.id==='partner'));
});
test('an accepted write with a lost reply is recovered by write ID without duplicate commits',async()=>{
 const s=server(),d=await joined(s);d.edit(v=>v.customExpenses[0].amount='7777');s.loseAcknowledgement();await d.client.sync();assert.equal(d.phase().phase,'error');assert.ok(d.meta().inflight);
 const revision=s.reply().revision;await d.client.sync();assert.equal(d.phase().phase,'synced');assert.equal(s.reply().revision,revision);assert.equal(d.get().customExpenses[0].amount,'7777');assert.equal(d.meta().inflight,null);
});
test('same-amount conflicts require explicit resolution and keep unrelated partner changes',async()=>{
 const s=server(),a=await joined(s),b=await joined(s);a.edit(v=>v.customExpenses[0].amount='7000');await a.client.sync();b.edit(v=>v.customExpenses[0].amount='9000');
 const remote=s.reply().data;remote.customExpenses[1].amount='4000';s.replace(remote);await b.client.sync();assert.equal(b.phase().phase,'conflict');assert.equal(s.reply().data.customExpenses[0].amount,'7000');
 await b.client.resolve('local');assert.equal(b.phase().phase,'synced');assert.deepEqual(s.reply().data.customExpenses.map(x=>x.amount),['9000','4000']);
});
test('remote updates wait while a local amount is being typed, then merge without resetting that amount',async()=>{
 const s=server(),d=await joined(s);d.edit(v=>v.customExpenses[0].amount='8888');d.editing(true);const remote=s.reply().data;remote.customExpenses[1].amount='3000';s.replace(remote);
 await d.client.sync();assert.equal(d.phase().phase,'editing');assert.equal(d.get().customExpenses[0].amount,'8888');assert.equal(d.get().customExpenses[1].amount,'1000');
 d.editing(false);await d.client.sync();assert.deepEqual(d.get().customExpenses.map(x=>x.amount),['8888','3000']);assert.equal(d.phase().phase,'synced');
});
test('leaving shared costs keeps the current budget and a recoverable local backup',async()=>{
 const s=server(),d=await joined(s);const before=d.get();d.client.leave();assert.equal(d.client.getConfig(),null);assert.deepEqual(d.get(),before);assert.ok(d.backups.length);await d.client.sync();assert.equal(d.phase().phase,'local');
});
