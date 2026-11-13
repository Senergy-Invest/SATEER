"use strict";
const assert = require('node:assert/strict');
const { creerServiceReseauInstitutionnel, creerTransactionPostgres, SQL_ORGANISATIONS, SQL_RELATIONS, SQL_INSERT, SQL_REVOQUER } = require('../institution-network-database');
const { construireGrapheInstitutionnel } = require('../institution-relationship-graph');
const now = '2026-11-13T15:00:00Z';
const orgs = [
  {id:1,tenant_id:10,nom:'Ministère fictif',type:'MINISTERE'},
  {id:2,tenant_id:10,nom:'Ambassade fictive A',type:'AMBASSADE'},
  {id:3,tenant_id:10,nom:'Consulat fictif B',type:'CONSULAT'},
  {id:4,tenant_id:10,nom:'Ambassade fictive C',type:'AMBASSADE'},
  {id:9,tenant_id:99,nom:'Ambassade autre tenant',type:'AMBASSADE'}
];
const relations = [
  {id:1,tenant_id:10,source_organisation_id:1,target_organisation_id:2,type:'SUPERVISION',statut:'ACTIVE',actif:true,date_debut:null,date_fin:null},
  {id:2,tenant_id:10,source_organisation_id:2,target_organisation_id:3,type:'ADMINISTRATIVE_TUTELLE',statut:'ACTIVE',actif:true,date_debut:null,date_fin:null},
  {id:3,tenant_id:10,source_organisation_id:4,target_organisation_id:3,type:'ADMINISTRATIVE_TUTELLE',statut:'REVOKED',actif:false,date_debut:null,date_fin:null}
];
let n=0;
function ok(v, label) {assert.ok(v, label);n++;}
const appels=[];
async function lire(sql,args){appels.push({sql,args});return {rows:sql===SQL_ORGANISATIONS?orgs.filter(x=>x.tenant_id===args[0]):sql===SQL_RELATIONS?relations.filter(x=>x.tenant_id===args[0]):[]};}
const acteur={personneId:5};
let accord = true;
let withTransactionCalls=0;
let failWrite=false;
const transaction=async fn=>{
  withTransactionCalls++;
  let client={query:async(sql,args)=>{
    appels.push({sql,args});
    if(sql===SQL_ORGANISATIONS||sql===SQL_RELATIONS)return lire(sql,args);
    if(sql===SQL_INSERT || sql===SQL_REVOQUER)return {rows:failWrite?[]:[{id:99,tenant_id:10,source_organisation_id:2,target_organisation_id:3,type:'ADMINISTRATIVE_TUTELLE',statut:'ACTIVE'}]};
    return {rows:[]};
  }};
  return fn(client);
};
let authorizations=[];
let verifier=async ({tenantId,organisationId,action})=>{authorizations.push({tenantId,organisationId,action});return accord && tenantId===10 && [1,2,3,4].includes(organisationId)};
const service=creerServiceReseauInstitutionnel({requete:lire,autoriser:verifier,transaction});
(async()=>{
  const sous=await service.lireSousReseau({acteur,tenantId:10,racineId:1,dateReference:now});
  assert.deepEqual(sous.descendants.map(x=>x.id),[2,3]);n++;
  ok(!sous.descendants.some(x=>x.id===4),'Aucune ambassade soeur visible');
  ok(!sous.descendants.some(x=>x.id===9),'Aucun autre tenant visible');
  ok(sous.relationsStructurelles.length===2,'Deux liens structurels autorisés');
  ok(appels.every(x=>x.args?.[0]===10),'Requêtes toutes limitées au tenant');
  accord=false;
  const before=appels.length;
  await assert.rejects(()=>service.lireSousReseau({acteur,tenantId:10,racineId:1,dateReference:now}),/ACCES_RESEAU_REFUSE/);n++;
  ok(appels.length===before,'Refus avant accès données');
  await assert.rejects(()=>service.creerLien({acteur,tenantId:10,parentId:2,enfantId:3,type:'ADMINISTRATIVE_TUTELLE',referenceValidation:'APPROVAL-2026-01'}),/ACCES_RESEAU_REFUSE/);n++;
  ok(withTransactionCalls===0,'Refus avant transaction');
  accord=true;
  await assert.rejects(()=>service.creerLien({acteur,tenantId:10,parentId:2,enfantId:9,type:'ADMINISTRATIVE_TUTELLE',referenceValidation:'APPROVAL-2026-01'}),/ACCES_RESEAU_REFUSE/);n++;
  await assert.rejects(()=>service.creerLien({acteur,tenantId:10,parentId:2,enfantId:3,type:'COMMUNITY_MEMBER',referenceValidation:'APPROVAL-2026-01'}),/RELATION_INVALIDE/);n++;
  await assert.rejects(()=>service.creerLien({acteur,tenantId:10,parentId:2,enfantId:2,type:'ADMINISTRATIVE_TUTELLE',referenceValidation:'APPROVAL-2026-01'}),/RELATION_INVALIDE/);n++;
  await assert.rejects(()=>service.creerLien({acteur,tenantId:10,parentId:2,enfantId:3,type:'ADMINISTRATIVE_TUTELLE',referenceValidation:'bad'}),/REFERENCE_VALIDATION_REQUISE/);n++;
  await assert.rejects(()=>service.creerLien({acteur,tenantId:10,parentId:1,enfantId:3,type:'SUPERVISION',referenceValidation:'APPROVAL-2026-01'}),/RELATION_NON_PERMISE/);n++;
  await assert.rejects(()=>service.creerLien({acteur,tenantId:10,parentId:3,enfantId:2,type:'ADMINISTRATIVE_TUTELLE',referenceValidation:'APPROVAL-2026-01'}),/RELATION_NON_PERMISE/);n++;
  const rev=await service.revoquerLien({acteur,tenantId:10,parentId:2,enfantId:3,type:'ADMINISTRATIVE_TUTELLE'});
  ok(rev.id===99,'Révocation structurale transactionnelle');
  ok(authorizations.slice(-2).every(x=>x.action==='MANAGE_INSTITUTION_NETWORK'),'Contrôle des deux organisations');
  ok(appels.some(x=>x.sql===SQL_REVOQUER),'Révocation utilise SQL canonique');
  failWrite=true;
  await assert.rejects(()=>service.creerLien({acteur,tenantId:10,parentId:1,enfantId:4,type:'SUPERVISION',referenceValidation:'APPROVAL-2026-02'}),/RELATION_ABSENTE_OU_DEJA_TRAITEE/);n++;
  failWrite=false;
  const added=await service.creerLien({acteur,tenantId:10,parentId:1,enfantId:4,type:'SUPERVISION',referenceValidation:'APPROVAL-2026-02'});
  ok(added.id===99,'Création validation tracée');
  ok(appels.some(x=>x.sql===SQL_INSERT),'SQL insert canonique utilisé');
  ok(appels.filter(x=>x.sql.includes('INSERT INTO audit_trail')).length===2,'Historique append-only des deux mutations réussies');
  ok(!/ON CONFLICT[\s\S]*DO UPDATE/.test(SQL_INSERT),'Impossible de réactiver une relation historique par UPSERT');
  ok(SQL_INSERT.includes('parent.tenant_id')||SQL_INSERT.includes('enfant.tenant_id'),'Contrôle tenant dans insertion');
  ok(SQL_REVOQUER.includes('parent.tenant_id')&&SQL_REVOQUER.includes('enfant.tenant_id'),'Contrôle tenant dans révocation');
  ok(SQL_RELATIONS.includes('parent.tenant_id')&&SQL_RELATIONS.includes('enfant.tenant_id'),'Contrôle des deux tenants en lecture');
  // Le contrat strict doit rester indépendant des permissions du moteur Communication.
  ok(!/TARGET_COMMUNICATION|VIEW_CASE|MANAGE_PUBLICATIONS/.test(SQL_INSERT),'Ne délivre aucun droit métier');
  const pg={queries:[],release(){this.released=true},async query(sql){this.queries.push(sql);if(sql==='COMMIT'&&this.forceFail)throw Error('echec COMMIT');return {rows:[]}}};
  const tx=creerTransactionPostgres(async()=>pg);
  const val=await tx(async c=>{await c.query('SELECT 1');return 42});
  ok(val===42 && pg.queries[0].startsWith('BEGIN') && pg.queries.at(-1)==='COMMIT' && pg.released,'Transaction unique commit/release');
  pg.queries=[];pg.released=false;
  await assert.rejects(()=>tx(async()=>{throw new Error('echec')}),/echec/);n++;
  ok(pg.queries.at(-1)==='ROLLBACK' && pg.released,'Rollback en cas d erreur');
  console.log('A3B_CONTRATS_PASS: '+n+' vérifications, lecture cloisonnée, tutelle, droits, audit et transactions');
})().catch(err=>{console.error(err);process.exitCode=1});
