"use strict";
/** A3c : transport HTTP synthétique, sans base ni sessions réelles. */
const assert = require('node:assert/strict');
const express = require('express');
const { creerRouteLectureReseau } = require('../institution-network-read-http');
const { ReseauRefuse } = require('../institution-network-database');
const { once } = require('node:events');
let n = 0;
function ok(v,label){assert.ok(v,label);n++;}
async function main(){
  let action='allowed', reads=0, lookups=0;
  const app=express();
  // Session fictive exclusivement dans ce serveur de test éphémère.
  app.use('/api/institution-network', (req,res,next)=>{
    if (req.get('x-test-session')==='synthetic-auth') req.auth={personneId:7};
    next();
  }, creerRouteLectureReseau({
    router:express.Router(),
    resoudreTenantId:async code=>{lookups++;return code==='SN'?3:null;},
    lireSousReseau:async ({acteur,tenantId,racineId})=>{
      reads++;
      assert.deepEqual({acteur,tenantId,racineId},{acteur:{personneId:7,tenantCode:'SN'},tenantId:3,racineId:11});
      if(action==='denied')throw new ReseauRefuse();
      if(action==='down')throw new Error('backend offline test');
      return {
        racine:{id:11,nom:'Ministère fictif',type:'MINISTERE',secret:'NE_JAMAIS_PARTAGER'},
        descendants:[{id:12,nom:'Ambassade fictive',type:'AMBASSADE',profondeur:1,privateEmail:'NE_JAMAIS_PARTAGER'}],
        relationsStructurelles:[{parentId:11,enfantId:12,type:'SUPERVISION',privilege:'NE_JAMAIS_PARTAGER'}]
      };
    }
  }));
  const server=app.listen(0,'127.0.0.1');
  try{
    await once(server,'listening');
    const origin=`http://127.0.0.1:${server.address().port}`;
    async function get(path,auth=true){const r=await fetch(origin+path,{headers:auth?{'x-test-session':'synthetic-auth'}:{}});return {status:r.status,data:await r.json(),headers:r.headers};}
    const endpoint='/api/institution-network/11?tenant=SN';
    let r=await get(endpoint,false);
    ok(r.status===401,'Sans session = 401');
    ok(lookups===0&&reads===0,'Sans session aucune lecture');
    for(const p of ['/api/institution-network/abc?tenant=SN','/api/institution-network/0?tenant=SN','/api/institution-network/11?tenant=bad','/api/institution-network/11?tenant=SN%3BDELETE']){
      r=await get(p);ok(r.status===400,'Paramètres invalides refusés');
    }
    ok(lookups===0&&reads===0,'Paramètres invalides : aucune lecture');
    r=await get('/api/institution-network/11?tenant=ZZ');
    ok(r.status===403,'Tenant inconnu : refus fermé');
    ok(reads===0,'Tenant inconnu : zéro lecture du réseau');
    r=await get(endpoint);
    ok(r.status===200&&r.data.statut==='RESEAU_INSTITUTIONNEL','Lecture autorisée');
    ok(r.data.racine.id===11&&r.data.descendants[0].id===12,'Racine et descendant corrects');
    ok(r.data.relations.length===1&&r.data.relations[0].type==='SUPERVISION','Lien de supervision');
    ok(!JSON.stringify(r.data).includes('NE_JAMAIS_PARTAGER'),'Projection minimale sans champs privés');
    ok(/no-store/.test(r.headers.get('cache-control')),'Sans cache');
    action='denied';r=await get(endpoint);
    ok(r.status===403&&!JSON.stringify(r.data).includes('Ministère'),'Permission insuffisante');
    action='down';r=await get(endpoint);
    ok(r.status===500&&!JSON.stringify(r.data).includes('backend offline'),'Erreur neutre');
    r=await fetch(origin+endpoint,{method:'POST',headers:{'x-test-session':'synthetic-auth'}});
    ok(r.status===404,'Aucune méthode d écriture exposée');
    const fs=require('node:fs');
    const source=fs.readFileSync(require('node:path').join(__dirname,'..','server.js'),'utf8');
    ok(source.includes('process.env.PGDATABASE === "sateer_test"')&&source.includes('SATEER_ENABLE_INSTITUTION_NETWORK_READ'), 'Double garde recette');
    ok(source.includes('app.use("/api/institution-network", exigerSession'), 'Middleware de session au montage');
    ok(!source.includes('app.use("/api/institution-network", creerRouteLectureReseau('), 'Jamais une route publique');
    console.log('AMBASSADE_A3C_HTTP_SYNTHETIQUE_PASS='+n);
  }finally{await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
