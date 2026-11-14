"use strict";
const assert = require('node:assert/strict');
const {test} = require('node:test');
const {creerRouteLectureDiaspora} = require('../diaspora-feed-http');
const TENANT='AMBVIS_96C7FBBEA383DD';
function fixture({auth={personneId:24},tenant=TENANT,membership=true,pubs=[]} = {}) {
  let handler;let reads=0;let memberships=0;
  const router={get:(path,fn)=>{assert.equal(path,'/feed');handler=fn;}};
  creerRouteLectureDiaspora({router,
    listerOrganisations:async(personne,scope)=>{memberships++;assert.equal(personne,24);assert.equal(scope,TENANT);return membership?[{id:333,tenant_code:TENANT}]:[];},
    listerPublications:async(personne,scope)=>{reads++;assert.equal(personne,24);assert.equal(scope,TENANT);return pubs;}});
  const req={auth,query:{tenant}};
  const res={code:200,headers:{},payload:null,set(k,v){this.headers[k]=v;return this;},status(code){this.code=code;return this;},json(x){this.payload=x;return this;}};
  return {handler,req,res,get reads(){return reads;},get memberships(){return memberships;}};
}
const pub = (changes={})=>({id:13,titre:'Rencontre énergie',contenu:'Source validée',categorie:'EVENEMENT',priorite:'NORMALE',organisation:'Agence fictive',organisation_type:'AGENCE',statut_diffusion_diaspora:'DIFFUSEE',audience_type:'TOUS',date_diffusion_diaspora:'2026-11-14',secret:'NON_DIVULGUER',...changes});
test('session obligatoire, aucune lecture préalable',async()=>{const f=fixture({auth:null});await f.handler(f.req,f.res);assert.equal(f.res.code,401);assert.equal(f.reads,0);});
test('tenant obligatoire et validé',async()=>{const f=fixture({tenant:'../../other'});await f.handler(f.req,f.res);assert.equal(f.res.code,400);assert.equal(f.reads,0);});
test('membre hors tenant refusé, aucune lecture',async()=>{const f=fixture({membership:false});await f.handler(f.req,f.res);assert.equal(f.res.code,403);assert.equal(f.reads,0);});
test('filtrage fail-closed : jamais de SOUMISE, REJETEE ou ASSOCIATION',async()=>{const f=fixture({pubs:[pub(),pub({id:14,statut_diffusion_diaspora:'SOUMISE'}),pub({id:15,statut_diffusion_diaspora:'REJETEE'}),pub({id:16,audience_type:'ASSOCIATION'})]});await f.handler(f.req,f.res);assert.equal(f.res.code,200);assert.deepEqual(f.res.payload.publications.map(x=>x.id),[13]);assert.equal('secret' in f.res.payload.publications[0],false);assert.equal(f.res.headers['Cache-Control'],'private, no-store');});
test('projection sans données privées et source conservée',async()=>{const f=fixture({pubs:[pub()]});await f.handler(f.req,f.res);assert.equal(f.res.payload.publications[0].organisation,'Agence fictive');assert.equal(f.res.payload.publications[0].contenu,'Source validée');assert.equal(f.res.payload.publications[0].statut_diffusion_diaspora,undefined);});
test('aucun contenu validé => résultat vide, pas de contenu fictif',async()=>{const f=fixture({pubs:[]});await f.handler(f.req,f.res);assert.equal(f.res.code,200);assert.deepEqual(f.res.payload.publications,[]);});
test('données sous-jacentes invalides => échec non permissif',async()=>{const f=fixture({pubs:null});const original=console.error;console.error=()=>{};try{await f.handler(f.req,f.res);}finally{console.error=original;}assert.equal(f.res.code,500);assert.equal(f.res.payload.statut,'ERREUR_DIASPORA_FEED');});
test('pas de méthode d’écriture enregistrée',()=>{const called=[];creerRouteLectureDiaspora({router:{get:(path)=>called.push(path)},listerOrganisations:async()=>[],listerPublications:async()=>[]});assert.deepEqual(called,['/feed']);});
