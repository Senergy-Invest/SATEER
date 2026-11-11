'use strict';
/* SATEER P3.3.5O1 — poste de courrier, recette uniquement et lecture seule.
   Toute décision affichée est une simulation de préqualification, jamais une action serveur. */
(() => {
  const core = window.SATEER_MAIL_INTENT;
  const params = new URLSearchParams(location.search);
  const org = params.get('organisation') || params.get('organisationId') || '', tenant = params.get('tenant') || '';
  const valid = /^[1-9][0-9]{0,14}$/.test(org) && /^[A-Z][A-Z0-9_-]{1,49}$/.test(tenant);
  const qs = new URLSearchParams({organisationId:org,tenant});
  const root=document.getElementById('mails'), detail=document.getElementById('detail');
  const status=document.getElementById('status'), count=document.getElementById('mail-count');
  const tabInbox=document.getElementById('tab-inbox'), tabScenarios=document.getElementById('tab-scenarios');
  const back=document.getElementById('back'), consulat=document.getElementById('open-consulat');
  const api='/api/bordeaux-email-demo/messages';
  let stored=[], mode='inbox', active=null, selectionToken=0;
  const text=(tag,value,cls)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(value!==undefined && value!==null)node.textContent=String(value);return node;};
  function add(parent,tag,value,cls){const n=text(tag,value,cls);parent.appendChild(n);return n;}
  function field(parent,label,value){const e=add(parent,'div','','mail-field');add(e,'b',label);add(e,'span',value==null?'—':value);}
  function setStatus(msg,error=false){status.className='mail-status'+(error?' mail-status-error':'');status.textContent=msg;}
  async function request(url){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});if(!(r.headers.get('content-type')||'').includes('application/json'))throw Error('Réponse serveur inattendue');const j=await r.json();if(!r.ok)throw Error(j.statut||'HTTP '+r.status);return j;}
  function introFor(a){
    if(a.intention==='INFORMATION')return 'La question porte sur une information générale. Le mot de la démarche ne suffit pas à créer un dossier ou à transmettre ce courrier au bureau.';
    if(a.intention==='DEMANDE')return 'Intention de dépôt repérée. Un dossier ne peut être créé ni envoyé au bureau sans vérifications et sans règles de routage autorisées.';
    return 'Ce message nécessite une qualification par le secrétariat. Aucune décision automatique de routage ou de réponse.';
  }
  function noteFor(a){
    if(a.intention==='INFORMATION')return 'Étape suivante prévue : retrouver une fiche institutionnelle publiée et une réponse approuvée, puis proposer Mon Consulat. Aucun envoi automatique n’est activé.';
    if(a.intention==='DEMANDE')return 'Étape suivante prévue : contrôle du type de demande et des pièces, puis orientation vers le bureau autorisé. Ce test ne crée aucun dossier.';
    return 'Étape suivante prévue : présenter le message au secrétariat, avec une suggestion IA à confirmer. L’IA opérationnelle n’est pas encore raccordée.';
  }
  function show(msg, fromDemo=false, serverDecision=null, conseilResult=null){
    if(!core){setStatus('Module de qualification indisponible.',true);return;}
    const a=fromDemo?core.qualifier(msg.objet,msg.texte):serverDecision;
    if(!a){setStatus('Préqualification serveur indisponible. Aucune décision affichée.',true);return;}
    detail.replaceChildren();
    const heading=add(detail,'div','','mail-title-row');
    const left=add(heading,'div');add(left,'p',fromDemo?'EXEMPLE DE TEST':'COURRIER FICTIF ENREGISTRÉ','mail-eyebrow');add(left,'h3',msg.objet);
    add(heading,'span',fromDemo?'Scénario synthétique':'Enregistré en recette','mail-tiny');
    const fields=add(detail,'div','','mail-field-row');
    field(fields,'Expéditeur',msg.expediteur);field(fields,'Source',fromDemo?'Cas de démonstration':'Boîte fictive : '+(msg.boite||'CONSULAT_DEMO'));
    add(detail,'div','Contenu du courrier','mail-section-title');add(detail,'div',msg.texte,'mail-quoted');
    const dec=add(detail,'section','','mail-decision');dec.dataset.intention=a.intention;
    add(dec,'span',a.label,'mail-decision-title');add(dec,'p',introFor(a));
    add(dec,'p','Thème détecté : '+a.categorieLibelle,'mail-guide');
    add(dec,'p',noteFor(a),'mail-guide');
    add(dec,'small','Règle : '+a.motif+(fromDemo?' · simulation locale':' · calculée côté serveur')+' · aucune action déclenchée','mail-code');
    if(!fromDemo && msg.uniteSuggeree){
      add(dec,'small','Ancienne suggestion par mot-clé : '+msg.uniteSuggeree+'. Non appliquée : la qualification par intention prévaut dans cette simulation.','mail-code');
    }
    if(a.intention==='INFORMATION'){
      const c=conseilResult?.conseil || null;
      const box=add(detail,'section','','mail-draft');
      add(box,'h3','Vérification de la source officielle');
      if(!c){
        add(box,'p','Aucune information institutionnelle vérifiée pour ce courrier. Aucun brouillon officiel disponible.','mail-guide');
      } else if(c.etat!=='FICHE_VALIDEE_ACTIVE' || !c.fiche){
        add(box,'p','Aucune fiche active et validée ne correspond précisément à cette question. Le secrétariat doit vérifier la démarche avant toute réponse.','mail-guide');
        add(box,'small','État de la recherche : '+c.etat,'mail-code');
      } else {
        add(box,'p','Fiche active et validée : '+c.fiche.titre+' ('+c.fiche.code+').','mail-guide');
        if(c.fiche.pieces?.length){
          const ls=add(box,'ul','','mail-piece-list');
          c.fiche.pieces.forEach(x=>add(ls,'li',x));
        } else add(box,'p','Aucune pièce publiable enregistrée sur cette fiche.','mail-guide');
        add(box,'h3','Proposition de réponse — validation humaine obligatoire');
        add(box,'div',c.brouillon,'mail-draft-preview');
        add(box,'small','La fiche de démarche est validée, mais ce modèle de réponse n’est pas autorisé à l’envoi automatique.','mail-caption');
      }
      if(valid){const link=add(box,'a','Consulter Mon Consulat (parcours authentifié de recette)','mail-link');link.href='/consulat.html?'+new URLSearchParams({organisation:org,tenant});}
      add(box,'small','Aucun lien public vers une fiche précise n’est encore disponible. Aucune réponse n’est envoyée.','mail-caption');
    }
    const reminder=add(detail,'p','Aucun message envoyé, aucun bureau saisi et aucune demande créée par cette action.','mail-caption');reminder.setAttribute('role','note');
    setStatus(fromDemo?'Scénario '+msg.id+' analysé · simulation locale.':'Courrier n°'+msg.id+' vérifié côté serveur · aucune action réelle.');
    root.querySelectorAll('button[data-key]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.key===String(msg.id))));
  }
  function list(){
    root.replaceChildren();active=null;
    tabInbox.setAttribute('aria-pressed',String(mode==='inbox'));
    tabScenarios.setAttribute('aria-pressed',String(mode==='scenarios'));
    const items=mode==='inbox'?stored:core.scenarios;
    if(!items.length){add(root,'p',mode==='inbox'?'Aucun courrier fictif enregistré.':'Aucun scénario.','mail-muted');detail.replaceChildren(add(document.createElement('div'),'p','Aucun courrier à afficher.','mail-muted'));return;}
    for(const item of items){const b=add(root,'button','','mail-item');b.type='button';b.dataset.key=String(item.id);b.setAttribute('aria-pressed','false');
      add(b,'strong',mode==='inbox'?('n°'+item.id+' · '+item.objet):item.objet);
      add(b,'small',item.expediteur+' · '+(mode==='inbox'?'message fictif':'cas '+item.id));
      b.addEventListener('click',()=>mode==='inbox'?loadMail(item):loadScenario(item));
    }
    if(mode==='scenarios')loadScenario(items[0]);
    else loadMail(items[0]);
  }
  async function loadScenario(item){
    const token=++selectionToken;
    try{
      setStatus('Vérification du scénario '+item.id+'…');
      const result=await request('/api/bordeaux-email-demo/scenarios/'+encodeURIComponent(item.id)+'/conseil?'+qs);
      if(token!==selectionToken || mode!=='scenarios')return;
      if(result.statut!=='CONSEIL_SCENARIO' || !result.lectureSeule || result.envoiAutorise!==false)throw Error('SOURCE_NON_VERIFIEE');
      show(item,true,result.decision,result);
    } catch(e){if(token!==selectionToken || mode!=='scenarios')return;detail.replaceChildren();setStatus('Scénario indisponible : '+e.message,true);}
  }
  async function loadMail(m){
    const token=++selectionToken;
    try{
      setStatus('Lecture du courrier n°'+m.id+'…');
      const item=api+'/'+encodeURIComponent(m.id);
      const [result,qualification,conseil]=await Promise.all([
        request(item+'?'+qs),request(item+'/qualification?'+qs),request(item+'/conseil?'+qs)
      ]);
      if(token!==selectionToken || mode!=='inbox')return;
      if(qualification.statut!=='PREQUALIFICATION_SYNTHETIQUE'||!qualification.lectureSeule||!qualification.decision||
         conseil.statut!=='CONSEIL_DE_RECETTE'||conseil.envoiAutorise!==false||!conseil.lectureSeule||
         JSON.stringify(qualification.decision)!==JSON.stringify(conseil.decision))throw Error('CONSEIL_NON_VALIDE');
      show(result.message,false,qualification.decision,conseil);
    } catch(e){if(token!==selectionToken || mode!=='inbox')return;detail.replaceChildren();setStatus('Lecture ou vérification des sources indisponible : '+e.message,true);}
  }
  async function init(){
    if(!core){setStatus('Le module de préqualification ne s’est pas chargé.',true);return;}
    if(!valid){setStatus('Ouvre cette page depuis le pilotage avec organisation et tenant valides.',true);return;}
    // Le retour dépend de l'espace d'origine et n'accorde aucun droit.
    const origine=params.get('retour');
    if(origine==='secretariat'){
      back.href='/secretariat-bordeaux.html?'+new URLSearchParams({organisation:org,tenant});
      back.textContent='← Mon Secrétariat';
    }else if(origine==='vice'){
      back.href='/dashboard-vice-consul.html?'+new URLSearchParams({organisation:org,tenant});
      back.textContent='← Pilotage du Consulat';
    }else{
      back.href='/index.html';back.textContent='← Mon SATEER';
    }
    consulat.href='/consulat.html?'+new URLSearchParams({organisation:org,tenant});
    tabInbox.addEventListener('click',()=>{mode='inbox';list();});
    tabScenarios.addEventListener('click',()=>{mode='scenarios';list();});
    try{const result=await request(api+'?'+qs);stored=result.messages||[];count.textContent=String(stored.length);list();}
    catch(e){count.textContent='—';setStatus('Boîte fictive indisponible : '+e.message,true);if(e.message==='SESSION_REQUISE'){const l=add(status,'a','Se connecter');l.href='/login.html';}mode='scenarios';list();setStatus('Boîte fictive indisponible. Exemples locaux uniquement : '+e.message,true);}
  }
  init();
})();
