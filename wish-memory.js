'use strict';
(() => {
  const parameter='wishlist';
  function parse(value,allowed){
    if(typeof value!=='string'||value.length>4096||!/^v1(?:\.[1-9]\d{0,8})*$/.test(value))return null;
    const ids=[...new Set(value.split('.').slice(1).map(Number))];
    const known=new Set(allowed);
    return {ids:ids.filter(id=>known.has(id)),unknown:ids.filter(id=>!known.has(id)).length};
  }
  function link(ids,locationHref){
    const url=new URL(locationHref);
    url.searchParams.delete(parameter);
    url.searchParams.set(parameter,'v1'+[...new Set(ids)].filter(Number.isSafeInteger).filter(id=>id>0).sort((a,b)=>a-b).map(id=>'.'+id).join(''));
    url.hash='places';
    return url.href;
  }
  function initialize({allowed,getIds,apply,onStatus}){
    const byId=id=>document.getElementById(id),dialog=byId('wish-memory-dialog');
    const heading=byId('wish-memory-title'),description=byId('wish-memory-description'),preview=byId('wish-memory-preview');
    const output=byId('wish-memory-link'),importActions=byId('wish-memory-import-actions'),shareActions=byId('wish-memory-share-actions');
    let incoming=null;
    const report=message=>{byId('wish-memory-feedback').textContent=message;onStatus(message);};
    function removeParameter(){
      const url=new URL(location.href);url.searchParams.delete(parameter);
      history.replaceState(history.state,'',url.href);
    }
    function close(){dialog.close();if(incoming){incoming=null;removeParameter();}}
    function showShare(){
      incoming=null;byId('wish-memory-feedback').textContent='';heading.textContent='把想去清單帶到其他裝置';
      description.textContent=`這份連結包含目前 ${getIds().length} 個想去地點。在另一台裝置開啟後，選擇合併或取代，即可記住清單。之後的新修改需再傳一次連結，不會自動同步。`;
      preview.textContent='持有連結的人都能查看這份想去清單，請只傳給想分享的人。';
      output.value=link(getIds(),location.href);output.hidden=false;
      shareActions.hidden=false;importActions.hidden=true;dialog.showModal();
    }
    function showImport(result){
      incoming=result;heading.textContent='收到一份想去清單';
      const current=getIds().length;
      description.textContent=`連結有 ${result.ids.length} 個可辨識地點；這台裝置原有 ${current} 個。合併會保留兩邊的想去紀錄；取代會改用連結中的清單。`;
      const names=result.ids.map(id=>allowed.find(p=>p.id===id)?.name).filter(Boolean);
      preview.textContent=(names.length?names.slice(0,12).join('、')+(names.length>12?'⋯':''):'這是一份空白清單。')+(result.unknown?` 另有 ${result.unknown} 個地點目前不在網站資料中，未匯入。`:'');
      output.hidden=true;shareActions.hidden=true;importActions.hidden=false;dialog.showModal();
    }
    byId('wish-memory-open').addEventListener('click',showShare);
    byId('wish-memory-close').addEventListener('click',close);
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    byId('wish-memory-copy').addEventListener('click',async()=>{
      try{await navigator.clipboard.writeText(output.value);report('清單連結已複製，請傳到另一台裝置開啟。');}
      catch{output.focus();output.select();report('無法自動複製，請長按或全選上方連結後複製。');}
    });
    for(const mode of ['merge','replace'])byId('wish-memory-'+mode).addEventListener('click',()=>{
      if(!incoming)return;
      const ids=mode==='merge'?[...new Set([...getIds(),...incoming.ids])]:incoming.ids;
      const saved=apply(ids);incoming=null;removeParameter();dialog.close();
      onStatus(saved?'清單已儲存在這個瀏覽器，可用「只看想去」查看相對位置。':'清單已在本頁套用，但瀏覽器拒絕儲存。請保留原連結作備份。');
    });
    const value=new URL(location.href).searchParams.get(parameter);
    if(value!==null){
      const result=parse(value,allowed.map(p=>p.id));
      if(result)showImport(result);
      else{removeParameter();onStatus('清單連結格式無效，原有想去紀錄已保留。');}
    }
  }
  const api={parse,link,initialize};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else window.JejuWishMemory=api;
})();
