"use strict";
(() => {
 const params=new URLSearchParams(location.search);
 const organisation=Number(params.get("organisation")),tenant=params.get("tenant")||"SN";
 const q=`?organisation=${encodeURIComponent(organisation)}&tenant=${encodeURIComponent(tenant)}`;
 const el=id=>document.getElementById(id);
 const retour=new URL("/consulat.html",location.origin);retour.searchParams.set("organisation",organisation);retour.searchParams.set("tenant",tenant);el("returnLink").href=retour.pathname+retour.search;
 const labels={EN_ATTENTE:"En attente",EN_INSTRUCTION:"En cours d'instruction",COMPLEMENT_REQUIS:"Complément demandé",EXAMEN_TERMINE:"Examen interne terminé (non officiel)",REFUSEE:"Dossier refusé"};
 let pieces=0;
 const api=async(path,method="GET",body)=>{const r=await fetch(path,{method,credentials:"same-origin",cache:"no-store",headers:{...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})}); const data=await r.json().catch(()=>({}));return {http:r.status,data};};
 const txt=(node,value)=>{node.textContent=value||"";};
 function create(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)txt(n,text);if(cls)n.className=cls;return n;}
 async function demarrer(){
  if(!Number.isSafeInteger(organisation)||organisation<1){txt(el("formEtat"),"Organisation absente ou invalide. Revenez à Mon Consulat.");el("submit").disabled=true;return;}
  const [auth,doc,history]=await Promise.all([api("/api/auth/me"),api("/api/mes-pieces-identite"),api("/api/verifications-identite/mes-demandes"+q)]);
  if(auth.http!==200){txt(el("formEtat"),"Veuillez vous reconnecter à SATEER.");el("submit").disabled=true;return;}
  if(doc.http===200){pieces=Array.isArray(doc.data.documents)?doc.data.documents.length:0;txt(el("piecesEtat"),pieces?`${pieces} référence(s) déclarée(s), non vérifiée(s).` :"Aucune référence déclarée. Ajoutez d'abord une CNI ou un passeport fictif dans Mon identité.");}
  else txt(el("piecesEtat"),"Les références ne sont pas accessibles pour le moment.");
  if(history.http!==200){txt(el("dossiers"),history.http===403?"Accès à ce Consulat non autorisé.":"Dossiers indisponibles.");el("submit").disabled=true;return;}
  const list=el("dossiers");list.replaceChildren();
  if(!history.data.demandes?.length) list.append(create("p","Aucune demande de vérification enregistrée.","muted"));
  for(const d of history.data.demandes||[]){const card=create("article",undefined,"item"),h=create("header");h.append(create("strong",`Dossier n° ${d.id}`),create("span",labels[d.statut]||d.statut,"badge"));card.append(h,create("p",`Dépôt : ${new Date(d.dateCreation).toLocaleDateString("fr-FR")}`,"muted"));
   if(d.retourConsulat)card.append(create("p",`Message du Consulat : ${d.retourConsulat}`));
   if(d.statut==="COMPLEMENT_REQUIS"){
    const form=create("form"),area=create("textarea"),btn=create("button","Transmettre mon complément");area.maxLength=600;area.required=true;area.placeholder="Réponse ou complément, sans numéro de pièce";form.append(area,btn);
    form.addEventListener("submit",async e=>{e.preventDefault();btn.disabled=true;const r=await api(`/api/verifications-identite/mes-demandes/${d.id}/completer${q}`,"POST",{message:area.value});if(r.http===200)await demarrer();else {btn.disabled=false;alert("Complément non transmis : "+(r.data.statut||r.http));}});card.append(form);
   } list.append(card);
  }
  const bloque=(history.data.demandes||[]).some(d=>["EN_ATTENTE","EN_INSTRUCTION","COMPLEMENT_REQUIS"].includes(d.statut));
  el("submit").disabled=pieces===0||bloque; txt(el("formEtat"),bloque?"Une demande est déjà en cours pour ce Consulat.":"");
 }
 el("verificationForm").addEventListener("submit",async e=>{e.preventDefault();if(!el("consent").checked||!pieces)return;const b=el("submit");b.disabled=true;const r=await api("/api/verifications-identite/mes-demandes"+q,"POST",{consentement:true,message:el("citizenNote").value});if(r.http===201){el("citizenNote").value="";el("consent").checked=false;await demarrer();}else{txt(el("formEtat"),"Envoi impossible : "+(r.data.statut||r.http));b.disabled=false;}});
 demarrer().catch(()=>{txt(el("formEtat"),"Service temporairement indisponible.");el("submit").disabled=true;});
})();
