'use strict';
/* Recette UI sans serveur ni PostgreSQL : autorisations, tenant, réseau associatif. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const helpers = require(path.join(root, 'public/sateer-p2.js'));

assert.equal(helpers.resolveTenant({tenant_code:'BORD'}, 'BORD', null), 'BORD');
assert.equal(helpers.resolveTenant({}, 'BORD', null), 'BORD');
assert.equal(helpers.resolveTenant({}, '', 'BORD'), 'BORD');
assert.throws(() => helpers.resolveTenant({tenant_code:'BORD'}, 'AUTRE', null), /incohérent/);
assert.equal(helpers.isConnectedAssociation({relation_statut:'ACTIVE', relation_active:true}), true,
  'L’API association-partners filtre déjà les organisations et ne renvoie pas le champ type');
assert.equal(helpers.isConnectedAssociation({relation_statut:'ACTIVE', relation_active:false}), false);
assert.equal(helpers.isConnectedAssociation({relation_statut:'INACTIVE', relation_active:true}), false);
assert.equal(helpers.isConnectedAssociation({type:'COMMUNE',relation_statut:'ACTIVE',relation_active:true}), false);

const html = fs.readFileSync(path.join(root,'public/associations-partenaires.html'),'utf8');
const assocSource = fs.readFileSync(path.join(root,'public/associations-partenaires.js'),'utf8');
const p2Source = fs.readFileSync(path.join(root,'public/sateer-p2.js'),'utf8');
assert(!p2Source.includes('/ecosysteme.html'), 'Pas de navigation vers le vieil Écosystème');
assert(p2Source.includes('/association-partners'), 'La liste provient de l’API associative');
assert(p2Source.includes('/association-relay-history'), 'Le compteur de relais provient de l’API');
for (const id of ['partnerConnectedCount','partnerPendingCount','partnerRelayCount','refreshPartners','historyPanel']) {
  assert(html.includes(`id="${id}"`), `Élément UI manquant: ${id}`);
}
assert(assocSource.includes('"#historyPanel"'), 'Le lien « Voir les relais » doit viser la même page');
assert(html.indexOf('/auth-client.js') < html.indexOf('/associations-partenaires.js'), 'Le contexte doit être initialisé avant la page');

const records = [{ id:132, nom:'Association synthétique n°132',
  relation_statut:'ACTIVE', relation_active:true }];
const waiting = { demandes: [] };
const relays = { relais: [{ titre:'Publication synthétique n°57' }] };
const dashboard = {
  organisation:{nom:'Consulat Bordeaux'},
  demandes:{nouvelles:3,en_cours:2,traitees:7},
  demandesASurveiller:[],
  delaiTraitement:{heures_moyennes:10},
  demandesParCategorie:[],
  activiteRecente:{demandes:[]},
  publications:{publiees:2}, diaspora:{total_usagers:8}
};

class Node {
  constructor(tag, owner) {
    this.tag=tag; this.owner=owner; this.children=[]; this.parentElement=null;
    this.attributes={}; this.style={}; this.hidden=false;
    this.href=''; this.className=''; this._text=''; this._id='';
  }
  set id(value) { this._id=value; if(value) this.owner.ids.set(value,this); }
  get id() { return this._id; }
  set textContent(v) { this._text=String(v ?? ''); this.children=[]; }
  get textContent() { return this._text + this.children.map(c=>c.textContent).join(''); }
  appendChild(n) { this.children.push(n); n.parentElement=this; return n; }
  prepend(n) { this.children.unshift(n); n.parentElement=this; return n; }
  replaceChildren(...nodes) { this.children=[]; nodes.forEach(n=>this.appendChild(n)); }
  setAttribute(name,v) { this.attributes[name]=String(v); }
  getAttribute(name) { return name==='href' ? this.href : this.attributes[name] ?? null; }
  addEventListener() {}
  closest() { return null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}
async function scenario({dashboardAllowed, partnerAllowed}) {
  const ids = new Map();
  const doc={ids,readyState:'complete',createElement(tag){return new Node(tag,doc);},
    getElementById(id){return ids.get(id)||null;},
    querySelector(selector){return selector==='main.page'?main:null;},
    querySelectorAll(){return [];} };
  const body={classList:{contains(v){return v==='sateer-vice';},add(){} }};
  doc.body=body;
  const main=new Node('main',doc);
  const original=new Node('a',doc);original.id='lienPublicationInstitutionnelle'; original.hidden=true;
  original.href='#';
  const kpi=new Node('strong',doc);kpi.id='kpiNouvelles';
  const URLSearchParamsGlobal=URLSearchParams;
  const mockGet=async url => {
    const ok = data => ({ok:true,status:200,json:async()=>data});
    const denied = () => ({ok:false,status:403,json:async()=>({statut:'ACCES_REFUSE'})});
    if(url.includes('/association-partners?')) return partnerAllowed ? ok({associations:records}) : denied();
    if(url.includes('/association-join-requests?')) return partnerAllowed ? ok(waiting) : denied();
    if(url.includes('/association-relay-history?')) return partnerAllowed ? ok(relays) : denied();
    if(url.includes('/dashboard-operationnel?')) return dashboardAllowed ? ok(dashboard) : denied();
    if(url.includes('/units/overview?')) return dashboardAllowed ? ok({unites:[]}) : denied();
    throw Error('Endpoint inattendu : '+url);
  };
  const win={dispatchEvent(){},SATEER_CONTEXT_READY:Promise.resolve({tenantCode:null}),
    SATEER_choisirOrganisation:async()=>({id:70, nom:'Consulat Bordeaux',type:'CONSULAT', tenant_code:'P6V_3B5AC5AB9DB04657'})};
  const sandbox={document:doc,window:win,URLSearchParams:URLSearchParamsGlobal,
    location:{search:'?organisation=70&tenant=P6V_3B5AC5AB9DB04657'},
    fetch:mockGet,MutationObserver:class{observe(){}},CustomEvent:class{constructor(type){this.type=type;}},console};
  vm.runInNewContext(p2Source,sandbox,{filename:'sateer-p2.js'});
  await new Promise(resolve=>setTimeout(resolve,5));
  const network=doc.getElementById('sx-p2-associations');
  const status=doc.getElementById('sx-p2-status');
  const link=doc.getElementById('sx-p2-partners-link');
  assert(network && status && link, 'Les indicateurs et le lien doivent exister');
  assert.equal(doc.getElementById('sx-p2-activity').hidden,!dashboardAllowed);
  assert.equal(link.hidden,!partnerAllowed);
  if(partnerAllowed){
    assert.equal(network.textContent,'1');
    assert.equal(doc.getElementById('sx-p2-pending').textContent,'0');
    assert.equal(doc.getElementById('sx-p2-relays').textContent,'1');
    assert(link.href.includes('organisation=70') && link.href.includes('tenant=P6V_'));
  } else {
    assert.equal(network.textContent,'—','Un refus ne doit pas devenir un faux zéro');
  }
  if(!dashboardAllowed){
    assert.match(status.textContent,/pas accès au pilotage opérationnel/);
  } else {
    assert.equal(status.textContent,'Indicateurs actualisés.');
  }
}

(async()=>{
  await scenario({dashboardAllowed:true, partnerAllowed:true});
  await scenario({dashboardAllowed:false, partnerAllowed:true});
  await scenario({dashboardAllowed:true, partnerAllowed:false});
  console.log('PASS UI BORDEAUX : tenant, absence de doublons, association #132, permissions partielles, 3 scénarios.');
})().catch(error=>{ console.error(error);process.exitCode=1; });
