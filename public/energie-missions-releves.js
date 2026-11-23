'use strict';
/** EP1 : interface privée sans droits calculés côté navigateur ; aucune insertion directe E-METER. */
(async()=>{
 const el=id=>document.getElementById(id),tenant=new URLSearchParams(location.search).get('tenant');
 const API='/api/energy/participation/v1',METER='/api/energy/mesures/v1';
 let ownerSites=[],ctx=null,blocked=false,photoAvailable=false;
 const pending=new Map();
 const info=(txt,error=false)=>{el('etat').textContent=txt;el('etat').classList.toggle('error',error);};
 const option=(label,id)=>new Option(label,id);
 function setOptions(id,arr,caption,value){const node=el(id);node.replaceChildren(option('Choisir…',''));for(const x of arr)node.add(option(caption(x),value(x)));}
 async function request(base,method,path,data,key){
  const u=base+path+(path.includes('?')?'&':'?')+'tenant='+encodeURIComponent(tenant);
  const headers={Accept:'application/json'};
  if(method!=='GET')headers['Content-Type']='application/json';
  if(key)headers['Idempotency-Key']=key;
  const r=await fetch(u,{method,credentials:'same-origin',cache:'no-store',headers,...(method==='GET'?{}:{body:JSON.stringify(data)})});
  const json=await r.json().catch(()=>({}));if(!r.ok)throw Error(json.statut||'HTTP_'+r.status);return json;
 }
 function pendingKey(action,data){const hash=JSON.stringify(data);let p=pending.get(action);
  if(!p||p.hash!==hash){p={hash,key:crypto.randomUUID()};pending.set(action,p);}return p.key;}
 function complete(action){pending.delete(action);}
 const post=async(path,body,action)=>{const key=pendingKey(action,body);const out=await request(API,'POST',path,body,key);complete(action);return out;};
 async function loadContexte(){const siteId=el('site').value;if(!siteId)return;
  ctx=await request(API,'GET','/sites/'+encodeURIComponent(siteId)+'/contexte');
  const distinct=[...new Map(ctx.registres.map(r=>[r.pointId,r])).values()];
  setOptions('point',distinct,p=>p.pointNom+(p.scopeNodeId?' · déjà lié':''),p=>p.pointId);
  setOptions('unite',ctx.unites,n=>n.nom+' · '+n.type,n=>n.id);
  const actifs=ctx.registres.filter(r=>r.registerId&&r.scopeNodeId);
  setOptions('registre',actifs,r=>r.pointNom+' · '+r.compteur+' · '+r.code+' ['+r.unite+']',r=>r.registerId);
  setOptions('grant',ctx.responsabilites,g=>g.perimetre+' · '+g.role,g=>g.id);
  el('contexte').textContent=ctx.registres.length+' registre(s)/point(s) visibles · '+ctx.responsabilites.length+' affectation(s) active(s).'+(ctx.listePartielle?' ATTENTION : liste partielle, aucune nouvelle attribution autorisée.':'');
  el('lier').querySelector('button').disabled=ctx.listePartielle;
  el('attribuer').querySelector('button').disabled=ctx.listePartielle;
  if(!actifs.length)info('Aucun registre associé à un périmètre C1 : commencez par relier un point.');
 }
 function label(parent,txt,kind='strong'){const e=document.createElement(kind);e.textContent=txt;parent.append(e);return e;}
 function makeButton(txt,cb,danger=false){const b=document.createElement('button');b.type='button';b.className=danger?'danger':'secondary';b.textContent=txt;b.addEventListener('click',cb);return b;}
 const localDate=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,19);};
 async function photoToPng(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024||file.size<64)throw Error('PHOTO_NON_ADMISE');
  const picture=await createImageBitmap(file);
  try{
   for(const max of [2400,1800,1200,900]){
    const scale=Math.min(1,max/Math.max(picture.width,picture.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(picture.width*scale));canvas.height=Math.max(1,Math.round(picture.height*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('CANVAS_INDISPONIBLE');
    ctx.drawImage(picture,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(blob&&blob.size>=64&&blob.size<=3*1024*1024)return blob;
   }
   throw Error('PHOTO_TROP_VOLUMINEUSE');
  }finally{picture.close?.();}
 }
 // E-METER-3 R1 : avis purement indicatif, affiché avant les décisions du coordinateur.
 async function afficherPrecontrole(li,m){
  const box=document.createElement('div');box.className='safety';li.append(box);
  const title=document.createElement('strong');title.textContent='Précontrôle indicatif avant décision';box.append(title);
  const say=txt=>{const p=document.createElement('p');p.className='muted';p.textContent=txt;box.append(p);};
  try{
   const q=await request('/api/energy/precontrole/v1','GET','/missions/'+encodeURIComponent(m.id)+'/apercu');
   if(q.statut!=='PRECONTROLE_INDICATIF')throw Error('REPONSE_INATTENDUE');
   say('Index proposé : '+q.indexPropose+' '+q.unite+' · contrôle non certifiant.');
   say(q.precedent?'Relevé antérieur du même compteur et registre : '+q.precedent.valeur+' '+q.unite+' ('+q.precedent.date+').':'Aucun relevé antérieur comparable sur ce compteur et ce registre.');
   if(q.suivant)say('Attention : relevé canonique à la même heure ou plus récent ('+q.suivant.date+').');
   for(const s of q.signaux||[])say((s.niveau==='A_VERIFIER'?'À VÉRIFIER':'Information')+' · '+s.code+' : '+s.explication);
   if(q.statutQualite==='REFERENCE_ABSENTE')say('Référence absente : aucune conclusion de cohérence n’est possible.');
   else if(q.statutQualite==='AUCUN_SIGNAL_DETECTE')say('Aucun signal détecté selon les règles existantes ; cela ne certifie pas la valeur.');
   else say('Un ou plusieurs signaux nécessitent une revue humaine.');
  }catch(e){say('Précontrôle indisponible ('+e.message+'). Effectuer la revue manuellement ; ne pas interpréter cette absence comme une validation.');}
 }
 async function refresh(){const r=await request(API,'GET','/mes-missions');el('missions').replaceChildren();
  el('indication').textContent=r.listePartielle?'Premières 50 missions uniquement : liste partielle.':'Missions privées, visibles uniquement selon vos droits Core/C1.';
  for(const m of r.missions){const li=document.createElement('li');label(li,m.point+' · '+m.registre+' ['+m.unite+']');
   const p=document.createElement('p');p.className='muted';p.textContent=m.site+' · '+m.perimetre+' · '+m.statut+(m.valeur!==null?' · index proposé '+m.valeur:'');li.append(p);
   if(m.attributaire&&m.statut==='A_FAIRE'){
    const f=document.createElement('form');f.className='mission-form';
    const a=document.createElement('label');a.textContent='Index affiché';const ix=document.createElement('input');ix.required=true;ix.placeholder='1234.5';ix.inputMode='decimal';a.append(ix);
    const b=document.createElement('label');b.textContent='Date et heure de lecture';const date=document.createElement('input');date.required=true;date.type='datetime-local';date.step='1';date.value=localDate();b.append(date);
    const c=document.createElement('label');c.textContent='Observation facultative';const note=document.createElement('input');note.maxLength=240;c.append(note);
    const btn=document.createElement('button');btn.textContent='Soumettre pour revue';btn.type='submit';f.append(a,b,c,btn);
    // EMETER2_R1_OCR : photo facultative, OCR indicatif, jamais de soumission automatique.
    if(photoAvailable){
     const labelPhoto=document.createElement('label');labelPhoto.textContent='Photo de l’afficheur (facultatif, sans danger)';
     const photoInput=document.createElement('input');photoInput.type='file';photoInput.accept='image/jpeg,image/png,image/webp';
     photoInput.setAttribute('capture','environment');labelPhoto.append(photoInput);
     const scan=makeButton('Lire l’index sur la photo',async()=>{
      if(blocked)return;
      const file=photoInput.files?.[0];if(!file)return info('Choisissez une photo de l’afficheur.',true);
      blocked=true;scan.disabled=true;use.hidden=true;proposal=null;
      try{
       const bytes=await photoToPng(file);
       const url='/api/energy/index-photo/v1/missions/'+encodeURIComponent(m.id)+'/analyser?tenant='+encodeURIComponent(tenant);
       const response=await fetch(url,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json','Content-Type':'application/octet-stream'},body:bytes});
       const result=await response.json().catch(()=>({statut:'REPONSE_ILLISIBLE'}));
       if(!response.ok)throw Error(result.statut||'HTTP_'+response.status);
       if(result.statut==='OCR_INDEX_A_CONFIRMER'){
        proposal=result.valeurProposee;
        message.textContent='Valeur suggérée : '+proposal+' '+m.unite+' — non vérifiée. Contrôlez-la sur l’afficheur avant de la reprendre.';
        use.hidden=false;
       }else message.textContent='Aucun index proposé : '+result.statut+'. Saisissez manuellement après observation.';
      }catch(err){message.textContent='Lecture non disponible : '+err.message+'. Saisie manuelle possible.';}
      finally{blocked=false;scan.disabled=false;}
     });
     const message=document.createElement('p');message.className='muted';message.setAttribute('role','status');
     const use=makeButton('Reprendre cet index après vérification visuelle',()=>{
      if(proposal===null)return;
      ix.value=proposal;use.hidden=true;
      message.textContent='Valeur reprise dans le formulaire, non envoyée. Vérifiez la date puis soumettez volontairement.';
      ix.focus();
     });
     use.hidden=true;let proposal=null;
     photoInput.addEventListener('change',()=>{proposal=null;use.hidden=true;message.textContent='';});
     f.insertBefore(labelPhoto,btn);f.insertBefore(scan,btn);f.insertBefore(message,btn);f.insertBefore(use,btn);
    }

    f.addEventListener('submit',async e=>{e.preventDefault();if(blocked)return;
     const d=new Date(date.value);if(!Number.isFinite(d.getTime()))return info('Date invalide.',true);
     const body={valeur:ix.value.trim().replace(',','.'),releveLe:d.toISOString(),observation:note.value.trim()||null};
     blocked=true;btn.disabled=true;try{await post('/missions/'+m.id+'/soumettre',body,'submit:'+m.id);info('Index proposé. Il n’est pas encore dans le registre canonique.');await refresh();}
     catch(err){info('Soumission non confirmée : '+err.message,true);}finally{blocked=false;btn.disabled=false;}});li.append(f);
   }
   if(m.coordinateur&&m.statut==='A_REVOIR'){
    await afficherPrecontrole(li,m);
    const actions=document.createElement('div');
    for(const [txt,decision] of [['Intégrer comme index déclaré à vérifier','INTEGRER'],['Refuser cette déclaration','REFUSER']]){
     actions.append(makeButton(txt,async()=>{if(blocked||!confirm(decision==='INTEGRER'?'Intégrer cet index comme donnée DÉCLARÉE À VÉRIFIER, sans certification ni calcul ?':'Refuser la déclaration sans effacer sa trace ?'))return;
      blocked=true;try{const r=await post('/missions/'+m.id+'/decision',{decision},'review:'+m.id+':'+decision);
       info(r.statut+' · '+(r.qualification||r.statut));await refresh();}catch(err){info('Décision non confirmée : '+err.message,true);}finally{blocked=false;}
     },decision==='REFUSER'));
    }li.append(actions);
   }
   el('missions').append(li);
  }
  if(!r.missions.length){const li=document.createElement('li');li.textContent='Aucune mission accessible pour ce compte.';el('missions').append(li);}
 }
 el('actualiser').addEventListener('click',()=>refresh().catch(e=>info(e.message,true)));
 el('site').addEventListener('change',()=>loadContexte().catch(e=>info(e.message,true)));
 el('lier').addEventListener('submit',async e=>{e.preventDefault();if(blocked||ctx?.listePartielle)return;
  const site=el('site').value,point=el('point').value,node=el('unite').value;if(!site||!point||!node)return;
  blocked=true;try{const r=await post('/sites/'+site+'/points/'+point+'/liaison',{scopeNodeId:node},'link:'+site+':'+point);
   info(r.statut);await loadContexte();}catch(err){info(err.message,true);}finally{blocked=false;}
 });
 el('attribuer').addEventListener('submit',async e=>{e.preventDefault();if(blocked||ctx?.listePartielle)return;
  const site=el('site').value,reg=ctx.registres.find(r=>r.registerId===el('registre').value),g=ctx.responsabilites.find(x=>x.id===el('grant').value);
  if(!reg||!g||g.nodeId!==reg.scopeNodeId)return info('Le registre et le responsable doivent appartenir à la même unité C1.',true);
  blocked=true;try{const r=await post('/sites/'+site+'/missions',{registerId:reg.registerId,grantId:g.id},'assign:'+site+':'+reg.registerId+':'+g.id);
   info(r.statut);await refresh();}catch(err){info(err.message,true);}finally{blocked=false;}
 });
 try{
  if(!tenant||!/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenant))throw Error('TENANT_INVALIDE');
  el('retour').href='/energie-pilotage.html?tenant='+encodeURIComponent(tenant);
  if(!window.SATEER_CONTEXT_READY)throw Error('SESSION_CORE_INDISPONIBLE');
  const context=await window.SATEER_CONTEXT_READY;
  if(!(context.organisations||[]).some(x=>x.tenant_code===tenant))throw Error('TENANT_NON_AUTORISE');
  const r=await request(METER,'GET','/sites').catch(()=>({sites:[]}));ownerSites=r.sites||[];
  if(ownerSites.length){el('coordination').hidden=false;
   setOptions('site',ownerSites,s=>s.nom+' · '+s.pays,s=>s.id);el('site').disabled=false;
   el('site').value=ownerSites[0].id;await loadContexte();}
  photoAvailable=await fetch('/api/energy/index-photo/v1/capacite?tenant='+encodeURIComponent(tenant),{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}}).then(r=>r.ok).catch(()=>false);
  await refresh();info('Session Energy valide · missions déclaratives non certifiées.');
 }catch(e){info('Accès indisponible : '+e.message,true);}
})();
