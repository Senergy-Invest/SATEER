/* SATEER P7 : preparation automatisee, documents preselectionnes, accord explicite. */
(()=>{'use strict';
 if(new URLSearchParams(location.search).get('source')!=='MON_CONSULAT')return;
 const $=id=>document.getElementById(id);const legacy=$('demandeForm');if(!legacy)return;
 const section=legacy.closest('section');section.style.display='none';
 const main=document.querySelector('main');const panel=document.createElement('section');panel.id='p7-panel';panel.className='p7-panel';main.appendChild(panel);
 const names={CNI_RECTO:'Carte d’identité, recto',CNI_VERSO:'Carte d’identité, verso',PASSEPORT:'Passeport',CARTE_CONSULAIRE:'Carte consulaire',ACTE_NAISSANCE:'Acte de naissance',JUSTIFICATIF_DOMICILE:'Justificatif de domicile',AUTRE:'Autre document'};
 let state={org:null,tenant:null,catalogue:[],procedure:null,files:[],busy:false};
 const make=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt!==undefined)n.textContent=String(txt);if(cls)n.className=cls;return n;};
 const api=async (url,opt={})=>{const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt});const body=await r.json().catch(()=>({}));if(!r.ok){const e=Error(body.statut||`HTTP ${r.status}`);e.detail=body;throw e;}return body;};
 const url=(suffix,params)=>'/api/pilot-procedures/'+suffix+(params?'?'+new URLSearchParams(params):'');
 const status=(t,err=false)=>{const s=$('p7-status');if(s){s.textContent=t;s.className=err?'p7-status error':'p7-status';}};
 function heading(){panel.replaceChildren();panel.append(make('h2','Préparer ma démarche'),make('p','SATEER recherche vos documents déjà conservés. Vous vérifiez avant de transmettre.','p7-muted'));
  const s=make('div','', 'p7-status');s.id='p7-status';s.setAttribute('role','status');panel.append(s);
 }
 async function init(){heading();status('Chargement des démarches…');
  try{const ctx=await window.SATEER_CONTEXT_READY;const org=await window.SATEER_choisirOrganisation(new URLSearchParams(location.search).get('organisation'));
   if(!ctx?.tenantCode||!org?.id)throw Error('Aucune organisation sélectionnée.');
   state.org=Number(org.id);state.tenant=ctx.tenantCode;
   const data=await api(url('catalogue',{organisationId:state.org,tenant:state.tenant}));state.catalogue=data.procedures;
   renderCatalogue();
  }catch(e){status('Impossible de préparer une démarche : '+e.message,true);}
 }
 function renderCatalogue(){heading();
  const chooser=make('label','Quelle démarche souhaitez-vous effectuer ?','p7-field');const select=make('select');select.id='p7-procedure';
  const choose=make('option','Choisir une démarche');choose.value='';select.append(choose);
  state.catalogue.forEach(p=>{const opt=make('option',p.titre);opt.value=p.code;select.append(opt);});
  chooser.append(select);panel.append(chooser);
  const info=make('p','Pour une question simple, utilisez l’assistant plutôt que d’ouvrir un dossier.','p7-muted');
  const link=make('a','Poser une question à l’assistant IA');link.href='/assistant.html';info.append(' ',link);panel.append(info);
  const other=make('button','Autre demande qui ne figure pas dans la liste','p7-secondary');other.type='button';
  other.addEventListener('click',()=>{
    const category=$('categorie');if(category){category.value='AUTRE';for(const opt of category.options)opt.disabled=opt.value!=='AUTRE';}
    panel.style.display='none';section.style.display='block';
    const helper=make('p','Ce formulaire concerne uniquement les demandes non référencées. Pour le passeport, utilisez la démarche guidée.','p7-muted');legacy.prepend(helper);
  });panel.append(other);
  const box=make('div');box.id='p7-preview';panel.append(box);
  if(!state.catalogue.length)status('Le Consulat n’a pas encore validé son catalogue de démarches. Aucune liste de pièces officielles ne peut être présentée.',true);
  else status('Choisissez une démarche pour préparer votre dossier.');
  select.addEventListener('change',()=>prepare(select.value));
 }
 async function prepare(code){const preview=$('p7-preview');preview.replaceChildren();if(!code){status('Choisissez une démarche.');return;}
  status('Recherche des documents de votre coffre…');
  try{const result=await api(url('preparer',{organisationId:state.org,tenant:state.tenant,code}));state.procedure=result.procedure;state.files=result.pieces;renderPreview();}
  catch(e){status('Préparation impossible : '+e.message,true);}
 }
 function renderPreview(){const box=$('p7-preview');box.replaceChildren();
  const proc=state.procedure;box.append(make('h3',proc.titre),make('p','Pièces exigées selon la configuration validée par le Consulat.','p7-muted'));
  if(proc.delaiIndicatifJours)box.append(make('p','Délai annoncé à titre indicatif : '+proc.delaiIndicatifJours+' jours calendaires. Ce n’est pas une date garantie.','p7-muted'));
  for(const item of state.files){
    const card=make('div',undefined,'p7-piece');const label=make('strong',names[item.categorie]||item.categorie);card.append(label);
    const select=make('select');select.dataset.category=item.categorie;select.className='p7-doc-select';
    const none=make('option','— Document manquant —');none.value='';select.append(none);
    item.documents.forEach((doc,i)=>{const opt=make('option',doc.nom+' · '+new Date(doc.dateCreation).toLocaleDateString('fr-FR'));opt.value=doc.id;select.append(opt);if(i===0)select.value=doc.id;});
    card.append(select);
    if(!item.documents.length)card.append(make('p','Ce document manque. Vous pouvez le photographier ou l’importer ici.','p7-warning'));
    const add=make('button','Ajouter ce document','p7-secondary');add.type='button';
    const picker=make('input');picker.type='file';picker.accept='image/jpeg,image/png,image/webp,application/pdf';picker.hidden=true;
    const camera=make('button','Prendre une photo','p7-secondary');camera.type='button';const cam=make('input');cam.type='file';cam.accept='image/*';cam.setAttribute('capture','environment');cam.hidden=true;
    add.addEventListener('click',()=>picker.click());camera.addEventListener('click',()=>cam.click());
    picker.addEventListener('change',()=>upload(item.categorie,picker.files?.[0]));cam.addEventListener('change',()=>upload(item.categorie,cam.files?.[0]));
    const controls=make('div',undefined,'p7-buttons');controls.append(add,camera,picker,cam);card.append(controls);box.append(card);
  }
  const noteLabel=make('label','Précision facultative pour le service','p7-field');const note=make('textarea');note.id='p7-note';note.maxLength=1000;note.rows=2;note.placeholder='Aucune rédaction longue nécessaire';noteLabel.append(note);box.append(noteLabel);
  const consent=make('label',undefined,'p7-consent');const check=make('input');check.type='checkbox';check.id='p7-consent';consent.append(check,document.createTextNode('J’ai vérifié les documents et j’autorise leur transmission uniquement dans cette demande.'));box.append(consent);
  const send=make('button','Vérifier et envoyer ma demande','p7-primary');send.type='button';send.id='p7-send';send.addEventListener('click',sendCase);box.append(send);
  updateMissing();box.querySelectorAll('.p7-doc-select').forEach(x=>x.addEventListener('change',updateMissing));
 }
 function chosen(){return [...document.querySelectorAll('.p7-doc-select')].map(x=>x.value).filter(Boolean);}
 function updateMissing(){const missing=[...document.querySelectorAll('.p7-doc-select')].filter(x=>!x.value);
  const submit=$('p7-send');if(submit)submit.disabled=missing.length>0;
  status(missing.length?'Il manque '+missing.length+' pièce(s) pour préparer ce dossier.':'Toutes les pièces configurées sont présentes. Vérifiez-les avant l’envoi.',missing.length>0);
 }
 async function upload(cat,file){if(!file||state.busy)return;
  if(file.size<16||file.size>5*1024*1024||!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)){status('Fichier non pris en charge (JPG, PNG, WebP ou PDF ; 5 Mo maximum).',true);return;}
  state.busy=true;status('Ajout au coffre personnel…');
  try{await api('/api/coffre-documents/'+encodeURIComponent(cat),{method:'POST',headers:{'Content-Type':'application/octet-stream','X-SATEER-FILENAME':encodeURIComponent(file.name)},body:file});await prepare(state.procedure.code);status('Document ajouté. Vérifiez la sélection avant de transmettre.');}
  catch(e){status('Impossible d’ajouter le document : '+e.message,true);}
  finally{state.busy=false;}
 }
 async function sendCase(){if(state.busy||!state.procedure)return;
  if(!$('p7-consent').checked)return status('Veuillez confirmer les pièces que vous autorisez à transmettre.',true);
  const ids=chosen();if(ids.length!==state.files.length)return status('Des documents manquent.',true);
  if(!confirm('Envoyer cette demande et les '+ids.length+' pièce(s) sélectionnée(s) au Consulat ?'))return;
  state.busy=true;$('p7-send').disabled=true;status('Envoi sécurisé du dossier…');
  try{const result=await api(url('envoyer'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({organisationId:state.org,tenantCode:state.tenant,code:state.procedure.code,documentIds:ids,note:$('p7-note').value,confirmation:true})});
   const done=$('p7-preview');done.replaceChildren();done.append(make('h3','Demande enregistrée'),make('p','Dossier n° '+result.demande.id+' · '+result.piecesJointes+' pièce(s) jointes.'));
   if(result.orientationAutomatique?.statut!=='ORIENTEE')done.append(make('p','Le dossier est enregistré mais son orientation reste à vérifier.','p7-warning'));
   status('Demande transmise. Vous pouvez suivre son avancement dans Mon Consulat.');
  }catch(e){const missing=e.detail?.pieces?.length?' : '+e.detail.pieces.map(x=>names[x]||x).join(', '):'';status('Envoi refusé : '+e.message+missing,true);$('p7-send').disabled=false;}
  finally{state.busy=false;}
 }
 init();
})();
