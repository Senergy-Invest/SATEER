"use strict";
/** Diagnostic sans écriture : raison de l'absence de notification D2A MANUAL.
 * Ne lit jamais ni n'affiche les mots de passe ou identités réelles.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Pool}=require('pg');
const privateDir=process.argv[2];
const m=JSON.parse(fs.readFileSync(path.join(privateDir,'MANIFESTE.json'),'utf8'));
assert.equal(m.type,'DIASPORA_D2A_FIXTURE');assert.equal(m.tenant,'AMBVIS_96C7FBBEA383DD');
assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');assert.equal(process.env.PGDATABASE,'sateer_test');
const pool=new Pool({host:'::1',port:5432,database:'sateer_test',user:process.env.PGUSER||process.env.USER,
 ...(process.env.PGPASSWORD?{password:process.env.PGPASSWORD}:{})});
const finish=async()=>{
 const cluster=await pool.query('SELECT current_database() AS db, (SELECT system_identifier::text FROM pg_control_system()) AS sys');
 assert.equal(cluster.rows[0].sys,'7699611241381229531');assert.equal(cluster.rows[0].db,'sateer_test');
 const p=await pool.query(`SELECT p.id,p.statut_diffusion_diaspora,p.date_diffusion_diaspora,t.nom AS zone
 FROM publications p JOIN tenants tn ON tn.id=p.tenant_id
 LEFT JOIN diaspora_publication_geo_targets g ON g.publication_id=p.id AND g.tenant_id=p.tenant_id
 LEFT JOIN territories t ON t.id=g.territory_id
 WHERE tn.code=$1 AND p.organisation_id=$2 AND p.titre='FICTIF D2A MANUAL 21F530DF9742'`,
 [m.tenant,m.ids.association]);
 assert.equal(p.rowCount,1);const item=p.rows[0];assert.equal(item.statut_diffusion_diaspora,'DIFFUSEE');
 const citizen=Number(m.personnes.citoyen);
 const sent=await pool.query(`SELECT id,type,reference_id,date_creation FROM notifications
 WHERE tenant_id=$1 AND personne_id=$2 AND type='DIASPORA_ABONNEMENT'
 ORDER BY date_creation DESC,id DESC`,[m.ids.tenant,citizen]);
 const previous=sent.rows.filter(n=>new Date(n.date_creation)<=new Date(item.date_diffusion_diaspora)&&
  new Date(n.date_creation)>=new Date(item.date_diffusion_diaspora).getTime()-24*3600*1000);
 const forThis=sent.rows.filter(n=>Number(n.reference_id)===Number(item.id));
 const approval=await pool.query(`SELECT details,date_action FROM audit_trail
 WHERE tenant_id=$1 AND action='DIASPORA_APPROVE' AND entity_type='publications' AND entity_id=$2
 ORDER BY id DESC LIMIT 1`,[m.ids.tenant,String(item.id)]);
 const subst=await pool.query(`SELECT COUNT(*)::int AS n FROM diaspora_subscriptions
 WHERE tenant_id=$1 AND personne_id=$2 AND actif=TRUE AND
 (association_id=$3 OR theme_code='EVENEMENT')`,[m.ids.tenant,citizen,m.ids.association]);
 const zone=await pool.query(`SELECT COUNT(*)::int AS n FROM diaspora_geo_preferences pref
 JOIN diaspora_publication_geo_targets g ON g.territory_id=pref.territory_id AND g.tenant_id=pref.tenant_id
 WHERE pref.tenant_id=$1 AND pref.personne_id=$2 AND pref.actif=TRUE AND g.publication_id=$3`,
 [m.ids.tenant,citizen,item.id]);
 const reason=forThis.length?'NOTIFICATION_PRESENTE':previous.length>=3?'QUOTA_3_SUR_24H_ATTEINT':'ABSENCE_A_DIAGNOSTIQUER';
 const result={controle:'DIASPORA_D3_DIAGNOSTIC_LECTURE_SEULE',publication:'FICTIF D2A MANUAL 21F530DF9742',
  statutDiffusion:item.statut_diffusion_diaspora,zone:item.zone,alertes24hAvantApprobation:previous.length,
  alertePourCettePublication:forThis.length,abonnementActuelCompatible:subst.rows[0].n>0,
  zoneActuelleCompatible:zone.rows[0].n>0,approbationAuditee:approval.rowCount===1,
  nombreNotificationsRapporteParTransition:approval.rows[0]?.details?.notificationsEnvoyees??null,conclusion:reason,
  note:'Les abonnements et la zone sont lus au présent, pas reconstitués historiquement.'};
 console.log(JSON.stringify(result,null,2));
 if(!result.approbationAuditee||reason==='ABSENCE_A_DIAGNOSTIQUER')process.exitCode=2;
};
finish().catch(e=>{console.error(JSON.stringify({statut:'DIAGNOSTIC_ECHEC',erreur:e.message}));process.exitCode=1}).finally(()=>pool.end());
