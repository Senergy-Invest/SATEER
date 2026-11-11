/* P335BX - interface configurateur de recette. Le serveur est l'unique arbitre. */
(() => {
 'use strict';
 const org='70',tenant='P6V_3B5AC5AB9DB04657';
 const params=new URLSearchParams(location.search);
 const status=document.getElementById('status'),space=document.getElementById('workspace'),grid=document.getElementById('rule-grid');
 const qs=new URLSearchParams({organisationId:org,tenant}).toString();
 const cat=[['PASSEPORT','Passeport'],['ETAT_CIVIL','État civil'],['CARTE_CONSULAIRE','Carte consulaire']];
 const node=(tag,s)=>{const e=document.createElement(tag);if(s!=null)e.textContent=String(s);return e;};
 const url='/api/bordeaux-email-demo/triage/';
 const request=async(p,init={})=>{const r=await fetch(url+p+(p.includes('?')?'&':'?')+qs,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(init.body?{'Content-Type':'application/json'}:{})},...init});
  const j=await r.json();if(!r.ok)throw Error(j.statut||'HTTP '+r.status);return j;};
 const metric=(name,num)=>{const a=node('article');a.append(node('div',name),node('strong',num));return a;};
 async function refresh(){
  const [rules,bureaux,stats]=await Promise.all([request('regles'),request('bureaux'),request('vice')]);
  const ms=document.getElementById('metrics');ms.replaceChildren(metric('Total courriers fictifs',stats.totalCourriers),
   metric('Proposés au Secrétariat',stats.nombres.secretariat),metric('En attente assistant / bureau',stats.nombres.assistant+stats.nombres.bureau));
  grid.replaceChildren();
  for(const [code,name] of cat){
   const current=rules.regles.find(x=>x.categorie===code&&x.actif)||{};
   const article=node('article'),heading=node('h3',name);article.append(heading);
   const label1=node('label','Mode de file virtuelle'),mode=node('select');
   for(const [value,title] of [['MANUEL','Manuel — Secrétariat'],['PROPOSITION','Proposition simulée']]){
    const option=node('option',title);option.value=value;option.selected=(current.mode||'MANUEL')===value;mode.append(option);
   }
   const label2=node('label','Bureau destinataire proposé'),unit=node('select');
   const none=node('option','Aucun');none.value='';unit.append(none);
   for(const b of bureaux.bureaux){const option=node('option',b.nom+' (n°'+b.id+')');option.value=String(b.id);option.selected=String(current.bureauId)===String(b.id);unit.append(option);}
   const update=()=>{unit.disabled=mode.value==='MANUEL';if(unit.disabled)unit.value='';};
   mode.addEventListener('change',update);
   update();
   const button=node('button','Enregistrer la règle de recette');button.type='button';button.disabled=!rules.peutConfigurer;
   const feedback=node('p');feedback.setAttribute('role','status');
   button.addEventListener('click',async()=>{
    feedback.textContent='Vérification…';button.disabled=true;
    try{const body={mode:mode.value,destinationUnitId:mode.value==='MANUEL'?null:Number(unit.value)||null};
     const j=await request('regles/'+code,{method:'PUT',body:JSON.stringify(body)});
     if(j.executionAutomatique!==false)throw Error('Réponse ambiguë');
     feedback.textContent='Règle enregistrée et auditée. Aucun traitement de courrier déclenché.';
     await refresh();
    }catch(e){feedback.textContent='Échec : '+e.message;button.disabled=false;}
   });
   article.append(label1,mode,label2,unit,button,feedback);grid.append(article);
  }
  space.hidden=false;
  if(rules.peutConfigurer){
   const audit=await request('audit');const a=document.getElementById('audit');a.replaceChildren();
   if(!audit.evenements.length)a.append(node('p','Aucune modification enregistrée.'));
   for(const entry of audit.evenements){
    const p=node('p',(new Date(entry.date)).toLocaleString('fr-FR')+' — '+entry.categorie+' : '+
      (entry.ancien?.mode||'non configurée')+' → '+(entry.nouveau?.mode||'—')+' (acteur n°'+entry.acteurId+')');a.append(p);
   }
   document.getElementById('auditSection').hidden=false;
  }
  status.textContent=rules.peutConfigurer?'Compte autorisé à configurer les files fictives.':'Consultation seule : modification interdite.';
 }
 if(params.get('organisation')!==org || params.get('tenant')!==tenant){status.textContent='Contexte Bordeaux invalide.';return;}
 Promise.resolve(window.SATEER_CONTEXT_READY).then(async()=>{
  const a=await request('access');if(a.profil!=='VICE')throw Error('Rôle Vice-Consul requis');await refresh();
 }).catch(e=>{space.hidden=true;status.textContent='Accès indisponible : '+e.message;});
})();
