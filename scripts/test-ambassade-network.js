"use strict";
/** A12–A14 : contrats stricts, sans DB ni réseau et sans mutation. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const P=path.resolve(__dirname,'..');
const {projeter,creerChargerReseau,SQL_RACINE,SQL_RELATIONS,SQL_ATTENTE}=require('../ambassade-network');
const ui=require('../public/ambassade-network-ui');
let n=0;const ok=(v,s)=>{assert.ok(v,s);n++};
const r=[
  {type:'ADMINISTRATIVE_TUTELLE',source_id:33,source_type:'AMBASSADE',source_nom:'Mission',target_id:34,target_type:'CONSULAT',target_nom:'Bordeaux'},
  {type:'COMMUNITY_MEMBER',source_id:51,source_type:'ASSOCIATION',source_nom:'Assoc directe',target_id:33,target_type:'AMBASSADE',target_nom:'Mission'},
  {type:'COMMUNITY_MEMBER',source_id:52,source_type:'ASSOCIATION',source_nom:'Assoc territoriale',target_id:34,target_type:'CONSULAT',target_nom:'Bordeaux'},
  {type:'COOPERATION',source_id:60,source_type:'BANQUE',source_nom:'Banque fictive',target_id:33,target_type:'AMBASSADE',target_nom:'Mission'},
  {type:'COMMUNITY_MEMBER',source_id:99,source_type:'ASSOCIATION',source_nom:'Hors réseau',target_id:88,target_type:'CONSULAT',target_nom:'Autre poste'}
];
const data=projeter({id:33,nom:'Mission',type:'AMBASSADE'},r,[{id:52,nom:'Assoc territoriale',origine:'INVITATION',type_relation:'COMMUNITY_MEMBER'}]);
ok(data.consulats.length===1,'consulat lié');
ok(data.associationsDirectes.length===1,'association directe');
ok(data.associationsDesConsulats.length===1,'association de poste');
ok(data.associationsDesConsulats[0].consulatNom==='Bordeaux','postes étiquetés sans deviner géographie');
ok(data.partenaires.length===1,'partenaire coopération');
ok(data.attentes.length===1,'invitation pending');
ok(!JSON.stringify(data).includes('Hors réseau'),'pas de relations du mauvais poste');
(async()=>{
const calls=[];
const load=creerChargerReseau({requete:async(sql,args)=>{calls.push({sql,args});return {rows:sql===SQL_RACINE?[{id:33,nom:'Mission',type:'AMBASSADE',tenant_id:9}]:sql===SQL_RELATIONS?r:[{id:51,nom:'Assoc',origine:'DEMANDE',type_relation:'COMMUNITY_MEMBER'}]}}});
const got=await load({organisationId:33,tenantCode:'AMBVIS_96C7FBBEA383DD'});
ok(got.statut==='RESEAU_AMBASSADE'&&got.tenantCode==='AMBVIS_96C7FBBEA383DD','projection scoped');
ok(calls.length===3&&calls.every(c=>c.args.includes(33)||c.args.includes(9)),'requêtes filtrées tenant + org');
for(const bad of ['BROKEN/;', '', 'abc']){
  await assert.rejects(load({organisationId:33,tenantCode:bad}),/CONTEXTE_RESEAU_INVALIDE/);n++;
}
class E {constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.hidden=false;}append(...a){this.children.push(...a)}replaceChildren(...a){this.children=a}}
const nodes={ambassadeReseauSection:new E('section'),ambassadeReseauContenu:new E('div'),ambassadeReseauStatut:new E('p')};nodes.ambassadeReseauSection.hidden=true;
const doc={createElement:tag=>new E(tag),getElementById:id=>nodes[id]||null};
const full={...data,tenantCode:'AMBVIS_96C7FBBEA383DD'};
ui.afficher(doc,nodes.ambassadeReseauContenu,full);
ok(nodes.ambassadeReseauContenu.children.length===1,'DOM créé sans innerHTML');
const denied=await ui.charger({organisationId:33,tenantCode:full.tenantCode,doc,fetcher:async()=>({status:403,ok:false})});
ok(denied===false&&nodes.ambassadeReseauSection.hidden,'pas de vue sans permission');
const good=await ui.charger({organisationId:33,tenantCode:full.tenantCode,doc,fetcher:async()=>({status:200,ok:true,json:async()=>full})});
ok(good===true&&!nodes.ambassadeReseauSection.hidden,'vue responsable autorisée');
const evil=await ui.charger({organisationId:33,tenantCode:full.tenantCode,doc,fetcher:async()=>({status:200,ok:true,json:async()=>({...full,organisation:{id:4,type:'AMBASSADE'}})})});
ok(!evil&&nodes.ambassadeReseauContenu.children.length===0,'réponse hors périmètre refusée');
const server=fs.readFileSync(path.join(P,'server.js'),'utf8');
const html=fs.readFileSync(path.join(P,'public/ambassade.html'),'utf8');
const home=fs.readFileSync(path.join(P,'public/app.js'),'utf8');
const theme=fs.readFileSync(path.join(P,'public/ambassade-theme-v2.css'),'utf8');
const cssHome=fs.readFileSync(path.join(P,'public/mon-sateer-deux-experiences.css'),'utf8');
ok(server.includes('SATEER_ENABLE_AMBASSADE_NETWORK')&&server.includes('PGDATABASE === "sateer_test"'),'drapeau recette');
ok(server.includes('app.use("/api/ambassade-network", exigerSession'),'route avec session');
ok(html.includes('id="ambassadeReseauSection"')&&html.includes('ambassade-network-ui.js'),'façade montée');
ok(home.includes('carteExperienceNonRattachee("AMBASSADE")')&&home.includes('carteExperienceNonRattachee("CONSULAT")'),'deux expériences visibles');
ok(home.includes('if (!consulats.length)')&&home.includes('if (!ambassades.length)'),'liens seulement si rattachement');
ok(theme.includes('body.sateer-ambassade')&&theme.includes('body.sx-ambassade-mode')&&!theme.includes('body.sateer-consulat'),'thème isolé');
ok(theme.includes('#351b4a')&&!theme.includes('background:#f4f5f8'),'fond réellement différent');
ok(cssHome.includes('sx-institution-card')&&cssHome.includes('sx-experience-locked'),'cartes visuellement distinctes');
ok(SQL_RELATIONS.includes('r.tenant_id=$1')&&SQL_RELATIONS.includes("r.statut='ACTIVE'")&&SQL_RELATIONS.includes("cons.type='CONSULAT'"),'SQL scoped et relations validées');
ok(SQL_ATTENTE.includes('organisation_join_requests')&&SQL_ATTENTE.includes('organisation_invitations'),'attentes existantes réutilisées');
console.log('A12_A14_CONTRATS_PASS='+n);
})().catch(e=>{console.error(e);process.exitCode=1});
