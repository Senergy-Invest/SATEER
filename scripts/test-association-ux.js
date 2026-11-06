"use strict";
// Recette du vrai code d'interface dans VM, sans requêtes réseau ni PostgreSQL.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = process.cwd();
const appSource = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
const assocSource = fs.readFileSync(path.join(root, "public/association-communications.js"), "utf8");
const accueil = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const assocHtml = fs.readFileSync(path.join(root, "public/association-communications.html"), "utf8");
assert.match(accueil, /id="professionnelsDescription"/);
assert.match(assocHtml, /id="joinSection" hidden/);
assert.match(assocHtml, /id="joinForm" hidden/);

class Node {
  constructor(id="", tag="div") {
    this.id=id;this.tagName=tag;this.children=[];this.options=[];this.hidden=false;
    this.textContent="";this.disabled=false;this.value="";this.handlers={};this.classList={toggle(){}};
  }
  append(...args) { this.children.push(...args); }
  replaceChildren(...args) { this.children=[...args];if (this.id==="consulateSelect") {this.options=[...args];this.value=args[0]?.value||"";} }
  add(option) { this.options.push(option); }
  addEventListener(event, cb){this.handlers[event]=cb;}
  setAttribute(key,val) {this[key]=val;}
}
class TestOption {constructor(text,value){this.textContent=text;this.value=value;}}
function testDocument(){
  const elems=new Map();
  return {
    elems,
    createElement:tag=>new Node("",tag),
    getElementById(id) {if(!elems.has(id))elems.set(id,new Node(id));return elems.get(id);}
  };
}

async function testAssociation(name, consulates, expected, status = 200){
  const document=testDocument();
  document.getElementById("joinSection").hidden=true;
  document.getElementById("joinForm").hidden=true;
  document.getElementById("requestButton").disabled=true;
  const calls=[];
  const fetch=async (url, options={})=>{
    calls.push({url, method:options.method||"GET"});
    let code=200,body={};
    if(url.includes("/communication-invitations?")) {code=403; body={statut:"ACCES_REFUSE"};}
    else if(url.includes("/association-communications?")) body={publications:[],canRelay:false};
    else if(url.includes("/association-channels?")) body={canaux:[]};
    else if(url.includes("/available-consulates?")) {code=status;body=status===200?{consulats:consulates}:{statut: status===403?"ACCES_REFUSE":"ERREUR_INTERNE"};}
    else if(url.includes("/communication-join-requests")) {code=201;body={statut:"DEMANDE_CREEE"};}
    else {code=404;body={statut:"NOT_FOUND"};}
    return {ok:code>=200 && code<300,status:code,json:async()=>body};
  };
  const window={SATEER_CONTEXT_READY:Promise.resolve({tenantCode:"BORD"}),SATEER_choisirOrganisation:async()=>({id:132,nom:"Association",tenant_code:"BORD"})};
  const context=vm.createContext({document,window,location:{search:"?organisation=132&tenant=BORD"},URLSearchParams,Option:TestOption,fetch,console});
  const completion=vm.runInContext(assocSource,context);
  await completion;
  const section=document.getElementById("joinSection");
  const form=document.getElementById("joinForm");
  const button=document.getElementById("requestButton");
  assert.equal(section.hidden,expected.sectionHidden,`${name} section`);
  assert.equal(form.hidden,expected.formHidden,`${name} form`);
  assert.equal(button.disabled,expected.formHidden,`${name} button`);
  if(expected.summary)assert.match(document.getElementById("connectedConsulates").textContent,expected.summary);
  if(expected.option)assert(document.getElementById("consulateSelect").options.some(x=>x.value===expected.option));
  if(expected.sectionHidden){
    await button.handlers.click();
    assert.equal(calls.filter(c=>c.method==="POST").length,0,`${name}: aucune requête interdite`);
  }
  console.log("PASS",name);
}

const consulat={id:70,nom:"Consulat Bordeaux",type:"CONSULAT",tenant_code:"BORD"};
const assoc={id:132,nom:"Association test",type:"ASSOCIATION",tenant_code:"BORD"};
async function testHome(name, organisations, access, expected){
  const document=testDocument();
  const window={};
  const fetch=async url=>({ok:true,status:200,json:async()=>({dashboards: access})});
  const context=vm.createContext({document,window,URLSearchParams,fetch,console});
  const marker='document.getElementById("notificationButton")?.addEventListener';
  assert.equal(appSource.split(marker).length,2);
  vm.runInContext(appSource.split(marker)[0],context);
  await context.afficherAccesProfessionnels({organisations,tenantCode:"BORD"});
  assert.equal(document.getElementById("professionnelsTitle").textContent,expected);
  console.log("PASS",name);
}

(async()=>{
  await testAssociation("Membre sans droit : formulaire totalement masqué", [], {sectionHidden:true,formHidden:true},403);
  await testAssociation("Gestionnaire déjà connecté : partenaire indiqué, formulaire masqué", [{id:70,nom:"Consulat Bordeaux",connected:true}], {sectionHidden:false,formHidden:true,summary:/Déjà partenaire : Consulat Bordeaux/});
  await testAssociation("Gestionnaire avec nouveau Consulat : formulaire autorisé", [{id:70,nom:"Consulat Bordeaux",connected:true},{id:77,nom:"Consulat autre",connected:false,request_pending:false}], {sectionHidden:false,formHidden:false,option:"77",summary:/Consulat Bordeaux/});
  await testAssociation("Erreur serveur : formulaire fermé sans autorisation", [], {sectionHidden:false,formHidden:true},500);
  await testHome("Compte membre : Mes associations", [assoc], {}, "Mes associations");
  await testHome("Compte Vice-Consul : Mes fonctions professionnelles", [consulat], {operationnel:true}, "Mes fonctions professionnelles");
  await testHome("Compte mixte : titre combiné", [assoc,consulat], {operationnel:true}, "Mes associations et fonctions professionnelles");
  console.log("ASSOCIATION_MEMBER_UX_PASS : 7/7 scénarios sans PostgreSQL");
})().catch(e=>{console.error(e);process.exitCode=1;});
