"use strict";
(async()=>{
 const params=new URLSearchParams(location.search);
 const ctx=await window.SATEER_CONTEXT_READY;
 const org=await window.SATEER_choisirOrganisation(params.get("organisation"));
 const status=document.getElementById("listStatus"), creation=document.getElementById("createStatus"), box=document.getElementById("channels");
 if(!org){status.textContent="Aucune organisation autorisée sélectionnée.";document.getElementById("create").hidden=true;return;}
 document.getElementById("org").textContent=org.nom;
 const tenant=ctx.tenantCode;
 const base=`/api/organisations/${encodeURIComponent(org.id)}/channels?tenant=${encodeURIComponent(tenant)}`;
 document.getElementById("back").href=`/dashboard-vice-consul.html?organisation=${encodeURIComponent(org.id)}&tenant=${encodeURIComponent(tenant)}`;
 const get=async()=>{const r=await fetch(base,{credentials:"same-origin",cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.statut||`HTTP ${r.status}`);return j;};
 async function load(){box.textContent="Chargement…";try{const data=await get();box.replaceChildren();document.getElementById("count").textContent=`${data.canaux.length} canal(aux)`;if(!data.canaux.length){box.textContent="Aucun canal créé pour cette organisation.";return;}
 data.canaux.forEach(c=>{const art=document.createElement("article");art.className="channel";const info=document.createElement("div");const h=document.createElement("h3");h.textContent=c.nom;const desc=document.createElement("p");desc.textContent=c.description||"Aucune description";const code=document.createElement("span");code.className="chip";code.textContent=c.code;info.append(h,desc,code);art.append(info);box.append(art);});status.textContent="";}catch(e){box.textContent="";status.textContent=`Chargement impossible : ${e.message}`;status.classList.add("error");}}
 await load();
 const form=document.getElementById("create");form.addEventListener("submit",async e=>{e.preventDefault();creation.classList.remove("error");creation.textContent="Création en cours…";const button=document.getElementById("submit");button.disabled=true;
 try{const values=Object.fromEntries(new FormData(form).entries());const r=await fetch(base,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({...values,visibility:"PUBLIC",tenantCode:tenant})});const data=await r.json();if(!r.ok)throw new Error(data.statut||`HTTP ${r.status}`);creation.textContent="Canal créé avec succès.";form.reset();await load();}catch(err){creation.textContent=`Création impossible : ${err.message}`;creation.classList.add("error");}finally{button.disabled=false;}});
})().catch(e=>console.error("Canaux institutionnels :",e));
