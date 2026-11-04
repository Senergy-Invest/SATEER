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
  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined') module.exports = { num, fmt };
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
    link(actions, 'Suivre les demandes', '#sx-p2-categories', 'sx-p2-secondary');
    const reload = put(actions, 'button', 'Actualiser', 'sx-p2-secondary');
    reload.type = 'button';
    reload.id = 'sx-p2-refresh';

    const status = put(root, 'p', 'Chargement des données…', 'sx-p2-status');
    status.id = 'sx-p2-status'; status.setAttribute('role', 'status');

    const metrics = put(root, 'section', undefined, 'sx-p2-block');
    put(metrics, 'h2', 'Activité consulaire');
    const cards = put(metrics, 'div', undefined, 'sx-p2-metrics');
    for (const [id, name, hint] of [
      ['new', 'Nouvelles', 'À orienter'], ['doing', 'En cours', 'En traitement'],
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
    put(comms, 'h2', 'Communication officielle');
    const info = put(comms, 'div', undefined, 'sx-p2-summary');
    for (const [id, label] of [['publications', 'Publications en ligne'], ['users', 'Sénégalais rattachés'], ['associations', 'Associations connectées']]) {
      const item = put(info, 'div', undefined, 'sx-p2-summary-item');
      put(item, 'strong', '—').id = `sx-p2-${id}`;
      put(item, 'span', label);
    }
    put(comms, 'p', 'Les personnes rattachées forment une audience potentielle, pas un comptage de notifications remises.', 'sx-p2-help');
    const commLinks = put(comms, 'div', undefined, 'sx-p2-links');
    const p = link(commLinks, 'Publier une information', '#'); p.hidden = true; p.id = 'sx-p2-publish-secondary';
    link(commLinks, 'Réseau des associations', '/ecosysteme.html');

    const lower = put(root, 'div', undefined, 'sx-p2-columns');
    const latest = put(lower, 'section', undefined, 'sx-p2-block');
    put(latest, 'h2', 'Dernières demandes');
    put(latest, 'div', undefined, 'sx-p2-list').id = 'sx-p2-latest';
    const attention = put(lower, 'section', undefined, 'sx-p2-block');
    put(attention, 'h2', 'Dossiers à surveiller');
    put(attention, 'div', undefined, 'sx-p2-list').id = 'sx-p2-attention';

    const operation = put(root, 'div', undefined, 'sx-p2-columns');
    const teams = put(operation, 'section', undefined, 'sx-p2-block');
    put(teams, 'h2', 'Activité des services');
    put(teams, 'div', undefined, 'sx-p2-list').id = 'sx-p2-teams';
    const network = put(operation, 'section', undefined, 'sx-p2-block');
    put(network, 'h2', 'Associations connectées');
    put(network, 'div', undefined, 'sx-p2-list').id = 'sx-p2-network';
    link(network, 'Gérer le réseau institutionnel', '/ecosysteme.html');

    const admin = put(root, 'details', undefined, 'sx-p2-admin');
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
  function display(data, eco, units, orgId, tenant) {
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
    const organisations = Array.isArray(eco?.organisations) ? eco.organisations : [];
    const associations = organisations.filter(o => String(o.type).toUpperCase() === 'ASSOCIATION' && o.relation_statut === 'ACTIVE');
    set('sx-p2-associations', fmt(associations.length));
    fillList('sx-p2-network', associations, 'Aucune association active reliée dans les données du pilote.', o => [o.nom, 'Connectée']);
    const recent = Array.isArray(data.activiteRecente?.demandes) ? data.activiteRecente.demandes : [];
    fillList('sx-p2-latest', recent, 'Aucune demande récente.', x => [x.objet || x.categorie || 'Demande', x.statut || '—']);
    const alerts = Array.isArray(data.demandesASurveiller) ? data.demandesASurveiller : [];
    fillList('sx-p2-attention', alerts, 'Aucun dossier signalé.', x => [x.objet || 'Demande', x.priorite || x.statut || 'À vérifier', 'warn']);
    const services = Array.isArray(units) ? units.filter(u => u.canViewAnalytics && (num(u.total_cases) || num(u.urgent_cases))) : [];
    fillList('sx-p2-teams', services.sort((a,b)=>num(b.total_cases)-num(a.total_cases)), 'Aucune activité affectée aux services pour le moment.', u => [u.nom || 'Unité', `${fmt(u.total_cases)} dossiers · ${fmt(u.urgent_cases)} urgents`,num(u.urgent_cases)?'warn':undefined]);
    const qs = new URLSearchParams({organisation:String(orgId),tenant});
    for (const a of document.querySelectorAll('.sx-p2-root a[href^="/ecosysteme.html"],.sx-p2-root a[href^="/configuration-consulat.html"]')) {
      a.href = a.pathname + '?' + qs.toString();
    }
  }
  async function load() {
    const status = document.getElementById('sx-p2-status');
    try {
      status.textContent = 'Actualisation des indicateurs…';
      const context = await window.SATEER_CONTEXT_READY;
      const qs = new URLSearchParams(location.search);
      const preferred = Number(qs.get('organisation')) || null;
      const org = await window.SATEER_choisirOrganisation(preferred);
      if (!org || !Number.isSafeInteger(Number(org.id))) throw Error('Organisation non autorisée ou non sélectionnée.');
      const tenant = String(context?.tenantCode || '');
      if (!tenant) throw Error('Tenant absent du contexte authentifié.');
      const orgId = Number(org.id);
      const base = `/api/organisations/${orgId}`;
      const param = '?tenant=' + encodeURIComponent(tenant);
      const get = url => fetch(url,{credentials:'same-origin',cache:'no-store'});
      const [dashboard, ecosystem, units] = await Promise.all([
        get(base+'/dashboard-operationnel'+param),get(base+'/ecosysteme'+param),get(base+'/units/overview'+param)
      ]);
      if (!dashboard.ok) throw Error('Accès au dashboard impossible (HTTP '+dashboard.status+').');
      const data = await dashboard.json();
      const eco = ecosystem.ok ? await ecosystem.json() : null;
      const u = units.ok ? await units.json() : null;
      // L'absence de permission sur l'écosystème/les unités ne devient pas une fausse valeur zéro.
      display(data, eco, u?.unites || u?.units || (Array.isArray(u)?u:[]),orgId,tenant);
      if (!ecosystem.ok) { set('sx-p2-associations','—'); set('sx-p2-network','Accès aux associations non disponible.'); }
      if (!units.ok) set('sx-p2-teams','Indicateurs des services non disponibles.');
      status.textContent = 'Indicateurs actualisés.';
    } catch (e) { status.textContent = 'Données indisponibles : '+(e?.message||'erreur inconnue'); }
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
    updatePublish();
    if (original) new MutationObserver(updatePublish).observe(original, {attributes:true,attributeFilter:['hidden','href']});
    document.getElementById('sx-p2-refresh').addEventListener('click',load);
    load();
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();
