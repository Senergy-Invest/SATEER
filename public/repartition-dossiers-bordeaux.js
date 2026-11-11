'use strict';
/* P335BY : l'API et les permissions restent sources de vérité. Aucune action automatique au chargement. */
(()=>{
 const org='70',tenant='P6V_3B5AC5AB9DB04657';
 const params=new URLSearchParams(location.search),qs=new URLSearchParams({organisationId:org,tenant});
 const $=id=>document.getElementById(id),stat=$('status');
 const node=(tag,text)=>{const e=document.createElement(tag);if(text!=null)e.textContent=String(text);return e;};
 const api='/api/bordeaux-case-dispatch';let offices=[],agents=[],current=0,offset=0,write=false,total=0;
 function set(msg,error=false){stat.textContent=msg;stat.className=error?'error':'';}
 async function request(route,options={}){
   const method=options.method||'GET';const query=new URLSearchParams(qs);
   if(options.extra)for(const [k,v] of Object.entries(options.extra))query.set(k,String(v));
   const headers={Accept:'application/json'};
   if(options.body!=null)headers['Content-Type']='application/json';
   const r=await fetch(api+route+'?'+query,{method,credentials:'same-origin',cache:'no-store',headers,
     ...(options.body!=null?{body:JSON.stringify(options.body)}:{})});
   const x=await r.json().catch(()=>({statut:'REPONSE_NON_JSON'}));
   if(!r.ok)throw Error(x.statut||'HTTP '+r.status);
   return x;
 }
 function fmtHours(v){return v==null?'Non mesuré':(Number(v)/3600).toFixed(1)+' h';}
 function card(label,value,sub){const b=node('article');b.className='box';b.append(node('small',label));const s=node('strong',value);b.append(s);if(sub)b.append(node('div',sub));return b;}
 async function stats(){
   const r=await request('/stats');
   if(!Array.isArray(r.bureaux))throw Error('STATISTIQUES_INCOMPATIBLES : liste des bureaux absente');
   const champs=['enAttente','enCours','traitees','sansAgent'];
   for(const b of r.bureaux){
     const manquants=champs.filter(k=>!Number.isSafeInteger(b[k]) || b[k]<0);
     if(typeof b.bureau!=='string'||manquants.length){
       throw Error('STATISTIQUES_INCOMPATIBLES : champs manquants ('+manquants.join(', ')+')');
     }
   }
   const root=$('metrics');root.replaceChildren();
   for(const b of r.bureaux){const e=card(b.bureau,(b.enAttente+b.enCours)+' ouverts',
     `${b.enAttente} nouveaux · ${b.enCours} en cours · ${b.traitees} traités · ${b.sansAgent} sans agent`);
     e.className='box';root.append(e);}
 }
 async function refresh(){
  const unitId=current;if(!unitId)return;set('Chargement des données du bureau…');
  const [a,c,t,performance]=await Promise.all([request('/agents',{extra:{unitId}}),request('/cases',{extra:{unitId,offset}}),
    request('/delays',{extra:{unitId}}),request('/agent-metrics',{extra:{unitId}})]);
  agents=a.agents;total=c.pagination.total;
  const performanceParId=new Map(performance.agents.map(x=>[Number(x.agentId),x]));
  const ar=$('agents');ar.replaceChildren();ar.append(node('h3','Agents habilités et charge actuelle'));
  if(!agents.length)ar.append(node('p','Aucun agent habilité et rattaché à ce bureau.'));
  for(const person of agents){
    const art=node('article'),title=node('div');title.append(node('strong',person.prenom+' '+person.nom));
    title.append(node('div',`${person.charge} dossiers ouverts · ${person.traites} dossiers traités · capacité ${person.capacite} · ${person.disponible?'disponible':'indisponible'}`));
    const per=performanceParId.get(Number(person.personneId));
    if(per)title.append(node('small',`Première réponse moyenne : ${per.delaiPremiereReponseHeures==null?'non mesurée':per.delaiPremiereReponseHeures+' h'} · remise : ${per.delaiRemiseHeures==null?'non mesurée':per.delaiRemiseHeures+' h'}`));
    art.append(title);
    if(write){const actions=node('div');actions.className='case-actions';
      const cap=node('input');cap.type='number';cap.min='0.25';cap.max='2';cap.step='0.25';cap.value=person.capacite;cap.setAttribute('aria-label','Capacité de '+person.prenom);
      const available=node('input');available.type='checkbox';available.checked=person.disponible;available.setAttribute('aria-label','Disponible : '+person.prenom);
      const btn=node('button','Enregistrer capacité');btn.type='button';btn.addEventListener('click',async()=>{
        try{btn.disabled=true;await request('/units/'+unitId+'/agents/'+person.personneId+'/settings',{method:'PUT',body:{capacite:Number(cap.value),disponible:available.checked}});set('Disponibilité et capacité enregistrées, avec audit.');await refresh();}
        catch(e){set('Configuration : '+e.message,true);}finally{btn.disabled=false;}
      });actions.append(cap,available,btn);art.append(actions);}
    ar.append(art);
  }
  const root=$('cases');root.replaceChildren();
  if(!c.dossiers.length)root.append(node('p','Aucun dossier sur cette page.'));
  for(const d of c.dossiers){const e=node('article'),meta=node('div');meta.append(node('strong','n°'+d.id+' · '+(d.objet||d.categorie||'Dossier')));
   meta.append(node('div',`${d.priorite||'Normale'} · ${d.statut} · agent ${d.agentId||'non affecté'}`));e.append(meta);
   if(write&&d.statut==='NOUVELLE'){
    const actions=node('div');actions.className='case-actions';
    const select=node('select');select.setAttribute('aria-label','Agent du dossier '+d.id);
    for(const p of agents.filter(p=>p.disponible)) {const opt=node('option',p.prenom+' '+p.nom);opt.value=p.personneId;select.append(opt);}
    const manual=node('button','Affecter manuellement');manual.disabled=select.options.length===0;
    const auto=node('button','Proposer et affecter');auto.className='secondary';auto.disabled=!agents.some(x=>x.disponible);
    async function affect(mode){let motif=null;if(d.agentId!=null){motif=window.prompt('Motif de réaffectation (8 caractères minimum) :');if(motif===null)return;}
      if(!window.confirm('Affecter ce dossier existant ? Cela ne déclenche pas la prise en charge.'))return;
      try{manual.disabled=auto.disabled=true;
        await request('/cases/'+d.id+'/assign',{method:'POST',body:{unitId,mode,agentId:mode==='MANUEL'?Number(select.value):null,motif}});
        set('Dossier n°'+d.id+' affecté et enregistré dans le journal.');await refresh();await stats();}
      catch(x){set('Affectation impossible : '+x.message,true);manual.disabled=auto.disabled=false;}
    }
    manual.addEventListener('click',()=>affect('MANUEL'));auto.addEventListener('click',()=>affect('AUTO'));
    actions.append(select,manual,auto);e.append(actions);
   }
   root.append(e);
  }
  $('page').textContent=`${total===0?0:offset+1}–${Math.min(total,offset+c.dossiers.length)} sur ${total}`;
  $('previous').disabled=offset===0;$('next').disabled=offset+50>=total;
  const timing=$('timings');timing.replaceChildren();for(const [name,val] of Object.entries(t.moyennesSecondes||{}))timing.append(card(name,fmtHours(val)));
  set('Données du bureau actualisées. Seules les actions explicites modifient les affectations.');
 }
 async function audit(){if(!write)return;const r=await request('/audit');const a=$('audit');a.replaceChildren();
  for(const e of r.evenements.slice(0,25)){const line=node('article');line.append(node('strong',e.action));line.append(node('span',`Dossier ${e.demandeId||'—'} · agent ${e.agentId||'—'} · ${new Date(e.date).toLocaleString('fr-FR')}`));a.append(line);}
  if(!r.evenements.length)a.append(node('p','Aucune affectation réalisée dans cette campagne.'));
 }
 async function init(){
  if(params.get('organisation')!==org||params.get('tenant')!==tenant){set('Contexte Bordeaux invalide.',true);return;}
  try{await Promise.resolve(window.SATEER_CONTEXT_READY);const access=await request('/access');write=access.peutAffecter===true;
    const u=await request('/units');offices=u.bureaux;$('workspace').hidden=false;$('officeSection').hidden=false;$('timingSection').hidden=false;
    $('auditSection').hidden=!write; $('batch').hidden=!write;
    const select=$('office');for(const b of offices){const opt=node('option',b.nom);opt.value=b.id;select.append(opt);}
    if(offices.length){current=Number(offices[0].id);select.value=current;await Promise.all([stats(),refresh(),audit()]);}
    else set('Aucun bureau actif.');
    select.addEventListener('change',async()=>{current=Number(select.value);offset=0;try{await refresh();}catch(e){set(e.message,true);}});
    $('reload').addEventListener('click',async()=>{try{await stats();await refresh();await audit();}catch(e){set(e.message,true);}});
    $('previous').addEventListener('click',async()=>{offset=Math.max(0,offset-50);await refresh().catch(e=>set(e.message,true));});
    $('next').addEventListener('click',async()=>{offset+=50;await refresh().catch(e=>set(e.message,true));});
    $('batch').addEventListener('click',async()=>{
      if(!window.confirm('Répartir jusqu’à 20 dossiers NON affectés dans ce bureau ? Action auditée, sans prise en charge.'))return;
      const btn=$('batch');btn.disabled=true;
      try{const r=await request('/units/'+current+'/distribute',{method:'POST',body:{confirmation:'REPARTIR_20_DOSSIERS_MAX'}});
        await stats();await refresh();await audit();set(r.affectations.length+' dossiers affectés automatiquement après confirmation.');}
      catch(e){set('Répartition impossible : '+e.message,true);}finally{btn.disabled=false;}
    });
  }catch(e){set('Accès indisponible : '+e.message,true);}
 }
 init();
})();
