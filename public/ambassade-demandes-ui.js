"use strict";
/** A15 — liste uniquement les demandes du compte connecté, selon le Core. */
(function(root) {
  const TENANT = /^[A-Z][A-Z0-9_-]{0,49}$/;
  const make = (doc, tag, cls, text) => {
    const el = doc.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = String(text);
    return el;
  };
  async function charger({ organisationId, tenantCode } = {}) {
    const doc = root.document;
    const list = doc.getElementById('ambassadeDemandesListe');
    const status = doc.getElementById('ambassadeDemandesStatut');
    const refresh = doc.getElementById('ambassadeDemandesActualiser');
    if (!list || !status || !refresh) return false;
    if (!Number.isSafeInteger(organisationId) || organisationId <= 0 ||
        typeof tenantCode !== 'string' || !TENANT.test(tenantCode)) {
      status.textContent = 'Contexte de demandes invalide.';
      return false;
    }
    async function load() {
      list.replaceChildren();
      status.textContent = 'Chargement de vos demandes enregistrées…';
      try {
        const url = '/api/citizen/demandes?' + new URLSearchParams({
          organisation: String(organisationId), tenant: tenantCode
        });
        const response = await root.fetch(url, {
          credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        if (data.statut !== 'MES_DEMANDES_CHARGEES' || data.organisationId !== organisationId ||
            data.tenantCode !== tenantCode || !Array.isArray(data.demandes)) {
          throw new Error('REPONSE_INCOHERENTE');
        }
        if (!data.demandes.length) {
          status.textContent = 'Aucune demande enregistrée pour votre compte dans cette ambassade.';
          return true;
        }
        for (const d of data.demandes) {
          const id = Number(d.id);
          if (!Number.isSafeInteger(id) || id <= 0) throw new Error('ID_INVALIDE');
          const item = make(doc, 'article', 'ambassade-demande-item');
          const heading = make(doc, 'h3', '', 'Demande n°' + id + ' · ' + (d.objet || 'Sans objet'));
          const meta = make(doc, 'p', 'ambassade-demande-meta',
            [d.categorie || 'Autre', d.statut || 'Statut indisponible'].join(' · '));
          const link = make(doc, 'a', 'ambassade-demande-suivi', 'Voir le détail et les réponses');
          link.href = '/demande-detail.html?' + new URLSearchParams({
            demande: String(id), organisation: String(organisationId),
            tenant: tenantCode, source: 'MON_AMBASSADE'
          });
          item.append(heading, meta, link);
          list.append(item);
        }
        status.textContent = data.demandes.length + ' demande(s) enregistrée(s) pour ce compte.';
        return true;
      } catch (err) {
        status.textContent = 'Suivi momentanément indisponible ; les demandes existantes ne sont pas supprimées.';
        return false;
      }
    }
    refresh.addEventListener('click', load);
    return load();
  }
  const api = Object.freeze({ charger });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SATEER_AMBASSADE_DEMANDES = api;
})(typeof window !== 'undefined' ? window : null);
