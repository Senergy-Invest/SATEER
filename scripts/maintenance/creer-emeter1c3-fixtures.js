'use strict';
/** Données EXCLUSIVEMENT fictives de recette, transaction atomique sur sateer_test, accord Mac requis. */
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const {Client}=require('pg');const {indexManuel}=require('../../energy/energy-meter-domain');
const CLUSTER='7699611241381229531',TENANT='ENERGY_MVP01D_RECETTE';
async function main(){
 assert.equal(process.env.EMETER1C3_FIXTURE_CONSENT,'1','CONSENTEMENT_FIXTIF_REQUIS');
 assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const out=process.argv[2];assert.ok(out&&out.endsWith('.json'),'CHEMIN_RESULTAT_REQUIS');
 const c=new Client();await c.connect();let opened=false;
 try{await c.query('BEGIN');opened=true;
  const base=(await c.query('SELECT current_database() db,(SELECT system_identifier::text FROM pg_control_system()) cluster')).rows[0];
  assert.deepEqual(base,{db:'sateer_test',cluster:CLUSTER});
  const row=(await c.query(`SELECT s.id site_id,s.public_id,s.tenant_id,s.owner_personne_id,
       p.id point_id,d.id meter_id,r.id register_id,r.unite
     FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.actif=true
     JOIN energy_meter_points p ON p.site_id=s.id AND p.tenant_id=s.tenant_id AND p.owner_personne_id=s.owner_personne_id
     JOIN energy_meter_devices d ON d.point_id=p.id AND d.site_id=s.id AND d.tenant_id=s.tenant_id AND d.owner_personne_id=s.owner_personne_id AND d.actif=true
     JOIN energy_meter_registers r ON r.meter_id=d.id AND r.point_id=p.id AND r.site_id=s.id AND r.tenant_id=s.tenant_id AND r.owner_personne_id=s.owner_personne_id
     WHERE t.code=$1 AND s.nom='RECETTE SYNTHETIQUE MVP01D' AND p.nom LIKE 'DEMO-C2-%' AND r.unite='KWH'
     ORDER BY r.date_creation DESC LIMIT 1`,[TENANT])).rows[0];
  assert.ok(row,'REGISTRE_DEMO_C2_INEXISTANT: ne pas creer dans un site reel');
  const start=new Date(Math.floor((Date.now()-600000)/1000)*1000);const marker='DEMO-EMETER-1C3-'+crypto.randomBytes(4).toString('hex').toUpperCase();
  const values=['230.000000','235.000000','235.000000'],ids=[];
  for(let i=0;i<3;i++){
    const moment=new Date(start.getTime()+i*30000),normalized=indexManuel({valeur:values[i],releveLe:moment.toISOString(),observation:marker});
    assert.ok(normalized,'RELEVE_NON_CANONIQUE');const id=crypto.randomUUID(),key=crypto.randomUUID();ids.push(id);
    const contentHash=crypto.createHash('sha256').update(JSON.stringify({registerId:String(row.register_id),...normalized})).digest('hex');
    await c.query(`INSERT INTO energy_meter_readings
      (id,register_id,meter_id,point_id,site_id,tenant_id,owner_personne_id,
       valeur_index,unite_snapshot,releve_le,observation,auteur_personne_id,request_key,content_hash)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8::numeric,$9,$10::timestamptz,$11,$12,$13::uuid,$14)`,
      [id,row.register_id,row.meter_id,row.point_id,row.site_id,row.tenant_id,row.owner_personne_id,
       normalized.valeur,row.unite,normalized.releveLe,marker,row.owner_personne_id,key,contentHash]);
    await c.query(`INSERT INTO energy_meter_events
      (site_id,tenant_id,owner_personne_id,acteur_personne_id,action,entity_id,details)
      VALUES($1,$2,$3,$4,'MeterReadingDeclared.v1',$5::uuid,$6::jsonb)`,
     [row.site_id,row.tenant_id,row.owner_personne_id,row.owner_personne_id,id,JSON.stringify({registerId:String(row.register_id),unite:row.unite,releveLe:normalized.releveLe,qualification:'DECLARE_A_VERIFIER',recetteFictive:marker})]);
  }
  await c.query('COMMIT');opened=false;
  const report={type:'EMETER1C3_FIXTURES_FICTIVES',tenant:TENANT,siteId:row.public_id,registerId:row.register_id,marker,ids,
    valeursFictives:values,ecartsSecondes:[30,30],modifications:'3 nouveaux releves append-only + 3 evenements',calculsConsommation:false};
  fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log('FIXTURES_1C3_3_RELEVES_CREES_TRANSACTION_ATOMIQUE='+marker);
 }catch(e){if(opened)await c.query('ROLLBACK').catch(()=>{});throw e;}finally{await c.end();}}
main().catch(e=>{console.error('FIXTURES_1C3_ECHEC',e.code||e.message);process.exitCode=1;});
