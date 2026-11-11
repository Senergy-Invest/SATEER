/* SATEER P6 - configurateur simple, uniquement demandes Mon Consulat. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const status=(t,error=false)=>{const n=$('sx-p6-status');if(n){n.textContent=String(t);n.classList.toggle('sx-p4-error',error);}};
 const qs=new URLSearchParams(location.search);
 let org=null, tenant=null;
 const request=async(path,method='GET',body)=>{
   const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.aide||data.statut||`Erreur HTTP ${response.status}`);
   return data;
 };
 const url=(cat)=>`/api/organisations/${encodeURIComponent(org)}/routing-rules${cat?'/'+encodeURIComponent(cat):''}?tenant=${encodeURIComponent(tenant)}`;
 function make(tag,value){const n=document.createElement(tag);if(value!==undefined)n.textContent=String(value);return n;}
 async function load(){
   const data=await request(url());if(!Array.isArray(data.regles))throw Error('Réponse de règles P6 invalide.');const box=$('sx-p6-rules');box.replaceChildren();
   if(!data.regles.length){box.append(make('p','Aucune règle configurée. Les demandes sans destination restent en attente et ne sont pas visibles dans les inbox des bureaux ordinaires. Seuls les acteurs habilités à l’échelle de l’organisation peuvent les consulter et les orienter. Configurez __DEFAULT__ pour diriger les autres catégories vers une file de qualification.'));return;}
   const labels={PASSEPORT:'Passeport',CARTE_CONSULAIRE:'Carte consulaire',ETAT_CIVIL:'État civil',RENDEZ_VOUS:'Rendez-vous',INFORMATION:'Question générale',AUTRE:'Autre demande',__DEFAULT__:'Toutes les autres demandes'};
   for(const r of data.regles){
     const row=make('div');row.className='sx-p6-rule';
     const details=make('div');const title=make('strong',labels[r.categorie]||r.categorie);const active=Boolean(r.actif);const dest=make('small',`→ ${r.bureau}${r.destinationValide?'':' · Bureau non habilité'}${active?' · Active':' · Désactivée'}`);details.append(title,dest);
     const toggle=make('button',active?'Désactiver':'Réactiver');toggle.type='button';toggle.className='sx-p4-button';toggle.addEventListener('click',async()=>{
       if(!confirm(`${active?'Désactiver':'Réactiver'} la règle pour ${title.textContent} ?`))return;
       try{
         status(active?'Désactivation…':'Réactivation…');
         if(active)await request(url(r.categorie),'DELETE');
         else await request(url(),'PUT',{tenantCode:tenant,categorie:r.categorie,destinationUnitId:Number(r.destinationUnitId)});
         status(active?'Règle désactivée.':'Règle réactivée.');await load();
       }catch(e){status(e.message,true);}
     });
     row.append(details,toggle);box.append(row);
   }
 }
 async function init(){
   if(!$('sx-p6-rule-form'))return;
   // Ne jamais proposer un lien nu vers le catalogue : il perdrait le contexte
   // de l'organisation et provoquerait « Organisation non sélectionnée ».
   const catalogueLink=$('sx-p7-procedures');
   if(catalogueLink){
     catalogueLink.removeAttribute('href');
     catalogueLink.setAttribute('aria-disabled','true');
     catalogueLink.title='Vérification du contexte consulaire en cours';
   }
   try{
     const ctx=await window.SATEER_CONTEXT_READY;
     const selected=await window.SATEER_choisirOrganisation(qs.get('organisation')||null);
     if(!ctx||!selected?.id||!ctx.tenantCode)throw Error('Ouvrez cette page depuis votre espace professionnel.');
     org=Number(selected.id);tenant=ctx.tenantCode;
     if(catalogueLink){
       catalogueLink.href='/catalogue-demarches.html?'+new URLSearchParams({organisation:String(org),tenant});
       catalogueLink.removeAttribute('aria-disabled');
       catalogueLink.removeAttribute('title');
     }
     await load();
   }catch(e){status(e.message,true);}
 }
 const ruleForm=$('sx-p6-rule-form'),saveButton=$('sx-p6-save'),categorySelect=$('sx-p4-demo-type'),unitSelect=$('sx-p4-demo-unit');
 let saving=false;
 ruleForm?.addEventListener('submit',async event=>{
   event.preventDefault();
   if(saving)return;
   if(!org||!tenant)return status('Organisation non chargée.',true);
   const categorie=String(categorySelect.value).trim();
   const destinationUnitId=Number(unitSelect.value);
   const bureau=unitSelect.selectedOptions[0]?.textContent?.trim()||'';
   if(!categorie)return status('Choisissez une catégorie.',true);
   if(!destinationUnitId||!bureau)return status('Choisissez un bureau destinataire.',true);
   if(!confirm(`Enregistrer ${categorie} → ${bureau} pour les nouvelles demandes ? Les anciens dossiers ne seront pas déplacés.`))return;
   saving=true;saveButton.disabled=true;categorySelect.disabled=true;unitSelect.disabled=true;
   try{
     status(`Enregistrement de ${categorie} → ${bureau}…`);
     const result=await request(url(),'PUT',{tenantCode:tenant,categorie,destinationUnitId});
     if(result.regle?.categorie!==categorie||Number(result.regle?.destinationUnitId)!==destinationUnitId){
       throw Error('La réponse du serveur ne correspond pas à la catégorie et au bureau sélectionnés.');
     }
     status(`Enregistrée ou réactivée pour les nouvelles demandes : ${result.regle.categorie} → ${result.regle.bureau}.`);
     await load();
   }catch(e){status(e.message,true);}
   finally{saving=false;saveButton.disabled=false;categorySelect.disabled=false;unitSelect.disabled=false;}
 });
 $('sx-p6-refresh')?.addEventListener('click',()=>load().catch(e=>status(e.message,true)));
 init();
})();
