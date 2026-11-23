'use strict';
/** Revalidation READ ONLY, utilisant l'affectation et la chaîne de C1, sans nouvelle permission. */
const {chaineValide}=require('./energy-meter-participation-domain');
function creerEnergyMeterPhotoStore({obtenirClient}){
 if(typeof obtenirClient!=='function')throw TypeError('CLIENT_POSTGRES_REQUIS');
 async function autoriser({tenant,actor,missionId}){
  const c=await obtenirClient();let inTx=false;
  try{
   await c.query('BEGIN READ ONLY');inTx=true;
   const q=await c.query(`SELECT m.id,m.site_id,m.tenant_id,m.owner_personne_id,m.assignee_grant_id,
    g.personne_id AS assignee_personne_id,reg.unite,d.actif
    FROM energy_meter_participation_missions m
    JOIN tenants t ON t.id=m.tenant_id AND t.actif=TRUE
    JOIN energy_scope_grants g ON g.id=m.assignee_grant_id AND g.site_id=m.site_id AND g.tenant_id=m.tenant_id AND g.owner_personne_id=m.owner_personne_id
    JOIN energy_meter_registers reg ON reg.id=m.register_id AND reg.meter_id=m.meter_id AND reg.point_id=m.point_id AND reg.site_id=m.site_id AND reg.tenant_id=m.tenant_id AND reg.owner_personne_id=m.owner_personne_id
    JOIN energy_meter_devices d ON d.id=m.meter_id AND d.point_id=m.point_id AND d.site_id=m.site_id AND d.tenant_id=m.tenant_id AND d.owner_personne_id=m.owner_personne_id
    WHERE m.id=$1::uuid AND t.code=$2 AND g.personne_id=$3 AND g.statut='ACTIF'
      AND m.statut='A_FAIRE' AND d.actif=TRUE LIMIT 1`,[missionId,tenant,actor]);
   const m=q.rows[0];if(!m)return null;
   const ancestors=await c.query(`WITH RECURSIVE asc_grants AS (
    SELECT id,parent_grant_id,personne_id,role_scope,statut,site_id,tenant_id,owner_personne_id,ARRAY[id] path,0 depth
      FROM energy_scope_grants WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4
    UNION ALL
    SELECT p.id,p.parent_grant_id,p.personne_id,p.role_scope,p.statut,p.site_id,p.tenant_id,p.owner_personne_id,x.path||p.id,x.depth+1
      FROM energy_scope_grants p JOIN asc_grants x ON p.id=x.parent_grant_id
      WHERE p.site_id=x.site_id AND p.tenant_id=x.tenant_id AND p.owner_personne_id=x.owner_personne_id
        AND NOT p.id=ANY(x.path)
    ) SELECT id,parent_grant_id,personne_id,role_scope,statut FROM asc_grants ORDER BY depth`,
    [m.assignee_grant_id,m.site_id,m.tenant_id,m.owner_personne_id]);
   const chain=ancestors.rows.map(r=>({...r,id:String(r.id),parent_grant_id:r.parent_grant_id?String(r.parent_grant_id):null}));
   if(!chaineValide(chain,actor))return null;
   return {unite:m.unite};
  }finally{if(inTx)await c.query('ROLLBACK').catch(()=>{});c.release();}
 }
 return {autoriser};
}
module.exports={creerEnergyMeterPhotoStore};
