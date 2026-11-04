/* SATEER P6.3.2 - bureau visible dans le formulaire, choix explicite, permissions inchangées. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const root=$('sx-p63-root');if(!root)return;
 const mainUnit=$('sx-p4-team-unit'),form=$('sx-p63-form'),role=$('sx-p63-role'),status=$('sx-p63-status'),out=$('sx-p63-link'),copy=$('sx-p63-copy'),list=$('sx-p63-list');
 if(!mainUnit||!form||!role||!status||!out||!copy||!list)return;
 const submit=form.querySelector('button[type="submit"]');
 let org,tenant,roles=[],gen=0,pending=false,loadError=true;
 const validId=n=>/^[1-9]\d*$/.test(String(n))?String(n):null;
 const el=(tag,txt)=>{const x=document.createElement(tag);x.textContent=String(txt);return x;};
 function tell(text,bad=false){status.textContent=text;status.classList.toggle('sx-p63-error',bad);}
 function endpoint(path=''){return `/api/organisations/${encodeURIComponent(org)}/units/${encodeURIComponent(mainUnit.value)}/staff-invitations${path}`;}
 async function request(url,method='GET',body){
  // Existing routes: tenant only once. Do not modify authorization or session.
  const suffix=method==='GET'&&!/[?&]tenant=/.test(url)?`${url.includes('?')?'&':'?'}tenant=${encodeURIComponent(tenant)}`:'';
  const response=await fetch(url+suffix,{method,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error((data.statut||`HTTP ${response.status}`)+` (HTTP ${response.status})`);
  return data;
 }
 // The bureau is now chosen next to the invitation fields. Both selectors stay synchronized.
 const wrapper=document.createElement('div');wrapper.className='sx-p632-unit-choice';
 const heading=el('strong','Bureau de rattachement de cet agent');
 const current=el('p','Aucun bureau sélectionné');current.id='sx-p632-current';
 const change=el('button','Choisir un bureau');change.type='button';change.id='sx-p632-change';change.setAttribute('aria-controls','sx-p632-unit');change.setAttribute('aria-expanded','false');
 const select=document.createElement('select');select.id='sx-p632-unit';select.setAttribute('aria-label','Choisir le bureau de l’agent');select.hidden=true;
 wrapper.append(heading,current,change,select);
 form.parentNode.insertBefore(wrapper,form);
 function optionsFromParent(){
  const before=select.value;
  select.replaceChildren(new Option('Sélectionner un bureau',''));
  for(const option of mainUnit.options){if(validId(option.value)&&!option.disabled)select.add(new Option(option.textContent.trim(),option.value));}
  select.value=validId(mainUnit.value)?mainUnit.value:(validId(before)&&[...select.options].some(o=>o.value===before)?before:'');
  if(!validId(mainUnit.value))select.value='';
 }
 function syncBureau(){
  optionsFromParent();const chosen=mainUnit.selectedOptions[0];
  current.textContent=validId(mainUnit.value)?`Bureau choisi : ${chosen?.textContent.trim()||'Bureau '+mainUnit.value}`:'Aucun bureau sélectionné. Choisissez le bureau pour afficher les responsabilités.';
  change.textContent=validId(mainUnit.value)?'Changer de bureau':'Choisir un bureau';
  if(!validId(mainUnit.value)){select.hidden=false;change.setAttribute('aria-expanded','true');}
 }
 function enableSubmit(){submit.disabled=pending||loadError||!validId(mainUnit.value)||!validId(role.value);}
 function renderRoles(){
  role.replaceChildren(new Option('Choisir une responsabilité',''));
  for(const r of roles.filter(r=>r.actif!==false&&['UNIT','BOTH'].includes(r.scope)))role.add(new Option(r.nom,String(r.id)));
  role.disabled=!validId(mainUnit.value)||loadError;
  enableSubmit();
 }
 function clearLink(){out.value='';out.closest('.sx-p63-delivery').hidden=true;}
 async function refresh(){
  const generation=++gen;clearLink();list.replaceChildren();loadError=true;roles=[];renderRoles();syncBureau();
  if(!org||!validId(mainUnit.value)){tell('Choisissez le bureau de rattachement dans le formulaire pour afficher les responsabilités.');return;}
  tell('Chargement des responsabilités et invitations…');
  const [roleResult,invResult]=await Promise.allSettled([
   request(`/api/organisations/${encodeURIComponent(org)}/roles?tenant=${encodeURIComponent(tenant)}`),
   request(endpoint())
  ]);
  if(generation!==gen)return;
  roles=roleResult.status==='fulfilled'&&Array.isArray(roleResult.value.roles)?roleResult.value.roles:[];
  loadError=roleResult.status!=='fulfilled';
  renderRoles();
  const entries=invResult.status==='fulfilled'&&Array.isArray(invResult.value.invitations)?invResult.value.invitations:[];
  if(!entries.length)list.append(el('p','Aucune invitation pour ce bureau.'));
  for(const i of entries){
   const row=document.createElement('div');row.className='sx-p63-entry';const left=document.createElement('div');
   left.append(el('strong',`${i.prenom||''} ${i.nom||''}`.trim()),el('small',`${i.email} · ${i.role_nom||'Rôle'}`));
   const accepted=!!i.accepted_at,revoked=!!i.revoked_at,expired=Date.parse(i.expires_at)<Date.now();const active=!accepted&&!revoked&&!expired;
   left.append(el('small',accepted?'Invitation acceptée':revoked?'Révoquée':expired?'Expirée':'En attente d’activation'));
   row.append(left);
   if(active){const revoke=el('button','Révoquer');revoke.type='button';revoke.addEventListener('click',async()=>{
    if(pending||!confirm(`Révoquer l'invitation de ${i.prenom} ${i.nom} ?`))return;
    pending=true;enableSubmit();try{await request(endpoint(`/${i.id}/revoke`),'POST',{tenantCode:tenant});await refresh();tell('Invitation révoquée.');}catch(e){tell('Révocation refusée : '+e.message,true);}finally{pending=false;enableSubmit();}
   });row.append(revoke);}list.append(row);
  }
  const errors=[];
  if(roleResult.status==='rejected')errors.push('Responsabilités indisponibles : '+roleResult.reason.message);
  if(invResult.status==='rejected')errors.push('Liste des invitations indisponible : '+invResult.reason.message);
  if(roleResult.status==='fulfilled'&&!roles.some(r=>r.actif!==false&&['UNIT','BOTH'].includes(r.scope)))errors.push('Aucune responsabilité de bureau disponible.');
  loadError=errors.some(t=>t.startsWith('Responsabilités')||t.startsWith('Aucune responsabilité'));
  renderRoles();
  tell(errors.length?errors.join(' | '):'Choisissez une responsabilité pour inviter un agent.',errors.length>0);
 }
 change.addEventListener('click',()=>{syncBureau();select.hidden=false;change.setAttribute('aria-expanded','true');select.focus();});
 select.addEventListener('change',()=>{
  if(select.value!==mainUnit.value){mainUnit.value=select.value;mainUnit.dispatchEvent(new Event('change',{bubbles:true}));}
  else syncBureau();
  if(validId(select.value)){select.hidden=true;change.setAttribute('aria-expanded','false');}
 });
 mainUnit.addEventListener('change',()=>{syncBureau();refresh().catch(e=>tell('Configuration indisponible : '+e.message,true));});
 // P4 can populate bureau choices after the P6.3.2 script has loaded.
 new MutationObserver(()=>syncBureau()).observe(mainUnit,{childList:true});
 role.addEventListener('change',enableSubmit);
 form.addEventListener('submit',async ev=>{
  ev.preventDefault();if(pending||loadError||!org||!validId(mainUnit.value)||!validId(role.value))return tell('Choisissez un bureau et une responsabilité autorisée.',true);
  const prenom=form.elements.prenom.value.trim(),nom=form.elements.nom.value.trim(),email=form.elements.email.value.trim().toLowerCase();
  if(!prenom||!nom||!email)return tell('Renseignez le prénom, le nom et l’e-mail professionnel.',true);
  const bureauLabel=mainUnit.selectedOptions[0]?.textContent.trim()||'ce bureau';
  if(!confirm(`Inviter ${prenom} ${nom} (${email}) dans « ${bureauLabel} » avec la responsabilité « ${role.selectedOptions[0].textContent} » ?\n\nAucun e-mail ne sera envoyé automatiquement.`))return;
  pending=true;enableSubmit();clearLink();tell('Création de l’invitation…');
  try{
   const result=await request(endpoint(),'POST',{tenantCode:tenant,prenom,nom,email,roleId:Number(role.value)});
   const link=new URL(result.lien,location.origin);if(link.origin!==location.origin)throw Error('DESTINATION_INVALIDE');
   out.value=link.href;out.closest('.sx-p63-delivery').hidden=false;
   tell(`Invitation créée pour « ${bureauLabel} ». Copiez le lien et transmettez-le en privé. Aucun e-mail automatique envoyé.`);
   form.reset();role.value='';
   const div=document.createElement('div');div.className='sx-p63-entry';div.append(el('strong',prenom+' '+nom),el('small',email+' · invitation en attente'));list.prepend(div);
  }catch(e){tell('Invitation non créée : '+e.message,true);}finally{pending=false;enableSubmit();}
 });
 copy.addEventListener('click',async()=>{if(!out.value)return;try{await navigator.clipboard.writeText(out.value);tell('Lien copié. Transmettez-le de manière privée.');}catch{out.select();tell('Sélectionnez puis copiez le lien affiché.');}});
 (async()=>{try{
  const ctx=await window.SATEER_CONTEXT_READY;
  const chosen=await window.SATEER_choisirOrganisation(new URLSearchParams(location.search).get('organisation')||null);
  if(!chosen?.id||!ctx?.tenantCode)throw Error('Organisation non autorisée');
  org=validId(chosen.id);tenant=ctx.tenantCode;await refresh();
 }catch(e){loadError=true;enableSubmit();tell('Configuration indisponible : '+e.message,true);}})();
})();
