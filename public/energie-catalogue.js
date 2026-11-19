'use strict';
// Interface optionnelle C3 : uniquement le propriétaire du site ; protection assurée par Core côté serveur.
(async function(){
 const $=id=>document.getElementById(id);
 const params=new URLSearchParams(location.search),tenant=params.get('tenant'),caseId=params.get('case');
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 const q='?tenant='+encodeURIComponent(tenant||'');const api='/api/energy/catalogue/v1';
 let siteId=null,passports=[],references=[],pendingKey=null,busy=false;
 const message=(id,t,error=false)=>{const e=$(id);e.textContent=t;e.dataset.error=error?'true':'false';};
 const option=(text,value)=>new Option(text,value);
 async function request(method,url,body,key){const headers={Accept:'application/json'};
  if(body!==undefined)headers['Content-Type']='application/json';if(key)headers['Idempotency-Key']=key;
  const r=await fetch(url+(url.includes('?')?'&':'?')+'tenant='+encodeURIComponent(tenant),
   {method,credentials:'same-origin',cache:'no-store',headers,body:body===undefined?undefined:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.statut||'HTTP '+r.status);return j;
 }
 const append=(parent,tag,text)=>{const e=document.createElement(tag);e.textContent=text;parent.append(e);return e;};
 function siteOptions(sites){const old=$('site').value;$('site').replaceChildren();
  for(const s of sites)$('site').append(option(s.nom,s.id));
  if(sites.some(s=>s.id===old))$('site').value=old;
 }
 function passportOptions(){for(const id of ['source','passeportLier']){$(id).replaceChildren();
  if(id==='source')$(id).append(option('Pas de passeport pour le moment',''));
  for(const p of passports)$(id).append(option(p.nom+' · appareil '+p.numeroIndividuel+' · '+p.id.slice(0,8),p.id));
 }}
 function render(){const list=$('references');list.replaceChildren();$('referenceLier').replaceChildren();
  if(!references.length)append(list,'li','Aucune référence. Commencez par en proposer une.');
  for(const r of references){const li=document.createElement('li');
   append(li,'strong',r.sousFamille+' · '+r.designation);
   append(li,'small',[r.famille,r.marque||'Fabricant inconnu',r.modele||'Modèle inconnu',r.statut,r.nombreAppareils+' appareil(s) associé(s)'].join(' · '));
   if(r.statut==='CANDIDATE'){
    for(const [caption,decision] of [['Référencer en interne','REFERENCER'],['Rejeter','REJETER']]){
     const b=document.createElement('button');b.type='button';b.textContent=caption;
     b.addEventListener('click',async()=>{
      if(!confirm(decision==='REFERENCER'?'Vérifier la marque et le modèle ? Ce référencement reste interne et non certifié.':'Rejeter cette fiche candidate ?'))return;
      b.disabled=true;try{await request('POST',api+'/sites/'+siteId+'/references/'+r.id+'/decision',{decision});
       message('messageListe','Décision enregistrée.');await reloadRefs();}
      catch(e){message('messageListe','Décision refusée : '+e.message,true);}finally{b.disabled=false;}
     });li.append(b);
    }
   }
   if(r.statut==='REFERENCE_INTERNE')$('referenceLier').append(option((r.marque||'')+' '+(r.modele||'')+' · '+r.sousFamille,r.id));
   list.append(li);
  }
 }
 async function reloadRefs(){const r=await request('GET',api+'/sites/'+siteId+'/references');references=r.references||[];render();
  if(r.listePartielle)message('messageListe','Liste partielle (100 premières références).',false);
 }
 async function reload(){siteId=$('site').value;if(!UUID.test(siteId||''))return;
  passports=[];references=[];message('contexte','Chargement du catalogue privé…');
  try{const r=await request('GET','/api/energy/passports/sites/'+siteId);passports=r.passeports||[];}
  catch(_){/* La gestion manuelle fonctionne sans le module photo. */}
  passportOptions();await reloadRefs();message('contexte','Session privée active · '+tenant+' · site sélectionné.');
 }
 $('site').addEventListener('change',()=>reload().catch(e=>message('contexte',e.message,true)));
 $('source').addEventListener('change',async()=>{const id=$('source').value;
  if(!id){message('preuve','Aucune source photographique choisie.');return;}
  try{const p=await request('GET',api+'/sites/'+siteId+'/sources/'+id);
   $('famille').value=p.famille;$('designation').value=p.nom;
   const v=p.valeursDeclarees||{};
   $('marque').value=v.MARQUE?.valeur||'';$('modele').value=v.MODELE?.valeur||'';
   const watt=Number(v.PUISSANCE_W?.valeur);$('watts').value=Number.isSafeInteger(watt)&&watt>0?String(watt):'';
   const volts=Number(v.TENSION_V?.valeur);$('volts').value=Number.isSafeInteger(volts)&&volts>0?String(volts):'';
   message('preuve','Valeurs récupérées : '+Object.keys(v).length+' champs déclarés, '+Object.values(p.photosDisponibles||{}).reduce((a,b)=>a+b,0)+' photo(s) privée(s). Vérifiez avant de soumettre.');
  }catch(e){message('preuve','Plaque non accessible : '+e.message,true);}
 });
 $('formReference').addEventListener('input',()=>{if(!busy)pendingKey=null;});
 $('formReference').addEventListener('change',()=>{if(!busy)pendingKey=null;});
 $('formReference').addEventListener('submit',async(ev)=>{ev.preventDefault();if(busy||!siteId)return;
  const f=new FormData($('formReference'));const integer=name=>f.get(name)?Number(f.get(name)):null;
  const body={famille:f.get('famille'),sousFamille:String(f.get('sousFamille')||'').trim(),designation:String(f.get('designation')||'').trim(),
   marque:String(f.get('marque')||'').trim()||null,modele:String(f.get('modele')||'').trim()||null,
   puissanceNominaleW:integer('puissanceNominaleW'),tensionV:integer('tensionV'),sourcePassportId:f.get('sourcePassportId')||null};
  busy=true;$('soumettre').disabled=true;if(!pendingKey)pendingKey=crypto.randomUUID();
  try{const r=await request('POST',api+'/sites/'+siteId+'/references',body,pendingKey);
   message('messageForm',r.nouvelle?'Fiche candidate enregistrée. Vérifiez les informations avant de la référencer.':'Fiche déjà enregistrée pour cette demande.');
   pendingKey=null;await reloadRefs();}
  catch(e){message('messageForm','Enregistrement refusé : '+e.message,true);}finally{busy=false;$('soumettre').disabled=false;}
 });
 $('formLier').addEventListener('submit',async(e)=>{e.preventDefault();if(!siteId)return;
  const refId=$('referenceLier').value,passportId=$('passeportLier').value;
  if(!UUID.test(refId||'')||!UUID.test(passportId||'')){message('messageLier','Sélectionnez une référence et un passeport.',true);return;}
  try{await request('POST',api+'/sites/'+siteId+'/references/'+refId+'/associer',{passportId});
   message('messageLier','Passeport associé à sa référence technique, sans copier les photos.');await reloadRefs();}
  catch(x){message('messageLier','Association refusée : '+x.message,true);}
 });
 if(tenant)$('retour').href='/inventaire-energie.html'+q+(caseId?'&case='+encodeURIComponent(caseId):'');
 try{const ctx=await window.SATEER_CONTEXT_READY;if(!tenant||!((ctx.organisations||[]).some(o=>o.tenant_code===tenant)))throw Error('SESSION_OU_TENANT_NON_AUTORISE');
  const r=await request('GET','/api/energy/inventory/sites');
  const sites=r.sites||[];if(!sites.length){message('contexte','Créez d’abord un inventaire privé depuis SUNU Courant.');return;}
  siteOptions(sites);await reload();
 }catch(e){message('contexte','Catalogue inaccessible : '+e.message,true);}
})();
