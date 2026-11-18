'use strict';
/* Façade progressive OCR local / correction manuelle; jamais de certification implicite. */
(async function(){
 const $=id=>document.getElementById(id);
 const params=new URLSearchParams(location.search),tenant=params.get('tenant'),passportId=params.get('id');
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
 const fields=['MARQUE','MODELE','PUISSANCE_W','TENSION_V'];
 const labels={MARQUE:'Marque',MODELE:'Modèle ou référence',PUISSANCE_W:'Puissance (W)',TENSION_V:'Tension (V)'};
 let analysisId=null,available=false,busy=false;
 const endpoint='/api/energy/labels/'+encodeURIComponent(passportId||'')+'?tenant='+encodeURIComponent(tenant||'');
 const setMessage=(s,error=false)=>{$('etiquetteMessage').textContent=s;$('etiquetteMessage').dataset.error=String(error);};
 async function api(method,suffix,body){
  const res=await fetch('/api/energy/labels/'+encodeURIComponent(passportId)+suffix+'?tenant='+encodeURIComponent(tenant),{
   method,headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},credentials:'same-origin',cache:'no-store',
   body:body?JSON.stringify(body):undefined
  });
  const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.statut||'HTTP '+res.status);return data;
 }
 async function reload(){
  const result=await api('GET','');available=true;
  const list=$('valeursConfirmees');list.replaceChildren();
  for(const field of fields){const record=(result.valeurs||[]).find(v=>v.champ===field);if(!record)continue;
   const li=document.createElement('li');const strong=document.createElement('strong');strong.textContent=labels[field]+': ';
   const value=document.createElement('span');value.textContent=record.valeur+(field==='PUISSANCE_W'?' W':field==='TENSION_V'?' V':'');
   const mark=document.createElement('small');mark.textContent=' · confirmé par vous (non certifié) · v'+record.revision;
   li.append(strong,value,mark);list.append(li);
  }
  $('valeursVides').hidden=(result.valeurs||[]).length>0;
 }
 function photosChanged(photos){
  const sel=$('photoPourLecture'),prior=sel.value;sel.replaceChildren();
  for(const p of (photos||[]).filter(p=>p.type==='ETIQUETTE')){const o=document.createElement('option');o.value=p.id;o.textContent='Étiquette photographiée · '+new Date(p.dateCreation).toLocaleDateString('fr-FR');sel.append(o);}
  if([...sel.options].some(x=>x.value===prior))sel.value=prior;
  $('analyserEtiquette').disabled=!sel.options.length||busy;
  $('pasDePhotoEtiquette').hidden=sel.options.length>0;
 }
 window.addEventListener('sateer:equipment-photos',ev=>photosChanged(ev.detail?.photos));
 $('analyserEtiquette').addEventListener('click',async()=>{
  if(busy||!available||!$('photoPourLecture').value)return;
  busy=true;$('analyserEtiquette').disabled=true;setMessage('Lecture locale de l’étiquette en cours…');
  try{
   const r=await api('POST','/analyser',{photoId:$('photoPourLecture').value});analysisId=r.analyseId;
   for(const f of fields)$(f).value=r.propositions?.[f]||'';
   if(!analysisId)setMessage('Aucune caractéristique fiable détectée. Vous pouvez renseigner les champs vous-même.',true);
   else setMessage('Propositions remplies. Corrigez les erreurs, puis confirmez les valeurs que vous souhaitez conserver.');
   $('formEtiquette').hidden=false;
  }catch(e){analysisId=null;setMessage('Lecture locale indisponible : '+e.message+'. Vous pouvez saisir les informations manuellement.',true);$('formEtiquette').hidden=false;}
  finally{busy=false;$('analyserEtiquette').disabled=!$('photoPourLecture').options.length;}
 });
 $('ouvrirSaisieManuelle').addEventListener('click',()=>{analysisId=null;$('formEtiquette').hidden=false;setMessage('Saisissez uniquement les informations que vous connaissez. Rien n’est obligatoire.');});
 $('formEtiquette').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!available)return;
  const valeurs=fields.map(champ=>({champ,valeur:$(champ).value.trim()})).filter(x=>x.valeur);
  if(!valeurs.length){setMessage('Renseignez au moins une information, ou revenez plus tard.',true);return;}
  busy=true;$('confirmerEtiquette').disabled=true;
  try{
   await api('POST','/confirmer',{analyseId,valeurs});analysisId=null;
   setMessage('Informations enregistrées dans le passeport. Elles restent déclaratives, non vérifiées.');
   await reload();$('formEtiquette').hidden=true;
  }catch(e){setMessage('Enregistrement non confirmé : '+e.message+'. Vous pouvez corriger et réessayer.',true);}
  finally{busy=false;$('confirmerEtiquette').disabled=false;}
 });
 try{
  await window.SATEER_CONTEXT_READY;if(!tenant||!UUID.test(passportId||''))throw Error('LIEN_INVALIDE');
  await reload();
  const pr=await fetch('/api/energy/passports/'+encodeURIComponent(passportId)+'?tenant='+encodeURIComponent(tenant),{credentials:'same-origin',cache:'no-store'});
  if(pr.ok){const detail=await pr.json();photosChanged(detail.photos||[]);}
  $('etiquetteAssistance').hidden=false;
 }catch(e){$('etiquetteStatus').textContent='Lecture assistée non disponible sur cette instance. Les photos et le QR restent utilisables.';}
})();
