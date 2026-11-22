'use strict';
/** E-METER-1D1 : parcours d'import contrôlé, sans stockage local ni HTML injecté. */
(async()=>{
 const $=id=>document.getElementById(id);
 const tenant=new URLSearchParams(location.search).get('tenant');
 const base='/api/energy/import/v1';
 let sites=[],courant=null,fichier='',apercu=null,cle=null,verrou=false,revision=0,snapshot=null;
 const statut=(v,erreur=false)=>{$('etat').textContent=v;$('etat').classList.toggle('error',erreur);};
 const option=(label,value)=>{const n=document.createElement('option');n.textContent=label;n.value=value;return n;};
 const ligneTexte=(values,etat)=>{const tr=document.createElement('tr');if(etat)tr.dataset.etat=etat;
  for(const value of values){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}return tr;};
 const path=p=>base+p+(p.includes('?')?'&':'?')+'tenant='+encodeURIComponent(tenant);
 const appel=async(method,p,body,requestKey)=>{
  const h={Accept:'application/json'};
  if(method==='POST'){h['Content-Type']='application/json';if(requestKey)h['Idempotency-Key']=requestKey;}
  const response=await fetch(path(p),{method,headers:h,credentials:'same-origin',cache:'no-store',
   ...(method==='POST'?{body:JSON.stringify(body)}:{})});
  const json=await response.json().catch(()=>({}));
  if(!response.ok){const e=new Error(json.statut||'HTTP_'+response.status);e.ligne=json.ligne;throw e;}
  return json;
 };
 // Le filtre natif macOS `accept` est supprimé : il grisait des CSV valides.
 // Le nom est vérifié côté navigateur ; le contenu reste validé côté serveur.
 // Les doubles de test en mémoire peuvent omettre File.name.
 const nomCSV=f=>!f||typeof f.name!=='string'||/\.csv$/i.test(f.name);
 const selectionDisponible=()=>Boolean(courant&&$('csv').files?.length&&nomCSV($('csv').files[0]));
 function controles(){
  $('site').disabled=verrou||!sites.length;
  $('csv').disabled=verrou;
  const selection=selectionDisponible();
  $('apercu').disabled=verrou||!selection;
  const f=$('csv').files?.[0];
  $('fichier-etat').textContent=!f
   ? 'Aucun fichier sélectionné. Le sélecteur macOS affiche tous les fichiers ; choisissez uniquement un .csv.'
   : !nomCSV(f)
    ? 'Fichier sélectionné : '+f.name+'. Extension non .csv : choisissez un fichier CSV (pas un ZIP, ni un .csv.txt).'
    : !courant
     ? 'Fichier détecté : '+f.name+'. Sélectionnez un site autorisé.'
     : 'Fichier détecté : '+f.name+' ('+f.size+' octets). '+
       (verrou?'Prévisualisation en cours…':'La prévisualisation est disponible sans écriture en base.');
 }
 function reinitialiser(){
  revision++;fichier='';apercu=null;cle=null;snapshot=null;
  $('bilan').textContent='Aucun fichier prévisualisé.';
  $('lignes').replaceChildren(ligneTexte(['—','—','—','—','—','Aucun aperçu']));
  $('consentement').checked=false;$('consentement').disabled=true;$('valider').disabled=true;
  $('resultat').textContent='Aucune écriture réalisée.';
  controles();
 }
 const actuel=(s)=>Boolean(s&&revision===s.revision&&courant?.id===s.siteId&&$('csv').files?.[0]===s.file);
 $('site').addEventListener('change',()=>{courant=sites.find(x=>x.id===$('site').value)||null;reinitialiser();});
 const fichierChange=()=>{
  reinitialiser();
  const f=$('csv').files?.[0];
  statut(!f?'Aucun fichier sélectionné : choisissez un .csv, pas un ZIP.':
    !nomCSV(f)?'Fichier non CSV : '+f.name+'. Choisissez un nom se terminant par .csv.':
    !courant?'Sélectionnez un site autorisé.':'Fichier reconnu : '+f.name+'. Cliquez sur Prévisualiser sans écrire en base.',!f||!nomCSV(f));
 };
 $('csv').addEventListener('change',fichierChange);
 // Couvre les navigateurs qui déclenchent input avant change pour le sélecteur de fichier.
 $('csv').addEventListener('input',()=>controles());
 window.addEventListener?.('pageshow',()=>controles());
 $('consentement').addEventListener('change',()=>{
  $('valider').disabled=verrou||!apercu?.importPossible||!actuel(snapshot)||!$('consentement').checked;
 });
 $('apercu').addEventListener('click',async()=>{
  if(verrou||!courant)return;
  const file=$('csv').files?.[0];if(!file)return;
  const attendu={revision,siteId:courant.id,file};
  verrou=true;controles();
  try{
   if(file.size===0||file.size>65536)throw Error('TAILLE_CSV_INVALIDE');
   const bytes=await file.arrayBuffer();
   if(!actuel(attendu))return; // Aucune réponse tardive ne réactive un ancien aperçu.
   const csv=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
   const v=await appel('POST','/sites/'+encodeURIComponent(attendu.siteId)+'/apercu',{csv});
   if(!actuel(attendu))return;
   fichier=csv;apercu=v;cle=crypto.randomUUID();snapshot={...attendu,sha256:v.fichierSha256};
   $('lignes').replaceChildren();
   for(const l of v.lignes){$('lignes').append(ligneTexte([l.numero,l.registreId,l.releveLe,l.valeur,l.unite||'—',
    l.motif||'Admissible · non vérifié'],l.statut));}
   $('bilan').textContent='Lot '+v.fichierSha256.slice(0,12)+'… · '+v.total+' ligne(s) · '+v.admissibles+' admissible(s) · '+v.refusees+' refusée(s).';
   $('consentement').disabled=!v.importPossible;$('consentement').checked=false;$('valider').disabled=true;
   statut(v.importPossible?'Aperçu en lecture seule conforme. Confirmez uniquement après contrôle humain.':'Lot refusé : corrigez le fichier, puis prévisualisez-le à nouveau.',!v.importPossible);
  }catch(e){
   if(actuel(attendu)){reinitialiser();statut('Prévisualisation impossible : '+e.message+(e.ligne?' · ligne '+e.ligne:''),true);}
  }finally{verrou=false;controles();}
 });
 $('valider').addEventListener('click',async()=>{
  if(verrou||!apercu?.importPossible||!actuel(snapshot)||!$('consentement').checked||!cle)return;
  // Le site, le fichier et la clé sont figés pendant l'enregistrement et son éventuel rejeu.
  const attendu=snapshot,siteId=attendu.siteId,csv=fichier,requestKey=cle;
  verrou=true;controles();$('valider').disabled=true;
  try{
   const r=await appel('POST','/sites/'+encodeURIComponent(siteId)+'/valider',
    {csv,confirmation:'CONFIRMER_IMPORT'},requestKey);
   if(!actuel(attendu))return;
   $('resultat').textContent=r.total+' relevé(s) déclaré(s) · '+(r.nouveau?'inscrits dans l’historique privé.':'lot déjà enregistré, aucune double écriture.')+
     ' Empreinte : '+r.fichierSha256.slice(0,12)+'…';
   $('consentement').checked=false;$('consentement').disabled=true;
   statut('Import confirmé par le serveur, sans calcul de consommation.');
  }catch(e){
   if(actuel(attendu)){
    $('resultat').textContent='Import refusé : '+e.message+'. Aucune réussite présumée.';
    statut('Vérifiez les erreurs et l’historique. En cas de réponse inconnue, ne changez pas de fichier ni de clé avant nouvelle tentative.',true);
    // Garder la même clé pour un rejeu sûr après perte de réponse, sans nouvelle prévisualisation.
    $('valider').disabled=!$('consentement').checked;
   }
  }finally{verrou=false;controles();}
 });
 try{
  if(!tenant||!/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenant))throw Error('TENANT_INVALIDE');
  $('retour').href='/energie-releves.html?tenant='+encodeURIComponent(tenant);
  if(!window.SATEER_CONTEXT_READY)throw Error('SESSION_CORE_INDISPONIBLE');
  const ctx=await window.SATEER_CONTEXT_READY;
  if(!ctx.organisations?.some(x=>x.tenant_code===tenant))throw Error('TENANT_NON_AUTORISE');
  const x=await appel('GET','/sites');sites=x.sites;
  const sel=$('site');sel.replaceChildren(option('Choisir un site…',''));
  for(const s of sites)sel.append(option(s.nom+' · '+s.pays,s.id));
  if(sites.length){courant=sites[0];sel.value=courant.id;statut('Site privé chargé. Choisissez le fichier .csv déjà importé (et non le ZIP).');}
  else statut('Aucun site propriétaire accessible.',true);
  controles();
  if(x.suivant)statut('Liste de sites non exhaustive (50 maximum), importer uniquement sur un site visible.',true);
 }catch(e){statut('Accès indisponible : '+e.message,true);}
})();
