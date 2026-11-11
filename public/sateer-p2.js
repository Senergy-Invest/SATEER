/* SATEER Pilote P2 — dashboard condensé du Vice-Consul.
 * UI uniquement : utilise les API protégées existantes. Zéro modification de données.
 */
(function () {
  'use strict';
  const num = value => { const n = Number(value); return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0; };
  const fmt = value => new Intl.NumberFormat('fr-FR').format(num(value));
  const make = (tag, text, cls) => {
    const el = document.createElement(tag);
    if (text !== undefined && text !== null) el.textContent = String(text);
    if (cls) el.className = cls;
    return el;
  };
  const isConnectedAssociation = association =>
    (!association?.type || String(association.type).toUpperCase() === 'ASSOCIATION')
    && association?.relation_statut === 'ACTIVE'
    && association?.relation_active === true;
  const resolveTenant = (organisation, urlTenant, contextTenant) => {
    const orgTenant = String(organisation?.tenant_code || '').trim();
    const requested = String(urlTenant || '').trim();
    if (orgTenant && requested && orgTenant !== requested) {
      throw new Error('Contexte du Consulat incohérent. Retournez à Mon SATEER puis rouvrez cet espace.');
    }
    return orgTenant || requested || String(contextTenant || '').trim();
  };
  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined') module.exports = { num, fmt, isConnectedAssociation, resolveTenant };
    return;
  }
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  const put = (parent, tag, text, cls) => { const el = make(tag, text, cls); parent.appendChild(el); return el; };
  const link = (parent, title, href, cls = 'sx-p2-link') => {
    const a = make('a', title, cls);
    a.href = href;
    parent.appendChild(a);
    return a;
  };
  function frame(main) {
    if (document.getElementById('sx-p2-root')) return null;
    const root = make('section', undefined, 'sx-p2-root');
    root.id = 'sx-p2-root';
    const hero = put(root, 'header', undefined, 'sx-p2-hero');
    put(hero, 'p', 'SATEER  /  PILOTAGE DU CONSULAT', 'sx-p2-eyebrow');
    put(hero, 'h1', 'Vue du Vice-Consul');
    put(hero, 'p', 'Chargement du Consulat…', 'sx-p2-org').id = 'sx-p2-org';
    const actions = put(hero, 'nav', undefined, 'sx-p2-actions');
    actions.setAttribute('aria-label', 'Actions rapides');
    const publish = link(actions, 'Publier une information', '#', 'sx-p2-primary');
    publish.id = 'sx-p2-publish';
    publish.hidden = true; // Montré seulement si le lien d'origine est autorisé.
    const demandsAction = link(actions, 'Suivre les demandes', '#sx-p2-categories', 'sx-p2-secondary');
    demandsAction.id = 'sx-p2-demands-action';
    const catalogueAction = link(actions, 'Catalogue des démarches', '#', 'sx-p2-secondary');
    catalogueAction.id = 'sx-p2-catalogue'; catalogueAction.hidden = true;
    const dispatchAction = link(actions, 'Répartir les dossiers', '#', 'sx-p2-secondary');
    dispatchAction.id = 'sx-p2-dispatch'; dispatchAction.hidden = true;
    const reload = put(actions, 'button', 'Actualiser', 'sx-p2-secondary');
    reload.type = 'button';
    reload.id = 'sx-p2-refresh';

    const status = put(root, 'p', 'Chargement des données…', 'sx-p2-status');
    status.id = 'sx-p2-status'; status.setAttribute('role', 'status');

    const metrics = put(root, 'section', undefined, 'sx-p2-block');
    metrics.id = 'sx-p2-activity';
    put(metrics, 'h2', 'Activité consulaire');
    const cards = put(metrics, 'div', undefined, 'sx-p2-metrics');
    for (const [id, name, hint] of [
      ['new', 'Nouvelles', 'À prendre en charge'], ['doing', 'En cours', 'En traitement'],
      ['done', 'Traitées', 'Clôturées'], ['alert', 'À surveiller', 'Prioritaires']
    ]) {
      const c = put(cards, 'article', undefined, 'sx-p2-metric');
      put(c, 'span', name);
      put(c, 'strong', '—').id = `sx-p2-${id}`;
      put(c, 'small', hint);
    }
    put(metrics, 'p', '', 'sx-p2-footnote').id = 'sx-p2-delay';

    const cols = put(root, 'div', undefined, 'sx-p2-columns');
    const demands = put(cols, 'section', undefined, 'sx-p2-block');
    demands.id = 'sx-p2-categories';
    put(demands, 'h2', 'Demandes par démarche');
    put(demands, 'p', 'Répartition de toutes les demandes classiques de cette organisation.', 'sx-p2-help');
    const tw = put(demands, 'div', undefined, 'sx-p2-table-scroll');
    const table = put(tw, 'table', undefined, 'sx-p2-table');
    const thead = put(table, 'thead');
    const thr = put(thead, 'tr');
    for (const name of ['Démarche', 'Reçues', 'En cours', 'Traitées']) { const th = put(thr, 'th', name); th.scope = 'col'; }
    put(table, 'tbody').id = 'sx-p2-category-rows';
    const comms = put(cols, 'section', undefined, 'sx-p2-block');
    comms.id = 'sx-p2-communication';
    put(comms, 'h2', 'Communication officielle');
    const info = put(comms, 'div', undefined, 'sx-p2-summary');
    for (const [id, label] of [['publications', 'Publications en ligne'], ['users', 'Sénégalais rattachés']]) {
      const item = put(info, 'div', undefined, 'sx-p2-summary-item');
      put(item, 'strong', '—').id = `sx-p2-${id}`;
      put(item, 'span', label);
    }
    put(comms, 'p', 'Les personnes rattachées forment une audience potentielle, pas un comptage de notifications remises.', 'sx-p2-help');
    const commLinks = put(comms, 'div', undefined, 'sx-p2-links');
    const p = link(commLinks, 'Publier une information', '#'); p.hidden = true; p.id = 'sx-p2-publish-secondary';
    // Un seul accès au réseau associatif, dans sa section dédiée ci-dessous.

    const lower = put(root, 'div', undefined, 'sx-p2-columns');
    lower.id = 'sx-p2-case-lists';
    const latest = put(lower, 'section', undefined, 'sx-p2-block');
    put(latest, 'h2', 'Dernières demandes');
    put(latest, 'div', undefined, 'sx-p2-list').id = 'sx-p2-latest';
    const attention = put(lower, 'section', undefined, 'sx-p2-block');
    put(attention, 'h2', 'Dossiers à surveiller');
    put(attention, 'div', undefined, 'sx-p2-list').id = 'sx-p2-attention';

    const operation = put(root, 'div', undefined, 'sx-p2-columns');
    const teams = put(operation, 'section', undefined, 'sx-p2-block');
    teams.id = 'sx-p2-teams-section';
    put(teams, 'h2', 'Activité des services');
    put(teams, 'div', undefined, 'sx-p2-list').id = 'sx-p2-teams';
    const network = put(operation, 'section', undefined, 'sx-p2-block');
    network.id = 'sx-p2-association-section';
    put(network, 'p', 'PARTENAIRES DU CONSULAT', 'sx-p2-section-eyebrow');
    put(network, 'h2', 'Réseau associatif');
    put(network, 'p', 'Associations indépendantes reliées au Consulat, invitations et relais autorisés.', 'sx-p2-help');
    const networkStats = put(network, 'div', undefined, 'sx-p2-network-stats');
    for (const [id, label] of [
      ['associations', 'Associations connectées'],
      ['pending', 'Demandes à examiner'],
      ['relays', 'Relais officiels']
    ]) {
      const item = put(networkStats, 'div', undefined, 'sx-p2-network-stat');
      put(item, 'strong', '—').id = `sx-p2-${id}`;
      put(item, 'span', label);
    }
    put(network, 'div', undefined, 'sx-p2-list sx-p2-network-list').id = 'sx-p2-network';
    const networkLink = link(network, 'Gérer les associations', '#', 'sx-p2-network-cta');
    networkLink.id = 'sx-p2-partners-link';
    networkLink.hidden = true; // Visible uniquement après autorisation API.
    const networkNote = put(network, 'p', '', 'sx-p2-help');
    networkNote.id = 'sx-p2-network-note';

    const admin = put(root, 'details', undefined, 'sx-p2-admin');
    admin.id = 'sx-p2-admin';
    const summary = put(admin, 'summary', 'Administration et réglages');
    summary.setAttribute('aria-label', 'Ouvrir les fonctions administratives');
    const adminLinks = put(admin, 'div', undefined, 'sx-p2-links');
    link(adminLinks, 'Configurer bureaux, rôles, demandes et voix', '/configuration-consulat.html');
    put(admin, 'p', 'Le routage par type de demande et les destinations ciblées des publications ne sont pas encore configurables depuis cet écran.', 'sx-p2-help');
    const existing = document.getElementById('gestionAccesDashboard');
    if (existing) admin.appendChild(existing); // Conserve le formulaire et ses permissions existantes.
    const footer = put(root, 'footer', undefined, 'sx-p2-footer');
    link(footer, '← Mon SATEER', '/index.html');

    main.prepend(root);
    document.body.classList.add('sx-p2-ready');
    return root;
  }

  function showRow(container, name, meta, kind) {
    const row = put(container, 'div', undefined, 'sx-p2-row');
    put(row, 'span', name || 'Sans libellé');
    put(row, 'small', meta || '—', kind === 'warn' ? 'sx-p2-warn' : undefined);
    return row;
  }
  function fillList(id, items, empty, map, limit=6) {
    const parent = document.getElementById(id);
    parent.replaceChildren();
    if (!items.length) { put(parent, 'p', empty, 'sx-p2-empty'); return; }
    items.slice(0, limit).forEach(item => { const [a,b,c] = map(item); showRow(parent,a,b,c); });
    if (items.length > limit) put(parent, 'p', `${fmt(items.length - limit)} autre(s) élément(s).`, 'sx-p2-help');
  }
  function display(data, units) {
    const d = data.demandes || {};
    set('sx-p2-org', data.organisation?.nom || 'Organisation sélectionnée');
    set('sx-p2-new', fmt(d.nouvelles));
    set('sx-p2-doing', fmt(d.en_cours));
    set('sx-p2-done', fmt(d.traitees));
    set('sx-p2-alert', fmt((data.demandesASurveiller || []).length));
    const h = Number(data.delaiTraitement?.heures_moyennes);
    set('sx-p2-delay', Number.isFinite(h) && h > 0 ? `Délai moyen de traitement : ${h.toFixed(1)} h` : 'Délai moyen : non disponible pour la période.');
    const arr = Array.isArray(data.demandesParCategorie) ? data.demandesParCategorie : [];
    const tbody = document.getElementById('sx-p2-category-rows');
    tbody.replaceChildren();
    for (const x of [...arr].sort((a,b) => num(b.total)-num(a.total)).slice(0,15)) {
      const tr = put(tbody, 'tr');
      for (const v of [x.categorie || 'Autre', fmt(x.total), fmt(x.en_cours), fmt(x.traitees)]) put(tr, 'td', v);
    }
    if (!arr.length) { const tr=put(tbody,'tr'); const td=put(tr,'td','Aucune demande classique enregistrée.'); td.colSpan=4; }
    if (arr.length > 15) put(tbody.parentElement.parentElement,'p', `${fmt(arr.length - 15)} catégories supplémentaires non affichées.`, 'sx-p2-help');
    set('sx-p2-publications', fmt(data.publications?.publiees));
    set('sx-p2-users', fmt(data.diaspora?.total_usagers));
    /* SATEER_VICE_P2_REFERENCES_VISIBLES_V1 */
    const refDossier = x => {
      const libelle = x.objet || x.categorie || 'Demande';
      const raw = String(x.id ?? x.demande_id ?? x.demandeId ?? '');
      return /^[1-9][0-9]{0,14}$/.test(raw) ? `Dossier n°${raw} · ${libelle}` : libelle;
    };
    const recent = Array.isArray(data.activiteRecente?.demandes) ? data.activiteRecente.demandes : [];
    fillList('sx-p2-latest', recent, 'Aucune demande récente.', x => [refDossier(x), x.statut || '—']);
    const alerts = Array.isArray(data.demandesASurveiller) ? data.demandesASurveiller : [];
    fillList('sx-p2-attention', alerts, 'Aucun dossier signalé.', x => [refDossier(x), x.priorite || x.statut || 'À vérifier', 'warn']);
    const services = Array.isArray(units) ? units.filter(u => u.canViewAnalytics && (num(u.total_cases) || num(u.urgent_cases))) : [];
    fillList('sx-p2-teams', services.sort((a,b)=>num(b.total_cases)-num(a.total_cases)), 'Aucune activité affectée aux services pour le moment.', u => [u.nom || 'Unité', `${fmt(u.total_cases)} dossiers · ${fmt(u.urgent_cases)} urgents`,num(u.urgent_cases)?'warn':undefined]);
  }
  function setOperationsVisible(allowed) {
    if (!allowed) {
      const catalogue = document.getElementById('sx-p2-catalogue');
      if (catalogue) catalogue.hidden = true;
    }
    for (const id of [
      'sx-p2-activity', 'sx-p2-categories', 'sx-p2-communication',
      'sx-p2-case-lists', 'sx-p2-teams-section', 'sx-p2-admin',
      'sx-p2-demands-action'
    ]) {
      const element = document.getElementById(id);
      if (element) element.hidden = !allowed;
    }
  }

  function displayPartners(data, requests, relays, orgId, tenant) {
    const partnersLink = document.getElementById('sx-p2-partners-link');
    const note = document.getElementById('sx-p2-network-note');
    const query = new URLSearchParams({ organisation: String(orgId), tenant });
    if (!data) {
      set('sx-p2-associations', '—');
      set('sx-p2-pending', '—');
      set('sx-p2-relays', '—');
      set('sx-p2-network', 'Accès au réseau associatif indisponible pour ce compte.');
      partnersLink.hidden = true;
      note.textContent = 'Les chiffres ne sont pas remplacés par des zéros en cas de refus d’accès.';
      return;
    }
    partnersLink.href = '/associations-partenaires.html?' + query.toString();
    partnersLink.hidden = false;
    const list = Array.isArray(data.associations) ? data.associations : [];
    const connected = list.filter(isConnectedAssociation);
    set('sx-p2-associations', fmt(connected.length));
    fillList('sx-p2-network', connected, 'Aucune association actuellement connectée.',
      association => [association.nom, 'Connectée']);
    set('sx-p2-pending', requests && Array.isArray(requests.demandes)
      ? fmt(requests.demandes.length) : '—');
    set('sx-p2-relays', relays && Array.isArray(relays.relais)
      ? fmt(relays.relais.length) : '—');
    const unavailable = [];
    if (!requests) unavailable.push('demandes de rattachement');
    if (!relays) unavailable.push('historique des relais');
    note.textContent = unavailable.length
      ? 'Accès non disponible : ' + unavailable.join(' et ') + '.'
      : 'Les publications restent signées par leur institution d’origine.';
  }

  async function load() {
    const status = document.getElementById('sx-p2-status');
    try {
      status.textContent = 'Actualisation des indicateurs…';
      const context = await window.SATEER_CONTEXT_READY;
      const qs = new URLSearchParams(location.search);
      const preferred = Number(qs.get('organisation')) || null;
      const org = await window.SATEER_choisirOrganisation(preferred, 'CONSULAT');
      if (!org || !Number.isSafeInteger(Number(org.id)) || Number(org.id) < 1) {
        throw Error('Consulat non autorisé ou non sélectionné.');
      }
      const tenant = resolveTenant(org, qs.get('tenant'), context?.tenantCode);
      if (!tenant) throw Error('Tenant indisponible pour le Consulat sélectionné.');
      const orgId = Number(org.id);
      const base = `/api/organisations/${encodeURIComponent(orgId)}`;
      const param = '?tenant=' + encodeURIComponent(tenant);
      set('sx-p2-org', org.nom || 'Consulat sélectionné');
      // Les autorisations sont toujours appliquées par le backend, jamais déduites de l'UI.
      const get = url => fetch(url, { credentials: 'same-origin', cache: 'no-store' });
      const [dashboardResponse, partnersResponse, requestsResponse, relaysResponse] = await Promise.all([
        get(base + '/dashboard-operationnel' + param),
        get(base + '/association-partners' + param),
        get(base + '/association-join-requests' + param),
        get(base + '/association-relay-history' + param)
      ]);
      const readJson = async response => response.ok ? response.json().catch(() => null) : null;
      const [dashboard, partners, requests, relays] = await Promise.all([
        readJson(dashboardResponse), readJson(partnersResponse),
        readJson(requestsResponse), readJson(relaysResponse)
      ]);
      displayPartners(partners, requests, relays, orgId, tenant);
      const adminConfig = document.querySelector('#sx-p2-admin a[href^="/configuration-consulat.html"]');
      if (adminConfig) adminConfig.href = '/configuration-consulat.html?' + new URLSearchParams({organisation: String(orgId), tenant});
      if (!dashboardResponse.ok || !dashboard) {
        setOperationsVisible(false);
        status.textContent = dashboardResponse.status === 403
          ? 'Ce compte n’a pas accès au pilotage opérationnel. Le réseau associatif reste disponible selon ses autorisations.'
          : `Pilotage opérationnel indisponible (HTTP ${dashboardResponse.status}).`;
        return;
      }
      setOperationsVisible(true);
      // Le lien est visible seulement après autorisation réelle de l'API catalogue.
      const catalogueAction = document.getElementById('sx-p2-catalogue');
      let adminAllowed = false;
      try {
        adminAllowed = (await get('/api/pilot-procedures/administration?' +
          new URLSearchParams({organisationId:String(orgId),tenant}))).ok;
      } catch (_) { /* Catalogue indisponible : conserver le tableau de bord. */ }
      if (catalogueAction) {
        catalogueAction.hidden = !adminAllowed;
        if (adminAllowed) catalogueAction.href = '/catalogue-demarches.html?' +
          new URLSearchParams({organisation:String(orgId),tenant});
      }
      const dispatchLink = document.getElementById('sx-p2-dispatch');
      if (dispatchLink) {
        dispatchLink.hidden = true;
        try {
          const access = await get('/api/bordeaux-case-dispatch/access?' +
            new URLSearchParams({organisationId:String(orgId),tenant}));
          if (access.ok) {
            dispatchLink.href = '/repartition-dossiers-bordeaux.html?' +
              new URLSearchParams({organisation:String(orgId),tenant});
            dispatchLink.hidden = false;
          }
        } catch (_) { /* La supervision existante reste utilisable. */ }
      }
      const unitsResponse = await get(base + '/units/overview' + param);
      const unitsData = await readJson(unitsResponse);
      const units = unitsData?.unites || unitsData?.units || (Array.isArray(unitsData) ? unitsData : []);
      display(dashboard, units);
      window.dispatchEvent(new CustomEvent('sateer:vice-dashboard-refreshed', { detail: { organisationId: orgId, tenant } }));
      if (!unitsResponse.ok) set('sx-p2-teams', 'Indicateurs des services non disponibles pour ce compte.');
      status.textContent = 'Indicateurs actualisés.';
    } catch (e) {
      status.textContent = 'Données indisponibles : ' + (e?.message || 'erreur inconnue');
      setOperationsVisible(false);
    }
  }
  function init() {
    if (!document.body.classList.contains('sateer-vice')) return;
    const main = document.querySelector('main.page');
    if (!main || !document.getElementById('kpiNouvelles')) return;
    const root = frame(main);
    if (!root) return;
    const original = document.getElementById('lienPublicationInstitutionnelle');
    const updatePublish = () => {
      const url = original?.getAttribute('href');
      for (const id of ['sx-p2-publish','sx-p2-publish-secondary']) {
        const a = document.getElementById(id);
        if (!a) continue;
        a.hidden = !original || original.hidden || Boolean(original.closest('[hidden]')) || !url || url === '#';
        if (!a.hidden) a.href = url;
      }
    };
    setOperationsVisible(false);
    updatePublish();
    if (original) new MutationObserver(updatePublish).observe(original, {attributes:true,attributeFilter:['hidden','href']});
    document.getElementById('sx-p2-refresh').addEventListener('click',load);
    load();
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();
