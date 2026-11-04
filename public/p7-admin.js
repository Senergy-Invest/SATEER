(()=>{'use strict';
 const $=id=>document.getElementById(id),names={CNI_RECTO:'Carte d’identité : recto',CNI_VERSO:'Carte d’identité : verso',PASSEPORT:'Ancien passeport / page identité',CARTE_CONSULAIRE:'Carte consulaire',ACTE_NAISSANCE:'Acte de naissance',JUSTIFICATIF_DOMICILE:'Justificatif de domicile',AUTRE:'Autre pièce à préciser'};
 let org,tenant,records=[];
 const status=(s,err=false)=>{const e=$('catalogue-status');e.textContent=s;e.classList.toggle('error',err);};
 const make=(tag,t)=>{const n=document.createElement(tag);if(t!==undefined)n.textContent=String(t);return n;};
 const api=async (sub,opts)=>{const r=await fetch('/api/pilot-procedures/'+sub,{credentials:'same-origin',cache:'no-store',...(opts||{})});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.statut||'HTTP '+r.status);return j;};
 function slug(s){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,58);}
 const fields=$('proc-docs');for(const [id,label] of Object.entries(names)){const l=make('label');const c=make('input');c.type='checkbox';c.value=id;c.className='p7-piecetype';l.append(c,document.createTextNode(label));fields.append(l);}
 function reset(){const f=$('catalogue-form');f.reset();$('proc-code').value='';delete $('proc-code').dataset.fixed;status('Nouvelle démarche : indiquez son nom puis les pièces exigées.');}
 function choose(p){$('proc-code').dataset.fixed='1';$('proc-title').value=p.titre;$('proc-code').value=p.code;$('proc-cat').value=p.categorie;
  $('proc-days').value=p.delaiIndicatifJours??'';$('proc-active').checked=!!p.actif;$('proc-validated').checked=false;
  fields.querySelectorAll('input').forEach(i=>{i.checked=(p.piecesObligatoires||[]).includes(i.value);});
  status('Modification de '+p.titre+'. Confirmez à nouveau la validité de la liste avant l’activation.');$('proc-title').focus();}
 async function load(){const j=await api('administration?'+new URLSearchParams({organisationId:org,tenant}));records=j.procedures;
  const list=$('catalogue-list');list.replaceChildren();if(!records.length){list.append(make('p','Aucune démarche configurée. Commencez par en créer une.'));return;}
  for(const p of records){const div=make('div');div.className='entry';const strong=make('strong',p.titre+' · '+(p.actif?'Accessible aux citoyens':'Brouillon'));
   const sub=make('p',(p.piecesObligatoires||[]).map(x=>names[x]||x).join(' · ')||'Aucune pièce obligatoire');sub.className='muted';
   const button=make('button','Modifier');button.type='button';button.addEventListener('click',()=>choose(p));div.append(strong,sub,button);list.append(div);}
 }
 $('proc-new').addEventListener('click',reset);
 $('proc-title').addEventListener('input',()=>{if(!$('proc-code').dataset.fixed)$('proc-code').value=slug($('proc-title').value);});
 $('catalogue-form').addEventListener('submit',async ev=>{ev.preventDefault();
  const code=$('proc-code').value||slug($('proc-title').value),pieces=[...fields.querySelectorAll('input:checked')].map(x=>x.value);
  if(!code||code.length<3)return status('Donnez un nom plus précis à la démarche.',true);
  if($('proc-active').checked&&!$('proc-validated').checked)return status('La validation officielle est obligatoire avant activation.',true);
  if($('proc-active').checked&&$('proc-cat').value==='PASSEPORT'&&!pieces.length)return status('La liste des pièces de cette démarche passeport ne peut pas être vide.',true);
  try{await api('administration/'+encodeURIComponent(code),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({organisationId:org,tenantCode:tenant,categorie:$('proc-cat').value,titre:$('proc-title').value.trim(),piecesObligatoires:pieces,delaiIndicatifJours:$('proc-days').value||null,actif:$('proc-active').checked})});
   status('Démarche enregistrée. Elle sera proposée aux citoyens si elle est activée.');await load();$('proc-code').dataset.fixed='1';}
  catch(e){status('Enregistrement refusé : '+e.message,true);}
 });
 (async()=>{try{const ctx=await window.SATEER_CONTEXT_READY;const u=new URLSearchParams(location.search);const selected=await window.SATEER_choisirOrganisation(u.get('organisation'));
  if(!ctx?.tenantCode||!selected?.id)throw Error('Organisation non sélectionnée.');org=selected.id;tenant=ctx.tenantCode;
  $('p7-back').href='/configuration-consulat.html?'+new URLSearchParams({organisation:org,tenant})+'#routage';
  await load();status('Vous pouvez ajouter une démarche. Les documents exacts sont décidés par le Consulat.');}
  catch(e){status('Accès aux démarches impossible : '+e.message,true);}
 })();
})();
