"use strict";
/** Coffre documentaire personnel : ajout et relecture titulaire, aucune transmission à un Consulat. */
(() => {
  const $ = id => document.getElementById(id);
  const panel = $("personalVault"), filePicker = $("vaultFilePicker"), cameraPicker = $("vaultCameraPicker");
  if (!panel || !filePicker || !cameraPicker) return;
  const status = $("vaultStatus"), list = $("vaultList"), choice = $("vaultCategory");
  const endpoint = "/api/coffre-documents";
  let busy = false;
  const names = {
    CNI_RECTO:"CNI · recto", CNI_VERSO:"CNI · verso", PASSEPORT:"Passeport · page identité",
    CARTE_CONSULAIRE:"Carte consulaire", ACTE_NAISSANCE:"Acte de naissance",
    JUSTIFICATIF_DOMICILE:"Justificatif de domicile", AUTRE:"Autre justificatif"
  };
  const json = r => r.json().catch(() => ({}));
  const info = (message, level="info") => { status.textContent=message; status.dataset.level=level; };
  const fmt = bytes => bytes > 1048576 ? (bytes / 1048576).toFixed(1)+" Mo" : Math.round(bytes / 1024)+" Ko";
  function btn(label, title, handler) {
    const b=document.createElement("button"); b.type="button"; b.textContent=label;
    b.className="vault-action"; b.setAttribute("aria-label",title); b.addEventListener("click",handler); return b;
  }
  async function load() {
    try {
      const r=await fetch(endpoint,{credentials:"same-origin",cache:"no-store"});
      const data=await json(r); if (!r.ok || !Array.isArray(data.documents)) throw Error(data.statut||"HTTP "+r.status);
      list.replaceChildren();
      if (!data.documents.length) {
        const p=document.createElement("p"); p.className="identity-help";
        p.textContent="Votre coffre est vide. Vous pourrez conserver ici vos documents pour vos futures démarches.";
        list.append(p);
      }
      for (const doc of data.documents) {
        const line=document.createElement("div"); line.className="vault-item";
        const metadata=document.createElement("div"); metadata.className="vault-item-meta";
        const name=document.createElement("strong"); name.textContent=names[doc.categorie]||"Document";
        const desc=document.createElement("small");desc.textContent=`${doc.nom || "Document"} · ${fmt(doc.taille)} · Non vérifié`;
        metadata.append(name,desc); line.append(metadata);
        const actions=document.createElement("div");actions.className="vault-item-actions";
        actions.append(btn("Récupérer","Télécharger "+name.textContent,()=>download(doc.id,doc.format)));
        actions.append(btn("Supprimer","Supprimer "+name.textContent,()=>remove(doc.id)));
        line.append(actions); list.append(line);
      }
      info(data.documents.length+" document(s) privé(s) enregistré(s). Aucune pièce n'a été transmise au Consulat.");
    } catch(e) { info("Coffre indisponible ("+e.message+"). Rechargez la page et vérifiez la session.","error"); }
  }
  async function upload(file) {
    if (!file || busy) return;
    const category=choice.value;
    if (!Object.hasOwn(names,category)) return info("Choisissez le type de document.","error");
    if (file.size < 16 || file.size > 5*1024*1024) return info("Chaque fichier doit faire au maximum 5 Mo.","error");
    const types=["image/jpeg","image/png","image/webp","application/pdf"];
    if (!types.includes(file.type)) return info("Utilisez JPG, PNG, WebP ou PDF. Les photos HEIC ne sont pas acceptées dans ce pilote.","error");
    busy=true; $("vaultImportButton").disabled=true;$("vaultPhotoButton").disabled=true;
    info("Chiffrement et enregistrement du fichier en cours…");
    try {
      const r=await fetch(endpoint+"/"+encodeURIComponent(category),{
        method:"POST", credentials:"same-origin", cache:"no-store",
        headers:{"Content-Type":"application/octet-stream","X-SATEER-FILENAME":encodeURIComponent(file.name)}, body:file
      });
      const data=await json(r);
      if(!r.ok) throw Error(data.statut || "HTTP "+r.status);
      await load(); info("Document privé ajouté. Non vérifié et non transmis.","success");
    } catch(e) { info("Enregistrement refusé : "+e.message,"error"); }
    finally { busy=false; $("vaultImportButton").disabled=false;$("vaultPhotoButton").disabled=false; filePicker.value="";cameraPicker.value=""; }
  }
  async function remove(id) {
    if (busy || !confirm("Supprimer définitivement ce document de votre coffre personnel ?")) return;
    busy=true;
    try {
      const r=await fetch(endpoint+"/"+encodeURIComponent(id),{method:"DELETE",credentials:"same-origin"});
      const data=await json(r); if(!r.ok) throw Error(data.statut||"HTTP "+r.status);
      await load(); info("Document supprimé du coffre.","success");
    } catch(e) { info("Suppression impossible : "+e.message,"error"); }
    finally {busy=false;}
  }
  async function download(id,format) {
    try {
      const r=await fetch(endpoint+"/"+encodeURIComponent(id)+"/telecharger",{credentials:"same-origin",cache:"no-store"});
      if(!r.ok) throw Error("HTTP "+r.status);
      const blob=await r.blob();const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;const ext={"application/pdf":"pdf","image/jpeg":"jpg","image/png":"png","image/webp":"webp"}[format]||"bin";a.download="document-sateer."+ext;
      document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(e) {info("Téléchargement impossible : "+e.message,"error");}
  }
  $("vaultImportButton").addEventListener("click",()=>filePicker.click());
  $("vaultPhotoButton").addEventListener("click",()=>cameraPicker.click());
  filePicker.addEventListener("change",()=>upload(filePicker.files?.[0]));
  cameraPicker.addEventListener("change",()=>upload(cameraPicker.files?.[0]));
  load();
})();
