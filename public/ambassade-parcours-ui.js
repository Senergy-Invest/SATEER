"use strict";
/* A6 : façade d'accès aux moteurs Workflow (Unit Workspace) et Communication.
 * Les autorisations ne sont jamais décidées ici : toutes les API contrôlent la session,
 * le tenant, les rôles et les capacités. Aucune écriture n'est exécutée par cette façade.
 */
(function (root) {
  const CODE = /^[A-Z][A-Z0-9_-]{0,49}$/;
  const ID = /^[1-9][0-9]*$/;
  const PROJECTION = 'UNITES_WORKSPACE_CHARGEES';
  const valider = (id, tenant) => Number.isSafeInteger(id) && id > 0 && typeof tenant === 'string' && CODE.test(tenant);
  const creer = (doc, tag, classe, valeur) => {
    const el = doc.createElement(tag);
    if (classe) el.className = classe;
    if (valeur !== undefined) el.textContent = String(valeur);
    return el;
  };
  function urlWorkspace(organisationId, tenantCode, unitId) {
    if (!valider(organisationId, tenantCode) || !Number.isSafeInteger(unitId) || unitId <= 0)
      throw new TypeError('LIEN_WORKSPACE_INVALIDE');
    return '/unit-workspace.html?' + new URLSearchParams({
      organisation: String(organisationId), unit: String(unitId), tenant: tenantCode
    }).toString();
  }
  function urlPublication(organisationId, tenantCode) {
    if (!valider(organisationId, tenantCode)) throw new TypeError('LIEN_PUBLICATION_INVALIDE');
    return '/publication-institutionnelle.html?' + new URLSearchParams({
      organisation: String(organisationId), tenant: tenantCode, from: 'AMBASSADE'
    }).toString();
  }
  function categorieCapacites(unit) {
    const caps = new Set(Array.isArray(unit.capabilities) ? unit.capabilities : []);
    if (caps.has('RECEIVE_INCOMING') && caps.has('ROUTE_CASES')) return 'Réception et orientation';
    if (caps.has('VIEW_INBOX')) return 'Traitement des demandes';
    return 'Espace de travail';
  }
  function rendreWorkspaces(doc, zone, unites, organisationId, tenantCode) {
    if (!Array.isArray(unites) || unites.length > 250) throw new TypeError('UNITES_INVALIDES');
    const gardees = unites.filter(u => u && u.canOpenWorkspace === true &&
      Number.isSafeInteger(Number(u.id)) && Number(u.id) > 0 &&
      Number(u.organisation_id) === organisationId &&
      typeof u.nom === 'string' && u.nom.trim() && u.nom.length <= 255);
    const ids = new Set();
    const liste = creer(doc, 'div', 'ambassade-parcours-grid');
    for (const u of gardees) {
      const id = Number(u.id);
      if (ids.has(id)) throw new TypeError('UNITE_DUPLIQUEE');
      ids.add(id);
      const card = creer(doc, 'article', 'ambassade-parcours-card');
      const titre = creer(doc, 'h3', '', u.nom);
      const description = creer(doc, 'p', '', categorieCapacites(u));
      const lien = creer(doc, 'a', 'ambassade-parcours-link', 'Ouvrir le Workspace');
      lien.href = urlWorkspace(organisationId, tenantCode, id);
      card.append(titre, description, lien);
      if (u.canViewAnalytics === true && Number.isSafeInteger(u.new_cases) && u.new_cases >= 0)
        card.append(creer(doc, 'small', '', `${u.new_cases} nouvelle(s) demande(s)`));
      liste.append(card);
    }
    if (gardees.length === 0) liste.append(creer(doc, 'p', '',
      'Aucun Workspace accessible actuellement. Les capacités et les rôles doivent être configurés.'));
    zone.replaceChildren(liste);
    return gardees.length;
  }
  async function charger({ organisationId, tenantCode, doc = root.document, fetcher = root.fetch } = {}) {
    const etat = doc?.getElementById('ambassadeParcoursStatut');
    const bureaux = doc?.getElementById('ambassadeParcoursBureaux');
    const comEtat = doc?.getElementById('ambassadeParcoursCommunicationStatut');
    const comActions = doc?.getElementById('ambassadeParcoursCommunicationActions');
    if (!etat || !bureaux || !comEtat || !comActions) return;
    bureaux.replaceChildren(); comActions.replaceChildren();
    if (!valider(organisationId, tenantCode) || typeof fetcher !== 'function') {
      etat.textContent = 'Contexte de l’ambassade invalide.';
      comEtat.textContent = 'Communication non disponible.';
      return;
    }
    etat.textContent = 'Vérification des Workspaces accessibles…';
    comEtat.textContent = 'Vérification du droit de publication…';
    const options = { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } };
    const param = new URLSearchParams({ tenant: tenantCode });
    const apiUnites = `/api/organisations/${organisationId}/units/overview?${param}`;
    const apiCom = `/api/organisations/${organisationId}/publications?${param}`;
    const [unites, communications] = await Promise.allSettled([
      fetcher(apiUnites, options), fetcher(apiCom, options)
    ]);
    try {
      if (unites.status !== 'fulfilled') throw new Error('INDISPONIBLE');
      if (unites.value.status === 401 || unites.value.status === 403) {
        etat.textContent = 'Accès aux Workspaces non habilité pour ce compte.';
      } else if (!unites.value.ok) {
        etat.textContent = 'Liste des Workspaces momentanément indisponible.';
      } else {
        const data = await unites.value.json();
        if (data?.statut !== PROJECTION || data.organisationId !== organisationId ||
            data.tenantCode !== tenantCode) throw new Error('HORS_PERIMETRE');
        const nombre = rendreWorkspaces(doc, bureaux, data.unites, organisationId, tenantCode);
        etat.textContent = `${nombre} Workspace(s) accessibles selon vos habilitations.`;
      }
    } catch { bureaux.replaceChildren(); etat.textContent = 'Liste des Workspaces indisponible. Aucun accès présumé.'; }
    try {
      if (communications.status !== 'fulfilled') throw new Error('INDISPONIBLE');
      if (communications.value.status === 401 || communications.value.status === 403) {
        comEtat.textContent = 'Gestion des publications non habilitée pour ce compte.';
      } else if (!communications.value.ok) {
        comEtat.textContent = 'Gestion des publications momentanément indisponible.';
      } else {
        const data = await communications.value.json();
        if (data?.statut !== 'PUBLICATIONS_CHARGEES' || !Array.isArray(data.publications))
          throw new Error('REPONSE_PUBLICATIONS_INVALIDE');
        const lien = creer(doc, 'a', 'ambassade-parcours-link', 'Préparer une publication');
        lien.href = urlPublication(organisationId, tenantCode);
        comActions.replaceChildren(lien);
        comEtat.textContent = 'Éditeur Communication accessible via les permissions existantes.';
      }
    } catch { comActions.replaceChildren(); comEtat.textContent = 'Gestion des publications indisponible. Aucun droit présumé.'; }
  }
  const api = Object.freeze({ charger, rendreWorkspaces, urlWorkspace, urlPublication, categorieCapacites });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.SATEER_AMBASSADE_PARCOURS = api;
})(typeof window !== 'undefined' ? window : globalThis);
