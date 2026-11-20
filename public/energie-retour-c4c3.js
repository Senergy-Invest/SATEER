'use strict';
/** Contrat de retour C4C3 : URL interne canonique, sans droits tirés de la navigation. */
(function(root, factory) {
  const navigation = factory();
  if (typeof module === 'object' && module.exports) module.exports = navigation;
  if (root) root.SATEER_C4C3_NAV = navigation;
})(typeof window !== 'undefined' ? window : null, function() {
  const TENANT=/^[A-Z][A-Z0-9_-]{0,49}$/;
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const STATUTS=['TOUTES','EN_REVUE','A_CORRIGER'];
  const SUIVIS=['TOUS','SANS_RELECTEUR_ACTIF'];
  function lireEtat(search,tenant) {
    if(!TENANT.test(tenant||'')) return null;
    const p=new URLSearchParams(search);
    if(p.get('tenant')!==tenant) return null;
    const site=p.get('site'), grantId=p.get('grantId');
    const statut=p.get('statut'),suivi=p.get('suivi'),offset=p.get('offset');
    return {site:site&&UUID.test(site)?site:null, grantId:grantId&&UUID.test(grantId)?grantId:null,
      statut:STATUTS.includes(statut)?statut:'TOUTES',
      suivi:SUIVIS.includes(suivi)?suivi:'TOUS',
      offset:offset!==null&&/^(0|[1-9][0-9]{0,4})$/.test(offset)&&Number(offset)<=10000&&Number(offset)%50===0?Number(offset):0};
  }
  function retour(tenant,site,statut='TOUTES',suivi='TOUS',offset=0) {
    if(!TENANT.test(tenant||'')) return null;
    const p=new URLSearchParams({tenant});
    if(site?.id&&UUID.test(site.id))p.set('site',site.id);
    if(site?.grantId&&UUID.test(site.grantId))p.set('grantId',site.grantId);
    if(STATUTS.includes(statut))p.set('statut',statut);
    if(SUIVIS.includes(suivi))p.set('suivi',suivi);
    if(Number.isSafeInteger(offset)&&offset>=0&&offset<=10000&&offset%50===0)p.set('offset',String(offset));
    return '/energie-actions.html?'+p.toString();
  }
  function vers(path,tenant,site,statut,suivi,offset,fragment='') {
    if(!['/energie-responsabilites.html','/energie-collecte.html'].includes(path))return null;
    const back=retour(tenant,site,statut,suivi,offset);
    if(!back)return null;
    const p=new URLSearchParams({tenant,from:'c4c3',retourC4C3:back});
    return path+'?'+p.toString()+(fragment&&/^#[A-Za-z0-9_-]+$/.test(fragment)?fragment:'');
  }
  function retourDepuis(search,tenant) {
    if(!TENANT.test(tenant||''))return null;
    const p=new URLSearchParams(search);
    if(p.get('from')!=='c4c3'||p.get('tenant')!==tenant)return null;
    const raw=p.get('retourC4C3');
    if(!raw||raw.length>500||!raw.startsWith('/energie-actions.html?')||raw.includes('#'))return null;
    const u=new URL(raw,'https://sateer.local.invalid');
    if(u.origin!=='https://sateer.local.invalid'||u.pathname!=='/energie-actions.html')return null;
    const o=lireEtat(u.search,tenant);
    if(!o)return null;
    return retour(tenant,o.site?{id:o.site,grantId:o.grantId}:null,o.statut,o.suivi,o.offset);
  }
  return Object.freeze({lireEtat,retour,vers,retourDepuis});
});
