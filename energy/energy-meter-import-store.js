'use strict';
/**
 * E-METER-1D1 : transactions à portée propriétaire/site/tenant.
 * CSV = saisie humaine assistée, provenance SQL SAISIE_MANUELLE inchangée,
 * audit details.modeSaisie = IMPORT_CSV_V1. Pas de nouvelle table ni migration.
 */
const crypto=require('node:crypto');
const {MODE,cleLigne,empreinte}=require('./energy-meter-import-domain');
const uuid=()=>crypto.randomUUID();
function creerEnergyMeterImportStore({obtenirClient}){
 if(typeof obtenirClient!=='function')throw TypeError('POSTGRES_CLIENT_REQUIS');
 async function withClient(fn){const c=await obtenirClient();try{return await fn(c);}finally{c.release();}}
 async function transaction(fn,readonly=false){return withClient(async c=>{
  let ouverte=false;try{
   await c.query(readonly?'BEGIN READ ONLY':'BEGIN');ouverte=true;
   const resultat=await fn(c);await c.query(readonly?'ROLLBACK':'COMMIT');ouverte=false;return resultat;
  }catch(e){if(ouverte)await c.query('ROLLBACK').catch(()=>{});throw e;}
 });}
 async function site(c,{tenant,actor,siteId},verrouiller=false){
  const r=await c.query(`SELECT s.id,s.public_id,s.nom,s.pays,s.tenant_id,s.owner_personne_id
   FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
   WHERE t.code=$1 AND s.public_id=$2::uuid AND s.owner_personne_id=$3
   LIMIT 1 ${verrouiller?'FOR UPDATE OF s':''}`,[tenant,siteId,actor]);
  return r.rows[0]||null;
 }
 async function inspecter(c,s,lot){
  const ids=[...new Set(lot.lignes.map(x=>x.registreId))];
  const r=await c.query(`SELECT r.id,r.code,r.unite,d.actif FROM energy_meter_registers r
   JOIN energy_meter_devices d ON d.id=r.meter_id AND d.point_id=r.point_id
    AND d.site_id=r.site_id AND d.tenant_id=r.tenant_id AND d.owner_personne_id=r.owner_personne_id
   WHERE r.id=ANY($1::uuid[]) AND r.site_id=$2 AND r.tenant_id=$3 AND r.owner_personne_id=$4`,
   [ids,s.id,s.tenant_id,s.owner_personne_id]);
  const autorises=new Map(r.rows.map(x=>[String(x.id),x]));
  const enCours=lot.lignes.filter(x=>autorises.get(x.registreId)?.actif===true);
  let collisions=new Set();
  if(enCours.length){
   const rr=await c.query(`SELECT m.register_id,m.releve_le FROM
     UNNEST($1::uuid[],$2::timestamptz[]) AS x(register_id,releve_le)
     JOIN energy_meter_readings m ON m.register_id=x.register_id AND m.releve_le=x.releve_le
    WHERE m.site_id=$3 AND m.tenant_id=$4 AND m.owner_personne_id=$5`,
    [enCours.map(x=>x.registreId),enCours.map(x=>x.releveLe),s.id,s.tenant_id,s.owner_personne_id]);
   collisions=new Set(rr.rows.map(x=>String(x.register_id)+'|'+new Date(x.releve_le).toISOString()));
  }
  const lignes=lot.lignes.map(x=>{
   const registre=autorises.get(x.registreId);
   const code=!registre||!registre.actif?'REGISTRE_NON_AUTORISE':
    collisions.has(x.registreId+'|'+x.releveLe)?'INSTANT_DEJA_SAISI':null;
   return {numero:x.numero,registreId:x.registreId,releveLe:x.releveLe,valeur:x.valeur,
    unite:code?null:registre.unite,statut:code?'REFUSE':'ADMISSIBLE',motif:code};
  });
  return {lignes,admissibles:lignes.filter(x=>x.statut==='ADMISSIBLE').length,
    refusees:lignes.filter(x=>x.statut==='REFUSE').length,unites:autorises};
 }
 async function sites({tenant,actor}){return withClient(async c=>{
  const r=await c.query(`SELECT s.public_id,s.nom,s.pays FROM energy_inventory_sites s
   JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE WHERE t.code=$1 AND s.owner_personne_id=$2
   ORDER BY s.id LIMIT 51`,[tenant,actor]);
  return {sites:r.rows.slice(0,50).map(x=>({id:String(x.public_id),nom:x.nom,pays:x.pays})),suivant:r.rows.length>50};
 });}
 async function apercu({tenant,actor,siteId,lot}){
  return transaction(async c=>{
   const s=await site(c,{tenant,actor,siteId});if(!s)return null;
   const details=await inspecter(c,s,lot);
   return {site:{id:String(s.public_id),nom:s.nom},format:lot.mode,fichierSha256:lot.fichierSha256,
    tailleOctets:lot.tailleOctets,total:lot.lignes.length,admissibles:details.admissibles,
    refusees:details.refusees,importPossible:details.refusees===0,lignes:details.lignes,
    provenance:'SAISIE_MANUELLE',qualification:'DECLARE_A_VERIFIER',aucunCalculConsommation:true};
  },true);
 }
 async function importer({tenant,actor,siteId,lot,requestKey}){
  return transaction(async c=>{
   const s=await site(c,{tenant,actor,siteId},true);if(!s)return {code:'SITE_NON_AUTORISE'};
   // L'empreinte inclut site et acteur ; l'idempotence est portée par le site/propriétaire.
   // La même clé sur un autre site n'est pas détectée comme collision globale.
   const hashLot=empreinte(JSON.stringify({siteId,actor,hash:lot.hashLot}));
   const deja=await c.query(`SELECT COUNT(*)::integer AS n,
     MIN(details->>'hashLot') AS min_hash,MAX(details->>'hashLot') AS max_hash
     FROM energy_meter_events
     WHERE site_id=$1 AND tenant_id=$2 AND owner_personne_id=$3
      AND action='MeterReadingDeclared.v1' AND details->>'lotIdempotence'=$4`,
     [s.id,s.tenant_id,s.owner_personne_id,requestKey]);
   const n=Number(deja.rows[0]?.n||0);
   if(n){
    const row=deja.rows[0];
    if(n===lot.lignes.length&&row.min_hash===hashLot&&row.max_hash===hashLot)
     return {code:'OK',nouveau:false,total:n,fichierSha256:lot.fichierSha256};
    return {code:'CLE_REUTILISEE'};
   }
   const controle=await inspecter(c,s,lot);
   if(controle.refusees)return {code:'LOT_NON_IMPORTABLE',lignes:controle.lignes};
   const lignes=[];
   for(const v of lot.lignes){
    const id=uuid(),registre=controle.unites.get(v.registreId);
    const requestLigne=cleLigne(requestKey,v.numero);
    const hash=empreinte(JSON.stringify({source:MODE,requestKey,registreId:v.registreId,valeur:v.valeur,
     releveLe:v.releveLe,observation:v.observation}));
    const r=await c.query(`INSERT INTO energy_meter_readings
     (id,register_id,meter_id,point_id,site_id,tenant_id,owner_personne_id,
      valeur_index,unite_snapshot,releve_le,observation,auteur_personne_id,request_key,content_hash)
     SELECT $1::uuid,reg.id,reg.meter_id,reg.point_id,$2,$3,$4,$5::numeric,reg.unite,
      $6::timestamptz,$7,$8,$9::uuid,$10
      FROM energy_meter_registers reg
      JOIN energy_meter_devices dev ON dev.id=reg.meter_id AND dev.point_id=reg.point_id
       AND dev.site_id=reg.site_id AND dev.tenant_id=reg.tenant_id AND dev.owner_personne_id=reg.owner_personne_id
      WHERE reg.id=$11::uuid AND reg.site_id=$2 AND reg.tenant_id=$3 AND reg.owner_personne_id=$4
       AND dev.actif=TRUE
     ON CONFLICT DO NOTHING RETURNING id`,
     [id,s.id,s.tenant_id,s.owner_personne_id,v.valeur,v.releveLe,v.observation,actor,
      requestLigne,hash,v.registreId]);
    if(r.rows.length!==1){const err=new Error('IMPORT_CONFLIT_TRANSACTION');err.code='IMPORT_CONFLIT_TRANSACTION';throw err;}
    await c.query(`INSERT INTO energy_meter_events
     (site_id,tenant_id,owner_personne_id,acteur_personne_id,action,entity_id,details)
     VALUES($1,$2,$3,$4,'MeterReadingDeclared.v1',$5::uuid,$6::jsonb)`,
     [s.id,s.tenant_id,s.owner_personne_id,actor,id,JSON.stringify({modeSaisie:MODE,
       fichierSha256:lot.fichierSha256,hashLot,lotIdempotence:requestKey,ligne:v.numero,
       registreId:v.registreId,unite:registre.unite,qualification:'DECLARE_A_VERIFIER'})]);
    lignes.push({numero:v.numero,id});
   }
   return {code:'OK',nouveau:true,total:lignes.length,fichierSha256:lot.fichierSha256,
     qualification:'DECLARE_A_VERIFIER',lignes};
  });
 }
 return {sites,apercu,importer};
}
module.exports={creerEnergyMeterImportStore};
