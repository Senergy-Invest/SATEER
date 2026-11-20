'use strict';
/** C4B : SVG interactif. Données canoniques toujours C1/051/C4A ; édition limitée aux POSITIONS. */
(async()=>{
 const $=id=>document.getElementById(id),query=new URLSearchParams(location.search),tenant=query.get('tenant'),q='?tenant='+encodeURIComponent(tenant||'');
 const topo='/api/energy/topologie/v1',sketch='/api/energy/esquisse/v1',scope='/api/energy/collab/v2',NS='http://www.w3.org/2000/svg';
 let siteId=null,activeView='PHYSIQUE',drawn=new Map(),positions=new Map(),dirty=new Map(),chosen=null,layout=[];
 let map={lieux:[],appareillages:[],equipements:[],liens:[],usages:[]},grants=[],partial=false,imageUrl=null;
 const say=(id,value,error=false)=>{const e=$(id);e.textContent=value;e.classList.toggle('error',error);};
 const opt=(text,value)=>{const o=document.createElement('option');o.textContent=text;o.value=value;return o;};
 const el=(tag,attrs={})=>{const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
 async function request(method,url,body){const headers={Accept:'application/json'};if(body!==undefined){headers['Content-Type']='application/json';headers['Idempotency-Key']=crypto.randomUUID();}
  const r=await fetch(url,{method,credentials:'same-origin',headers,body:body===undefined?undefined:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.statut||'HTTP '+r.status);return j;}
 const route=(api,suffix)=>api+'/sites/'+encodeURIComponent(siteId)+suffix+q;
 const key=(type,id)=>type+':'+id;
 const named=id=>map.lieux.find(x=>x.id===id)?.nom||map.appareillages.find(x=>x.id===id)?.nom||map.equipements.find(x=>x.id===id)?.nom||String(id).slice(0,8);
 function visible(){if(activeView==='PHYSIQUE')return map.lieux.map(x=>({id:x.id,type:'LIEU',name:x.nom}));
  if(activeView==='ELECTRIQUE'){
   const links=map.liens.filter(l=>l.actif),used=new Set(links.map(l=>l.targetScopeNodeId).filter(Boolean));
   const machines=new Set(links.map(l=>l.targetEquipmentId).filter(Boolean));
   return [...map.appareillages.map(x=>({id:x.id,type:'ELECTRIQUE',name:x.nom})),...map.lieux.filter(x=>used.has(x.id)).map(x=>({id:x.id,type:'LIEU',name:x.nom})),...map.equipements.filter(x=>machines.has(x.id)).map(x=>({id:x.id,type:'EQUIPEMENT',name:x.nom}))];
  }
  const sc=new Set(map.equipements.map(x=>x.scopeNodeId).filter(Boolean));
  return [...map.equipements.map(x=>({id:x.id,type:'EQUIPEMENT',name:x.nom})),...map.lieux.filter(x=>sc.has(x.id)).map(x=>({id:x.id,type:'LIEU',name:x.nom}))];
 }
 function renderLinks(){const ul=$('liens');ul.replaceChildren();const active=map.liens.filter(x=>x.actif);
  for(const l of active.slice(0,120)){const li=document.createElement('li');li.textContent=named(l.sourceAssetId)+' — '+l.typeLien+' → '+named(l.targetAssetId||l.targetScopeNodeId||l.targetEquipmentId)+' · à vérifier';ul.append(li);}
  if(!active.length){const li=document.createElement('li');li.textContent='Aucune relation électrique déclarée pour le moment.';ul.append(li);}
 }
 function selectOptions(){const available=visible().filter(x=>!drawn.has(key(x.type,x.id)));
  const a=$('ajouter');a.replaceChildren(opt('Choisissez un élément à placer…',''));
  for(const n of available)a.append(opt(n.name+' · '+n.type,key(n.type,n.id)));
  const p=$('parent');p.replaceChildren();for(const n of map.lieux)p.append(opt(n.nom,n.id));
 }
 function defaultPoint(idx){return {x:Math.min(890,70+(idx%6)*154),y:Math.min(620,70+Math.floor(idx/6)*105),revision:0};}
 function draw(){const svg=$('esquisse');for(const x of [...svg.querySelectorAll('.edge,.node,.edge-label,.plan-preview')])x.remove();
  if(imageUrl){const img=el('image',{href:imageUrl,x:0,y:0,width:1000,height:700,opacity:.32,class:'plan-preview',preserveAspectRatio:'xMidYMid meet'});svg.append(img);}
  const nodes=visible();const coords=new Map([...drawn.entries()].map(([k,v])=>[k,v]));
  function edge(a,b,color,dashed,label){const pa=coords.get(a),pb=coords.get(b);if(!pa||!pb)return;
   const line=el('line',{x1:pa.x+70,y1:pa.y+27,x2:pb.x+70,y2:pb.y+27,class:'edge '+(color?'electric ':'')+(dashed?'dashed':'')});svg.append(line);
   if(label){const t=el('text',{x:(pa.x+pb.x)/2+68,y:(pa.y+pb.y)/2+13,class:'edge-label'});t.textContent=label;svg.append(t);}}
  if(activeView==='PHYSIQUE')for(const x of map.lieux)if(x.parentId)edge(key('LIEU',x.parentId),key('LIEU',x.id),false,false,'');
  if(activeView==='ELECTRIQUE')for(const x of map.liens.filter(l=>l.actif)){
   let target=x.targetAssetId?key('ELECTRIQUE',x.targetAssetId):x.targetScopeNodeId?key('LIEU',x.targetScopeNodeId):x.targetEquipmentId?key('EQUIPEMENT',x.targetEquipmentId):null;
   if(target)edge(key('ELECTRIQUE',x.sourceAssetId),target,true,true,x.typeLien);
  }
  if(activeView==='FONCTIONNELLE')for(const x of map.equipements)if(x.scopeNodeId)edge(key('LIEU',x.scopeNodeId),key('EQUIPEMENT',x.id),false,true,'situé');
  for(const [k,p] of drawn.entries()){
   const [type,id]=k.split(':');const d=nodes.find(x=>x.id===id&&x.type===type);if(!d)continue;
   const group=el('g',{class:'node '+(type==='ELECTRIQUE'?'electric':type==='EQUIPEMENT'?'machine':'')+(chosen===k?' selected':''),transform:`translate(${p.x} ${p.y})`,tabindex:0,role:'button','aria-label':'Déplacer : '+d.name});
   const box=el('rect',{width:140,height:54,rx:9,ry:9});const text=el('text',{x:8,y:22});text.textContent=d.name.length>17?d.name.slice(0,16)+'…':d.name;
   const small=el('text',{x:8,y:42,style:'font-size:11px;font-weight:400'});small.textContent=type==='LIEU'?'Lieu':type==='ELECTRIQUE'?'Réseau':'Machine';group.append(box,text,small);
   group.addEventListener('pointerdown',e=>{if(e.button!==0)return;chosen=k;const rect=svg.getBoundingClientRect(),start={x:e.clientX,y:e.clientY,p:{...drawn.get(k)}};
    const move=ev=>{const dx=(ev.clientX-start.x)*1000/rect.width,dy=(ev.clientY-start.y)*700/rect.height;const v=drawn.get(k);v.x=Math.max(0,Math.min(860,Math.round(start.p.x+dx)));v.y=Math.max(0,Math.min(646,Math.round(start.p.y+dy)));group.setAttribute('transform',`translate(${v.x} ${v.y})`);};
    const end=()=>{group.removeEventListener('pointermove',move);group.removeEventListener('pointerup',end);group.removeEventListener('pointercancel',end);
     const v=drawn.get(k);if(v.x!==start.p.x||v.y!==start.p.y){dirty.set(k,true);say('messageEsquisse','Position modifiée : cliquer sur « Enregistrer les positions ».');}draw();};
    group.setPointerCapture(e.pointerId);group.addEventListener('pointermove',move);group.addEventListener('pointerup',end);group.addEventListener('pointercancel',end);});
   group.addEventListener('keydown',e=>{const delta={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]}[e.key];if(!delta)return;e.preventDefault();chosen=k;
    p.x=Math.min(860,Math.max(0,p.x+delta[0]));p.y=Math.min(646,Math.max(0,p.y+delta[1]));dirty.set(k,true);draw();const selected=svg.querySelector('.node.selected');selected?.focus();});
   group.addEventListener('click',()=>{chosen=k;draw();});svg.append(group);
  }
  selectOptions();
 }
 async function load(){if(!siteId)return;
  drawn.clear();positions.clear();dirty.clear();chosen=null;partial=false;
  map={lieux:[],appareillages:[],equipements:[],liens:[],usages:[]};
  for(let offset=0;offset<500;offset+=100){const r=await request('GET',route(topo,'/carte')+'&offset='+offset);
   for(const k of Object.keys(map))map[k].push(...(r[k]||[]));if(!r.suivant)break;if(offset===400)partial=true;}
  for(let offset=0;offset<500;offset+=100){const r=await request('GET',route(sketch,'/positions')+'&vue='+activeView+'&offset='+offset);
   for(const p of r.positions){const k=key(p.type,p.refId);positions.set(k,p);drawn.set(k,{x:p.x,y:p.y,revision:p.revision});}
   if(!r.suivant)break;if(offset===400)partial=true;}
  renderLinks();draw();say('messageEsquisse',partial?'Carte partielle (plus de 500 objets). Pagination et recherche grands sites à compléter.':'Esquisse chargée. Les éléments non placés peuvent être ajoutés un à un.');
 }
 $('placer').addEventListener('click',()=>{const k=$('ajouter').value;if(!k)return;drawn.set(k,defaultPoint(drawn.size));dirty.set(k,true);chosen=k;draw();say('messageEsquisse','Élément placé : enregistrer ses coordonnées pour le retrouver.');});
 $('save').addEventListener('click',async()=>{if(!siteId)return;const tasks=[...dirty.keys()];if(!tasks.length){say('messageEsquisse','Aucun déplacement à enregistrer.');return;}
  $('save').disabled=true;let ok=0;try{for(const k of tasks){const [type,refId]=k.split(':'),p=drawn.get(k),old=positions.get(k);
   const r=await request('POST',route(sketch,'/positions'),{vue:activeView,type,refId,x:p.x,y:p.y,expectedRevision:old?.revision||0});
   positions.set(k,{revision:r.revision});dirty.delete(k);ok++;}
   say('messageEsquisse',`${ok} position(s) enregistrée(s), sans modifier les raccordements.`);
  }catch(e){say('messageEsquisse',`Enregistrement partiel (${ok}/${tasks.length}) : ${e.message}. Rechargez en cas de conflit.`,true);}finally{$('save').disabled=false;draw();}});
 $('vue').addEventListener('change',async()=>{if(dirty.size&&!confirm('Des positions non enregistrées seront perdues. Continuer ?')){$('vue').value=activeView;return;}
  activeView=$('vue').value;try{await load();}catch(e){say('messageEsquisse',e.message,true);}});
 $('site').addEventListener('change',async()=>{if(dirty.size&&!confirm('Positions non enregistrées : quitter ce site ?')){ $('site').value=siteId;return;}
  siteId=$('site').value;try{await load();}catch(e){say('messageEsquisse',e.message,true);}});
 $('formLieu').addEventListener('submit',async e=>{e.preventDefault();const root=grants.find(g=>g.siteId===siteId&&g.role==='COORDINATEUR');if(!root){say('messageLieu','Cette création exige le coordinateur C1 autorisé.',true);return;}
  const data={sourceGrantId:root.id,parentNodeId:$('parent').value,typeNoeud:$('typeLieu').value,nom:$('nomLieu').value.trim()};
  if(!confirm('Créer le lieu « '+data.nom+' » dans C1 ? Cela modifie l’organigramme canonique, sans donner de droits supplémentaires.'))return;
  try{await request('POST',route(scope,'/unites'),data);say('messageLieu','Lieu créé dans C1. Positionnez-le maintenant sur la carte.');$('formLieu').reset();await load();}catch(err){say('messageLieu',err.message,true);}});
 $('formElement').addEventListener('submit',async e=>{e.preventDefault();const data={typeNoeud:$('typeElement').value,nom:$('nomElement').value.trim(),repere:$('repere').value.trim()||null,scopeNodeId:null};
  if(!confirm('Créer « '+data.nom+' » dans le référentiel électrique C4A, sans raccorder automatiquement ?'))return;
  try{await request('POST',route(topo,'/appareillages'),data);say('messageElement','Élément C4A enregistré sans lien. Positionnez-le sur le dessin.');$('formElement').reset();await load();}catch(err){say('messageElement',err.message,true);}});
 $('planLocal').addEventListener('change',e=>{const file=e.target.files?.[0];if(imageUrl){URL.revokeObjectURL(imageUrl);imageUrl=null;}
  if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024){say('messageEsquisse','Image locale refusée : PNG, JPEG ou WebP, 8 Mo maximum.',true);e.target.value='';return;}
  imageUrl=URL.createObjectURL(file);draw();say('messageEsquisse','Image affichée uniquement localement, non téléversée.');});
 $('retirerPlan').addEventListener('click',()=>{if(imageUrl){URL.revokeObjectURL(imageUrl);imageUrl=null;draw();}$('planLocal').value='';});
 window.addEventListener('beforeunload',e=>{if(imageUrl)URL.revokeObjectURL(imageUrl);if(dirty.size){e.preventDefault();e.returnValue='';}});
 try{const ctx=await window.SATEER_CONTEXT_READY;if(!tenant||!ctx.organisations?.some(o=>o.tenant_code===tenant))throw Error('SESSION_OU_TENANT_NON_AUTORISE');
  const sites=await request('GET',topo+'/sites'+q);const s=sites.sites||[];$('site').replaceChildren();s.forEach(x=>$('site').append(opt(x.nom+' · '+x.typeSite,x.id)));
  if(!s.length){say('contexte','Aucun site privé dans ce compte.');return;}
  const mine=await request('GET',scope+'/mes-responsabilites'+q);grants=mine.responsabilites||[];siteId=$('site').value;
  $('retour').href='/energie-cartographie.html'+q;$('versCarte').href='/energie-cartographie.html'+q;
  await load();say('contexte','Session privée active · '+tenant+' · accès propriétaire uniquement, recette.');
 }catch(e){say('contexte','Esquisse inaccessible : '+e.message,true);}
})();
