"use strict";
(async function(){
  const state=document.getElementById("state"), container=document.getElementById("publications");
  const p=new URLSearchParams(location.search),org=Number(p.get("organisation")),tenant=p.get("tenant");
  if(!Number.isSafeInteger(org)||org<=0||!tenant||!/^[A-Za-z0-9_-]{1,30}$/.test(tenant)){
    state.textContent="Ouvrez cette page avec le lien officiel de votre organisation.";return;
  }
  try {
    const response=await fetch(`/api/organisations/${org}/communication-feed?tenant=${encodeURIComponent(tenant)}`, {credentials:"same-origin",cache:"no-store"});
    const data=await response.json();
    if(!response.ok)throw Error(data.statut||`HTTP ${response.status}`);
    const pubs=data.publications||[];
    state.textContent=pubs.length?`${pubs.length} information(s) reçue(s).`:'Aucune publication destinée à votre profil.';
    for(const pub of pubs){
      const article=document.createElement('article');
      const title=document.createElement('h2');title.textContent=pub.titre||"Information";
      const meta=document.createElement('p');meta.className='info';meta.textContent=(pub.categorie||'Information')+' · '+(pub.priorite||'Normale');
      const body=document.createElement('p');body.textContent=pub.contenu||'';
      article.append(title,meta,body);
      for(const m of Array.isArray(pub.medias)?pub.medias:[]){
        if(typeof m.url!=='string' || !m.url.startsWith(`/api/organisations/${org}/publications/${pub.id}/media/`)) continue;
        if(m.type==='IMAGE'){
          const img=document.createElement('img');img.src=m.url;img.alt='Illustration de la publication';
          img.loading='lazy';img.style.cssText='max-width:100%;height:auto;max-height:340px;object-fit:contain';article.append(img);
        } else if(m.type==='DOCUMENT'){
          const a=document.createElement('a');a.href=m.url;a.textContent='Consulter le PDF';a.target='_blank';a.rel='noopener noreferrer';article.append(a);
        }
      }
      container.append(article);
    }
  }catch(e){state.textContent='Impossible de charger les informations : '+e.message;}
})();
