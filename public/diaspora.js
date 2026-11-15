"use strict";
(async function chargerDiaspora() {
  const status = document.getElementById('diasporaStatus');
  const feed = document.getElementById('diasporaFeed');
  const sponsoredFeed = document.getElementById('diasporaSponsoredFeed');
  const sponsoredTitle = document.getElementById('diasporaSponsoredTitle');
  const sponsoredNotice = document.getElementById('diasporaSponsorNotice');
  if (!status || !feed) return;
  const query = new URLSearchParams(window.location.search);
  const tenant = query.get('tenant');
  if (!tenant || !/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenant)) {
    status.textContent = 'Contexte Diaspora incomplet : ouvrez l’expérience depuis Mon SATEER.';
    return;
  }
  try {
    const bureauLink = document.getElementById('diasporaBureauLink');
    if (bureauLink) bureauLink.href = '/diaspora-communication.html?' + new URLSearchParams({tenant});
    const geoLink = document.getElementById('diasporaGeoLink');
    if (geoLink) geoLink.href = '/diaspora-geographie.html?' + new URLSearchParams({tenant});
    const sponsorLink=document.getElementById('diasporaSponsorLink');
    if(sponsorLink) sponsorLink.href='/diaspora-partenariats.html?'+new URLSearchParams({tenant});
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
    if (sponsoredFeed) sponsoredFeed.replaceChildren();
    const sponsorCount = data.publications.filter(item=>item.sponsorisee===true).length;
    if (sponsoredTitle) sponsoredTitle.hidden=sponsorCount===0;
    if (sponsoredNotice) sponsoredNotice.hidden=sponsorCount===0;
    status.textContent = data.publications.length
      ? data.publications.length + ' information(s) diffusée(s) dans votre périmètre.'
      : 'Aucune information générale validée pour la diaspora dans ce périmètre actuellement.';
    for (const item of data.publications) {
      const article = document.createElement('article');article.className='diaspora-card'+(item.sponsorisee?' diaspora-card--sponsor':'');article.id='publication-'+Number(item.id);
      const tag = document.createElement('div');tag.className='diaspora-tag';tag.textContent=(item.sponsorisee?'Communication sponsorisée · ':'')+(item.categorie||'Information');
      const title = document.createElement('h3');title.textContent=item.titre || 'Information';
      const source = document.createElement('p');source.className='diaspora-meta';
      source.textContent='Source : '+(item.organisation || 'Non renseignée') +
        (item.organisationType ? ' · '+item.organisationType : '');
      const content = document.createElement('p');content.textContent=item.contenu || '';
      const date = document.createElement('div');date.className='diaspora-meta';
      const parsed = item.dateDiffusion ? new Date(item.dateDiffusion) : null;
      date.textContent=parsed && !Number.isNaN(parsed.getTime())
        ? 'Diffusée le '+parsed.toLocaleDateString('fr-FR') : 'Date de diffusion indisponible';
      article.append(tag,title,source,content,date);(item.sponsorisee && sponsoredFeed ? sponsoredFeed : feed).append(article);
    }
  } catch(error) {
    status.textContent='Les informations Diaspora sont indisponibles ('+error.message+').';
    feed.replaceChildren();
    if(sponsoredFeed)sponsoredFeed.replaceChildren();
  }
})();
