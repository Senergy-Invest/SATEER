'use strict';
// SUNU Courant MVP02-UX-1 — façade adaptative sur le moteur Energy Inventory existant.
// Aucun droit ni identité provenant du navigateur; requêtes toujours contrôlées par Core.
(async function () {
  const ui = window.SATEER_INVENTAIRE_UX;
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  const tenant = params.get('tenant');
  const caseId = params.get('case');
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const query = '?tenant=' + encodeURIComponent(tenant || '');
  let siteId = null;
  let siteType = 'AUTRE';
  let besoins = [];
  let zones = [];
  let selected = null;
  let equipmentKey = null;
  let autoZoneKey = null;
  let formZoneKey = null;
  let sending = false;

  if (tenant) $('retourSunu').href = '/sunu-courant.html' + query;
  if (!ui) { $('contexte').textContent = 'Composant de présentation indisponible.'; return; }

  function feedback(id, text, error) {
    const e = $(id);
    e.textContent = text;
    e.dataset.error = error ? 'true' : 'false';
  }
  function option(text, value) { return new Option(text, value); }
  async function request(method, path, body, key) {
    const headers = {'Accept': 'application/json'};
    if (body) headers['Content-Type'] = 'application/json';
    if (key) headers['Idempotency-Key'] = key;
    const response = await fetch('/api/energy/inventory' + path + query, {
      method, credentials:'same-origin', cache:'no-store', headers,
      body:body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.statut || 'HTTP ' + response.status);
    return data;
  }

  function drawCategories() {
    const container = $('categories');
    container.replaceChildren();
    for (const c of ui.selection(siteType,besoins)) {
      const b = document.createElement('button');
      b.type='button'; b.className='category-card'; b.dataset.category=c.id;
      b.setAttribute('aria-pressed', String(selected===c.id));
      const symbol=document.createElement('span');symbol.className='device-symbol';
      symbol.textContent=c.emoji;symbol.setAttribute('aria-hidden','true');
      const name=document.createElement('span');name.className='category-name';name.textContent=c.nom;
      b.append(symbol,name);
      b.addEventListener('click',()=>selectCategory(c.id));
      container.append(b);
    }
  }
  function selectCategory(id) {
    const c=ui.categorie(id);if (!c) return;
    selected=c.id;equipmentKey=null;autoZoneKey=null;
    drawCategories();
    $('formEquipement').hidden=false;
    $('titreAppareil').textContent=c.nom;
    $('nomEquipement').value=c.nomAppareil || '';
    $('quantiteEquipement').value='1';
    $('puissanceEquipement').value='';
    $('optionsAvancees').open=false;
    feedback('messageEquipement','',false);
    $('nomEquipement').focus();
    $('formEquipement').scrollIntoView({block:'nearest',behavior:'auto'});
  }
  $('changerCategorie').addEventListener('click',()=>{
    selected=null;equipmentKey=null;autoZoneKey=null;$('formEquipement').hidden=true;
    drawCategories();$('ajoutTitre').focus?.();
  });

  function renderPlaces() {
    const place=$('zoneEquipement');const prior=place.value;
    place.replaceChildren(option('Peu importe pour le moment',''));
    for (const z of zones) place.append(option(z.nom + ' · ' + z.typeZone.toLowerCase(),z.id));
    if ([...place.options].some(o=>o.value===prior)) place.value=prior;
    updateParents();
  }
  function updateParents() {
    const type=$('typeZone').value;
    const parent=$('parentZone');const prior=parent.value;
    parent.replaceChildren();
    const allowed = type==='ETAGE'?['BATIMENT']:
      type==='PIECE'?['BATIMENT','ETAGE']:
      type==='ZONE'?['BATIMENT','ETAGE','PIECE','EXTERIEUR']:[];
    if (!allowed.length) { parent.append(option('Racine du site','')); parent.disabled=true; return; }
    parent.disabled=false;
    for (const z of zones.filter(z=>allowed.includes(z.typeZone))) parent.append(option(z.nom + ' · ' + z.typeZone,z.id));
    if ([...parent.options].some(o=>o.value===prior)) parent.value=prior;
    if (!parent.options.length) parent.append(option('Créez d’abord un bâtiment ou un extérieur',''));
  }
  $('typeZone').addEventListener('change',updateParents);

  function renderEquipments(equipements) {
    const list=$('listeEquipements');list.replaceChildren();
    $('compteurAppareils').textContent=String(equipements.reduce((sum,e)=>sum+Number(e.quantite||0),0));
    $('emptyEquipements').hidden=equipements.length>0;
    for (const e of equipements) {
      const li=document.createElement('li');li.className='equipment-card';
      const icon=document.createElement('span');icon.className='device-symbol';icon.setAttribute('aria-hidden','true');
      const low=String(e.nom||'').toLowerCase();
      icon.textContent=low.includes('ventilat')?'🌀':low.includes('télé')?'📺':ui.libre(e.famille).emoji;
      const body=document.createElement('div');
      const name=document.createElement('h3');name.textContent=e.nom;
      const qty=document.createElement('p');qty.textContent=Number(e.quantite)>1?e.quantite+' appareils de ce type':'1 appareil';
      const state=document.createElement('p');state.className='declared';state.textContent='✓ Enregistré · donnée déclarée';
      body.append(name,qty,state);li.append(icon,body);list.append(li);
    }
  }

  async function reload() {
    const data=await request('GET','/sites/'+encodeURIComponent(siteId));
    if (!data.site||data.site.energyCaseId!==caseId) {
      $('inventaire').hidden=true;$('contexte').textContent='Ce dossier ne correspond pas au site demandé.';return;
    }
    siteType=data.site.typeSite||'AUTRE';zones=data.zones||[];
    const equipements=data.equipements||[];
    $('inventaire').hidden=false;
    $('contexte').textContent='Dossier privé actif · '+data.site.nom+' · '+data.site.pays;
    $('nomSite').textContent=ui.nomProfil(siteType)+' · '+data.site.nom;
    $('resume').textContent=equipements.length+' ligne(s) enregistrée(s)'+(data.listePartielle?' · affichage partiel (limite technique)':'');
    renderPlaces();renderEquipments(equipements);
    const list=$('listeZones');list.replaceChildren();
    for (const z of zones){const li=document.createElement('li');li.textContent=z.nom+' · '+z.typeZone.toLowerCase();list.append(li);}
    if(!zones.length){const li=document.createElement('li');li.textContent='Aucun espace ajouté manuellement.';list.append(li);}
    drawCategories();
  }
  async function ensurePlace(preferred) {
    if (preferred && zones.some(z=>z.id===preferred)) return preferred;
    const found=ui.zoneParDefaut(zones,siteType);
    if (found) return found.id;
    const data=ui.zoneInitiale(siteType);
    if (!autoZoneKey) autoZoneKey=crypto.randomUUID();
    const created=await request('POST','/sites/'+encodeURIComponent(siteId)+'/zones',data,autoZoneKey);
    if (!created.id||!UUID.test(created.id))throw new Error('EMPLACEMENT_NON_CONFIRME');
    zones.push({id:created.id,...data});autoZoneKey=null;
    return created.id;
  }
  $('formEquipement').addEventListener('input',()=>{if (!sending) equipmentKey=null;});
  $('formEquipement').addEventListener('change',()=>{if (!sending) equipmentKey=null;});
  $('formEquipement').addEventListener('submit',async event=>{
    event.preventDefault();if (sending||!siteId||!selected) return;
    const f=$('formEquipement');const data=new FormData(f);
    const zone=data.get('zoneId');const name=data.get('nom');const q=data.get('quantite');const w=data.get('puissance');
    if (typeof name!=='string'||!name.trim()) {feedback('messageEquipement','Donnez un nom simple à cet appareil.',true);return;}
    sending=true;$('saveEquipement').disabled=true;
    feedback('messageEquipement','Enregistrement en cours…',false);
    try{
      // Valider la saisie AVANT de créer automatiquement un espace en base.
      const preliminary=ui.saisieEquipement({categorieId:selected,nom:name,quantite:q,
        zoneId:'11111111-1111-4111-8111-111111111111',puissance:w});
      if (!preliminary) {feedback('messageEquipement','Vérifiez le nom, la quantité et les détails facultatifs.',true);return;}
      const zoneId=await ensurePlace(zone);
      const payload={...preliminary,zoneId};
      if (!equipmentKey) equipmentKey=crypto.randomUUID();
      await request('POST','/sites/'+encodeURIComponent(siteId)+'/equipements',payload,equipmentKey);
      equipmentKey=null;
      await reload();
      selected=null;drawCategories();f.hidden=true;
      feedback('messageCategorie','Appareil enregistré. Vous pouvez en ajouter un autre, ou revenir plus tard.',false);
      $('collectionTitre').scrollIntoView({block:'nearest',behavior:'auto'});
    }catch(e){feedback('messageEquipement','Enregistrement non confirmé : '+e.message+'. Réessayez sans effacer votre saisie.',true);}
    finally{sending=false;$('saveEquipement').disabled=false;}
  });
  $('formZone').addEventListener('input',()=>{formZoneKey=null;});
  $('formZone').addEventListener('change',()=>{formZoneKey=null;});
  $('formZone').addEventListener('submit',async event=>{
    event.preventDefault();const form=$('formZone');
    const data=new FormData(form);const type=data.get('typeZone');const parent=$('parentZone');
    if (parent.disabled===false && !parent.value) {feedback('messageZone','Choisissez un espace parent valide.',true);return;}
    const payload={typeZone:type,nom:data.get('nom'),parentId:parent.disabled?null:parent.value};
    if (!formZoneKey) formZoneKey=crypto.randomUUID();$('saveZone').disabled=true;
    try{
      await request('POST','/sites/'+encodeURIComponent(siteId)+'/zones',payload,formZoneKey);
      formZoneKey=null;form.reset();feedback('messageZone','Espace enregistré.',false);await reload();
    }catch(e){feedback('messageZone','Impossible de créer cet espace : '+e.message,true);}
    finally{$('saveZone').disabled=false;}
  });
  $('creerSite').addEventListener('click',async()=>{
    $('creerSite').disabled=true;
    try{
      const data=await request('POST','/sites',{energyCaseId:caseId});
      if (!data.site?.id||!UUID.test(data.site.id))throw new Error('SITE_NON_CONFIRME');
      siteId=data.site.id;$('creerSite').hidden=true;await reload();
    }catch(e){$('contexte').textContent='Création non confirmée : '+e.message;}
    finally{$('creerSite').disabled=false;}
  });
  try {
    const ctx=await window.SATEER_CONTEXT_READY;
    if (!tenant||!UUID.test(caseId||'')) { $('contexte').textContent='Lien incomplet : dossier ou tenant invalide.'; return; }
    if (!(ctx.organisations||[]).some(o=>o.tenant_code===tenant)) {
      $('contexte').textContent='Votre compte n’est pas rattaché à cet espace.';return;
    }
    // Récupérer les priorités déclarées au MVP01 ; ne redemander aucun renseignement.
    try {
      const caseResponse=await fetch('/api/energy/cases/'+encodeURIComponent(caseId)+query,{credentials:'same-origin',cache:'no-store'});
      if (caseResponse.ok) {
        const detail=await caseResponse.json();
        if (detail.energyCase?.id===caseId && Array.isArray(detail.energyCase.besoins)) besoins=detail.energyCase.besoins;
      }
    }catch(_){/* L'inventaire privé reste utilisable si le résumé des objectifs est indisponible. */}
    const sites=await request('GET','/sites');
    const current=(sites.sites||[]).find(s=>s.energyCaseId===caseId);
    if (current) {siteId=current.id;await reload();}
    else {$('contexte').textContent='Votre dossier est prêt. Commencez en ajoutant un appareil.';$('creerSite').hidden=false;}
  }catch(e){$('contexte').textContent='Impossible de charger l’inventaire : '+e.message;}
})();
