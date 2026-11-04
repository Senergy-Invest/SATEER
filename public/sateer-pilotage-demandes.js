/* SATEER Pilote P1 — cockpit de supervision en lecture seule.
 * Aucune donnée personnelle affichée ; aucune mutation, permission ou API modifiée.
 * Reutilise exclusivement le dashboard operationnel existant.
 */
(function () {
  'use strict';
  const normalise = value => {
    const v = Number(value);
    return Number.isFinite(v) && v >= 0 ? Math.trunc(v) : 0;
  };
  const totalise = rows => (Array.isArray(rows) ? rows : []).reduce((s, row) => s + normalise(row.total), 0);
  const fmt = value => new Intl.NumberFormat('fr-FR').format(normalise(value));
  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined') module.exports = { normalise, totalise, fmt };
    return;
  }

  function element(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined && text !== null) el.textContent = String(text);
    if (className) el.className = className;
    return el;
  }

  function cellule(row, text, head) {
    const c = element(head ? 'th' : 'td', text);
    if (head) c.scope = 'col';
    row.appendChild(c);
  }

  function creerPanel() {
    const main = document.querySelector('main.page');
    if (!main || document.getElementById('sx-p1-supervision')) return null;
    const panel = element('section', undefined, 'section sx-p1-cockpit');
    panel.id = 'sx-p1-supervision';
    panel.setAttribute('aria-label', 'Synthèse du pilotage des demandes et communications');
    const head = element('div', undefined, 'sx-p1-head');
    const title = element('div');
    title.appendChild(element('p', 'PILOTAGE · VUE CONSOLIDÉE', 'sx-p1-eyebrow'));
    title.appendChild(element('h2', 'Demandes et diffusion consulaire'));
    title.appendChild(element('p', 'Demandes du circuit consulaire principal, y compris celles traitées par les services. Les dossiers de vérification d’identité et les futurs e-mails ne sont pas encore inclus.', 'sx-p1-sub'));
    const refresh = element('button', 'Actualiser', 'sx-p1-refresh');
    refresh.type = 'button';
    head.append(title, refresh);
    panel.appendChild(head);

    const stats = element('div', undefined, 'sx-p1-kpis');
    for (const [id, label] of [
      ['total', 'Demandes classiques reçues'], ['ouvertes', 'Nouvelles + en cours'],
      ['traitees', 'Demandes traitées'], ['alerte', 'Dossiers à surveiller']
    ]) {
      const card = element('article', undefined, 'sx-p1-kpi');
      card.appendChild(element('span', label));
      const strong = element('strong', '—');
      strong.id = `sx-p1-${id}`;
      card.appendChild(strong);
      stats.appendChild(card);
    }
    panel.appendChild(stats);
    const grid = element('div', undefined, 'sx-p1-grid');
    const left = element('article', undefined, 'sx-p1-card');
    left.appendChild(element('h3', 'Démarches par catégorie'));
    left.appendChild(element('p', 'Les catégories proviennent des dossiers réellement enregistrés. Le circuit de vérification d’identité, distinct, n’est pas encore consolidé ici.', 'sx-p1-sub'));
    const tableWrap = element('div', undefined, 'sx-p1-tablewrap');
    const table = element('table', undefined, 'sx-p1-table');
    const caption = element('caption', 'Répartition des demandes du circuit principal par catégorie et statut');
    const thead = document.createElement('thead');
    const header = document.createElement('tr');
    ['Démarche', 'Total', 'Nouvelles', 'En cours', 'Traitées'].forEach(label => cellule(header, label, true));
    thead.appendChild(header);
    const tbody = document.createElement('tbody');
    tbody.id = 'sx-p1-categories';
    table.append(caption, thead, tbody);
    tableWrap.appendChild(table);
    left.appendChild(tableWrap);
    const categoryNote = element('p', '', 'sx-p1-sub');
    categoryNote.id = 'sx-p1-category-note';
    left.appendChild(categoryNote);
    const right = element('article', undefined, 'sx-p1-card');
    right.appendChild(element('h3', 'Informations officielles'));
    const statLines = element('dl', undefined, 'sx-p1-comms');
    for (const [id, label] of [
      ['publiees', 'Publications publiées'], ['audience', 'Usagers rattachés (audience potentielle)'],
      ['diffusees', 'Statut « diffusée diaspora »']
    ]) {
      statLines.appendChild(element('dt', label));
      const val = element('dd', '—');
      val.id = `sx-p1-${id}`;
      statLines.appendChild(val);
    }
    right.appendChild(statLines);
    right.appendChild(element('p', 'Attention : une publication visible ou marquée « diffusée » ne prouve pas sa réception ni sa lecture par chaque citoyen. Le suivi réel des remises et consultations reste à développer.', 'sx-p1-warning'));
    grid.append(left, right);
    panel.appendChild(grid);
    const status = element('p', 'Chargement des indicateurs…', 'sx-p1-status');
    status.id = 'sx-p1-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    panel.appendChild(status);
    // Respecte les restructurations visuelles des Lots 1J/1K.
    const target = document.getElementById('dernieresDemandes');
    let before = target?.closest('section.section') || null;
    while (before && before.parentElement !== main) before = before.parentElement;
    if (before) main.insertBefore(panel, before);
    else main.appendChild(panel);
    refresh.addEventListener('click', () => charger(panel));
    return panel;
  }

  function remplir(panel, data) {
    const d = data?.demandes || {};
    const rows = Array.isArray(data?.demandesParCategorie) ? data.demandesParCategorie : [];
    // Totaux calculés par le backend sur l'ensemble des demandes de l'organisation.
    panel.querySelector('#sx-p1-total').textContent = fmt(d.total);
    panel.querySelector('#sx-p1-ouvertes').textContent = fmt(normalise(d.nouvelles) + normalise(d.en_cours));
    panel.querySelector('#sx-p1-traitees').textContent = fmt(d.traitees);
    panel.querySelector('#sx-p1-alerte').textContent = fmt(data?.demandesASurveiller?.length);
    panel.querySelector('#sx-p1-publiees').textContent = fmt(data?.publications?.publiees);
    panel.querySelector('#sx-p1-diffusees').textContent = fmt(data?.publications?.diffusees_diaspora);
    panel.querySelector('#sx-p1-audience').textContent = fmt(data?.diaspora?.total_usagers);
    const body = panel.querySelector('#sx-p1-categories');
    body.replaceChildren();
    const sorted = [...rows].sort((a, b) => normalise(b.total) - normalise(a.total));
    for (const item of sorted.slice(0, 40)) {
      const row = document.createElement('tr');
      cellule(row, item.categorie || 'Sans catégorie');
      for (const key of ['total', 'nouvelles', 'en_cours', 'traitees']) cellule(row, fmt(item[key]));
      body.appendChild(row);
    }
    if (!body.childElementCount) {
      const r = element('tr');
      const c = element('td', 'Aucune demande enregistrée pour cette organisation.');
      c.colSpan = 5;
      r.appendChild(c);
      body.appendChild(r);
    }
    const note = panel.querySelector('#sx-p1-category-note');
    note.textContent = rows.length > 40
      ? `40 catégories affichées sur ${rows.length}. Les totaux ci-dessus comprennent toutes les catégories.`
      : `${fmt(totalise(rows))} demandes réparties par catégorie. Le détail individuel reste consultable dans les espaces métier autorisés.`;
    panel.querySelector('#sx-p1-status').textContent = 'Synthèse mise à jour depuis le serveur.';
  }

  async function charger(panel) {
    const status = panel.querySelector('#sx-p1-status');
    const qs = new URLSearchParams(window.location.search);
    const organisationId = Number(qs.get('organisation'));
    try {
      const context = await window.SATEER_CONTEXT_READY;
      const tenant = context?.tenantCode || qs.get('tenant');
      if (!Number.isSafeInteger(organisationId) || organisationId < 1 || !tenant) {
        throw new Error('Organisation/tenant manquant : ouvrez le dashboard depuis votre espace professionnel.');
      }
      status.textContent = 'Actualisation en cours…';
      const res = await fetch(`/api/organisations/${organisationId}/dashboard-operationnel?tenant=${encodeURIComponent(tenant)}`,
        { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401 || res.status === 403) throw new Error('Accès non autorisé au pilotage opérationnel.');
      if (!res.ok) throw new Error(`Indicateurs indisponibles (HTTP ${res.status}).`);
      const data = await res.json();
      if (!data || !data.demandes || !Array.isArray(data.demandesParCategorie)) {
        throw new Error('Le serveur ne fournit pas encore les indicateurs de catégories attendus.');
      }
      remplir(panel, data);
    } catch (err) {
      status.textContent = err?.message || 'Impossible de charger les indicateurs.';
    }
  }

  async function init() {
    if (!document.body.classList.contains('sateer-vice')) return;
    const panel = creerPanel();
    if (panel) await charger(panel);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
