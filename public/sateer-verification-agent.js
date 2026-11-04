"use strict";
(() => {
 const p=new URLSearchParams(location.search),organisation=Number(p.get("organisation")),tenant=p.get("tenant")||"SN";
 const q=`?organisation=${encodeURIComponent(organisation)}&tenant=${encodeURIComponent(tenant)}`;
 const el=id=>document.getElementById(id);const back=new URL("/dashboard-vice-consul.html",location.origin);back.searchParams.set("organisation",organisation);back.searchParams.set("tenant",tenant);el("returnLink").href=back.pathname+back.search;
 const names={EN_ATTENTE:"En attente",EN_INSTRUCTION:"En instruction",COMPLEMENT_REQUIS:"Complément requis",EXAMEN_TERMINE:"Examen interne terminé",REFUSEE:"Refusé"};
 const api=async(url,method="GET",body)=>{const r=await fetch(url,{method,credentials:"same-origin",cache:"no-store",headers:{...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});return {http:r.status,data:await r.json().catch(()=>({}))};};
 const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 async function charger(){
  if(!Number.isSafeInteger(organisation)||organisation<=0){el("proEtat").textContent="Organisation invalide.";return;}
  const r=await api("/api/verifications-identite/instruction"+q);
  if(r.http!==200){el("dossiers").textContent=r.http===403?"Accès refusé : permission de lecture requise.":r.http===401?"Veuillez vous reconnecter.":"Dossiers indisponibles : "+r.http;return;}
  const root=el("dossiers");root.replaceChildren();el("proEtat").textContent=`${r.data.demandes?.length||0} dossier(s) visible(s).`;
  if(!r.data.demandes?.length)root.append(make("p","Aucune demande pour cette organisation.","muted"));
  for(const d of r.data.demandes||[]){const card=make("article",undefined,"item"),head=make("header");head.append(make("strong",`${d.citoyen?.prenom||""} ${d.citoyen?.nom||""} · Dossier n° ${d.id}`),make("span",names[d.statut]||d.statut,"badge"));card.append(head,
    make("p",`Références déclarées : ${Array.isArray(d.typesDocuments)?d.typesDocuments.join(", "):"Non précisées"}`),make("p",`Créé le ${new Date(d.dateCreation).toLocaleDateString("fr-FR")}`,"muted"));
   if(d.messageCitoyen)card.append(make("p",`Message citoyen : ${d.messageCitoyen}`));
   if(d.retourConsulat)card.append(make("p",`Dernier retour : ${d.retourConsulat}`));
   if(["EN_ATTENTE","EN_INSTRUCTION"].includes(d.statut)){
    const form=make("form"),area=make("textarea"),actions=make("div",undefined,"actions");area.maxLength=600;area.placeholder="Motif (obligatoire pour complément ou refus, sans données sensibles)";form.append(area);
    const opts=d.statut==="EN_ATTENTE"?[["PRENDRE_EN_CHARGE","Prendre en charge"]]:[["DEMANDER_COMPLEMENT","Demander un complément"],["TERMINER_EXAMEN","Clore l'examen interne"],["REFUSER","Refuser le dossier"]];
    for(const [action,label] of opts){const btn=make("button",label);btn.type="button";btn.addEventListener("click",async()=>{if(["REFUSER","DEMANDER_COMPLEMENT"].includes(action)&&!area.value.trim()){area.focus();return;}btn.disabled=true;const reply=await api(`/api/verifications-identite/instruction/${d.id}/action`+q,"POST",{action,commentaire:area.value});if(reply.http===200)await charger();else {btn.disabled=false;el("proEtat").textContent=`Opération refusée : ${reply.data.statut||reply.http}`;}});actions.append(btn);}form.append(actions);card.append(form);
   }root.append(card);
  }
 }
 el("refresh").addEventListener("click",()=>charger().catch(()=>el("proEtat").textContent="Erreur de chargement."));
 charger().catch(()=>el("proEtat").textContent="Erreur de chargement.");
})();
