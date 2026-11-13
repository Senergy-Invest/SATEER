"use strict";
/**
 * A3b : audit structurel et non nominatif. AUCUNE écriture ; la transaction
 * PostgreSQL est READ ONLY et refusée hors instance de recette autorisée.
 */
const assert = require('node:assert/strict');
if (process.env.PGDATABASE !== 'sateer_test') {
  console.error('A3B_REFUS_BASE : PGDATABASE doit être sateer_test');
  process.exit(40);
}
const { obtenirClientDatabase, fermerDatabase } = require('../database');
const INSTANCE_AUTORISEE = '7699611241381229531';
const REQUIRED = {
  organisation_relationships: ['id','tenant_id','source_organisation_id','target_organisation_id','type','statut','actif','date_debut','date_fin','metadata','date_modification'],
  organisations: ['id','tenant_id','nom','type'],
  tenants: ['id','actif','code'],
  audit_trail: ['tenant_id','organisation_id','personne_id','action','entity_type','entity_id','details']
};
async function main() {
  const client = await obtenirClientDatabase();
  let tx = false;
  try {
    const cible = await client.query('SELECT current_database() AS db, (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier');
    assert.equal(cible.rows?.[0]?.db, 'sateer_test', 'REFUS_BASE');
    assert.equal(cible.rows?.[0]?.system_identifier, INSTANCE_AUTORISEE, 'REFUS_CLUSTER');
    await client.query('BEGIN READ ONLY'); tx=true;
    const rows = await client.query(`SELECT table_name,column_name
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name=ANY($1::text[])`, [Object.keys(REQUIRED)]);
    const present = new Set(rows.rows.map(x=>`${x.table_name}.${x.column_name}`));
    const missing = [];
    for (const [table,columns] of Object.entries(REQUIRED))for (const col of columns)
      if(!present.has(`${table}.${col}`))missing.push(`${table}.${col}`);
    assert.deepEqual(missing,[], 'Schéma incomplet : '+missing.join(', '));
    // Pas de noms, identifiants, courriers ou détails individuels dans le rapport.
    const q = await client.query(`
      SELECT count(*)::integer AS incoherentes
      FROM organisation_relationships r
      LEFT JOIN organisations parent ON parent.id=r.source_organisation_id
      LEFT JOIN organisations enfant ON enfant.id=r.target_organisation_id
      WHERE parent.tenant_id IS DISTINCT FROM r.tenant_id
         OR enfant.tenant_id IS DISTINCT FROM r.tenant_id`);
    const n = Number(q.rows[0].incoherentes);
    console.log('A3B_CLUSTER_RECETTE_VERIFIE');
    console.log('A3B_SCHEMA_COLONNES_OK');
    console.log('A3B_RELATIONS_TENANT_INCOHERENTES='+n);
    if(n!==0)throw new Error('Relations existantes avec portée tenant incohérente : traitement manuel requis.');
    const types=await client.query(`SELECT type, count(*)::integer AS total
      FROM organisation_relationships WHERE type IN ('SUPERVISION','ADMINISTRATIVE_TUTELLE')
      GROUP BY type ORDER BY type`);
    console.log('A3B_RELATIONS_STRUCTURELLES_EXISTANTES='+types.rows.reduce((v,x)=>v+Number(x.total),0));
    const constraints=await client.query(`SELECT conname, contype
      FROM pg_constraint WHERE conrelid='public.organisation_relationships'::regclass
      ORDER BY conname`);
    const unique=constraints.rows.some(x=>x.contype==='u');
    assert.ok(unique,'Contrainte unique du registre de relations absente');
    await client.query('COMMIT');tx=false;
    console.log('A3B_SCHEMA_READ_ONLY_PASS');
  } catch(e){ if(tx)await client.query('ROLLBACK').catch(()=>{});throw e; }
  finally{client.release();await fermerDatabase();}
}
main().catch(e=>{console.error('A3B_AUDIT_BLOQUE:',e.message);process.exitCode=1;});
