'use strict';
(async function(){
 const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),tenant=params.get('tenant'),id=params.get('id');
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 let passport=null,qrUrl=null,photoUrls=[];
 function message(s){$('photoMessage').textContent=s;}
 async function api(method,url,body,mime){
  const headers={'Accept':'application/json'};if(mime)headers['Content-Type']=mime;
  const res=await fetch(url,{method,credentials:'same-origin',cache:'no-store',headers,body});
  if(!res.ok){const b=await res.json().catch(()=>({}));throw new Error(b.statut||'HTTP '+res.status);}return res;
 }
 const base='/api/energy/passports/'+encodeURIComponent(id||'')+'?tenant='+encodeURIComponent(tenant||'');
 const path=suffix=>'/api/energy/passports/'+encodeURIComponent(id||'')+suffix+'?tenant='+encodeURIComponent(tenant||'');
 async function load(){
  const data=await (await api('GET',base)).json();passport=data.passeport;qrUrl=data.qrUrl;
  $('nom').textContent=passport.nom;
  $('info').textContent=(passport.quantiteDeclaree>1?'Appareil n°'+passport.numeroIndividuel+' sur '+passport.quantiteDeclaree:'Un appareil individualisé')+
     ' · '+passport.famille.toLowerCase()+' · '+(passport.puissanceUnitaireW?passport.puissanceUnitaireW+' W déclarés':'Puissance non renseignée');
  const back='/inventaire-energie.html?tenant='+encodeURIComponent(tenant)+'&case=';
  // Le propriétaire revient via l'historique du navigateur, jamais via un ID EnergyCase deviné.
  $('retour').href='/sunu-courant.html?tenant='+encodeURIComponent(tenant);
  const q=$('qrCanvas');q.replaceChildren();
  try{q.append(window.SATEER_QR.svgElement(qrUrl,document));$('qrMessage').textContent='QR SATEER prêt. Connexion requise pour consulter.';}
  catch(_){$('qrMessage').textContent='Adresse QR non représentable localement. Le lien peut être copié.';}
  for(const u of photoUrls)URL.revokeObjectURL(u);photoUrls=[];
  const grid=$('photoGrid');grid.replaceChildren();
  for(const p of data.photos||[]){
   const tile=document.createElement('article');tile.className='photo-tile';
   const img=document.createElement('img');img.alt=p.type==='APPAREIL'?'Photo déclarée de l’appareil':'Photo déclarée de la plaque';img.loading='lazy';
   try{const resp=await api('GET',path('/photos/'+p.id));const blob=await resp.blob();
     const url=URL.createObjectURL(blob);photoUrls.push(url);img.src=url;
   }catch(_){img.alt='Photo indisponible';}
   const label=document.createElement('p');label.textContent=p.type==='APPAREIL'?'Mon appareil':'Son étiquette';
   const del=document.createElement('button');del.type='button';del.textContent='Supprimer cette photo';del.className='danger';
   del.addEventListener('click',async()=>{
    if(!confirm('Supprimer cette photo privée ? Cette action ne supprime pas la fiche de l’appareil.'))return;
    del.disabled=true;try{await api('DELETE',path('/photos/'+p.id));message('Photo retirée.');await load();}
    catch(e){message('Suppression non confirmée : '+e.message);del.disabled=false;}
   });
   tile.append(img,label,del);grid.append(tile);
  }
  $('content').hidden=false;$('status').textContent='Fiche privée chargée. Photos et caractéristiques non vérifiées.';
 }
 async function convertImage(file){
  if(!file||file.size>12*1024*1024)throw Error('PHOTO_SOURCE_TROP_GRANDE');
  const url=URL.createObjectURL(file);let img;
  try{img=new Image();img.decoding='async';img.src=url;await img.decode();}
  finally{URL.revokeObjectURL(url);}
  if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>20000000)throw Error('PHOTO_DIMENSIONS_EXCESSIVES');
  const scale=Math.min(1,1400/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('PHOTO_INCOMPATIBLE');ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.82));
  if(!blob)throw Error('PHOTO_CONVERSION_IMPOSSIBLE');
  const out=(blob.type==='image/webp')?blob:await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!out||out.size>3*1024*1024)throw Error('PHOTO_APRES_REDUCTION_TROP_GRANDE');
  return out;
 }
 async function upload(input,type){
  if(!input.files?.[0])return;input.disabled=true;message('Préparation et enregistrement privé de la photo…');
  try{
   const blob=await convertImage(input.files[0]);await api('POST',path('/photos/'+type),blob,'application/octet-stream');
   input.value='';message('Photo enregistrée dans votre fiche privée.');await load();
  }catch(e){message('Photo non enregistrée : '+e.message+'. Vous pouvez réessayer.');}
  finally{input.disabled=false;}
 }
 $('photoAppareil').addEventListener('change',()=>upload($('photoAppareil'),'APPAREIL'));
 $('photoEtiquette').addEventListener('change',()=>upload($('photoEtiquette'),'ETIQUETTE'));
 $('copyQr').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(qrUrl);$('qrMessage').textContent='Lien du QR copié. Accès privé toujours requis.';}
  catch(_){$('qrMessage').textContent='Copie indisponible ; réessayez depuis un navigateur compatible.';}});
 $('printQr').addEventListener('click',()=>window.print());
 try{await window.SATEER_CONTEXT_READY;if(!UUID.test(id||'')||!tenant)throw Error('LIEN_INVALIDE');await load();}
 catch(e){$('status').textContent='Fiche inaccessible : '+e.message+'. Vérifiez votre session et votre lien.';}
 window.addEventListener('pagehide',()=>photoUrls.forEach(u=>URL.revokeObjectURL(u)));
})();
