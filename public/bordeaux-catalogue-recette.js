(()=>{'use strict';
const ORG=70,TENANT='P6V_3B5AC5AB9DB04657',BASE='/api/bordeaux-procedures-recette/';
const $=id=>document.getElementById(id);
const node=(tag,txt)=>{const n=document.createElement(tag);if(txt!==undefined)n.textContent=String(txt);return n;};
const message=(t,err=false)=>{$('status').textContent=t;$('status').classList.toggle('error',err);};
async function request(url,options){const r=await fetch(BASE+url,{credentials:'same-origin',cache:'no-store',...options});
const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.statut||('HTTP '+r.status));return j;}
function card(p,admin){const wrap=node('article');wrap.className='card';
const h=node('h3',p.titre);const state=node('p', 'État simulé : '+p.etat);state.className='state';
const parts=node('p','Pièces fictives : '+(p.piecesObligatoires||[]).join(', '));
wrap.append(h,state,parts,node('small','RECETTE · Jamais publié dans le catalogue institutionnel'));
if(admin){const actions={BROUILLON:['VALIDER'],VALIDEE:['PUBLIER'],PUBLIEE:['RETIRER']};
for(const action of (actions[p.etat]||[])){const b=node('button',action+' (simulation)');b.type='button';
b.addEventListener('click',async()=>{
if(!window.confirm('Confirmer la '+action.toLowerCase()+' SIMULÉE de cette fiche fictive ? Aucun effet officiel.'))return;
b.disabled=true;try{await request('actions/'+encodeURIComponent(p.code),{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify({organisationId:ORG,tenantCode:TENANT,action,revision:p.revision,confirmation:'CONFIRMER_SIMULATION_BORDEAUX'})});await load();}
catch(e){message('Simulation refusée : '+e.message,true);b.disabled=false;}});wrap.append(b);}}
return wrap;}
async function load(){try{const d=await request('catalogue?'+new URLSearchParams({organisationId:ORG,tenant:TENANT}));
const admin=$('admin-list'),cit=$('citizen-list');admin.replaceChildren();cit.replaceChildren();
const rows=d.procedures||[];
if(d.peutSimuler){if(!rows.length)admin.append(node('p','Aucun brouillon [DEMO BORDEAUX] éligible.'));
for(const p of rows)admin.append(card(p,true));}
else admin.append(node('p','Ce compte ne possède pas le rôle Vice-Consul de recette et le droit MANAGE_PUBLICATIONS. Vue administrative indisponible.'));
const published=rows.filter(p=>p.etat==='PUBLIEE');
if(!published.length)cit.append(node('p','Aucune fiche publiée dans la simulation.'));
for(const p of published)cit.append(card(p,false));
message('Catalogue de recette chargé. '+(d.peutSimuler?'Vice-Consul de recette autorisé.':'Aperçu citoyen uniquement.'));
}catch(e){message('Accès à la recette impossible : '+e.message,true);}}
$('reload').addEventListener('click',load);load();
})();
