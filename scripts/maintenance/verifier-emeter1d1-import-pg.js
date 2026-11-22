'use strict';
/** Preuve PostgreSQL bornée : même tenant, site synthétique, propriétaire Core et clé de lot. READ ONLY. */
const fs=require('node:fs'),{Client}=require('pg');
const {analyserCsv,empreinte}=require('../../energy/energy-meter-import-domain');
const {UUID}=require('../../energy/energy-meter-domain');
const TENANT='ENERGY_MVP01D_RECETTE',CLUSTER='7699611241381229531';
const [csvPath,outPath,siteId,actorString,lotIdempotence,phase]=process.argv.slice(2);
const actor=Number(actorString);
function requis(){
 if(process.env.PGDATABASE!=='sateer_test'||process.env.PGHOST!=='::1'||process.env.PGPORT!=='5432'||
    !csvPath||!outPath||!UUID.test(siteId||'')||!UUID.test(lotIdempotence||'')||
    !Number.isSafeInteger(actor)||actor<=0||!['avant','apres'].includes(phase))throw Error('CIBLE_OU_ARGUMENTS_REFUSES');
}
const normaliser=s=>String(s).replace(/^0+(?=\d)/,'').replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
async function main(){
 requis();
 // Le fichier ne doit pas être un gabarit avec placeholders.
 const lot=analyserCsv(fs.readFileSync(csvPath,'utf8'));
 if(lot.lignes.length!==2)throw Error('PREUVE_ATTEND_2_LIGNES_FICTIVES');
 const client=new Client();let ouverte=false;
 try{
  await client.connect();await client.query('BEGIN READ ONLY');ouverte=true;
  const meta=(await client.query('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS cluster, current_setting(\'transaction_read_only\') AS ro')).rows[0];
  if(meta.db!=='sateer_test'||String(meta.cluster)!==CLUSTER||meta.ro!=='on')throw Error('BASE_CLUSTER_OU_READ_ONLY_INVALIDE');
  const s=(await client.query(`SELECT s.id,s.tenant_id,s.owner_personne_id,s.nom
   FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
   WHERE s.public_id=$1::uuid AND t.code=$2 AND s.owner_personne_id=$3`,[siteId,TENANT,actor])).rows;
  if(s.length!==1||s[0].nom!=='RECETTE SYNTHETIQUE MVP01D')throw Error('SITE_SYNTHETIQUE_OU_ACTEUR_INVALIDE');
  const scope=s[0];const hashLot=empreinte(JSON.stringify({siteId,actor,hash:lot.hashLot}));
  const sql=`SELECT e.id AS event_id,e.entity_id,e.details,r.register_id,r.releve_le,
      r.valeur_index::text AS valeur,r.provenance,r.qualification,r.unite_snapshot AS unite
     FROM energy_meter_events e JOIN energy_meter_readings r
       ON r.id=e.entity_id AND r.site_id=e.site_id AND r.tenant_id=e.tenant_id
       AND r.owner_personne_id=e.owner_personne_id AND r.auteur_personne_id=e.acteur_personne_id
     WHERE e.action='MeterReadingDeclared.v1' AND e.site_id=$1 AND e.tenant_id=$2
       AND e.owner_personne_id=$3 AND e.acteur_personne_id=$3
       AND e.details->>'modeSaisie'='IMPORT_CSV_V1'
       AND e.details->>'fichierSha256'=$4 AND e.details->>'lotIdempotence'=$5
     ORDER BY (e.details->>'ligne')::integer,e.id`;
  const rows=(await client.query(sql,[scope.id,scope.tenant_id,actor,lot.fichierSha256,lotIdempotence])).rows;
  const expected=phase==='avant'?0:2;
  if(rows.length!==expected)throw Error('NOMBRE_EVENEMENTS_INATTENDU_'+phase+'_'+rows.length+'_ATTENDU_'+expected);
  const eventIds=new Set(),readingIds=new Set();
  for(let i=0;i<rows.length;i++){
   const r=rows[i],d=r.details,ligne=lot.lignes[i];
   if(d.ligne!==ligne.numero||d.fichierSha256!==lot.fichierSha256||d.hashLot!==hashLot||
      d.lotIdempotence!==lotIdempotence||d.registreId!==ligne.registreId||
      String(r.register_id)!==ligne.registreId||new Date(r.releve_le).toISOString()!==ligne.releveLe||
      normaliser(r.valeur)!==ligne.valeur||r.provenance!=='SAISIE_MANUELLE'||
      r.qualification!=='DECLARE_A_VERIFIER'||!r.unite||d.unite!==r.unite||
      eventIds.has(String(r.event_id))||readingIds.has(String(r.entity_id)))throw Error('TRACE_OU_RELEVE_NON_CONFORME_LIGNE_'+ligne.numero);
   eventIds.add(String(r.event_id));readingIds.add(String(r.entity_id));
  }
  const verdict=phase==='avant'?'AVANT_AUCUNE_TRACE_DU_LOT_ATTENDU':'APRES_2_RELEVES_ET_2_EVENEMENTS_CONFIRME';
  fs.writeFileSync(outPath,JSON.stringify({tenant:TENANT,siteId,actor,lotIdempotence,
    phase,database:meta.db,clusterVerifie:true,transactionReadOnly:true,
    fichierSha256:lot.fichierSha256,lignesCsv:lot.lignes.length,evenementsEtRelevesObserves:rows.length,
    verdict,aucunCalculConsommation:true,
    reserve:'Une absence de trace pour cette clé/empreinte ne prouve pas l’absence de toute écriture.'},null,2)+'\n',{mode:0o600,flag:'wx'});
  await client.query('ROLLBACK');ouverte=false;
  console.log('EMETER1D1_PREUVE_PG_PASS='+verdict);
 }finally{if(ouverte)await client.query('ROLLBACK').catch(()=>{});await client.end().catch(()=>{});}
}
main().catch(e=>{console.error('EMETER1D1_PREUVE_PG_ECHEC',e.code||e.message);process.exitCode=1;});
