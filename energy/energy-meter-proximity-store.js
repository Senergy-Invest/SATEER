'use strict';
/** E-METER-1C3 — projection canonique 061 STRICTEMENT READ ONLY, aucun modèle parallèle. */
const {LIMIT,signauxProximite,statut}=require('./energy-meter-proximity-domain');
function creerEnergyMeterProximityStore({obtenirClient}){
 if(typeof obtenirClient!=='function')throw TypeError('CLIENT_POSTGRES_REQUIS');
 async function read(fn){
  const c=await obtenirClient();let opened=false;
  try{await c.query('BEGIN READ ONLY');opened=true;const out=await fn(c);await c.query('COMMIT');opened=false;return out;}
  catch(e){if(opened)await c.query('ROLLBACK').catch(()=>{});throw e;}
  finally{c.release();}
 }
 async function site(c,{tenant,actor,siteId}){
  const r=await c.query(`SELECT s.id,s.public_id,s.nom,s.tenant_id,s.owner_personne_id
   FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
   WHERE t.code=$1 AND s.public_id=$2::uuid AND s.owner_personne_id=$3 LIMIT 1`,[tenant,siteId,actor]);
  return r.rows[0]||null;
 }
 const scope=s=>[s.id,s.tenant_id,s.owner_personne_id];
 async function sites({tenant,actor}){return read(async c=>{
  const r=await c.query(`SELECT s.public_id,s.nom FROM energy_inventory_sites s
   JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
   WHERE t.code=$1 AND s.owner_personne_id=$2 ORDER BY s.id LIMIT 51`,[tenant,actor]);
  return {sites:r.rows.slice(0,LIMIT).map(x=>({id:String(x.public_id),nom:x.nom})),suivant:r.rows.length>LIMIT};
 });}
 async function releves({tenant,actor,siteId,offset=0}){return read(async c=>{
  const s=await site(c,{tenant,actor,siteId});if(!s)return null;
  const r=await c.query(`SELECT r.id,r.register_id,r.valeur_index::text AS valeur,
     to_char(r.releve_le AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS releve_le,
     reg.code AS registre,reg.unite,d.nom AS compteur,p.nom AS point,
     precedent.valeur_index::text AS precedente,precedent.unite_snapshot AS unite_precedente,
     CASE WHEN precedent.releve_le IS NOT NULL THEN
       EXTRACT(EPOCH FROM (r.releve_le-precedent.releve_le))::text ELSE NULL END AS secondes
    FROM energy_meter_readings r
    JOIN energy_meter_registers reg ON reg.id=r.register_id AND reg.site_id=r.site_id
       AND reg.tenant_id=r.tenant_id AND reg.owner_personne_id=r.owner_personne_id
    JOIN energy_meter_devices d ON d.id=reg.meter_id AND d.site_id=reg.site_id
       AND d.tenant_id=reg.tenant_id AND d.owner_personne_id=reg.owner_personne_id
    JOIN energy_meter_points p ON p.id=reg.point_id AND p.site_id=reg.site_id
       AND p.tenant_id=reg.tenant_id AND p.owner_personne_id=reg.owner_personne_id
    LEFT JOIN LATERAL (SELECT ant.valeur_index,ant.unite_snapshot,ant.releve_le
      FROM energy_meter_readings ant WHERE ant.register_id=r.register_id
        AND ant.site_id=r.site_id AND ant.tenant_id=r.tenant_id
        AND ant.owner_personne_id=r.owner_personne_id AND ant.releve_le<r.releve_le
      ORDER BY ant.releve_le DESC,ant.id DESC LIMIT 1) precedent ON TRUE
    WHERE r.site_id=$1 AND r.tenant_id=$2 AND r.owner_personne_id=$3
    ORDER BY r.releve_le DESC,r.id DESC LIMIT 51 OFFSET $4`,[...scope(s),offset]);
  const items=r.rows.slice(0,LIMIT).map(x=>{
   const secs=x.secondes===null?null:Number(x.secondes);
   const signaux=signauxProximite({valeur:x.valeur,precedente:x.precedente,
      secondes:secs,memeUnite:x.unite_precedente===null||x.unite_precedente===x.unite});
   return {id:String(x.id),registerId:String(x.register_id),date:x.releve_le,
    point:x.point,compteur:x.compteur,registre:x.registre,unite:x.unite,
    valeur:x.valeur,precedente:x.precedente??null,
    intervalleSecondes:signaux.length?secs:null,
    signaux,statut:statut(signaux)};
  });
  return {site:{id:String(s.public_id),nom:s.nom},source:'RELEVES_RAPPROCHES',
   seuilSecondes:60,offset,limite:LIMIT,suivant:r.rows.length>LIMIT,items,
   qualification:'SIGNAL_INDICATIF_NON_CERTIFIE',aucunCalculConsommation:true};
 });}
 return {sites,releves};
}
module.exports={creerEnergyMeterProximityStore};
