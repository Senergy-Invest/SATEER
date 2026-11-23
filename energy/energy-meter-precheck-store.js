'use strict';
/** Aperçu PostgreSQL READ ONLY, strict propriétaire Core + tenant + site + compteur + registre. */
const {evaluerPrecontrole}=require('./energy-meter-precheck-domain');
function creerEnergyMeterPrecheckStore({obtenirClient}){
 if(typeof obtenirClient!=='function')throw TypeError('CLIENT_PG_REQUIS');
 async function apercu({tenant,actor,missionId}){
  const client=await obtenirClient();let opened=false;
  try{
   await client.query('BEGIN READ ONLY');opened=true;
   const q=await client.query(`SELECT m.id,m.statut,m.register_id,m.meter_id,m.site_id,m.tenant_id,m.owner_personne_id,
     m.valeur_index::text AS valeur,m.releve_le,reg.unite,d.actif AS compteur_actif
    FROM energy_meter_participation_missions m
    JOIN energy_inventory_sites s ON s.id=m.site_id AND s.tenant_id=m.tenant_id AND s.owner_personne_id=m.owner_personne_id
    JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
    JOIN energy_meter_registers reg ON reg.id=m.register_id AND reg.meter_id=m.meter_id AND reg.point_id=m.point_id
       AND reg.site_id=m.site_id AND reg.tenant_id=m.tenant_id AND reg.owner_personne_id=m.owner_personne_id
    JOIN energy_meter_devices d ON d.id=m.meter_id AND d.point_id=m.point_id
       AND d.site_id=m.site_id AND d.tenant_id=m.tenant_id AND d.owner_personne_id=m.owner_personne_id
    WHERE m.id=$1::uuid AND t.code=$2 AND m.owner_personne_id=$3 AND m.statut='A_REVOIR' LIMIT 1`,
    [missionId,tenant,actor]);
   if(q.rows.length!==1){await client.query('ROLLBACK');opened=false;return null;}
   const m=q.rows[0],instant=new Date(m.releve_le);
   if(!Number.isFinite(instant.getTime()))throw Error('DATE_MISSION_INVALIDE');
   const args=[m.register_id,m.meter_id,m.site_id,m.tenant_id,m.owner_personne_id,m.releve_le];
   const previous=await client.query(`SELECT r.valeur_index::text AS valeur,r.releve_le FROM energy_meter_readings r
    WHERE r.register_id=$1::uuid AND r.meter_id=$2::uuid AND r.site_id=$3 AND r.tenant_id=$4
      AND r.owner_personne_id=$5 AND r.releve_le<$6::timestamptz
    ORDER BY r.releve_le DESC,r.id DESC LIMIT 1`,args);
   const next=await client.query(`SELECT r.valeur_index::text AS valeur,r.releve_le FROM energy_meter_readings r
    WHERE r.register_id=$1::uuid AND r.meter_id=$2::uuid AND r.site_id=$3 AND r.tenant_id=$4
      AND r.owner_personne_id=$5 AND r.releve_le >= $6::timestamptz
    ORDER BY r.releve_le ASC,r.id ASC LIMIT 1`,args);
   const p=previous.rows[0]??null,n=next.rows[0]??null;
   const previousAt=p?new Date(p.releve_le):null,nextAt=n?new Date(n.releve_le):null;
   if((p&&!Number.isFinite(previousAt.getTime()))||(n&&!Number.isFinite(nextAt.getTime())))throw Error('DATE_HISTORIQUE_INVALIDE');
   const precedent=p?{valeur:String(p.valeur),date:previousAt.toISOString(),secondes:(instant-previousAt)/1000}:null;
   const suivant=n?{valeur:String(n.valeur),date:nextAt.toISOString()}:null;
   const evaluation=evaluerPrecontrole({valeur:String(m.valeur),precedent,suivant,compteurActif:m.compteur_actif===true});
   await client.query('ROLLBACK');opened=false;
   return {missionId:String(m.id),statutMission:'A_REVOIR',indexPropose:String(m.valeur),unite:m.unite,
    dateReleve:instant.toISOString(),precedent:precedent?{valeur:precedent.valeur,date:precedent.date}:null,
    suivant,compteurActif:m.compteur_actif===true,...evaluation};
  }catch(error){if(opened)await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();}
 }
 return {apercu};
}
module.exports={creerEnergyMeterPrecheckStore};
