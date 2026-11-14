"use strict";
/** A12 : aucun accès de lecture si pas de droit serveur. textContent uniquement. */
(function(root){
  const mk=(doc,tag,cls,txt)=>{const e=doc.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=String(txt);return e;};
  const validerId=v=>Number.isSafeInteger(Number(v)) && Number(v)>0;
  function afficher(doc,zone,data){
    if(!data||data.statut!=='RESEAU_AMBASSADE'|| !['consulats','associationsDirectes','associationsDesConsulats','partenaires','attentes'].every(k=>Array.isArray(data[k])))throw new TypeError('RESEAU_INVALID');
    const wrap=mk(doc,'div','amb-network-shell');
    const groupes=[
      ['Consulats liés','consulats','Postes liés par une relation administrative validée'],
      ['Associations directes','associationsDirectes','Relations acceptées directement avec la mission'],
      ['Associations des consulats','associationsDesConsulats','Vue de réseau par poste lié, sans gestion de ses membres'],
      ['Partenaires et coopérations','partenaires','Coopérations actives, distinctes des relations hiérarchiques'],
      ['Relations en attente','attentes','Demandes et invitations à examiner par les acteurs autorisés']
    ];
    const tiles=mk(doc,'div','amb-network-overview');
    for(const [titre,key,desc] of groupes){
      const card=mk(doc,'article','amb-network-card');
      card.append(mk(doc,'strong','amb-network-number',data[key].length),mk(doc,'h3','',titre),mk(doc,'p','',desc));
      const list=mk(doc,'ul','amb-network-list');
      for(const item of data[key].slice(0,40)){
        const name=item.nom;
        if(typeof name!=='string'||name.length>255||!validerId(item.id))throw new TypeError('ITEM_RESEAU_INVALIDE');
        const li=mk(doc,'li','',name);
        const detail=key==='associationsDesConsulats'?` · via ${item.consulatNom}`:
          key==='partenaires'?` · ${item.relation}`:
          key==='attentes'?` · ${item.origine.toLowerCase()}`:'';
        if(detail)li.append(mk(doc,'span','amb-network-detail',detail));
        list.append(li);
      }
      if(!data[key].length)list.append(mk(doc,'li','amb-network-empty','Aucune relation enregistrée pour ce périmètre.'));
      card.append(list);tiles.append(card);
    }
    wrap.append(tiles,mk(doc,'p','amb-network-disclaimer','Les liens indiqués proviennent de relations actives enregistrées dans SATEER. Aucune relation n’attribue à elle seule le droit de lire ou modifier les dossiers d’un autre poste.'));
    zone.replaceChildren(wrap);
  }
  async function charger({organisationId,tenantCode,doc=root.document,fetcher=root.fetch?.bind(root)}={}){
    const section=doc?.getElementById('ambassadeReseauSection'),zone=doc?.getElementById('ambassadeReseauContenu'),status=doc?.getElementById('ambassadeReseauStatut');
    if(!section||!zone||!status||!validerId(organisationId)||!TENANT.test(tenantCode||'')||typeof fetcher!=='function')return false;
    try {
      const url=`/api/ambassade-network/${encodeURIComponent(organisationId)}?tenant=${encodeURIComponent(tenantCode)}`;
      const response=await fetcher(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
      if(response.status===401||response.status===403||response.status===404){section.hidden=true;return false;}
      if(!response.ok){section.hidden=false;status.textContent='Réseau momentanément indisponible.';return false;}
      const data=await response.json();
      if(data.organisation?.id!==Number(organisationId)||data.tenantCode!==tenantCode||data.organisation?.type!=='AMBASSADE')throw Error('HORS_PERIMETRE');
      afficher(doc,zone,data);section.hidden=false;status.textContent='Relations institutionnelles actives, filtrées pour ce responsable.';return true;
    }catch(_){section.hidden=false;zone.replaceChildren();status.textContent='Réseau indisponible. Aucune relation ne peut être déduite.';return false;}
  }
  const TENANT=/^[A-Z][A-Z0-9_-]{0,49}$/;
  const api=Object.freeze({charger,afficher});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root && typeof root==='object')root.SATEER_AMBASSADE_RESEAU=api;
})(typeof window!=='undefined'?window:globalThis);
