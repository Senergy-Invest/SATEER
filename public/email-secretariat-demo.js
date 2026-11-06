'use strict';
(() => {
 const q=new URLSearchParams(location.search);
 const org=q.get('organisation'),tenant=q.get('tenant');
 const root=document.getElementById('mails'),detail=document.getElementById('detail'),status=document.getElementById('status');
 const back=document.getElementById('back');
 if(org && tenant)back.href='/dashboard-vice-consul.html?organisation='+encodeURIComponent(org)+'&tenant='+encodeURIComponent(tenant);
 const api='/api/bordeaux-email-demo/messages';
 const qs='?organisationId='+encodeURIComponent(org||'')+'&tenant='+encodeURIComponent(tenant||'');
 function tag(name,text,cls){const x=document.createElement(name);if(cls)x.className=cls;x.textContent=text==null?'—':String(text);return x;}
 function field(container,label,value){const el=tag('div','','field');el.append(tag('b',label),tag('span',value));container.append(el);}
 async function json(url){const r=await fetch(url,{credentials:'same-origin',headers:{'Accept':'application/json'}});const type=r.headers.get('content-type')||'';if(!type.includes('application/json'))throw Error('Réponse serveur inattendue (HTML au lieu de JSON)');const data=await r.json();if(!r.ok)throw Error(data.statut||('HTTP '+r.status));return data;}
 function fail(e){status.className='danger';status.textContent='Courriers indisponibles : '+e.message;if(e.message==='SESSION_REQUISE'){const a=tag('a','Se connecter');a.href='/login.html';status.append(' · ',a);}}
 async function selectMail(m){try{status.textContent='Chargement du courrier n°'+m.id+'…';const data=await json(api+'/'+encodeURIComponent(m.id)+qs);detail.replaceChildren();const msg=data.message;detail.append(tag('h2','Courrier n°'+msg.id));field(detail,'Expéditeur',msg.expediteur);field(detail,'Objet',msg.objet);field(detail,'Boîte de recette',msg.boite);field(detail,'Catégorie proposée',msg.categorieProposee||'À qualifier manuellement');field(detail,'Unité suggérée',msg.uniteSuggeree||'Aucune destination automatique');field(detail,'Motif de qualification',msg.motif);detail.append(tag('h3','Contenu du message'));detail.append(tag('div',msg.texte,'content'));detail.append(tag('p','Préqualification uniquement : aucune demande créée, aucune validation effectuée.','hint'));status.textContent='Courrier n°'+msg.id+' consulté · Simulation en lecture seule.';for(const el of root.querySelectorAll('button[data-id]'))el.setAttribute('aria-pressed',String(Number(el.dataset.id)===Number(msg.id)));}catch(e){fail(e);}}
 async function init(){if(!org||!tenant){fail(Error('Ouvre cette page depuis le pilotage du Consulat avec organisation et tenant.'));return;}try{const p=await json(api+qs);root.replaceChildren();if(!p.messages.length){root.append(tag('p','Aucun courrier de simulation.','empty'));status.textContent='Aucun message.';return;}for(const m of p.messages){const b=tag('button','','mail');b.type='button';b.dataset.id=m.id;b.setAttribute('aria-pressed','false');b.append(tag('strong','Courrier n°'+m.id+' · '+m.objet),tag('small',m.expediteur+' · '+(m.categorieProposee||'À qualifier')));b.addEventListener('click',()=>selectMail(m));root.append(b);}status.textContent=p.messages.length+' courrier(s) de simulation.';await selectMail(p.messages[0]);}catch(e){fail(e);}}
 init();
})();
