"use strict";
/** D3 : tests sans BD des droits, du routage et de la presentation Diaspora. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {creerRoutesCreationDiaspora,CATEGORIES}=require('../diaspora-creation-http');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const tenant='AMBVIS_96C7FBBEA383DD';
function fixture({permitted=true,orgType='ASSOCIATION'}={}){
 let handler,argumentsPublication=null;
 const router={post(p,fn){assert.equal(p,'/:organisationId/diaspora/publications');handler=fn;}};
 const org=async()=>({type:orgType});
 const perm=async()=>({succes:true,autorise:permitted,portee:permitted?'ORGANISATION':null});
 const create=async(...args)=>{argumentsPublication=args;return{id:888}};
 creerRoutesCreationDiaspora({router,verifierPermission:perm,trouverOrganisation:org,creerPublication:create});
 async function invoke(body={tenantCode:tenant,titre:'Rencontre associative fictive',contenu:'Message de recette',categorie:'EVENEMENT'},options={}){
  const req={auth:{personneId:704},params:{organisationId:'374'},query:{tenant},body,
    get:(h)=>h==='Origin'?(options.origin||(process.env.SATEER_PUBLIC_ORIGIN||'http://localhost:3000')):null};
  if(options.auth===false)req.auth=null;
  if(options.tenant)req.query.tenant=options.tenant;
  const res={code:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(c){this.code=c;return this;},json(x){this.data=x;return this;}};
  await handler(req,res);return res;
 }
 return{invoke,args:()=>argumentsPublication};
}
test('six themes strictement identiques au catalogue Diaspora',()=>{
 assert.deepEqual(CATEGORIES,['EVENEMENT','FORMATION','EMPLOI','ENTREPRENEURIAT','CULTURE','COMMUNAUTE']);
});
test('creation conserve une audience generale et aucun media, canal ou notification',async()=>{
 const f=fixture(),r=await f.invoke();assert.equal(r.code,201);assert.equal(r.data.statut,'DIASPORA_PUBLICATION_CREEE');
 assert.deepEqual(f.args(),[tenant,374,704,'Rencontre associative fictive','Message de recette','TOUS',null,'EVENEMENT','NORMALE',[],null]);
});
test('categorie institutionnelle refusee',async()=>{const f=fixture(),r=await f.invoke({tenantCode:tenant,titre:'test',contenu:'test',categorie:'COMMUNIQUE'});assert.equal(r.code,400);assert.equal(f.args(),null)});
test('champs de permission ou ciblage fabriques refuses',async()=>{const f=fixture(),r=await f.invoke({tenantCode:tenant,titre:'test',contenu:'test',categorie:'CULTURE',personneId:999,media:[]});assert.equal(r.code,400)});
test('session absente refusee',async()=>{const f=fixture(),r=await f.invoke(undefined,{auth:false});assert.equal(r.code,401)});
test('citoyen sans permission est refuse meme rattache',async()=>{const f=fixture({permitted:false}),r=await f.invoke();assert.equal(r.code,403)});
test('Bureau ne peut publier via la route associative',async()=>{const f=fixture({orgType:'SATEER'}),r=await f.invoke();assert.equal(r.code,403)});
test('protection origine et tenant',async()=>{const f=fixture(),r=await f.invoke(undefined,{origin:'http://evil.example'});assert.equal(r.code,403);const r2=await f.invoke(undefined,{tenant:'DIFFERENT'});assert.equal(r2.code,400)});
test('titre et corps requis',async()=>{const f=fixture(),r=await f.invoke({tenantCode:tenant,titre:' ',contenu:'test',categorie:'EVENEMENT'});assert.equal(r.code,400)});
test('formulaire natif distinct des ecrans consulaires',()=>{
 const html=read('public/diaspora-creer-publication.html');const js=read('public/diaspora-creer-publication.js');
 assert.match(html,/diaspora-theme.css\?v=ux1/);assert.match(html,/class="diaspora-experience"/);
 for(const category of CATEGORIES)assert.match(html,new RegExp('value="'+category+'"'));
 assert.doesNotMatch(html,/ambassade-theme|ambassade-identity|Informations générales du Consulat/i);
 assert.match(js,/\/diaspora\/publications/);assert.match(js,/source-publications/);
 assert.match(js,/credentials:'same-origin'/);assert.match(js,/NON_DEMANDEE/);
});
test('raccordement source et categorie de la revue',()=>{
 const h=read('public/diaspora-communication.html'),s=read('public/diaspora-communication.js');
 assert.match(h,/id="dcCreateSection"/);assert.match(s,/find\('dcCreateSection'\).hidden=false/);
 assert.match(s,/Catégorie : '\+\(p.categorie\|\|'Non renseignée'/);
 assert.match(s,/selected.type==='ASSOCIATION'/);
});
test('zone deja affectee sans doublon et verrouillage soumis',()=>{
 const js=read('public/diaspora-zones-professionnelles.js');
 assert.match(js,/Number\(p.geoTerritoryId\)===Number\(selectedArea.id\)/);
 assert.match(js,/Déjà affectée : /);assert.match(js,/if\(same\)button.disabled=true/);
 assert.match(js,/p.etatDiffusion==='NON_DEMANDEE'/);
});
test('notification : lien vers publication conserve',()=>{
 const s=read('public/app.js');assert.match(s,/DIASPORA_ABONNEMENT/);
 assert.match(s,/destination.hash = `publication-\$\{Number\(notification.reference_id\)\}`/);
 assert.match(s,/Voir dans Diaspora/);
});
