'use strict';
/** E-METER-1E1 : transition atomique sous verrou site/proprietaire. Historique immuable. */
const crypto=require('node:crypto');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const id=()=>crypto.randomUUID();
function creerEnergyMeterReplacementStore({obtenirClient}){
 if(typeof obtenirClient!=='function')throw TypeError('POSTGRES_CLIENT_REQUIS');
 async function transaction(fn){
  const c=await obtenirClient();let opened=false;
  try{await c.query('BEGIN');opened=true;const result=await fn(c);await c.query('COMMIT');opened=false;return result;}
  catch(e){if(opened)await c.query('ROLLBACK').catch(()=>{});throw e;}
  finally{c.release();}
 }
 async function sites({tenant,actor}){
  const c=await obtenirClient();
  try{
   const r=await c.query(`SELECT s.public_id,s.nom,s.pays FROM energy_inventory_sites s
    JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
    WHERE t.code=$1 AND s.owner_personne_id=$2 ORDER BY s.id LIMIT 51`,[tenant,actor]);
   return {sites:r.rows.slice(0,50).map(x=>({id:String(x.public_id),nom:x.nom,pays:x.pays})),suivant:r.rows.length>50};
  }finally{c.release();}
 }
 async function remplacer({tenant,actor,siteId,pointId,meterId,requestKey,data}){
  const contentHash=hash({pointId,meterId,motif:data.motif,nouveauCompteur:data.nouveauCompteur});
  return transaction(async c=>{
   // Verrou identique aux ecritures 1A/1D1 : tous les changements du site sont serialises.
   const sr=await c.query(`SELECT s.id,s.tenant_id,s.owner_personne_id FROM energy_inventory_sites s
    JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
    WHERE t.code=$1 AND s.public_id=$2::uuid AND s.owner_personne_id=$3 LIMIT 1 FOR UPDATE OF s`,
    [tenant,siteId,actor]);
   const site=sr.rows[0];if(!site)return {code:'SITE_NON_AUTORISE'};
   const scope=[site.id,site.tenant_id,site.owner_personne_id];
   const pr=await c.query(`SELECT id FROM energy_meter_points
    WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4`,[pointId,...scope]);
   if(!pr.rows.length)return {code:'POINT_NON_AUTORISE'};
   // Reprise reseau : meme cle + meme contenu => aucune nouvelle modification.
   const replay=await c.query(`SELECT id,content_hash FROM energy_meter_devices
    WHERE site_id=$1 AND tenant_id=$2 AND owner_personne_id=$3 AND request_key=$4::uuid`,[...scope,requestKey]);
   if(replay.rows.length){
    if(replay.rows[0].content_hash!==contentHash)return {code:'CLE_REUTILISEE'};
    const newId=String(replay.rows[0].id);
    const rr=await c.query(`SELECT id FROM energy_meter_registers WHERE meter_id=$1::uuid
     AND point_id=$2::uuid AND site_id=$3 AND tenant_id=$4 AND owner_personne_id=$5
     AND code=$6`,[newId,pointId,...scope,data.nouveauCompteur.registreCode]);
    return rr.rows.length?{code:'OK',id:newId,registreId:String(rr.rows[0].id),nouveau:false}:{code:'CONTRAT_REPRISE_INCOHERENT'};
   }
   const old=await c.query(`SELECT id,point_id,actif,date_installation,date_retrait FROM energy_meter_devices
    WHERE id=$1::uuid AND point_id=$2::uuid AND site_id=$3 AND tenant_id=$4 AND owner_personne_id=$5`,
    [meterId,pointId,...scope]);
   if(!old.rows.length)return {code:'COMPTEUR_NON_AUTORISE'};
   if(!old.rows[0].actif||old.rows[0].date_retrait!==null)return {code:'COMPTEUR_DEJA_RETIRE'};
   const active=await c.query(`SELECT id FROM energy_meter_devices WHERE point_id=$1::uuid
    AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4 AND actif=TRUE`,[pointId,...scope]);
   if(active.rows.length!==1||String(active.rows[0].id)!==meterId)return {code:'COMPTEUR_ACTIF_INCOHERENT'};
   // Horodatage serveur seulement : ni retrodatation utilisateur ni date physique inventee.
   const stamp=(await c.query('SELECT clock_timestamp() AS instant')).rows[0].instant;
   if(new Date(stamp).getTime()<new Date(old.rows[0].date_installation).getTime())return {code:'DATE_TRANSITION_INCOHERENTE'};
   const future=await c.query(`SELECT 1 FROM energy_meter_readings WHERE meter_id=$1::uuid
    AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4
    AND releve_le>$5::timestamptz LIMIT 1`,[meterId,...scope,stamp]);
   if(future.rows.length)return {code:'RELEVE_POSTERIEUR_A_TRANSITION'};
   // L'UPDATE ne peut etre commute seul : toute erreur ulterieure provoque ROLLBACK.
   const stopped=await c.query(`UPDATE energy_meter_devices SET actif=FALSE,date_retrait=$1::timestamptz
    WHERE id=$2::uuid AND point_id=$3::uuid AND site_id=$4 AND tenant_id=$5 AND owner_personne_id=$6
      AND actif=TRUE AND date_retrait IS NULL RETURNING id`,[stamp,meterId,pointId,...scope]);
   if(stopped.rows.length!==1)throw Error('REMPLACEMENT_ANCIEN_NON_RETIRE');
   const n=data.nouveauCompteur,newId=id(),registerId=id();
   await c.query(`INSERT INTO energy_meter_devices
    (id,point_id,site_id,tenant_id,owner_personne_id,nom,technologie,mode_commercial,numero_serie,
     actif,date_installation,request_key,content_hash)
    VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,TRUE,$10::timestamptz,$11::uuid,$12)`,
    [newId,pointId,...scope,n.nom,n.technologie,n.modeCommercial,n.numeroSerie,stamp,requestKey,contentHash]);
   await c.query(`INSERT INTO energy_meter_registers
    (id,meter_id,point_id,site_id,tenant_id,owner_personne_id,code,unite,request_key,content_hash)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9::uuid,$10)`,
    [registerId,newId,pointId,...scope,n.registreCode,n.registreUnite,requestKey,
     hash({code:n.registreCode,unite:n.registreUnite})]);
   async function event(action,entityId,details){await c.query(`INSERT INTO energy_meter_events
    (site_id,tenant_id,owner_personne_id,acteur_personne_id,action,entity_id,details)
    VALUES($1,$2,$3,$4,$5,$6::uuid,$7::jsonb)`,[...scope,actor,action,entityId,JSON.stringify(details)]);}
   await event('MeterDeviceDeclared.v1',newId,{pointId,technologie:n.technologie,mode:n.modeCommercial,creationDans:'REMPLACEMENT'});
   await event('MeterRegisterDeclared.v1',registerId,{meterId:newId,code:n.registreCode,unite:n.registreUnite});
   await event('MeterDeviceReplaced.v1',newId,{pointId,ancienCompteurId:meterId,nouveauCompteurId:newId,
    nouveauRegistreId:registerId,motif:data.motif,instantRemplacement:new Date(stamp).toISOString(),
    source:'DECLARATION_PROPRIETAIRE',qualification:'DECLARE_A_VERIFIER',requestKey});
   return {code:'OK',id:newId,registreId:registerId,ancienCompteurId:meterId,nouveau:true,
    qualification:'DECLARE_A_VERIFIER',remplaceLe:new Date(stamp).toISOString()};
  });
 }
 return {sites,remplacer};
}
module.exports={creerEnergyMeterReplacementStore};
