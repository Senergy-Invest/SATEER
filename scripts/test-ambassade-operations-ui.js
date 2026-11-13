"use strict";
const assert=require('node:assert/strict');
const ui=require('../public/ambassade-operations-ui');
class Node {
 constructor(tag){this.tagName=tag;this.children=[];this.className='';this.textContent='';}
 append(...args){this.children.push(...args)}
 replaceChildren(...args){this.children=[...args]}
}
const nodes={ambassadeOperationsStatut:new Node('p'),ambassadeOperationsContenu:new Node('div')};
const doc={createElement:t=>new Node(t),getElementById:id=>nodes[id]};
let n=0;
function ok(c,m){assert.ok(c,m);n++;}
const vue={organisationId:7,tenantCode:'SN',demandes:{total:3,nouvelles:1,enCours:1,traitees:1,sansDestination:1,urgentesOuvertes:0},publications:{publiees:2},unites:[{id:1,nom:'<img src=x onerror=alert(1)>',code:'TEST'}]};
function texts(x){return x.textContent+' '+(x.children||[]).map(texts).join(' ')}
(async()=>{
 ui.afficherVue(doc,nodes.ambassadeOperationsContenu,vue);
 ok(nodes.ambassadeOperationsContenu.children.length===5,'Cinq zones sans innerHTML');
 ok(texts(nodes.ambassadeOperationsContenu).includes('<img src=x onerror=alert(1)>'),'Nom brut uniquement comme texte');
 ok(texts(nodes.ambassadeOperationsContenu).includes('Aucune orientation automatique'),'Routage non présenté comme activé');
 assert.throws(()=>ui.afficherVue(doc,nodes.ambassadeOperationsContenu,{...vue,demandes:{...vue.demandes,total:-1}}),/METRIQUE_INVALIDE/);n++;
 let read=0;
 const fetcher=async url=>{read++;ok(url.includes('/api/ambassade-operations/7/summary?tenant=SN'),'URL vérifiée');return {ok:true,status:200,json:async()=>({statut:'OPERATIONS_AMBASSADE',vue})};};
 await ui.charger({organisationId:7,tenantCode:'SN',fetcher,doc});
 ok(nodes.ambassadeOperationsStatut.textContent.includes('permissions'),'Succès lisible');
 ok(read===1,'Une requête API');
 const forbid=async()=>({status:403,ok:false});
 await ui.charger({organisationId:7,tenantCode:'SN',fetcher:forbid,doc});
 ok(nodes.ambassadeOperationsStatut.textContent.includes('non habilités'),'Refus distinct');
 ok(nodes.ambassadeOperationsContenu.children.length===0,'Données retirées à la révocation');
 const disabled=async()=>({status:404,ok:false});
 await ui.charger({organisationId:7,tenantCode:'SN',fetcher:disabled,doc});
 ok(nodes.ambassadeOperationsStatut.textContent.includes('non activée'),'Drapeau éteint');
 await ui.charger({organisationId:7,tenantCode:'SN',fetcher:async()=>({status:503,ok:false}),doc});
 ok(nodes.ambassadeOperationsStatut.textContent.includes('indisponibles'),'Panne neutre');
 await ui.charger({organisationId:7,tenantCode:'SN',fetcher:async()=>({ok:true,status:200,json:async()=>({statut:'OPERATIONS_AMBASSADE',vue:{...vue,organisationId:12}})}),doc});
 ok(nodes.ambassadeOperationsContenu.children.length===0,'Périmètre inattendu refusé');
 const html=require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../public/ambassade.html'),'utf8');
 ok(html.includes('/ambassade-operations-ui.js')&&html.includes('id="ambassadeOperationsContenu"'),'Montage dans Mon Ambassade');
 console.log('AMBASSADE_A5_INTERFACE_PASS='+n);
})().catch(e=>{console.error(e);process.exitCode=1;});
