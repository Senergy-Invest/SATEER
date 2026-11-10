(() => {
  'use strict';
  // P3.3.5Q : une fiche ne devient officielle qu'après validation ET publication.
  // Les données et les droits sont vérifiés par l'API, pas par ces boutons.
  const el = id => document.getElementById(id);
  const pieceNames = {
    CNI_RECTO: 'Carte d’identité : recto', CNI_VERSO: 'Carte d’identité : verso',
    PASSEPORT: 'Ancien passeport / page identité', CARTE_CONSULAIRE: 'Carte consulaire',
    ACTE_NAISSANCE: 'Acte de naissance', JUSTIFICATIF_DOMICILE: 'Justificatif de domicile',
    AUTRE: 'Autre pièce à préciser'
  };
  const statusNames = {BROUILLON:'Brouillon', VALIDEE:'Validée — non publiée',
    PUBLIEE:'Publiée', A_REVALIDER:'À revalider — publication historique non certifiée'};
  let organisation, tenant, records = [], selectedCode = null, busy = false;

  const make = (tag, value) => {
    const node = document.createElement(tag);
    if (value !== undefined) node.textContent = String(value);
    return node;
  };
  const status = (message, error=false) => {
    const node = el('catalogue-status');
    node.textContent = message; node.classList.toggle('error', error);
  };
  const slug = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,58);
  const current = () => records.find(p => p.code === selectedCode) || null;
  async function api(route, options={}) {
    const response = await fetch('/api/pilot-procedures/'+route, {
      credentials:'same-origin',cache:'no-store',...options
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(body.statut || 'HTTP '+response.status);
    return body;
  }
  function updateButtons() {
    const p = current();
    el('proc-validate').disabled = busy || !p || p.etat !== 'BROUILLON';
    el('proc-publish').disabled = busy || !p || p.etat !== 'VALIDEE';
    el('proc-unpublish').disabled = busy || !p || p.etat !== 'PUBLIEE';
    el('proc-save').disabled = busy;
  }
  const fields = el('proc-docs');
  for (const [code, label] of Object.entries(pieceNames)) {
    const row = make('label'); const box = make('input');
    box.type='checkbox'; box.value=code; box.className='p7-piecetype';
    row.append(box, document.createTextNode(label)); fields.append(row);
  }
  function reset() {
    el('catalogue-form').reset(); selectedCode=null;
    el('proc-code').value=''; delete el('proc-code').dataset.fixed;
    el('proc-selected-state').textContent='Nouvelle fiche — brouillon';
    status('Saisissez les informations, puis enregistrez le brouillon.');
    updateButtons();
  }
  function choose(p) {
    selectedCode=p.code; el('proc-code').dataset.fixed='1';
    el('proc-code').value=p.code; el('proc-title').value=p.titre;
    el('proc-cat').value=p.categorie; el('proc-days').value=p.delaiIndicatifJours ?? '';
    el('proc-validated').checked=false;
    fields.querySelectorAll('input').forEach(box => {
      box.checked=(p.piecesObligatoires||[]).includes(box.value);
    });
    el('proc-selected-state').textContent='État : '+(statusNames[p.etat]||p.etat);
    status(p.etat==='A_REVALIDER'
      ? 'Ancienne publication sans validation explicite vérifiable : enregistrer comme brouillon, puis faire valider et publier par une personne habilitée.'
      : 'Pour modifier cette fiche, enregistrez d’abord un brouillon. Toute modification annule la précédente validation et publication.');
    updateButtons(); el('proc-title').focus();
  }
  async function load() {
    const response=await api('administration?'+new URLSearchParams({organisationId:organisation,tenant}));
    records=response.procedures||[];
    const list=el('catalogue-list'); list.replaceChildren();
    if (!records.length) list.append(make('p','Aucune démarche configurée.'));
    for (const p of records) {
      const row=make('article'); row.className='entry';
      const label=make('strong',p.titre+' · '+(statusNames[p.etat]||p.etat));
      const pieces=(p.piecesObligatoires||[]).map(x => pieceNames[x]||x).join(' · ');
      const description=make('p',pieces||'Aucune pièce obligatoire');description.className='muted';
      const button=make('button','Ouvrir la fiche');button.type='button';
      button.addEventListener('click',()=>choose(p));
      row.append(label,description,button);list.append(row);
    }
    updateButtons();
  }
  async function withBusy(task) {
    if (busy) return;busy=true;updateButtons();
    try {await task();}catch(err){status('Opération refusée : '+err.message,true);}
    finally{busy=false;updateButtons();}
  }
  el('proc-new').addEventListener('click',reset);
  el('proc-title').addEventListener('input',()=>{
    if (!el('proc-code').dataset.fixed)el('proc-code').value=slug(el('proc-title').value);
  });
  el('catalogue-form').addEventListener('submit',event=>{
    event.preventDefault();
    withBusy(async()=>{
      const code=el('proc-code').value||slug(el('proc-title').value);
      if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(code))return status('Donnez un nom plus précis à la démarche.',true);
      const old=current();
      if (old?.etat==='PUBLIEE' && !window.confirm('Cette modification retirera immédiatement la fiche de la publication. Continuer ?'))return;
      const pieces=[...fields.querySelectorAll('input:checked')].map(box=>box.value);
      await api('administration/'+encodeURIComponent(code),{
        method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({organisationId:organisation,tenantCode:tenant,
          categorie:el('proc-cat').value,titre:el('proc-title').value.trim(),
          piecesObligatoires:pieces,delaiIndicatifJours:el('proc-days').value||null,
          revision:old?.revision||null})
      });
      selectedCode=code;await load();choose(current());
      status('Brouillon enregistré. La validation institutionnelle puis la publication sont deux étapes distinctes.');
    });
  });
  async function action(suffix,warning,ok) {
    const p=current();
    if (!p)return status('Choisissez une fiche.',true);
    if (!el('proc-validated').checked)return status('Cochez d’abord la confirmation explicite.',true);
    if (!window.confirm(warning))return;
    await withBusy(async()=>{
      await api('administration/'+encodeURIComponent(p.code)+'/'+suffix,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({organisationId:organisation,tenantCode:tenant,
          revision:p.revision,confirmation:true})
      });
      await load();choose(current());status(ok);el('proc-validated').checked=false;
    });
  }
  el('proc-validate').addEventListener('click',()=>action('valider',
    'Je confirme avoir vérifié la liste de cette démarche avec l’autorité consulaire compétente. Valider ?',
    'Fiche validée. Elle reste invisible aux citoyens tant qu’elle n’est pas publiée.'));
  el('proc-publish').addEventListener('click',()=>action('publier',
    'Publier cette fiche validée dans le catalogue des démarches guidées ? Les pièces enregistrées y seront visibles.',
    'Fiche publiée dans le catalogue citoyen authentifié. Aucun e-mail ne sera envoyé automatiquement.'));
  el('proc-unpublish').addEventListener('click',()=>action('retirer',
    'Retirer cette fiche du catalogue citoyen ? Elle ne pourra plus alimenter de brouillon e-mail.',
    'Publication retirée. La validation reste enregistrée.'));
  (async()=>{
    try {
      const contexte=await window.SATEER_CONTEXT_READY;
      const selected=await window.SATEER_choisirOrganisation(Number(new URLSearchParams(location.search).get('organisation'))||null,'CONSULAT');
      if (!contexte?.tenantCode||!selected?.id)throw Error('Organisation non sélectionnée.');
      organisation=selected.id;tenant=contexte.tenantCode;
      el('p7-back').href='/configuration-consulat.html?'+new URLSearchParams({organisation,tenant})+'#routage';
      await load();reset();
    }catch(e){status('Accès aux démarches impossible : '+e.message,true);}
  })();
})();
