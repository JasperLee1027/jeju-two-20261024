const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function app(){
 const values=new Map([['DOC_ID','private-doc'],['TAB_ID','private-tab'],['SYNC_TOKEN','private-admin-test-key']]);let opens=0,n=0;
 const props={getProperty:k=>values.get(k)??null,setProperty:(k,v)=>values.set(k,v),setProperties:p=>Object.entries(p).forEach(([k,v])=>values.set(k,v)),deleteProperty:k=>values.delete(k),getProperties:()=>Object.fromEntries(values)};
 const box={PropertiesService:{getScriptProperties:()=>props},Utilities:{getUuid:()=>String(++n).padStart(32,'0'),newBlob:s=>({getBytes:()=>Buffer.from(s)})},LockService:{getScriptLock:()=>({waitLock(){},hasLock:()=>true,releaseLock(){}})},ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'javascript'},createTextOutput:text=>({text,setMimeType(type){this.type=type;return this;}})},DocumentApp:{openById(){opens++;throw new Error('Document must not be opened by cost requests');}}};vm.createContext(box);vm.runInContext(fs.readFileSync('integrations/cost-sync/Code.gs.txt','utf8'),box);
 return {box,values,opens:()=>opens,post:data=>JSON.parse(box.doPost({postData:{contents:JSON.stringify(data)}}).text)};
}
test('combined deployment retains Doc settings while cost access cannot read private Doc',()=>{
 const a=app();const room=a.post({action:'costSetup',token:'private-admin-test-key'});assert.equal(room.ok,true);
 const denied=a.post({action:'read',token:room.key});assert.equal(denied.error,'UNAUTHORIZED');assert.equal(a.opens(),0);
 assert.equal(a.values.get('DOC_ID'),'private-doc');assert.equal(a.values.get('TAB_ID'),'private-tab');assert.equal(a.values.get('SYNC_TOKEN'),'private-admin-test-key');
 assert.equal(a.post({action:'costSetup',token:'wrong'}).error,'UNAUTHORIZED');
 const response=a.box.doGet({parameter:{action:'costRead',room:room.room,key:room.key,callback:'__jejuCostssafe'}});assert.equal(response.type,'javascript');assert.ok(response.text.startsWith('__jejuCostssafe('));assert.ok(!response.text.includes('private-doc'));assert.ok(!response.text.includes('private-admin-test-key'));
});
test('a callback expression is never executed and public health checks reveal no keys',()=>{
 const a=app();const health=JSON.parse(a.box.doGet().text);assert.equal(health.version,'1.1.0');assert.equal(health.configured,true);assert.equal('token'in health,false);
 const room=a.post({action:'costSetup',token:'private-admin-test-key'});const response=a.box.doGet({parameter:{action:'costRead',room:room.room,key:room.key,callback:'alert(1)//'}});assert.equal(response.type,'json');assert.ok(response.text.startsWith('{'));
});
