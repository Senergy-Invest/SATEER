'use strict';
/* C4A : vues de données structurées, aucune inférence automatique de connexion électrique. */
(async()=>{
 const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),tenant=params.get('tenant'),q='?tenant='+encodeURIComponent(tenant||'');
 const api='/api/energy/topologie/v1',uuid=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
 let siteId=null,offset=0,partial=false,data={lieux:[],appareillages:[],liens:[],equipements:[],usages:[]};
 const option=(text,value)=>{const el=document.createElement('option');el.textContent=text;el.value=value;return el;};
 const say=(k,text,error=false)=>{const e=$(k);e.textContent=text;e.classList.toggle('error',error);};
 async function request(method,path,body){const headers={Accept:'application/json'};if(body!==undefined){headers['Content-Type']='application/json';headers['Idempotency-Key']=crypto.randomUUID();}
  const resp=await fetch(path,{method,credentials:'same-origin',headers,body:body===undefined?undefined:JSON.stringify(body)});
  const j=await resp.json().catch(()=>({}));if(!resp.ok)throw Error(j.statut||'HTTP '+resp.status);return j;
 }
 const endpoint=path=>api+'/sites/'+encodeURIComponent(siteId)+path+q;
 const newli=(ul,text,detail,button)=>{const li=document.createElement('li'),strong=document.createElement('strong');strong.textContent=text;li.append(strong);
  if(detail){const sm=document.createElement('small');sm.textContent=detail;li.append(sm);}if(button)li.append(button);ul.append(li);};
 const known=(id)=>data.appareillages.find(a=>a.id===id)?.nom||data.lieux.find(a=>a.id===id)?.nom||data.equipements.find(a=>a.id===id)?.nom||'Élément '+String(id||'').slice(0,8);
 const select=(id,options,empty)=>{$(id).replaceChildren();if(empty!==undefined)$(id).append(option(empty,''));options.forEach(x=>$(id).append(option(x.label,x.id)));};
 function render(){
  const types={SITE:'Site',BATIMENT:'Bâtiment',ETAGE:'Étage',BUREAU:'Bureau',SERVICE:'Service',ZONE:'Zone'};
  $('lieux').replaceChildren();for(const x of data.lieux)newli($('lieux'),x.nom,(types[x.type]||x.type)+(x.parentId?' · parent : '+known(x.parentId):' · racine'));
  $('appareillages').replaceChildren();for(const x of data.appareillages)newli($('appareillages'),x.nom,x.type+(x.repere?' · '+x.repere:'')+(x.scopeNodeId?' · situé : '+known(x.scopeNodeId):'')+' · à vérifier');
  $('liens').replaceChildren();for(const l of data.liens){const btn=document.createElement('button');btn.type='button';btn.textContent='Retirer ce lien';btn.disabled=!l.actif;
   btn.addEventListener('click',async()=>{if(!confirm('Retirer uniquement ce lien ? Les éléments et l’historique seront conservés.'))return;
    try{await request('POST',api+'/sites/'+encodeURIComponent(siteId)+'/liens/'+l.id+'/retirer'+q,{});say('messageLien','Lien retiré et historisé.');await load();}catch(e){say('messageLien',e.message,true);}});
   newli($('liens'),known(l.sourceAssetId)+' · '+l.typeLien+' · '+known(l.targetAssetId||l.targetScopeNodeId||l.targetEquipmentId),
    (l.actif?'Actif':'Retiré')+' · déclaration à vérifier',btn);}
  $('usages').replaceChildren();for(const x of data.usages)newli($('usages'),known(x.equipmentId)+' · '+x.usage,x.commentaire||'Usage déclaré, non mesuré');
  select('localisation',data.lieux.map(x=>({id:x.id,label:x.nom+' · '+x.type})),'Je ne sais pas');
  select('sourceLien',data.appareillages.map(x=>({id:x.id,label:x.nom+' · '+x.type})));
  select('equipement',data.equipements.map(x=>({id:x.id,label:x.nom+' · '+x.famille})));
  targetOptions();
  $('pagination').textContent=`${data.lieux.length} lieux · ${data.appareillages.length} éléments électriques · ${data.liens.length} relations · ${data.equipements.length} machines · ${data.usages.length} usages. ${partial?'Données partielles : chargez la suite.':''}`;
  $('suite').hidden=!partial;
 }
 function targetOptions(){let kind=$('categorieCible').value;const allowed=$('typeLien').value;
  if(allowed==='DESSERT'&&kind!=='SCOPE'){kind='SCOPE';$('categorieCible').value=kind;}
  if(allowed==='ALIMENTE'&&kind==='SCOPE'){kind='ASSET';$('categorieCible').value=kind;}
  if(kind==='ASSET')select('cibleLien',data.appareillages.map(x=>({id:x.id,label:x.nom+' · '+x.type})));
  else if(kind==='SCOPE')select('cibleLien',data.lieux.map(x=>({id:x.id,label:x.nom+' · '+x.type})));
  else select('cibleLien',data.equipements.map(x=>({id:x.id,label:x.nom+' · '+x.famille})));
 }
 async function load(more=false){if(!siteId)return;
  if(!more){offset=0;data={lieux:[],appareillages:[],liens:[],equipements:[],usages:[]};}
  const r=await request('GET',endpoint('/carte')+'&offset='+offset);
  for(const k of Object.keys(data))data[k].push(...r[k]);partial=r.suivant;offset+=100;render();}
 $('suite').addEventListener('click',()=>load(true).catch(e=>say('contexte',e.message,true)));
 $('site').addEventListener('change',async()=>{siteId=$('site').value;try{await load();say('contexte','Carte privée : '+$('site').selectedOptions[0]?.textContent);}catch(e){say('contexte',e.message,true);}});
 $('categorieCible').addEventListener('change',targetOptions);$('typeLien').addEventListener('change',targetOptions);
 $('formAppareillage').addEventListener('submit',async e=>{e.preventDefault();if(!siteId)return;
  const d={typeNoeud:$('typeAppareillage').value,nom:$('nomAppareillage').value.trim(),repere:$('repere').value.trim()||null,scopeNodeId:$('localisation').value||null};
  try{await request('POST',endpoint('/appareillages'),d);say('messageAppareillage','Élément enregistré ; aucun raccordement n’est déduit.');$('formAppareillage').reset();await load();}catch(err){say('messageAppareillage',err.message,true);}});
 $('formLien').addEventListener('submit',async e=>{e.preventDefault();const kind=$('categorieCible').value,target=$('cibleLien').value;
  if(!target){say('messageLien','Choisissez une cible.',true);return;}
  const d={sourceAssetId:$('sourceLien').value,typeLien:$('typeLien').value,targetAssetId:kind==='ASSET'?target:null,
   targetScopeNodeId:kind==='SCOPE'?target:null,targetEquipmentId:kind==='EQUIPMENT'?target:null};
  try{await request('POST',endpoint('/liens'),d);say('messageLien','Relation déclarée à vérifier (non certifiée).');await load();}catch(err){say('messageLien',err.message,true);}});
 $('formUsage').addEventListener('submit',async e=>{e.preventDefault();const d={equipmentId:$('equipement').value,usage:$('usage').value,commentaire:$('commentaire').value.trim()||null};
  try{await request('POST',endpoint('/usages'),d);say('messageUsage','Usage lié à l’équipement existant.');$('formUsage').reset();await load();}catch(err){say('messageUsage',err.message,true);}});
 try{const ctx=await window.SATEER_CONTEXT_READY;
  if(!tenant||!((ctx.organisations||[]).some(x=>x.tenant_code===tenant)))throw Error('SESSION_OU_TENANT_NON_AUTORISE');
  const sites=await request('GET',api+'/sites'+q);select('site',(sites.sites||[]).map(s=>({id:s.id,label:s.nom+' · '+s.typeSite})));
  if(!sites.sites?.length){say('contexte','Aucun site propriétaire autorisé. Créez d’abord votre dossier SUNU Courant.');return;}
  siteId=$('site').value;
  $('retour').href='/sunu-courant.html'+q;
  $('organisation').href='/energie-responsabilites.html'+q;
  await load();say('contexte','Session active · '+tenant+' · site privé · déclarations à vérifier.');
 }catch(e){say('contexte','Carte inaccessible : '+e.message,true);}
})();
