/* SATEER Pilote P6.1 — choix multiple recherchable des activités d'un bureau.
 * Appels API séquentiels; les permissions restent intégralement contrôlées par le serveur.
 * Aucun accès à des comptes citoyens ni aux données des dossiers.
 */
(function () {
  'use strict';
  const el = id => document.getElementById(id);
  if (!el('sx-p61-root')) return;
  const find = id => el(id);
  const unitSelect = find('sx-p4-team-unit');
  const search = find('sx-p61-search');
  const container = find('sx-p61-list');
  const info = find('sx-p61-info');
  const save = find('sx-p61-save');
  const selectAll = find('sx-p61-select-visible');
  const clear = find('sx-p61-clear');
  const RECOMMENDED = ['RECEIVE_INCOMING', 'VIEW_INBOX'];
  let organisation = null;
  let tenant = null;
  let catalog = [];
  let active = new Set();
  let checked = new Set();
  let toDisable = new Set(); // Active activities deliberately unchecked by administrator
  let generation = 0;
  let loading = false;
  let saving = false;
  function status(message, error) {
    info.textContent = String(message);
    info.classList.toggle('sx-p61-error', !!error);
  }
  function text(tag, content, cls) {
    const n = document.createElement(tag);
    if (content !== undefined) n.textContent = String(content);
    if (cls) n.className = cls;
    return n;
  }
  function safeId(v) {
    return /^[1-9]\d*$/.test(String(v)) ? String(v) : null;
  }
  async function json(url, method, body) {
    const r = await fetch(url, {
      method: method || 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: {Accept: 'application/json', ...(body ? {'Content-Type': 'application/json'} : {})},
      ...(body ? {body: JSON.stringify(body)} : {})
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.aide || d.statut || d.erreur || `HTTP ${r.status}`);
    return d;
  }
  const endpoint = path => `/api/organisations/${encodeURIComponent(organisation)}${path}${path.includes('?') ? '&' : '?'}tenant=${encodeURIComponent(tenant)}`;
  function keyOf(r) { return String(r.code || r.capability_code || r.capabilityCode || '').toUpperCase(); }
  function nameOf(r) { return String(r.nom || r.capability_nom || r.capabilityNom || r.code || r.capability_code || 'Activité'); }
  function registered(row) {
    // Identifiant de capacité et identifiant d'attribution ne sont pas interchangeables.
    const id = row.capability_id ?? row.capabilityId;
    if (id != null && safeId(id)) return safeId(id);
    const code = keyOf(row);
    if (code) return catalog.find(c => c.code === code)?.id || null;
    return null;
  }
  function visibleCapabilities() {
    const q = search.value.trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return catalog.filter(c => !q || `${c.nom} ${c.code}`.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q));
  }
  function updateControls() {
    const remaining = [...checked].filter(id => !active.has(id));
    const removing = [...toDisable].filter(id => active.has(id));
    const total = remaining.length + removing.length;
    save.disabled = loading || saving || !safeId(unitSelect.value) || !total;
    save.textContent = saving ? 'Enregistrement…' : `Enregistrer ${total} modification${total > 1 ? 's' : ''}`;
    selectAll.disabled = loading || saving || !safeId(unitSelect.value);
    clear.disabled = saving || loading;
  }
  function render() {
    container.replaceChildren();
    const items = visibleCapabilities();
    if (!items.length) container.appendChild(text('p', 'Aucune activité ne correspond à votre recherche.', 'sx-p61-empty'));
    for (const c of items) {
      const row = text('label', undefined, 'sx-p61-line');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = c.id;
      cb.checked = active.has(c.id) ? !toDisable.has(c.id) : checked.has(c.id);
      cb.disabled = loading || saving;
      cb.setAttribute('aria-label', c.nom);
      cb.addEventListener('change', () => {
        if (active.has(c.id)) {
          if (cb.checked) toDisable.delete(c.id); else toDisable.add(c.id);
        } else {
          if (cb.checked) checked.add(c.id); else checked.delete(c.id);
        }
        updateControls();
      });
      const details = text('span', undefined, 'sx-p61-line-description');
      details.appendChild(text('strong', c.nom));
      if (active.has(c.id)) details.appendChild(text('small', toDisable.has(c.id) ? 'Désactivation à confirmer' : 'Déjà activée (décochez pour retirer)', 'sx-p61-active'));
      else if (RECOMMENDED.includes(c.code)) details.appendChild(text('small', 'Nécessaire pour recevoir les demandes', 'sx-p61-recommended'));
      row.append(cb, details);
      container.appendChild(row);
    }
    updateControls();
  }
  async function reload(presetRecommended = true) {
    const token = ++generation;
    const id = safeId(unitSelect.value);
    active = new Set(); checked = new Set(); toDisable = new Set();
    if (!id || !organisation || !tenant) {
      catalog = []; loading = false; render();
      status('Sélectionnez d’abord un bureau pour choisir ses activités.'); return;
    }
    loading = true; render(); status('Chargement des activités du bureau…');
    try {
      const [available, assigned] = await Promise.all([
        json(endpoint('/unit-capabilities')),
        json(endpoint(`/units/${id}/capabilities`))
      ]);
      if (token !== generation || id !== safeId(unitSelect.value)) return;
      const candidates = Array.isArray(available.capabilities) ? available.capabilities : [];
      catalog = candidates.filter(c => c.actif !== false && safeId(c.id)).map(c => ({
        id: safeId(c.id), code: keyOf(c), nom: nameOf(c)
      }));
      catalog.sort((a, b) => {
        const priority = c => RECOMMENDED.includes(c.code) ? RECOMMENDED.indexOf(c.code) : 99;
        return priority(a) - priority(b) || a.nom.localeCompare(b.nom, 'fr');
      });
      const rows = Array.isArray(assigned.capabilities) ? assigned.capabilities : [];
      // En cas de schéma inattendu, ne pas tenter d'activer à l'aveugle.
      for (const r of rows.filter(r => r.actif !== false)) {
        const idActif = registered(r);
        if (!idActif) throw new Error('Impossible de vérifier les activités déjà actives ; aucune modification autorisée.');
        active.add(idActif);
      }
      // No implicit checkmarks: a checked box must always mean active or expressly selected.
      checked = new Set();
      toDisable = new Set();
      status(`${catalog.length} activités disponibles. Cochez pour autoriser et décochez pour désactiver. Les activités essentielles au routage apparaissent en tête.`);
    } catch (e) {
      if (token !== generation) return;
      catalog = []; active = new Set(); checked = new Set(); toDisable = new Set();
      status(`Impossible de charger les activités : ${e.message}`, true);
    } finally {
      if (token === generation) { loading = false; render(); }
    }
  }
  search.addEventListener('input', render);
  unitSelect.addEventListener('change', () => { if (!saving) reload(); });
  selectAll.addEventListener('click', () => {
    for (const c of visibleCapabilities()) {
      if (active.has(c.id)) toDisable.delete(c.id);
      else checked.add(c.id);
    }
    render();
  });
  clear.addEventListener('click', () => { checked.clear(); toDisable.clear(); render(); });
  save.addEventListener('click', async () => {
    if (loading || saving || !organisation || !tenant) return;
    const id = safeId(unitSelect.value);
    if (!id) return status('Choisissez un bureau.', true);
    const selected = catalog.filter(c => checked.has(c.id) && !active.has(c.id));
    const removed = catalog.filter(c => toDisable.has(c.id) && active.has(c.id));
    if (!selected.length && !removed.length) return status('Aucun changement à enregistrer.', true);
    // Refuse local changes which would invalidate an existing P6 routing rule.
    if (removed.some(c => RECOMMENDED.includes(c.code))) {
      try {
        const routing = await json(endpoint('/routing-rules'));
        if (!Array.isArray(routing.regles)) throw Error('Liste de routage indisponible');
        const existing = routing.regles.filter(r => String(r.destinationUnitId) === id && r.actif !== false);
        if (existing.length) return status('Impossible de désactiver la réception : des règles actives dirigent encore des dossiers vers ce bureau. Retirez ou réorientez ces règles dans « Qui reçoit quoi ? » avant de désactiver.', true);
      } catch (e) { return status('Vérification des règles de routage impossible : aucune désactivation de réception effectuée. ' + e.message, true); }
    }
    const detail = [...selected.map(c => '+ ' + c.nom), ...removed.map(c => '− ' + c.nom)].join('\n');
    if (!window.confirm(`Confirmer les modifications pour ce bureau :\n${detail}\n\nLes droits individuels des agents restent distincts.`)) return;
    saving = true; unitSelect.disabled = true; render();
    let succeeded = 0;
    const total = selected.length + removed.length;
    try {
      for (const c of removed) {
        await json(endpoint(`/units/${id}/capabilities/${c.id}/disable`), 'POST', {tenantCode: tenant});
        succeeded++; active.delete(c.id); toDisable.delete(c.id);
        status(`${succeeded}/${total} modification(s) effectuée(s)…`);
      }
      for (const c of selected) {
        await json(endpoint(`/units/${id}/capabilities`), 'POST', {capabilityId: Number(c.id), tenantCode: tenant, configuration: {}});
        succeeded++; active.add(c.id); checked.delete(c.id);
        status(`${succeeded}/${total} modification(s) effectuée(s)…`);
      }
      status(`${succeeded} modification(s) enregistrée(s). Les droits effectifs restent vérifiés par le serveur.`);
      // Refresh the read-only summary. The P6.2 change listener skips its own reload while saving.
      unitSelect.dispatchEvent(new Event('change'));
    } catch (e) {
      status(`Opération partielle : ${succeeded}/${total}. ${e.message}. Relisez l’état réel avant de continuer.`, true);
    } finally {
      saving = false; unitSelect.disabled = false; render();
      // Faire relire la vérité au serveur après tout succès/échec, sans effacer le statut.
      const message = info.textContent, error = info.classList.contains('sx-p61-error');
      await reload(false);
      status(message, error);
      // Actualiser la liste des activités de l'ancien panneau si la page expose cet accès.
      // Le rechargement complet depuis le navigateur reste possible sans redémarrer Node.
    }
  });
  (async function init() {
    try {
      const ctx = await window.SATEER_CONTEXT_READY;
      const qs = new URLSearchParams(window.location.search);
      const selected = await window.SATEER_choisirOrganisation(qs.get('organisation') || null);
      if (!ctx || !selected?.id || !ctx.tenantCode) throw new Error('Ouvrez la configuration depuis votre espace professionnel.');
      organisation = safeId(selected.id); tenant = ctx.tenantCode;
      if (!organisation) throw new Error('Organisation non reconnue.');
      await reload();
    } catch (e) { status(`Configuration indisponible : ${e.message}`, true); updateControls(); }
  })();
})();
