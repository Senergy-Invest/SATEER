'use strict';
/** DDL et intégration PostgreSQL de 054, entièrement ROLLBACK sans mutation permanente. */
const {Client}=require('pg');
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const CLUSTER='7699611241381229531';const TENANT='ENERGY_MVP01D_RECETTE';
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const c=new Client({host:'::1',port:5432,database:'sateer_test',user:process.env.PGUSER||process.env.USER,
  ...(process.env.PGPASSWORD?{password:process.env.PGPASSWORD}:{}),
  connectionTimeoutMillis:5000,statement_timeout:15000,application_name:'energy_mvp02b_pg_rollback'});
 let begun=false,n=0;const ok=s=>console.log('PASS '+(++n)+' '+s);
 try{
  await c.connect();const pin=(await c.query(`SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS cluster`)).rows[0];
  assert.equal(pin.db,'sateer_test');assert.equal(String(pin.cluster),CLUSTER);ok('Base et cluster épinglés');
  await c.query('BEGIN');begun=true;await c.query("SET LOCAL lock_timeout='4s'");
  const migration=fs.readFileSync(path.join(__dirname,'../../database/054_energy_inventory_collaboration.sql'),'utf8')
   .replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
  await c.query(migration);ok('Schéma 054 appliqué uniquement dans la transaction rollback');
  const site=(await c.query(`SELECT s.id,s.tenant_id,s.owner_personne_id,s.public_id,s.type_site
   FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE WHERE t.code=$1 LIMIT 1`,[TENANT])).rows[0];
  assert.ok(site,'SITE_FICTIF_ENERGY_ABSENT');const contributor=(await c.query('SELECT id FROM personnes WHERE id<>$1 ORDER BY id LIMIT 1',[site.owner_personne_id])).rows[0];
  assert.ok(contributor,'SECOND_COMPTE_TEST_ABSENT');ok('Site Energy et personne distincte pour FK');
  const token=crypto.randomBytes(24).toString('base64url'),digest=crypto.createHash('sha256').update('SATEER-COLLAB-INVITE-v1:scb_'+token).digest('hex');
  const invId=crypto.randomUUID();const inv=await c.query(`INSERT INTO energy_inventory_invitations(public_id,site_id,tenant_id,owner_personne_id,token_hash,expires_at)
    VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL '48 hours') RETURNING id`,[invId,site.id,site.tenant_id,site.owner_personne_id,digest]);
  assert.ok(inv.rows[0].id);ok('Invitation secrète, propriétaire/tenant/site liés');
  const claimed=await c.query(`UPDATE energy_inventory_invitations SET statut='ACCEPTEE',invitee_personne_id=$1,date_acceptation=NOW()
    WHERE id=$2 RETURNING invitee_personne_id`,[contributor.id,inv.rows[0].id]);
  assert.equal(claimed.rows[0].invitee_personne_id,contributor.id);ok('Invitation revendiquée par une personne distincte');
  const pId=crypto.randomUUID(),key=crypto.randomUUID();const prop=await c.query(`INSERT INTO energy_inventory_contributions
    (public_id,invitation_id,site_id,tenant_id,owner_personne_id,contributeur_personne_id,
     request_key,content_hash,nom,famille,quantite,puissance_unitaire_w)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'Frigo fictif B1','FROID',1,NULL) RETURNING id`,
    [pId,inv.rows[0].id,site.id,site.tenant_id,site.owner_personne_id,contributor.id,key,crypto.randomBytes(32).toString('hex')]);
  assert.ok(prop.rows[0].id);ok('Proposition en attente, équipement canonique non créé');
  const before=(await c.query(`SELECT statut,equipment_id FROM energy_inventory_contributions WHERE id=$1`,[prop.rows[0].id])).rows[0];
  assert.equal(before.statut,'SOUMISE');assert.equal(before.equipment_id,null);ok('Aucune approbation automatique');
  await c.query('SAVEPOINT wrong_invitee');
  try{await c.query(`INSERT INTO energy_inventory_contributions
    (public_id,invitation_id,site_id,tenant_id,owner_personne_id,contributeur_personne_id,
     request_key,content_hash,nom,famille,quantite)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'Refus non invite','FROID',1)`,
    [crypto.randomUUID(),inv.rows[0].id,site.id,site.tenant_id,site.owner_personne_id,site.owner_personne_id,
     crypto.randomUUID(),crypto.randomBytes(32).toString('hex')]);throw Error('PERSONNE_NON_INVITEE_A_PASSE_FK');}
  catch(e){assert.ok(['23503','23514'].includes(e.code),'Code attendu 23503 ou 23514 : '+e.message);await c.query('ROLLBACK TO SAVEPOINT wrong_invitee');}
  ok('FK et contrainte interdisent contributeur non invité / propriétaire');
  await c.query('SAVEPOINT replay');
  try{await c.query(`INSERT INTO energy_inventory_contributions
    (public_id,invitation_id,site_id,tenant_id,owner_personne_id,contributeur_personne_id,
     request_key,content_hash,nom,famille,quantite)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'Doublon','FROID',1)`,
    [crypto.randomUUID(),inv.rows[0].id,site.id,site.tenant_id,site.owner_personne_id,contributor.id,
     key,crypto.randomBytes(32).toString('hex')]);throw Error('DOUBLON_NON_PROTEGE');}
  catch(e){assert.equal(e.code,'23505');await c.query('ROLLBACK TO SAVEPOINT replay');}ok('Idempotence unique côté PostgreSQL');
  await c.query('SAVEPOINT invalid_approved');
  try{await c.query(`UPDATE energy_inventory_contributions SET statut='ACCEPTEE',date_decision=NOW() WHERE id=$1`,[prop.rows[0].id]);
    throw Error('APPROBATION_SANS_EQUIPEMENT');}
  catch(e){assert.equal(e.code,'23514');await c.query('ROLLBACK TO SAVEPOINT invalid_approved');}ok('Validation refuse sans création canonique');
  let zone=(await c.query(`SELECT id FROM energy_inventory_zones WHERE site_id=$1 AND tenant_id=$2 AND owner_personne_id=$3 LIMIT 1`,
   [site.id,site.tenant_id,site.owner_personne_id])).rows[0];
  if(!zone){const created=await c.query(`INSERT INTO energy_inventory_zones
    (public_id,site_id,tenant_id,owner_personne_id,request_key,content_hash,type_zone,nom)
    VALUES($1,$2,$3,$4,$5,$6,'BATIMENT','Bâtiment fictif B1') RETURNING id`,
    [crypto.randomUUID(),site.id,site.tenant_id,site.owner_personne_id,crypto.randomUUID(),crypto.randomBytes(32).toString('hex')]);
   zone=created.rows[0];}
  const eq=await c.query(`INSERT INTO energy_inventory_equipements
    (public_id,site_id,zone_id,tenant_id,owner_personne_id,request_key,content_hash,nom,famille,quantite)
    VALUES($1,$2,$3,$4,$5,$6,$7,'Frigo fictif B1','FROID',1) RETURNING id`,
    [crypto.randomUUID(),site.id,zone.id,site.tenant_id,site.owner_personne_id,pId,crypto.randomBytes(32).toString('hex')]);
  await c.query(`UPDATE energy_inventory_contributions SET statut='ACCEPTEE',equipment_id=$1,date_decision=NOW() WHERE id=$2`,
   [eq.rows[0].id,prop.rows[0].id]);ok('Approbation crée l’équipement propriétaire puis référence la proposition');
  await c.query('SAVEPOINT cross_site');
  try{await c.query(`UPDATE energy_inventory_contributions SET site_id=-100 WHERE id=$1`,[prop.rows[0].id]);throw Error('SITE_CROISE_NON_REFUSE');}
  catch(e){assert.equal(e.code,'23503');await c.query('ROLLBACK TO SAVEPOINT cross_site');}ok('Lien équipement-proposition / site protégé par FK');
  await c.query(`INSERT INTO energy_inventory_collaboration_events(site_id,tenant_id,owner_personne_id,acteur_personne_id,action,entity_public_id,details)
    VALUES($1,$2,$3,$4,'ContributionAccepted.v1',$5,'{}'::jsonb)`,[site.id,site.tenant_id,site.owner_personne_id,site.owner_personne_id,pId]);
  ok('Audit de validation append-only écrit');
  await c.query(`UPDATE energy_inventory_invitations SET statut='REVOQUEE',date_revocation=NOW() WHERE id=$1`,[inv.rows[0].id]);
  ok('Révocation sans suppression des propositions historisées');
  await c.query('ROLLBACK');begun=false;ok('Rollback intégral de tous les tests');
  console.log('ENERGY_MVP02B_PG_ROLLBACK_PASS='+n);
 }finally{if(begun)await c.query('ROLLBACK').catch(()=>{});await c.end().catch(()=>{});}
}
main().catch(e=>{console.error('ENERGY_MVP02B_PG_ECHEC='+String(e.message||e));process.exitCode=1;});
