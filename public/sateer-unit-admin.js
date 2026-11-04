(function () {
  'use strict';
  const root = document.getElementById('sateer-unit-admin');
  if (!root) return;
  const form = document.getElementById('sateer-unit-form');
  const toggle = document.getElementById('sateer-unit-toggle');
  const message = document.getElementById('sateer-unit-result');
  const parent = document.getElementById('sateer-unit-parent');
  const cancel = document.getElementById('sateer-unit-cancel');
  const submit = document.getElementById('sateer-unit-submit');
  let currentOrg = null;
  let currentTenant = null;
  function show(text, error) {
    message.textContent = text;
    message.className = error ? 'sateer-admin-result is-error' : 'sateer-admin-result';
    message.hidden = !text;
  }
  async function loadParents() {
    const response = await fetch(`/api/organisations/${currentOrg}/structure?tenant=${encodeURIComponent(currentTenant)}`, {credentials:'same-origin',cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.statut || 'Impossible de charger les unités');
    const units = Array.isArray(data.units) ? data.units : [];
    parent.replaceChildren();
    const none = new Option('Aucun — unité principale', '');
    parent.add(none);
    units.filter(u => u.actif !== false).forEach(unit => parent.add(new Option(unit.nom, String(unit.id))));
  }
  async function init() {
    try {
      const ctx = await window.SATEER_CONTEXT_READY;
      const requested = new URLSearchParams(location.search).get('organisation');
      const org = await window.SATEER_choisirOrganisation(requested ? Number(requested) : null);
      if (!org) return;
      currentOrg = Number(org.id);
      currentTenant = ctx.tenantCode;
      // This is UI gating only. All write permissions are enforced again by server.
      const access = await fetch(`/api/organisations/${currentOrg}/dashboards/acces?tenant=${encodeURIComponent(currentTenant)}`, {credentials:'same-origin'});
      if (!access.ok) return;
      const data = await access.json();
      const allowed = data.dashboards?.operationnel === true || data.operationnel === true;
      if (!allowed) return;
      root.hidden = false;
      await loadParents();
    } catch (error) { show(`Chargement des commandes indisponible : ${error.message}`, true); }
  }
  toggle.addEventListener('click', () => {
    form.hidden = !form.hidden;
    toggle.setAttribute('aria-expanded', String(!form.hidden));
    if (!form.hidden) document.getElementById('sateer-unit-name').focus();
  });
  cancel.addEventListener('click', () => { form.hidden = true; toggle.setAttribute('aria-expanded','false'); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!currentOrg) return;
    const name = document.getElementById('sateer-unit-name').value.trim();
    const type = document.getElementById('sateer-unit-type').value;
    const rawCode = document.getElementById('sateer-unit-code').value.trim();
    const code = rawCode.toUpperCase().replace(/[^A-Z0-9_]/g,'_');
    const mission = document.getElementById('sateer-unit-mission').value.trim();
    if (!name || !code || !type) return show('Nom, code et type obligatoires.',true);
    const parentUnitId = parent.value ? Number(parent.value) : null;
    submit.disabled = true;
    show('Création en cours…',false);
    try {
      const response = await fetch(`/api/organisations/${currentOrg}/units?tenant=${encodeURIComponent(currentTenant)}`, {
        method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({tenantCode:currentTenant,parentUnitId,nom:name,code,type,metadata:mission?{mission}:{}})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.erreur || data.statut || `HTTP ${response.status}`);
      show(`Unité « ${name} » créée. Organigramme actualisé.`,false);
      form.reset();
      form.hidden = true;
      toggle.setAttribute('aria-expanded','false');
      if (typeof window.chargerOrganisation === 'function') await window.chargerOrganisation();
      await loadParents();
    } catch(error) {show(`Création refusée : ${error.message}`,true);}
    finally {submit.disabled = false;}
  });
  init();
})();
