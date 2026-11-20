'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test'),crypto=require('node:crypto');
const {VIEWS,KINDS,position}=require('../energy/energy-sketch-domain');
const {creerEnergySketchRouter}=require('../energy/energy-sketch-http');
const uid=()=>crypto.randomUUID();const id=uid();
const valid={vue:'PHYSIQUE',type:'LIEU',refId:id,x:100,y:200,expectedRevision:0};
for(const [name,d,ok] of [
 ['valide',valid,true],['vue incorrecte',{...valid,vue:'MAP'},false],['vue non autorisée',{...valid,vue:'PHYSIQUE\0'},false],
 ['ref invalide',{...valid,refId:'3'},false],['type invalide',{...valid,type:'COMPTEUR'},false],['x négatif',{...valid,x:-1},false],
 ['x limite',{...valid,x:1000},true],['x trop grand',{...valid,x:1001},false],['y trop grand',{...valid,y:701},false],
 ['y limite',{...valid,y:700},true],['x décimal',{...valid,x:2.5},false],['révision négative',{...valid,expectedRevision:-1},false],
 ['révision décimale',{...valid,expectedRevision:1.1},false],['révision limite',{...valid,expectedRevision:999999},true],
 ['revision maximale refusée',{...valid,expectedRevision:1000000},false],['champ supplémentaire',{...valid,role:'ADMIN'},false],
 ['sans ID',(()=>{const v={...valid};delete v.refId;return v;})(),false],['objet tableau',[],false],
 ['électrique',{...valid,type:'ELECTRIQUE',vue:'ELECTRIQUE'},true],['machine',{...valid,type:'EQUIPEMENT',vue:'FONCTIONNELLE'},true],
 ['toutes vues',null,true]
 ])test('C4B domaine '+name,()=>{if(name==='toutes vues'){assert.deepEqual(VIEWS,['PHYSIQUE','ELECTRIQUE','FONCTIONNELLE']);assert.deepEqual(KINDS,['LIEU','ELECTRIQUE','EQUIPEMENT']);return;}assert.equal(position(d)!==null,ok);});
function mock(){const routes={},router={use(){},get(p,fn){routes['GET '+p]=fn;},post(p,fn){routes['POST '+p]=fn;}};return {router,routes};}
function res(){return {code:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(n){this.code=n;return this;},json(o){this.body=o;return this;}};}
function make({owner=true,origin='http://localhost:3483',tenant='ENERGY_MVP01D_RECETTE',auth=true,body=valid,key=uid()}={}){
 const a=mock();const store={async list(){return owner?{positions:[],suivant:false}:null;},async save(){return owner?{code:'OK',id:uid(),revision:1}:{code:'SITE_NON_AUTORISE'};}};
 creerEnergySketchRouter({router:a.router,store,listerOrganisations:async()=>[{tenant_code:'ENERGY_MVP01D_RECETTE'}],origineAutorisee:'http://localhost:3483',tenantAutorise:'ENERGY_MVP01D_RECETTE'});
 const req={auth:auth?{personneId:708}:null,query:{tenant,vue:'PHYSIQUE'},params:{siteId:id},body,
  get:k=>k==='Origin'?origin:k==='Idempotency-Key'?key:null};return {routes:a.routes,req};
}
for(const [name,opts,method,code] of [
 ['lecture authentifiée',{},'GET',200],['lecture sans session',{auth:false},'GET',401],
 ['lecture hors tenant',{tenant:'AUTRE'},'GET',403],['lecture sans propriétaire',{owner:false},'GET',404],
 ['écriture valide',{},'POST',200],['écriture sans session',{auth:false},'POST',401],
 ['écriture cross origin',{origin:'https://evil.example'},'POST',403],['écriture mauvais tenant',{tenant:'AUTRE'},'POST',403],
 ['écriture hors propriétaire',{owner:false},'POST',404],['écriture mauvaise forme',{body:{...valid,role:'ADMIN'}},'POST',400],
 ['écriture sans clé',{key:'BAD'},'POST',400]
 ])test('C4B HTTP '+name,async()=>{const {routes,req}=make(opts),out=res();await routes[method+' /sites/:siteId/positions'](req,out);assert.equal(out.code,code);});
