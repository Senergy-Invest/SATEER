'use strict';
// Contrat SQL/Bordeaux de recette ; aucun réseau, aucune base, aucune mutation.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const ROOT=process.env.SATEER_PROJECT_ROOT||path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(ROOT,'pilot-case-dispatch-http.js'),'utf8');
const block=source.slice(source.indexOf('async function candidates('),source.indexOf('const sortCases='));
test('pas de filtre personnel organisation redondant : MEMBRE + rôle UNIT actif autorisable',()=>{
 assert.doesNotMatch(block,/ro\.type\s+IN\s*\(/);
 assert.match(block,/JOIN relations_personne_organisation ro ON ro\.personne_id=p\.id AND ro\.organisation_id=o\.id/);
 assert.match(block,/JOIN organisation_roles role_unite ON role_unite\.id=m\.role_id/);
 assert.match(block,/role_unite\.actif=TRUE/);
 assert.match(block,/role_unite\.scope IN \('UNIT','BOTH'\)/);
 assert.match(block,/rp\.role_id=role_unite\.id AND rp\.actif=TRUE/);
 assert.match(block,/permission\.code='TAKE_CASE'/);
});
test('conditions historiques maintenues (bureau, dates, permission effective)',()=>{
 assert.match(block,/u\.actif=TRUE/);
 assert.match(block,/m\.actif=TRUE/);
 assert.match(block,/m\.date_debut IS NULL OR m\.date_debut<=now\(\)/);
 assert.match(block,/m\.date_fin IS NULL OR m\.date_fin>now\(\)/);
 assert.match(block,/c\.code='TAKE_CASES'/);
 assert.match(block,/permissionsParUnite/);
 assert.match(block,/allowed=entitled\(d,'TAKE_CASE'\)/);
 assert.match(block,/if\(allowed\)permitted\.push/);
});
test('candidats : 327 conservé, 328 hors unité non proposé',async()=>{
 const original=Module._load;
 let candidates;
 try{
  Module._load=function(name,parent,isMain){
   if(name==='express')return {Router(){}};
   if(name==='./database')return {};
   if(name==='./services-database')return {};
   if(name==='./pilot-mail-dispatch-core')return {};
   return original.apply(this,arguments);
  };
  ({candidates}=require(path.join(ROOT,'pilot-case-dispatch-http.js')));
 }finally{Module._load=original;}
 const mock=async(sql,args)=>{
  assert.match(sql,/JOIN organisation_roles role_unite/);
  assert.match(sql,/role_unite\.scope IN \('UNIT','BOTH'\)/);
  assert.deepEqual(args,[70,'P6V_3B5AC5AB9DB04657',115]);
  // Le résultat représente le filtrage effectué par la requête SQL : 328 ne fait pas partie du bureau 115.
  return {rows:[{personneId:327,prenom:'Recette',nom:'Passeports',charge:0,traites:3,capacite:1,disponible:true}]};
 };
 const rights=async(personneId,org,tenant)=>{
  assert.equal(personneId,327);assert.equal(org,70);assert.equal(tenant,'P6V_3B5AC5AB9DB04657');
  return {succes:true,permissionsOrganisation:[],permissionsParUnite:[{uniteId:115,permissions:['TAKE_CASE']}]};
 };
 const result=await candidates(mock,rights,115);
 assert.deepEqual(result.map(a=>a.personneId),[327]);
 assert.equal(result[0].habilite,true);
 assert.equal(result[0].bureauId,115);
});
test('pas de permissions globales ajoutées ni d écriture à partir des agents',()=>{
 assert.doesNotMatch(block,/UPDATE\s+|INSERT\s+INTO|DELETE\s+FROM/i);
 assert.doesNotMatch(block,/GRANT\s+|ALTER\s+ROLE/i);
});
