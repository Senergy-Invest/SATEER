'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/dashboard-consul.js','utf8');
const css = fs.readFileSync('public/sateer-consul-finition.css','utf8');
const html = fs.readFileSync('public/dashboard-consul.html','utf8');
function element() {
  return {
    hidden: true, textContent: '', href: '', style: {}, className: '', children: [],
    get childElementCount() {return this.children.length;},
    appendChild(child) {this.children.push(child);return child;},
    append(...items) {this.children.push(...items);},
    replaceChildren(...items) {this.children=items;}
  };
}
const ids=['organisationNom','kpiDemandesTotal','kpiTauxTraitement','kpiDelaiMoyen','kpiUrgentes',
 'kpiUsagers','kpiTerritoires','kpiNouvelles','kpiEnCours','kpiTraites','kpiImportantes',
 'kpiPublications','kpiPublicationsPubliees','kpiPublicationsSoumises','kpiPublicationsDiffusees',
 'evolutionMensuelle','categoriesDemandes','couvertureTerritoriale','dashboardContenu',
 'dashboardErreur','dashboardErreurMessage','accesOperationnelSection','accesOperationnelLien'];
async function simulate({mainOk=true,optional='error'}={}) {
  const dom=Object.fromEntries(ids.map(id=>[id,element()]));
  dom.dashboardErreur.hidden=true;
  dom.dashboardContenu.hidden=true;
  dom.accesOperationnelSection.hidden=true;
  const seen=[];
  const errors=[];const warnings=[];
  const payload={organisation:{nom:'Organisation recette'},indicateurs:{total:6,taux_traitement:33.3,
    delai_moyen_heures:.4,urgentes_ouvertes:1,usagers:2,territoires_couverts:1,
    nouvelles:2,en_cours:2,traitees:2,importantes_ouvertes:0,publications_total:3,
    publications_publiees:3,publications_soumises_diaspora:0,publications_diffusees_diaspora:0},
    evolution_mensuelle:[],demandes_par_categorie:[],couverture_territoriale:[]};
  const context={
    URLSearchParams,Date,Intl,Number,Array,Math,encodeURIComponent,
    window:{location:{search:'?organisation=70&tenant=P6V_3B5AC5AB9DB04657'},
       SATEER_CONTEXT_READY:Promise.resolve({tenantCode:'P6V_3B5AC5AB9DB04657'}),
       SATEER_choisirOrganisation:async()=>({id:70})},
    document:{getElementById(id){return dom[id] || null;},createElement(){return element();}},
    console:{error(...args){errors.push(args);},warn(...args){warnings.push(args);}},
    fetch:async function (url) {
      seen.push(url);
      if (url.includes('dashboard-strategique?')) {
        return mainOk ? {ok:true,json:async()=>payload} :
          {ok:false,status:503,json:async()=>({statut:'INDICATEURS_INDISPONIBLES'})};
      }
      if (url.includes('dashboard-operationnel/acces?')) {
        if(optional==='error') throw new Error('Appel secondaire impossible');
        if(optional==='denied') return {ok:false,status:403,json:async()=>({})};
        return {ok:true,status:200,json:async()=>({peutConsulter:true})};
      }
      throw new Error('URL inattendue : '+url);
    }
  };
  vm.runInNewContext(source,context,{filename:'dashboard-consul.js',timeout:1500});
  for (let k=0;k<12;k++) await new Promise(resolve=>setImmediate(resolve));
  return {dom,seen,errors,warnings};
}
(async()=>{
  {
    const {dom,seen,errors,warnings}=await simulate({optional:'error'});
    assert.equal(dom.kpiDemandesTotal.textContent,'6');
    assert.equal(dom.dashboardContenu.hidden,false);
    assert.equal(dom.dashboardErreur.hidden,true,'La panne secondaire ne doit pas afficher la panne generale');
    assert.equal(errors.length,0);
    assert.equal(warnings.length,1,'La panne facultative doit rester dans le journal');
    assert.equal(seen.length,2);
    console.log('PASS: indicateurs affiches meme si le service operationnel facultatif echoue');
  }
  {
    const {dom,errors}=await simulate({mainOk:false});
    assert.equal(dom.dashboardContenu.hidden,true);
    assert.equal(dom.dashboardErreur.hidden,false,'Une vraie panne des indicateurs doit rester signalee');
    assert.equal(dom.dashboardErreurMessage.textContent,'INDICATEURS_INDISPONIBLES');
    assert.equal(errors.length,1);
    console.log('PASS: erreur reelle sur indicateurs toujours visible');
  }
  {
    const {dom}=await simulate({optional:'allowed'});
    assert.equal(dom.dashboardErreur.hidden,true);
    assert.equal(dom.accesOperationnelSection.hidden,false);
    assert.match(dom.accesOperationnelLien.href,/organisation=70/);
    console.log('PASS: acces operationnel fonctionne quand autorise');
  }
  {
    const {dom}=await simulate({optional:'denied'});
    assert.equal(dom.dashboardErreur.hidden,true);
    assert.equal(dom.accesOperationnelSection.hidden,true);
    console.log('PASS: acces operationnel refuse sans alerte de panne generale');
  }
  assert.match(css,/#dashboardErreur\[hidden\]\s*,\s*#dashboardContenu\[hidden\]\s*\{\s*display:\s*none\s*!important\s*;/);
  assert.match(html,/sateer-consul-finition\.css\?v=5/);
  assert.match(html,/sateer-consul-finition\.js\?v=5/);
  console.log('PASS: panneaux masques resistent aux anciens styles; assets actualises');
  console.log('BORDEAUX_CONSUL_STATUT_PASS : 5/5, aucune ecriture DB');
})().catch(e=>{console.error(e);process.exitCode=1;});
