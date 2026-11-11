/* SATEER P3.3.5N — registre autonome fondé sur P3.3.5L2 — consultation des dossiers par un superviseur autorisé.
   Lecture seule ; contrôle des permissions uniquement côté serveur. */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const labelStatut = { NOUVELLE: 'Nouvelle', EN_COURS: 'En cours', TRAITEE: 'Traitée' };
  const labelAction = {
    CREATION: 'Demande créée', ORIENTATION: 'Orientation automatique', ORIENTATION_AUTOMATIQUE: 'Orientation automatique',
    PRISE_EN_CHARGE: 'Prise en charge', REPONSE_ENVOYEE: 'Message envoyé',
    DOCUMENT_PRET_CONFIRME: 'Document prêt au retrait', DOCUMENT_REMIS_CONFIRME: 'Document remis',
    DOCUMENT_REMIS: 'Document remis', PIECES_TRANSMISES: 'Pièces transmises', AFFECTATION: 'Affectation', ROUTAGE: 'Dossier orienté'
  };
  const labelMessage = { REPONSE: 'Information de suivi', DOCUMENT_PRET: 'Confirmation de disponibilité', DOCUMENT_REMIS: 'Remise du document' };
  const create = (tag, text, klass) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = String(text); if (klass) n.className = klass; return n; };
  const add = (parent, tag, text, klass) => { const n=create(tag,text,klass);parent.appendChild(n);return n; };
  const date = value => { if (!value) return 'Date indisponible'; const d = new Date(value); return Number.isNaN(d.getTime()) ? 'Date indisponible' : new Intl.DateTimeFormat('fr-FR',{dateStyle:'short',timeStyle:'short'}).format(d); };
  const author = value => [value?.auteur_prenom,value?.auteur_nom].filter(Boolean).join(' ') || 'Auteur non renseigné';
  const statusText = s => labelStatut[s] || String(s || '—');
  const replace = node => { node.replaceChildren();return node; };
  const number = v => String(Number(v)||0);
  let page=1, seq=0, detailSeq=0;
  let orgId=null, tenant=null, panel=null, list=null, feedback=null, detail=null;
  let q=null, statut=null, categorie=null, unite=null, orientation=null, urgence=null, tri=null, previous=null, next=null;
  const endpoint = '/api/pilot-procedures/supervision';
  const context = extra => new URLSearchParams({organisationId:String(orgId),tenant,...extra});
  async function api(url) {
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
    if (!response.ok) {const e=new Error(response.status===403?'Accès au pilotage refusé.':`Lecture indisponible (HTTP ${response.status}).`);e.httpStatus=response.status;throw e;}
    return response.json();
  }
  function select(name, first) {
    const wrapper=add(panel.querySelector('.sx-l2-filters'),'label',name);
    const sel=add(wrapper,'select');sel.appendChild(new Option(first,''));return sel;
  }
  function appendOption(sel,label,value) { sel.appendChild(new Option(label,String(value))); }
  function badge(parent, value) {add(parent,'span',statusText(value),'sx-l2-badge sx-l2-'+String(value||'autre').toLowerCase());}
  function updateRecent(rows) {
    const target=document.getElementById('sx-p2-latest');if(!target)return;
    replace(target);
    for(const d of rows.slice(0,5)){
      const row=add(target,'div',undefined,'sx-p2-row sx-l2-recent');
      const button=add(row,'button',`Dossier n°${d.id} · ${d.objet||d.categorie||'Demande'}`,'sx-l2-recent-btn');
      button.type='button';button.addEventListener('click',()=>openDetail(d.id));
      add(row,'small',`${statusText(d.statut)} · ${date(d.date_modification||d.date_creation)}`);
    }
    if(!rows.length)add(target,'p','Aucun dossier récent.','sx-p2-empty');
  }
  function renderRows(data) {
    const items=Array.isArray(data.dossiers)?data.dossiers:[];
    replace(list);
    // Une seule table synthétique et accessible. Le détail reste une lecture sécurisée.
    if(items.length){
      const table=add(list,'table',undefined,'sx-m3-table');
      add(table,'caption','Dossiers du Consulat, triés par dernière activité','sx-m3-sr-only');
      const trHead=add(add(table,'thead'),'tr');
      ['Dossier','Demandeur','Bureau','État','Dernière activité'].forEach(name=>{
        const th=add(trHead,'th',name);th.scope='col';
      });
      const tbody=add(table,'tbody');
      for(const dossier of items){
        const row=add(tbody,'tr');
        const cell=(label)=>{const td=add(row,'td');td.setAttribute('data-label',label);return td;};
        const dossierCell=cell('Dossier');
        const title=add(dossierCell,'button',`n°${dossier.id} — ${dossier.objet||'Demande sans objet'}`,'sx-l2-case-link');
        title.type='button';title.addEventListener('click',()=>openDetail(dossier.id));
        add(dossierCell,'small',dossier.categorie||'Démarche non précisée');
        const who=cell('Demandeur');
        add(who,'span',[dossier.prenom,dossier.nom].filter(Boolean).join(' ')||'Citoyen');
        add(cell('Bureau'),'span',dossier.unitName||'Bureau non affecté');
        const state=cell('État');badge(state,dossier.statut);
        if(dossier.priorite==='URGENTE')add(state,'span','Urgent','sx-m3-urgent');
        add(cell('Activité'),'span',date(dossier.date_modification||dossier.date_creation));
      }
    }else add(list,'p','Aucun dossier ne correspond à ces critères.','sx-l2-empty sx-m3-empty');
    const total=Number(data.total)||0;
    feedback.textContent=`${total} dossier${total>1?'s':''} · Page ${data.page} sur ${Math.max(1,Math.ceil(total/data.pageSize))}`;
    previous.disabled=page<=1;
    next.disabled=page*data.pageSize>=total;
  }
  async function loadList() {
    const n=++seq;
    feedback.textContent='Recherche des dossiers…';
    try{
      const params=context({page:String(page)});
      if(q.value.trim())params.set('q',q.value.trim());
      if(statut.value)params.set('statut',statut.value);
      if(categorie.value)params.set('categorie',categorie.value);
      if(unite.value)params.set('unitId',unite.value);
      if(orientation.value)params.set('orientation',orientation.value);
      if(urgence.value)params.set('urgence',urgence.value);
      if(tri.value)params.set('tri',tri.value);
      const data=await api(endpoint+'/dossiers?'+params);
      if(n!==seq)return;
      if(data.statut!=='DOSSIERS_SUPERVISION')throw Error('Format de liste inattendu.');
      panel.hidden=false;
      renderRows(data);
      if(page===1&&!q.value.trim()&&!statut.value&&!categorie.value&&!unite.value)updateRecent(data.dossiers);
    }catch(err){
      if(n!==seq)return;
      const status=document.getElementById('sx-n-register-status');
      if(err.httpStatus===403||err.httpStatus===401){panel.hidden=true;if(status)status.textContent='Accès au registre non autorisé pour ce compte.';}
      else {panel.hidden=false;feedback.textContent='Impossible de charger les dossiers : '+err.message;}
    }
  }
  function eventCard(container,title,meta,body,cls) {
    const card=add(container,'article',undefined,'sx-l2-event'+(cls?' '+cls:''));
    add(card,'strong',title);
    add(card,'small',meta);
    if(body)add(card,'p',body,'sx-l2-body');
    return card;
  }
  function renderDetail(data){
    const d=data.dossier;
    replace(detail);
    const head=add(detail,'header',undefined,'sx-l2-detail-head');
    const text=add(head,'div');
    add(text,'p',`DOSSIER N°${d.id} · LECTURE SEULE`,'sx-l2-eyebrow');
    add(text,'h3',d.objet||'Dossier consulaire');
    const close=add(head,'button','Fermer','sx-l2-small-btn');
    close.type='button';close.addEventListener('click',()=>{detail.hidden=true;replace(detail);});
    const summary=add(detail,'div',undefined,'sx-l2-detail-summary');
    badge(summary,d.statut);
    if(d.documentStatut==='PRET_A_RETIRER')add(summary,'span','Document prêt au retrait','sx-l2-doc-badge');
    if(d.documentStatut==='REMIS')add(summary,'span','Document remis','sx-l2-doc-badge');
    add(detail,'p',`${[d.prenom,d.nom].filter(Boolean).join(' ')} · ${d.unitName||'Sans bureau'} · ${d.categorie||'Sans démarche'}`,'sx-l2-muted');
    const tabs=add(detail,'div',undefined,'sx-l2-tabs');
    const msgButton=add(tabs,'button',`Messages (${data.messages.length})`);
    const histButton=add(tabs,'button',`Historique (${data.historique.length})`);
    const content=add(detail,'div',undefined,'sx-l2-detail-body');
    function messages(){
      replace(content);msgButton.setAttribute('aria-pressed','true');histButton.setAttribute('aria-pressed','false');
      if(!data.messages.length)add(content,'p','Aucun message envoyé au citoyen.','sx-l2-empty');
      data.messages.forEach(m=>{
        const type=labelMessage[m.type]||'Message';
        const card=eventCard(content,type,author(m)+' · '+date(m.date_creation),'','sx-l2-message');
        const pre=add(card,'p',m.contenu||'—','sx-l2-message-content');pre.style.whiteSpace='pre-wrap';
      });
    }
    function history(){
      replace(content);msgButton.setAttribute('aria-pressed','false');histButton.setAttribute('aria-pressed','true');
      if(!data.historique.length)add(content,'p','Aucun événement.','sx-l2-empty');
      data.historique.forEach(h=>{
        const name=labelAction[h.action]||String(h.action||'Événement').replaceAll('_',' ').toLowerCase();
        const change=h.ancien_statut&&h.nouveau_statut&&h.ancien_statut!==h.nouveau_statut
          ? ` · ${statusText(h.ancien_statut)} → ${statusText(h.nouveau_statut)}` : '';
        eventCard(content,name,author(h)+' · '+date(h.date_action)+change,h.commentaire||'','sx-l2-history');
      });
    }
    msgButton.type='button';histButton.type='button';
    msgButton.addEventListener('click',messages);histButton.addEventListener('click',history);messages();
    add(detail,'p','Journal en lecture seule. Les pièces personnelles ne sont pas affichées.','sx-l2-footer');
    detail.hidden=false;
    detail.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function openDetail(id){
    const n=++detailSeq;detail.hidden=false;replace(detail);
    add(detail,'p',`Chargement du dossier n°${id}…`,'sx-l2-muted');
    try{
      const data=await api(endpoint+'/dossiers/'+encodeURIComponent(id)+'?'+context());
      if(n!==detailSeq)return;
      if(data.statut!=='DETAIL_SUPERVISION'||Number(data.dossier?.id)!==Number(id))throw Error('Détail inattendu.');
      renderDetail(data);
    }catch(err){if(n===detailSeq){replace(detail);add(detail,'p','Détail non disponible : '+err.message,'sx-l2-error');}}
  }
  async function init() {
    if(!document.body.classList.contains('sateer-vice'))return;
    const root=document.getElementById('sx-p2-root');if(!root||document.getElementById('sx-l2-cases'))return;
    const qs=new URLSearchParams(location.search);
    const contextValue=await window.SATEER_CONTEXT_READY;
    const preferred=Number(qs.get('organisation'))||null;
    const org=await window.SATEER_choisirOrganisation(preferred,'CONSULAT');
    if(!org)return;
    orgId=Number(org.id);
    tenant=String(org.tenant_code||qs.get('tenant')||contextValue?.tenantCode||'');
    if(!Number.isSafeInteger(orgId)||orgId<=0||!tenant|| (org.tenant_code&&qs.get('tenant')&&org.tenant_code!==qs.get('tenant')))return;
    panel=create('section',undefined,'sx-p2-block sx-l2-panel');panel.id='sx-l2-cases';panel.hidden=true;
    const header=add(panel,'div',undefined,'sx-l2-header');
    const title=add(header,'div');add(title,'p','PILOTAGE · CONSULTATION AUTORISÉE','sx-l2-eyebrow');
    add(title,'h2','Tous les dossiers');
    add(title,'p','Recherche, filtres et journal des actions. Consultation sans modification.','sx-l2-muted');
    const reload=add(header,'button','Actualiser','sx-l2-small-btn');reload.type='button';reload.addEventListener('click',loadList);
    const filters=add(panel,'div',undefined,'sx-l2-filters');
    const searchLabel=add(filters,'label','Rechercher');q=add(searchLabel,'input');q.type='search';q.placeholder='N° dossier, citoyen ou objet';q.maxLength=100;
    statut=select('Statut','Tous les statuts');
    [['Nouvelle','NOUVELLE'],['En cours','EN_COURS'],['Traitée','TRAITEE']].forEach(([name,val])=>appendOption(statut,name,val));
    categorie=select('Démarche','Toutes les démarches');
    unite=select('Bureau','Tous les bureaux');
    orientation=select('Prise en charge','Toutes les étapes');
    [['À orienter','A_ORIENTER'],['Orientée, en attente d’un agent','ATTENTE_AGENT']].forEach(([name,val])=>appendOption(orientation,name,val));
    urgence=select('Urgence','Toutes les priorités');
    appendOption(urgence,'Urgentes non clôturées','1');
    tri=select('Trier par','Activité récente');
    [['Ancienneté de la demande','ANCIENNETE'],['Urgences en premier','URGENCE']].forEach(([name,val])=>appendOption(tri,name,val));
    feedback=add(panel,'p','Chargement…','sx-l2-feedback');feedback.setAttribute('role','status');
    list=add(panel,'div',undefined,'sx-l2-list');
    const pager=add(panel,'div',undefined,'sx-l2-pagination');
    previous=add(pager,'button','← Précédent');next=add(pager,'button','Suivant →');
    previous.type='button';next.type='button';
    previous.addEventListener('click',()=>{page=Math.max(1,page-1);loadList();});
    next.addEventListener('click',()=>{page++;loadList();});
    detail=add(panel,'section',undefined,'sx-l2-detail');detail.hidden=true;
    const anchor=root.querySelector('#sx-p2-case-lists');
    if(anchor&&anchor.parentElement===root)anchor.insertAdjacentElement('afterend',panel);
    else root.appendChild(panel);
    const action=document.getElementById('sx-p2-demands-action');if(action)action.href='#sx-l2-cases';
    const reset=()=>{page=1;loadList();};
    let timer;
    q.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(reset,300);});
    for(const s of [statut,categorie,unite,orientation,urgence,tri])s.addEventListener('change',reset);
    window.addEventListener('sateer:vice-dashboard-refreshed',()=>{loadList();});
    try{
      const data=await api(endpoint+'/filtres?'+context());
      if(data.statut==='FILTRES_SUPERVISION'){
        for(const cat of (data.categories||[]))appendOption(categorie,cat,cat);
        for(const u of (data.unites||[]))appendOption(unite,u.nom,u.id);
      }
    }catch(err){if(err.httpStatus===401||err.httpStatus===403){panel.hidden=true;return;}}
    if(document.body.classList.contains('sateer-vice-registre')){
      const params=new URLSearchParams(location.search);
      const qs=params.get('q');if(qs)q.value=qs.slice(0,100);
      const st=params.get('statut');if(['NOUVELLE','EN_COURS','TRAITEE'].includes(st))statut.value=st;
      const selected=params.get('unitId');if(selected&&[...unite.options].some(opt=>opt.value===selected))unite.value=selected;
      const cat=params.get('categorie');if(cat&&[...categorie.options].some(opt=>opt.value===cat))categorie.value=cat;
      const step=params.get('orientation');if(step&&[...orientation.options].some(opt=>opt.value===step))orientation.value=step;
      const urgent=params.get('urgence');if(urgent==='1')urgence.value='1';
      const order=params.get('tri');if(order&&[...tri.options].some(opt=>opt.value===order))tri.value=order;
      const back=document.getElementById('sx-n-registry-back');
      if(back)back.href='/dashboard-vice-consul.html?'+new URLSearchParams({organisation:String(orgId),tenant});
    }
    await loadList();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{init().catch(e=>console.error('P335L2 supervision',e));});
  else init().catch(e=>console.error('P335L2 supervision',e));
})();
