'use strict';
// Uniquement pour la base de recette identifiée et la fixture entièrement synthétique.
const fs=require('fs'); const path=require('path');
const {Client}=require('pg');
const {DEMO, TENANT, ORG, proposerCategorie,empreinte}=require('./bordeaux-email-intake-core');
const mode=process.argv[2]||'install';
if(!['preflight','install','verify'].includes(mode))throw Error('MODE_INCONNU');
if(process.env.PGDATABASE !== 'sateer_test')throw Error('BASE_REFUSEE : PGDATABASE doit être sateer_test');
const client=new Client();
async function main(){
 await client.connect();
 try{
  const system=await client.query('SELECT current_database() AS db, system_identifier::text AS sid FROM pg_control_system()');
  if(system.rows[0].db!=='sateer_test'||system.rows[0].sid!=='7699611241381229531') throw Error('INSTANCE_POSTGRES_REFUSEE');
  const org=await client.query(`SELECT o.id,t.id AS tenant_id FROM organisations o JOIN tenants t ON t.id=o.tenant_id WHERE o.id=$1 AND t.code=$2`,[ORG,TENANT]);
  if(org.rowCount!==1)throw Error('CONSULAT_ET_TENANT_INTROUVABLES');
  const existing=await client.query("SELECT to_regclass('public.pilot_email_inbox_demo') IS NOT NULL AS existe");
  const hasTable=existing.rows[0].existe;
  if(mode==='preflight'){
    console.log(`EMAIL_PREFLIGHT_PASS : ${system.rows[0].db}, organisation ${ORG}, tenant autorisé, staging=${hasTable?'existant':'absent'}`);return;
  }
  if(mode==='install'){
   await client.query('BEGIN');
   try{
    await client.query(fs.readFileSync(path.resolve(__dirname,'../database/039_bordeaux_email_intake_demo.sql'),'utf8'));
    const proposal=proposerCategorie(DEMO.subject,DEMO.body);
    if(!proposal.categorie)throw Error('FIXTURE_AMBIGUE');
    // Réutilise la destination existante comme suggestion, pas comme règle e-mail officielle.
    const rule=await client.query(`SELECT r.destination_unit_id,u.nom FROM organisation_routing_rules r
      JOIN organisation_units u ON u.id=r.destination_unit_id AND u.organisation_id=r.organisation_id AND u.actif=TRUE
      WHERE r.organisation_id=$1 AND r.source='MON_CONSULAT' AND r.category_key=$2 AND r.actif=TRUE`,[ORG,proposal.categorie]);
    const dest=rule.rowCount===1?rule.rows[0].destination_unit_id:null;
    const insert=await client.query(`INSERT INTO pilot_email_inbox_demo
      (tenant_id,organisation_id,mailbox_key,message_id,fingerprint,from_label,subject,body,categorie_proposee,unite_suggeree_id,motif_qualification)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (organisation_id,mailbox_key,message_id) DO NOTHING RETURNING id`,
      [org.rows[0].tenant_id, ORG, DEMO.mailboxKey,DEMO.messageId,empreinte(DEMO.mailboxKey,DEMO.messageId),DEMO.fromLabel,DEMO.subject,DEMO.body,proposal.categorie,dest,proposal.motif]);
    await client.query('COMMIT');
    console.log('EMAIL_SYNTHETIQUE_'+(insert.rowCount?'STAGED':'DEJA_PRESENT')+' : '+(insert.rowCount?'1 message ajouté au staging':'idempotence confirmée'));
    console.log('EMAIL_PROPOSITION : '+proposal.categorie+' -> '+(rule.rowCount===1?rule.rows[0].nom:'A_QUALIFIER_MANUELLEMENT'));
    console.log('EMAIL_RAPPEL : destination suggérée seulement, aucune demande citoyenne créée');
   }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
  }
  const rows=await client.query(`SELECT id,categorie_proposee,unite_suggeree_id,statut,COUNT(*) OVER() AS total
    FROM pilot_email_inbox_demo WHERE organisation_id=$1 AND mailbox_key=$2 AND message_id=$3`,[ORG,DEMO.mailboxKey,DEMO.messageId]);
  if(rows.rowCount!==1||rows.rows[0].statut!=='A_QUALIFIER')throw Error('EMAIL_FIXTURE_VERIFICATION_ECHEC');
  const d=await client.query('SELECT COUNT(*)::int AS total FROM demandes WHERE organisation_id=$1',[ORG]);
  if(d.rows[0].total!==6)throw Error('DEMANDES_ORIGINALES_MODIFIEES_OU_NON_CONFORMES');
  console.log(`EMAIL_STAGING_VERIFY_PASS : message #${rows.rows[0].id} ; catégorie ${rows.rows[0].categorie_proposee} ; 6 dossiers consulaires préservés`);
 }finally{await client.end();}
}
main().catch(e=>{console.error('EMAIL_PILOTE_ECHEC :',e.message);process.exitCode=1;});
