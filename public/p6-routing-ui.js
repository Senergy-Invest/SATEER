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
   const data=await request(url());const box=$('sx-p6-rules');box.replaceChildren();
   if(!data.regles.length){box.append(make('p','Aucune règle active. Les dossiers non orientés restent dans la file de tri autorisée.'));return;}
   const labels={PASSEPORT:'Passeport',CARTE_CONSULAIRE:'Carte consulaire',ETAT_CIVIL:'État civil',RENDEZ_VOUS:'Rendez-vous',INFORMATION:'Question générale',AUTRE:'Autre demande',__DEFAULT__:'Toutes les autres demandes'};
   for(const r of data.regles){
     const row=make('div');row.className='sx-p6-rule';
     const details=make('div');const title=make('strong',labels[r.categorie]||r.categorie);const dest=make('small',`→ ${r.bureau}${r.destinationValide?'':' · Bureau non habilité'}`);details.append(title,dest);
     const remove=make('button','Retirer');remove.type='button';remove.className='sx-p4-button';remove.addEventListener('click',async()=>{
       if(!confirm(`Retirer la règle pour ${title.textContent} ?`))return;
       try{status('Désactivation…');await request(url(r.categorie),'DELETE');status('Règle retirée.');await load();}
       catch(e){status(e.message,true);}
     });
     row.append(details,remove);box.append(row);
   }
 }
 async function init(){
   if(!$('sx-p6-save'))return;
   try{
     const ctx=await window.SATEER_CONTEXT_READY;
     const selected=await window.SATEER_choisirOrganisation(qs.get('organisation')||null);
     if(!ctx||!selected?.id||!ctx.tenantCode)throw Error('Ouvrez cette page depuis votre espace professionnel.');
     org=Number(selected.id);tenant=ctx.tenantCode;
     await load();
   }catch(e){status(e.message,true);}
 }
 $('sx-p6-save')?.addEventListener('click',async()=>{
   if(!org||!tenant)return status('Organisation non chargée.',true);
   const categorie=$('sx-p4-demo-type').value;
   const destinationUnitId=Number($('sx-p4-demo-unit').value);
   if(!destinationUnitId)return status('Choisissez un bureau destinataire.',true);
   if(!confirm('Enregistrer cette règle pour les nouvelles demandes ? Les anciens dossiers ne seront pas déplacés.'))return;
   try{
     status('Enregistrement de la règle…');
     const result=await request(url(),'PUT',{tenantCode:tenant,categorie,destinationUnitId});
     status(`Enregistré : ${result.regle.categorie} → ${result.regle.bureau}.`);
     await load();
   }catch(e){status(e.message,true);}
 });
 $('sx-p6-refresh')?.addEventListener('click',()=>load().catch(e=>status(e.message,true)));
 init();
})();
