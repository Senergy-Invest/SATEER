/* SUNU Courant — MVP02-UX-1, adaptation de présentation, sans deuxième moteur Energy. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SATEER_INVENTAIRE_UX = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const CATEGORIES = Object.freeze([
    { id:'FRIGO', famille:'FROID', nom:'Réfrigérateur', emoji:'🧊', mode:'MAISON', nomAppareil:'Mon réfrigérateur' },
    { id:'CONGELATEUR', famille:'FROID', nom:'Congélateur', emoji:'❄️', mode:'MAISON', nomAppareil:'Mon congélateur' },
    { id:'CLIM', famille:'CLIMATISATION', nom:'Climatiseur', emoji:'🌬️', mode:'TOUS', nomAppareil:'Mon climatiseur' },
    { id:'VENTILO', famille:'AUTRE', nom:'Ventilateur', emoji:'🌀', mode:'MAISON', nomAppareil:'Mon ventilateur' },
    { id:'LAMPE', famille:'ECLAIRAGE', nom:'Lampes', emoji:'💡', mode:'TOUS', nomAppareil:'Mes lampes' },
    { id:'TV', famille:'AUTRE', nom:'Télévision', emoji:'📺', mode:'MAISON', nomAppareil:'Ma télévision' },
    { id:'POMPE', famille:'POMPAGE', nom:'Pompe à eau', emoji:'💧', mode:'TOUS', nomAppareil:'Ma pompe' },
    { id:'MACHINE', famille:'MOTEUR', nom:'Machine / moteur', emoji:'⚙️', mode:'PRO', nomAppareil:'Ma machine' },
    { id:'ORDINATEUR', famille:'INFORMATIQUE', nom:'Informatique', emoji:'💻', mode:'PRO', nomAppareil:'Mon équipement informatique' },
    { id:'SOLAIRE', famille:'SOLAIRE', nom:'Équipement solaire', emoji:'☀️', mode:'PRO', nomAppareil:'Mon équipement solaire' },
    { id:'BATTERIE', famille:'STOCKAGE', nom:'Batterie', emoji:'🔋', mode:'PRO', nomAppareil:'Ma batterie' },
    { id:'AUTRE', famille:'AUTRE', nom:'Autre appareil', emoji:'➕', mode:'TOUS', nomAppareil:'' }
  ]);
  const TYPES = Object.freeze({
    LOGEMENT:'MENAGE', COMMERCE:'PRO', PME:'PRO', BATIMENT_PUBLIC:'PUBLIC',
    INDUSTRIE:'INDUSTRIE', EXPLOITATION_AGRICOLE:'AGRICOLE', AUTRE:'PRO'
  });
  const LIBELLES = Object.freeze({MENAGE:'Mon logement',PRO:'Mon activité',PUBLIC:'Mon bâtiment',INDUSTRIE:'Mon installation',AGRICOLE:'Mon exploitation'});
  function profil(typeSite) { return TYPES[typeSite] || 'PRO'; }
  function selection(typeSite, besoins = []) {
    const p = profil(typeSite);
    const order = p==='MENAGE' ? ['FRIGO','CONGELATEUR','CLIM','VENTILO','LAMPE','TV','POMPE','AUTRE'] :
      p==='AGRICOLE' ? ['POMPE','SOLAIRE','MACHINE','BATTERIE','FRIGO','LAMPE','AUTRE'] :
      p==='INDUSTRIE' ? ['MACHINE','POMPE','CLIM','CONGELATEUR','LAMPE','SOLAIRE','BATTERIE','AUTRE'] :
      p==='PUBLIC' ? ['CLIM','LAMPE','ORDINATEUR','POMPE','FRIGO','AUTRE'] :
      ['FRIGO','CONGELATEUR','CLIM','LAMPE','ORDINATEUR','POMPE','MACHINE','AUTRE'];
    const byId = new Map(CATEGORIES.map(c=>[c.id,c]));
    const goals=new Set(Array.isArray(besoins)?besoins:[]);
    const priority=goals.has('POMPAGE')?'POMPE':goals.has('CONFORT')?'CLIM':goals.has('FROID')?'FRIGO':null;
    if (priority && order.includes(priority)) return [byId.get(priority),...order.filter(id=>id!==priority).map(id=>byId.get(id))].filter(Boolean);
    return order.map(id=>byId.get(id)).filter(Boolean);
  }
  function categorie(id) { return CATEGORIES.find(c=>c.id===id) || null; }
  function zoneParDefaut(zones, profilSite) {
    const roots = (Array.isArray(zones)?zones:[]).filter(z=>!z.parentId && ['BATIMENT','EXTERIEUR'].includes(z.typeZone));
    const prefered = profil(profilSite)==='AGRICOLE' ? 'EXTERIEUR' : 'BATIMENT';
    return roots.find(z=>z.typeZone===prefered) || roots.find(z=>z.typeZone==='BATIMENT') || roots[0] || null;
  }
  function zoneInitiale(typeSite) {
    const p=profil(typeSite);
    if(p==='AGRICOLE')return {typeZone:'EXTERIEUR',nom:'Mon exploitation',parentId:null};
    return {typeZone:'BATIMENT',nom:LIBELLES[p]||'Site principal',parentId:null};
  }
  function saisieEquipement({categorieId,nom,quantite,zoneId,puissance}) {
    const c=categorie(categorieId);
    if(!c||typeof nom!=='string'||!nom.trim()||nom.trim().length>120||/[\u0000-\u001f\u007f]/.test(nom))return null;
    if(typeof zoneId!=='string'||!(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i).test(zoneId))return null;
    const q=Number(quantite);if(!Number.isSafeInteger(q)||q<1||q>10000)return null;
    let w=null;if(puissance!==null&&puissance!==undefined&&String(puissance).trim()!==''){
      w=Number(puissance);if(!Number.isSafeInteger(w)||w<1||w>100000000)return null;
    }
    return {zoneId,nom:nom.trim(),famille:c.famille,quantite:q,puissanceUnitaireW:w};
  }
  function libre(famille) {
    const found=CATEGORIES.find(c=>c.famille===famille && !['VENTILO','TV','AUTRE'].includes(c.id));
    return found || categorie('AUTRE');
  }
  function nomProfil(typeSite) { return LIBELLES[profil(typeSite)] || 'Mon site'; }
  return Object.freeze({CATEGORIES,profil,selection,categorie,zoneParDefaut,zoneInitiale,saisieEquipement,libre,nomProfil});
});
