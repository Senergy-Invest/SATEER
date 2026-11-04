"use strict";
(async()=>{
 const params=new URLSearchParams(location.search);const ctx=await window.SATEER_CONTEXT_READY;
 const org=await window.SATEER_choisirOrganisation(params.get("organisation"));const box=document.getElementById("channels"),status=document.getElementById("status");
 if(!org){box.textContent="Aucune organisation disponible.";return;}
 document.getElementById("org").textContent=org.nom;
 const base=`/api/organisations/${encodeURIComponent(org.id)}/channels`,query=`?tenant=${encodeURIComponent(ctx.tenantCode)}`;
 async function call(path,options={}){const response=await fetch(path,{credentials:"same-origin",...options});let data;try{data=await response.json();}catch{throw new Error(`HTTP ${response.status}`);}if(!response.ok)throw new Error(data.statut||`HTTP ${response.status}`);return data;}
 async function load(){box.textContent="Chargement…";try{const data=await call(base+query,{cache:"no-store"});box.replaceChildren();document.getElementById("count").textContent=`${data.canaux.length} canal(aux)`;if(!data.canaux.length){box.textContent="Aucun canal disponible pour cette organisation.";return;}
 for(const c of data.canaux){const art=document.createElement("article");art.className="channel";const info=document.createElement("div");const name=document.createElement("h3");name.textContent=c.nom;const desc=document.createElement("p");desc.textContent=c.description||"Aucune description";const chip=document.createElement("span");chip.className="chip";chip.textContent=c.abonne?"Abonné":"Non abonné";info.append(name,desc,chip);const button=document.createElement("button");button.className=c.abonne?"btn-outline":"";button.textContent=c.abonne?"Se désabonner":"S'abonner";
 button.addEventListener("click",async()=>{button.disabled=true;status.textContent="Mise à jour de l'abonnement…";status.classList.remove("error");try{await call(`${base}/${encodeURIComponent(c.id)}/subscribe${query}`,{method:c.abonne?"DELETE":"POST"});status.textContent=c.abonne?"Désabonnement effectué.":"Abonnement effectué.";await load();}catch(e){status.textContent=`Opération impossible : ${e.message}`;status.classList.add("error");button.disabled=false;}});
 art.append(info,button);box.append(art);} }catch(e){box.textContent="";status.textContent=`Chargement impossible : ${e.message}`;status.classList.add("error");}}
 await load();
})().catch(e=>console.error("Mes canaux :",e));
