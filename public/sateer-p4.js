/* SATEER Pilote P4 — Centre de configuration générique.
 * Seules les actions explicitement connectées à des API existantes sont persistantes.
 * Les règles de réception par sujet et les voix sont des démonstrations locales.
 */
(function () {
  'use strict';
  const root = document.getElementById('sx-p4');
  if (!root) return;
  const $ = id => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const context = { id: null, tenant: null, org: null, units: [], roles: [], permissions: [], capabilities: [] };
  const text = (tag, content, cls) => {
    const el = document.createElement(tag);
    if (content !== undefined) el.textContent = String(content);
    if (cls) el.className = cls;
    return el;
  };
  const erase = el => el.replaceChildren();
  const alertStatus = (message, error=false) => {
    const node = $('sx-p4-status');
    node.textContent = String(message); node.classList.toggle('sx-p4-error', error);
  };
  const api = async (url, method='GET', data) => {
    const response = await fetch(url, {
      method, credentials:'same-origin', cache:'no-store',
      headers: { Accept:'application/json', ...(data ? {'Content-Type':'application/json'} : {}) },
      ...(data ? { body: JSON.stringify(data) } : {})
    });
    const obj = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(`${obj.statut || obj.erreur || 'Accès impossible'} (HTTP ${response.status})`);
    return obj;
  };
  const url = suffix => `/api/organisations/${encodeURIComponent(context.id)}${suffix}${suffix.includes('?')?'&':'?'}tenant=${encodeURIComponent(context.tenant)}`;
  const form = elem => Object.fromEntries(new FormData(elem));
  const opt = (select, id, label) => {
    const o = document.createElement('option'); o.value = String(id); o.textContent=String(label); select.appendChild(o);
  };
  const setOptions = (select, rows, title, current) => {
    const val = current === undefined ? select.value : String(current);
    erase(select); opt(select,'',title);
    rows.forEach(r=>opt(select,r.id,r.nom));
    if ([...select.options].some(x=>x.value===val)) select.value=val;
  };
  function tab(name) {
    const allowed = ['bureaux','roles','permissions','equipes','routage','voix'];
    if (!allowed.includes(name)) return;
    root.querySelectorAll('[data-tab]').forEach(b => {
      const on = b.dataset.tab===name; b.setAttribute('aria-selected',on?'true':'false'); b.tabIndex=on?0:-1;
    });
    root.querySelectorAll('[data-panel]').forEach(p=> {p.hidden=p.dataset.panel!==name;});
    history.replaceState(null,'',`#${name}`);
  }
  root.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click',()=>tab(btn.dataset.tab)));
  root.querySelector('[role=tablist]').addEventListener('keydown',event => {
    if (!['ArrowRight','ArrowLeft'].includes(event.key)) return;
    event.preventDefault(); const btns=[...root.querySelectorAll('[data-tab]')];
    const i=btns.indexOf(document.activeElement); if(i<0)return;
    const next=btns[(i+(event.key==='ArrowRight'?1:-1)+btns.length)%btns.length];next.focus();tab(next.dataset.tab);
  });
  function visibleUnits() { return context.units.filter(u=>u.actif!==false); }
  function unitLine(unit, all, seen=new Set()) {
    if(seen.has(Number(unit.id)))return text('p','Rattachement circulaire détecté','sx-p4-warning');
    const branch=document.createElement('li');
    const line=text('div',undefined,'sx-p4-unit-line');
    const button=text('button',unit.nom,'sx-p4-unit-button'); button.type='button';
    button.title='Afficher ce bureau dans le formulaire de modification';
    button.addEventListener('click',()=> { $('sx-p4-edit-select').value=String(unit.id); unitSelected(); });
    const code=text('small',unit.type || 'Unité');line.append(button);branch.appendChild(line);
    const children=all.filter(u=>Number(u.parent_unit_id)===Number(unit.id));
    if(children.length){const ul=document.createElement('ul');const next=new Set([...seen,Number(unit.id)]);
      children.forEach(child=>ul.appendChild(unitLine(child,all,next)));branch.appendChild(ul);}
    return branch;
  }
  function showStructure() {
    const all=visibleUnits(); const target=$('sx-p4-tree');erase(target);
    const roots=all.filter(u=>!u.parent_unit_id || !all.some(x=>Number(x.id)===Number(u.parent_unit_id)));
    if(!roots.length){target.appendChild(text('p','Aucune unité active.'));} else {
      const tree=document.createElement('ul');roots.forEach(r=>tree.appendChild(unitLine(r,all)));target.appendChild(tree);
    }
    const unitRows=all.map(u=>({id:u.id,nom:u.nom}));
    for(const id of ['sx-p4-edit-select','sx-p4-team-unit','sx-p4-demo-unit'])setOptions($(id),unitRows,'Sélectionner un bureau');
    setOptions($('sx-p4-new-parent'),unitRows,'Choisir un bureau responsable');
    setOptions($('sx-p4-move-parent'),unitRows,'Sans parent');
    unitSelected(); loadTeam(); routePreview();
  }
  async function loadStructure(){
    const data=await api(url('/structure'));
    context.units=Array.isArray(data.units)?data.units:[];
    $('sx-p4-org').textContent=data.organisation?.nom || context.org?.nom || 'Organisation autorisée';
    showStructure();
  }
  function unitSelected(){
    const chosen=context.units.find(u=>String(u.id)===$('sx-p4-edit-select').value);
    const selectedTitle = $('sx-p51-selected-name');
    if(selectedTitle)selectedTitle.textContent = chosen ? chosen.nom : 'Choisir un bureau dans la liste';
    $('sx-p4-edit-name').value=chosen?.nom || '';
    $('sx-p4-edit-mission').value=chosen?.metadata?.mission || '';
    $('sx-p4-move-parent').value=chosen?.parent_unit_id?String(chosen.parent_unit_id):'';
    const p5Open = $('sx-p5-open-workspace');
    if (p5Open) p5Open.disabled = !chosen || chosen.actif === false;
    // L'interface ne permet pas de déplacer une unité sous elle-même.
    [...$('sx-p4-move-parent').options].forEach(o=>{o.disabled=!!chosen && o.value===String(chosen.id);});
  }
  /* SATEER P5: workspace de bureau via permissions existantes */
  const p5Open = document.createElement('button');
  p5Open.id = 'sx-p5-open-workspace';
  p5Open.type = 'button';
  p5Open.className = 'sx-p4-button';
  p5Open.textContent = 'Ouvrir l’espace de travail du bureau sélectionné';
  p5Open.disabled = true;
  p5Open.title = 'Ouvrir la boîte de réception de cette unité si vos droits l’autorisent';
  $('sx-p4-edit-unit').insertAdjacentElement('afterend',p5Open);
  p5Open.addEventListener('click', () => {
    const selected = context.units.find(u => String(u.id) === $('sx-p4-edit-select').value);
    if (!selected || selected.actif === false) return alertStatus('Sélectionnez un bureau actif.', true);
    doAction('Ouverture de l’espace de travail…', async () => {
      // Vérifier le droit réellement accordé à l’acteur, sans le déduire de son rôle affiché.
      await api(url(`/units/${encodeURIComponent(selected.id)}/workspace`));
      const page = new URL('/unit-workspace.html', location.origin);
      page.searchParams.set('organisation', String(context.id));
      page.searchParams.set('unit', String(selected.id));
      page.searchParams.set('tenant', String(context.tenant));
      window.location.assign(page.pathname + page.search);
    });
  });

  $('sx-p4-edit-select').addEventListener('change',unitSelected);
  $('sx-p4-reload').addEventListener('click',()=>doAction('Organigramme actualisé',loadStructure));
  async function doAction(success, fn) {
    try {alertStatus('Opération en cours…'); await fn();alertStatus(success);} catch(e){alertStatus(e.message,true);}
  }
  $('sx-p4-new-unit').addEventListener('submit',event=>{
    event.preventDefault(); const f=event.currentTarget;const d=form(f);
    doAction('Bureau créé. Le schéma a été actualisé.',async()=> {
      const data={code:d.code.trim().toUpperCase(),nom:d.nom.trim(),type:d.type,
        parentUnitId:d.parentUnitId?Number(d.parentUnitId):null,metadata:{mission:(d.mission||'').trim()},tenantCode:context.tenant};
      await api(url('/units'),'POST',data);f.reset();await loadStructure();
    });
  });
  $('sx-p4-edit-unit').addEventListener('submit',event=>{
    event.preventDefault(); const selected=context.units.find(u=>String(u.id)===$('sx-p4-edit-select').value);
    if(!selected)return alertStatus('Sélectionnez un bureau.',true);
    doAction('Bureau modifié.',async()=>{
      await api(url(`/units/${selected.id}`),'PATCH',{
        nom:$('sx-p4-edit-name').value.trim(),type:selected.type,
        metadata:{...(selected.metadata||{}),mission:$('sx-p4-edit-mission').value.trim()},tenantCode:context.tenant
      });await loadStructure();$('sx-p4-edit-select').value=String(selected.id);unitSelected();
    });
  });
  $('sx-p4-move').addEventListener('click',()=>{
    const selected=context.units.find(u=>String(u.id)===$('sx-p4-edit-select').value);
    if(!selected)return alertStatus('Sélectionnez le bureau à déplacer.',true);
    const parent=$('sx-p4-move-parent').value;
    if(parent===String(selected.id))return alertStatus('Une unité ne peut pas être son propre parent.',true);
    if(!confirm(`Modifier le rattachement de « ${selected.nom} » ?`))return;
    doAction('Rattachement modifié.',async()=> {
      await api(url(`/units/${selected.id}/move`),'POST',{parentUnitId:parent?Number(parent):null,tenantCode:context.tenant});
      await loadStructure();$('sx-p4-edit-select').value=String(selected.id);unitSelected();
    });
  });
  function showRoles(){
    const target=$('sx-p4-roles-list');erase(target);
    for(const r of context.roles){
      const card=text('div',undefined,'sx-p4-item');
      const left=document.createElement('div');left.append(text('strong',r.nom),text('small',r.description || (r.actif ? 'Responsabilité active' : 'Responsabilité inactive')));
      card.append(left);target.append(card);
    }
    if(!context.roles.length)target.append(text('p','Aucun rôle configuré.'));
    setOptions($('sx-p4-perm-role'),context.roles.filter(r=>r.actif!==false),'Sélectionner un rôle');
  }
  async function loadRoles(){const data=await api(url('/roles'));
    context.roles=Array.isArray(data.roles)?data.roles:[];showRoles();await loadRolePermissions();}
  $('sx-p4-new-role').addEventListener('submit',event=>{
    event.preventDefault();const f=event.currentTarget;const d=form(f);
    doAction('Rôle créé. Attribuez-lui ensuite ses permissions.',async()=>{
      const result=await api(url('/roles'),'POST',{
        nom:d.nom.trim(),code:d.code.trim().toUpperCase(),scope:d.scope,
        description:(d.description||'').trim(),tenantCode:context.tenant
      });f.reset();await loadRoles();
      if(result.role?.id){$('sx-p4-perm-role').value=String(result.role.id);await loadRolePermissions();}
    });
  });
  async function loadPermissions(){
    const data=await api('/api/permissions'); context.permissions=Array.isArray(data.permissions)?data.permissions:[];
    setOptions($('sx-p4-perm-new'),context.permissions.filter(p=>p.actif!==false).map(p=>({id:p.id,nom:p.nom||p.code})),'Choisir une permission');
  }
  async function loadRolePermissions(){
    const id=$('sx-p4-perm-role').value;const target=$('sx-p4-perms-list');erase(target);
    if(!id){target.append(text('p','Choisissez un rôle.'));return;}
    try {
      const d=await api(url(`/roles/${id}/permissions`));
      const list=Array.isArray(d.permissions)?d.permissions:[];
      if(!list.length){target.append(text('p','Aucune permission active.'));return;}
      for(const p of list){const row=text('div',undefined,'sx-p4-item');
        const div=document.createElement('div');div.append(text('strong',p.nom||p.code),text('small',p.code||''));row.append(div);target.append(row);}
    } catch(e){target.append(text('p',e.message,'sx-p4-warning'));}
  }
  $('sx-p4-perm-role').addEventListener('change',loadRolePermissions);
  $('sx-p4-perm-add').addEventListener('click',()=>{
    const role=$('sx-p4-perm-role').value;const perm=$('sx-p4-perm-new').value;
    if(!role||!perm)return alertStatus('Choisissez un rôle et une permission.',true);
    if(!confirm('Cette permission change les droits effectifs du rôle. Confirmer ?'))return;
    doAction('Permission attribuée. Le backend a vérifié votre autorisation.',async()=>{
      await api(url(`/roles/${role}/permissions`),'POST',{permissionId:Number(perm),tenantCode:context.tenant});
      await loadRolePermissions();
    });
  });
  async function loadCapabilityCatalog(){
    const data=await api(url('/unit-capabilities'));
    context.capabilities=Array.isArray(data.capabilities)?data.capabilities:[];
    setOptions($('sx-p4-capability'),context.capabilities.map(c=>({id:c.id,nom:c.nom||c.code})),'Choisir une capacité');
  }
  async function loadTeam(){
    const id=$('sx-p4-team-unit').value;
    const caps=$('sx-p4-team-caps'),members=$('sx-p4-team-members');erase(caps);erase(members);
    if(!id){caps.append(text('p','Sélectionnez un bureau.'));members.append(text('p','Sélectionnez un bureau.'));return;}
    const [a,b]=await Promise.allSettled([
      api(url(`/units/${id}/capabilities`)),api(url(`/units/${id}/members`))
    ]);
    if(a.status==='fulfilled'){
      const rows=a.value.capabilities || [];
      if(!rows.length)caps.append(text('p','Aucune capacité active.'));
      for(const row of rows){const n=row.nom||row.capability_nom||row.code||row.capability_code||`Capacité #${row.capability_id||row.id}`;
        caps.append(text('div',n,'sx-p4-item'));}
    }else caps.append(text('p',a.reason.message,'sx-p4-warning'));
    if(b.status==='fulfilled'){
      const rows=b.value.membres || [];
      if(!rows.length)members.append(text('p','Aucun membre affecté.'));
      for(const m of rows)members.append(text('div',`${m.prenom||''} ${m.nom||''} · ${m.role_nom||m.role||'Membre'}`.trim(),'sx-p4-item'));
    }else members.append(text('p',b.reason.message,'sx-p4-warning'));
  }
  $('sx-p4-team-unit').addEventListener('change',loadTeam);
  $('sx-p4-cap-add').addEventListener('click',()=>{
    const unit=$('sx-p4-team-unit').value, capability=$('sx-p4-capability').value;
    if(!unit||!capability)return alertStatus('Choisissez un bureau et une capacité.',true);
    if(!confirm('Activer cette capacité sur le bureau sélectionné ?'))return;
    doAction('Capacité activée.',async()=>{
      await api(url(`/units/${unit}/capabilities`),'POST',{capabilityId:Number(capability),tenantCode:context.tenant,configuration:{}});
      await loadTeam();
    });
  });
  function routePreview(){
    const name=$('sx-p4-demo-unit').selectedOptions[0]?.textContent || '';
    const type=$('sx-p4-demo-type').value;
    $('sx-p4-route-preview').textContent=$('sx-p4-demo-unit').value?
      `Demande « ${type} » → bureau « ${name} » après enregistrement.` :
      'Choisissez un bureau et enregistrez votre règle.';
  }
  $('sx-p4-demo-unit').addEventListener('change',routePreview);
  $('sx-p4-demo-type').addEventListener('change',routePreview);
  // Dictée locale navigateur : pas de persistance SATEER. Le fournisseur du navigateur peut traiter la voix.
  let recognition=null;
  const stateVoice= msg => {$('sx-p4-voice-state').textContent=msg;};
  $('sx-p4-listen').addEventListener('click',()=>{
    const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SpeechRecognition)return stateVoice('Dictée non prise en charge par ce navigateur. Essayez Chrome avec un microphone autorisé.');
    if(recognition)return stateVoice('Une dictée est déjà en cours.');
    try{
      const rec=new SpeechRecognition();recognition=rec;rec.lang=$('sx-p4-language').value;rec.continuous=false;rec.interimResults=false;
      rec.onresult=event=>{const sentence=event.results[0]?.[0]?.transcript||'';const target=$('sx-p4-voice-text');
        target.value+=(target.value?' ':'')+sentence;stateVoice('Dictée reçue. Aucun envoi vers SATEER.');};
      rec.onerror=e=>stateVoice(`Reconnaissance interrompue : ${e.error}`);
      rec.onend=()=>{recognition=null;};rec.start();stateVoice('Microphone en cours d’écoute…');
    }catch(e){recognition=null;stateVoice('Impossible de démarrer la dictée : '+e.message);}
  });
  $('sx-p4-stop').addEventListener('click',()=>{
    if(recognition){recognition.stop();recognition=null;}
    if(window.speechSynthesis)window.speechSynthesis.cancel();stateVoice('Lecture et dictée arrêtées.');
  });
  $('sx-p4-speak').addEventListener('click',()=>{
    if(!('speechSynthesis' in window))return stateVoice('Synthèse vocale non prise en charge.');
    const input=$('sx-p4-voice-text').value.trim();if(!input)return stateVoice('Saisissez ou dictez d’abord un texte.');
    window.speechSynthesis.cancel();const utter=new SpeechSynthesisUtterance(input.slice(0,1500));
    utter.lang=$('sx-p4-language').value;window.speechSynthesis.speak(utter);stateVoice('Lecture du texte démarrée.');
  });
  $('sx-p4-clear').addEventListener('click',()=>{$('sx-p4-voice-text').value='';stateVoice('Notes effacées.');});
  /* SATEER P5.1 : interface guidée, sans privilège supplémentaire. */
  const p51WorkspaceSlot = $('sx-p51-workspace-slot');
  const p51ExistingButton = $('sx-p5-open-workspace');
  if (p51WorkspaceSlot && p51ExistingButton) p51WorkspaceSlot.appendChild(p51ExistingButton);
  // L'utilisateur ne remplit jamais les codes internes. Ils sont uniques, sans valeur métier codée en dur.
  function p51Code(prefix, nom) {
    const slug = String(nom||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,36) || 'NOUVEAU';
    const suffix = window.crypto && window.crypto.getRandomValues
      ? Array.from(window.crypto.getRandomValues(new Uint8Array(4))).map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase()
      : Date.now().toString(36).toUpperCase();
    return `${prefix}_${slug}_${suffix}`;
  }
  $('sx-p4-new-unit').addEventListener('submit', () => {
    const f = $('sx-p4-new-unit'); f.elements.namedItem('code').value = p51Code('B', f.elements.namedItem('nom').value);
  }, true);
  $('sx-p4-new-role').addEventListener('submit', () => {
    const f = $('sx-p4-new-role'); f.elements.namedItem('code').value = p51Code('R', f.elements.namedItem('nom').value);
  }, true);
  // On conserve le contrôle des droits du serveur avant toute ouverture de l'espace de travail.
  // Ne jamais déduire les autorisations du seul affichage des bureaux.

  async function init(){
    try {
      const ctx=await window.SATEER_CONTEXT_READY;
      const selected=await window.SATEER_choisirOrganisation(qs.get('organisation')||null);
      if(!selected)throw new Error('Choisissez une organisation à laquelle votre compte est rattaché.');
      context.id=Number(selected.id);context.org=selected;context.tenant=ctx.tenantCode;
      // Contrôle serveur VIEW_ORGANISATION avant affichage de la page.
      await loadStructure();
      $('sx-p4-workspace').hidden=false;
      const back=new URL('/dashboard-vice-consul.html',location.origin);
      back.searchParams.set('organisation',String(context.id));back.searchParams.set('tenant',context.tenant);
      $('sx-p4-back').href=back.pathname+back.search;
      const results=await Promise.allSettled([loadRoles(),loadPermissions(),loadCapabilityCatalog()]);
      const errors=results.filter(x=>x.status==='rejected');
      alertStatus(errors.length?`Organisation chargée. Certaines rubriques nécessitent d'autres permissions : ${errors.map(x=>x.reason.message).join(' ; ')}`:
        'Organisation chargée. Vous pouvez consulter vos bureaux et leurs responsabilités.',false);
      tab(['bureaux','equipes','routage','voix'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'bureaux');
    }catch(e){$('sx-p4-workspace').hidden=true;alertStatus(`Accès à la configuration non autorisé ou indisponible : ${e.message}`,true);}
  }
  init();
})();
