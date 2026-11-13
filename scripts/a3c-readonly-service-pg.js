"use strict";
/** A3c : contrat SQL réel en lecture seule. Aucun rôle ni session simulée en BD. */
const assert=require('node:assert/strict');
if(process.env.PGDATABASE!=='sateer_test'){console.error('A3C_REFUS_BASE');process.exit(40);}
const {obtenirClientDatabase,fermerDatabase}=require('../database');
const {creerServiceReseauInstitutionnel,SQL_ORGANISATIONS,SQL_RELATIONS}=require('../institution-network-database');
async function main(){
  const client=await obtenirClientDatabase();let tx=false;
  try{
    const target=await client.query('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS system_identifier');
    assert.equal(target.rows?.[0]?.db,'sateer_test');
    assert.equal(target.rows?.[0]?.system_identifier,'7699611241381229531','Cluster non autorisé');
    await client.query('BEGIN READ ONLY');tx=true;
    const select=await client.query(`SELECT t.id AS tenant_id,o.id AS org_id FROM tenants t
      JOIN organisations o ON o.tenant_id=t.id
      WHERE t.actif=TRUE AND o.type IN ('MINISTERE','AMBASSADE','CONSULAT')
      ORDER BY t.id,o.id LIMIT 1`);
    const one=select.rows[0];
    if(one){
      let allowed=0;
      const sql=[];
      const service=creerServiceReseauInstitutionnel({
        requete:(q,args)=>{assert.ok(q===SQL_ORGANISATIONS||q===SQL_RELATIONS);sql.push(q);return client.query(q,args);},
        autoriser:({acteur,tenantId,organisationId,action})=>{
          allowed++;
          return acteur.personneId===999999 && tenantId===Number(one.tenant_id) &&
            organisationId===Number(one.org_id) && action==='VIEW_INSTITUTION_NETWORK';
        }
      });
      const result=await service.lireSousReseau({
        acteur:{personneId:999999},tenantId:Number(one.tenant_id),racineId:Number(one.org_id)
      });
      assert.equal(result.racine.id,Number(one.org_id));
      assert.equal(sql.length,2);
      assert.equal(allowed,1);
      assert.ok(result.descendants.every(o=>Number.isSafeInteger(o.id)&&o.id>0));
      console.log('A3C_SQL_RESEAU_REEL_READONLY_PASS');
    }else console.log('A3C_AUCUN_POSTE_ELIGIBLE_DANS_RECETTE : requetes réelles non exercées, schéma seul');
    await client.query('ROLLBACK');tx=false;
    console.log('A3C_TRANSACTION_LECTURE_SEULE_TERMINEE');
  }finally{if(tx)await client.query('ROLLBACK').catch(()=>{});client.release();await fermerDatabase();}
}
main().catch(e=>{console.error('A3C_SQL_BLOQUE',e.message);process.exitCode=1;});
