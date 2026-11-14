"use strict";
(async function chargerDiaspora() {
  const status = document.getElementById('diasporaStatus');
  const feed = document.getElementById('diasporaFeed');
  if (!status || !feed) return;
  const query = new URLSearchParams(window.location.search);
  const tenant = query.get('tenant');
  if (!tenant || !/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenant)) {
    status.textContent = 'Contexte Diaspora incomplet : ouvrez l’expérience depuis Mon SATEER.';
    return;
  }
  try {
    const context = await window.SATEER_CONTEXT_READY;
    const organisations = Array.isArray(context?.organisations) ? context.organisations : [];
    if (!organisations.some(o => o && o.tenant_code === tenant)) {
      status.textContent = 'Cette expérience n’est pas accessible avec votre contexte.';
      return;
    }
    const response = await fetch('/api/diaspora/feed?' + new URLSearchParams({tenant}), {
      method:'GET',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
    });
    const data = await response.json().catch(()=>({}));
    if (!response.ok || data.statut !== 'DIASPORA_FEED_CHARGE' || data.tenant !== tenant ||
        data.perimetre !== 'DIFFUSEE_TOUS' || !Array.isArray(data.publications)) {
      throw new Error(data.statut || 'REPONSE_INVALIDE');
    }
    feed.replaceChildren();
    status.textContent = data.publications.length
      ? data.publications.length + ' information(s) diffusée(s) dans votre périmètre.'
      : 'Aucune information générale validée pour la diaspora dans ce périmètre actuellement.';
    for (const item of data.publications) {
      const article = document.createElement('article');article.className='diaspora-card';
      const tag = document.createElement('div');tag.className='diaspora-tag';tag.textContent=item.categorie || 'Information';
      const title = document.createElement('h3');title.textContent=item.titre || 'Information';
      const source = document.createElement('p');source.className='diaspora-meta';
      source.textContent='Source : '+(item.organisation || 'Non renseignée') +
        (item.organisationType ? ' · '+item.organisationType : '');
      const content = document.createElement('p');content.textContent=item.contenu || '';
      const date = document.createElement('div');date.className='diaspora-meta';
      const parsed = item.dateDiffusion ? new Date(item.dateDiffusion) : null;
      date.textContent=parsed && !Number.isNaN(parsed.getTime())
        ? 'Diffusée le '+parsed.toLocaleDateString('fr-FR') : 'Date de diffusion indisponible';
      article.append(tag,title,source,content,date);feed.append(article);
    }
  } catch(error) {
    status.textContent='Les informations Diaspora sont indisponibles ('+error.message+').';
    feed.replaceChildren();
  }
})();
