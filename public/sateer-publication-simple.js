/* SATEER P3 : présentation simple de l'unique publication consulaire.
 * Ce module n'ajoute PAS de destinations non gérées par les API.
 * Il conserve le formulaire et les événements de l'application existante.
 */
(() => {
  'use strict';
  function text(tag, content, className) {
    const node = document.createElement(tag);
    if (content !== undefined) node.textContent = content;
    if (className) node.className = className;
    return node;
  }
  function init() {
    const form = document.getElementById('formPublication');
    const root = document.querySelector('main.com-page');
    if (!root || !form || root.classList.contains('sx-cp-enhanced')) return;
    const field = selector => form.querySelector(selector)?.closest('.com-field');
    const titre = field('[name="titre"]');
    const contenu = field('[name="contenu"]');
    const categorie = field('[name="categorie"]');
    const priorite = field('[name="priorite"]');
    const canal = field('#communicationChannelId');
    const audience = field('#audienceType');
    const cible = document.getElementById('ciblageLabel');
    const cibleInput = document.getElementById('audienceValeur');
    const media = field('#publicationFichiers');
    const externe = field('#publicationLien');
    const action = form.querySelector('button[type="submit"]');
    const resultat = document.getElementById('publicationResultat');
    const aside = root.querySelector('.com-aside');
    const audienceSelect = document.getElementById('audienceType');
    const canalSelect = document.getElementById('communicationChannelId');
    if ([titre,contenu,categorie,priorite,canal,audience,cible,cibleInput,media,externe,action,resultat,aside,audienceSelect,canalSelect].some(x => !x)) return;
    root.classList.add('sx-cp-enhanced');
    const params = new URLSearchParams(location.search);
    const orgId = Number(params.get('organisation'));
    const tenant = params.get('tenant') || '';
    const back = root.querySelector('.com-back');
    if (back) {
      back.textContent = '← Retour au pilotage';
      if (Number.isSafeInteger(orgId) && orgId > 0 && tenant) {
        back.href = '/dashboard-vice-consul.html?' + new URLSearchParams({organisation:String(orgId),tenant});
      }
    }
    const banner = root.querySelector('.com-banner');
    if (banner) {
      const title = banner.querySelector('h1');
      const desc = banner.querySelector('p:last-child');
      const kicker = banner.querySelector('.com-kicker');
      if (title) title.textContent = 'Publier une information';
      if (desc) desc.textContent = 'Un message officiel, adressé aux personnes que vous choisissez.';
      if (kicker) kicker.textContent = 'SATEER · Communication officielle';
    }
    const pageTitle = root.querySelector('#com-form-title');
    if (pageTitle) pageTitle.textContent = 'Votre publication';
    const subtitle = root.querySelector('.com-panel > .com-muted');
    if (subtitle) subtitle.textContent = 'Rédigez, choisissez les destinataires, puis publiez.';

    function section(num, title, desc) {
      const sec = text('section', undefined, 'sx-cp-section');
      const h = text('h3', num + '  ' + title);
      sec.appendChild(h);
      if (desc) sec.appendChild(text('p', desc, 'sx-cp-help'));
      return sec;
    }
    const writing = section('01','Message','');
    const row = text('div', undefined, 'sx-cp-grid');
    row.append(categorie,priorite);
    writing.append(titre,contenu,row);

    const targets = section('02','Destinataires','Une publication peut être visible dans Mon Consulat sans déclencher d’e-mail ni de notification.');
    // Le backend sait cibler TOUS, DEPARTEMENT, PROFIL et une ASSOCIATION à la fois.
    // Les options multiples / toutes associations ne sont volontairement pas simulées ici.
    const options = {
      TOUS:'Tous les Sénégalais concernés par le Consulat',
      DEPARTEMENT:'Un territoire / département',
      PROFIL:'Un profil de public',
      ASSOCIATION:'Une association connectée',
      ORGANISATIONS:'Plusieurs organisations connectées'
    };
    if (![...audienceSelect.options].some(opt => opt.value === 'ORGANISATIONS'))
      audienceSelect.add(new Option(options.ORGANISATIONS,'ORGANISATIONS'));
    for (const opt of audienceSelect.options) {
      if (options[opt.value]) opt.textContent = options[opt.value];
    }
    const targetLabel = audience.firstChild;
    if (targetLabel && targetLabel.nodeType === Node.TEXT_NODE) targetLabel.textContent = 'Public destinataire';
    const associationBox = text('div', undefined, 'sx-cp-association-box');
    const associationLabel = text('label', 'Association connectée', 'sx-cp-select-label');
    const associationSelect = document.createElement('select');
    associationSelect.id = 'sx-cp-associations';
    associationSelect.appendChild(new Option('Choisir une association…',''));
    associationLabel.appendChild(associationSelect);
    const associationInfo = text('p', 'Chargement des associations autorisées…','sx-cp-help');
    associationBox.append(associationLabel,associationInfo);
    const orgBox = text('div',undefined,'sx-cp-association-box');
    const orgLabel = text('label','Organisations connectées (choix multiple)','sx-cp-select-label');
    const orgSelect = document.createElement('select');
    orgSelect.id='sx-cp-organisations';
    orgSelect.multiple=true;
    orgSelect.size=6;
    orgSelect.setAttribute('aria-label','Organisations destinataires');
    orgLabel.appendChild(orgSelect);
    const orgInfo = text('p','Chargement des organisations autorisées…','sx-cp-help');
    orgBox.append(orgLabel,orgInfo);
    targets.append(audience,cible,associationBox,orgBox);
    const limited = text('p','Pour adresser une information à plusieurs associations ou partenaires, choisissez « Plusieurs organisations connectées ».','sx-cp-help sx-cp-limit');
    targets.appendChild(limited);
    // Le choix historique de canal n'est plus présenté. Un fil officiel reste conservé.
    canal.hidden = true;
    canal.setAttribute('aria-hidden','true');

    const mediaDetails = text('details',undefined,'sx-cp-attachments');
    const summary = text('summary','03  Photos, PDF ou lien vidéo (facultatif)');
    const mediaWrap = text('div',undefined,'sx-cp-attachments-content');
    mediaWrap.append(media,externe);
    mediaDetails.append(summary,mediaWrap);

    const review = text('section',undefined,'sx-cp-review');
    review.appendChild(text('h3','Avant publication'));
    const summaryText = text('p','', 'sx-cp-review-text');
    review.appendChild(summaryText);
    review.appendChild(text('p','La publication sera enregistrée et visible aux personnes éligibles dans SATEER. Sa lecture et la remise de notifications ne sont pas encore mesurées.','sx-cp-small'));
    action.textContent = 'Publier l’information';
    action.classList.add('sx-cp-submit');
    resultat.classList.add('sx-cp-result');

    form.replaceChildren(writing,targets,mediaDetails,review,canal,action,resultat);
    aside.replaceChildren();
    const help = text('section',undefined,'sx-cp-aside-card');
    help.appendChild(text('h3','Diffusion officielle'));
    help.appendChild(text('p','Votre publication rejoint le fil Mon Consulat pour son audience autorisée.'));
    const mode = text('div','Canal officiel unique','sx-cp-mode');
    help.appendChild(mode);
    const condition = text('p','La diffusion vers les associations et les notifications externes feront l’objet de fonctions distinctes, avec suivi et autorisations.','sx-cp-help');
    help.appendChild(condition);
    aside.appendChild(help);

    function sync() {
      const choice = audienceSelect.value;
      associationBox.hidden = choice !== 'ASSOCIATION';
      orgBox.hidden = choice !== 'ORGANISATIONS';
      cible.hidden = choice === 'ORGANISATIONS';
      limited.hidden = choice !== 'ASSOCIATION';
      orgSelect.required = choice === 'ORGANISATIONS';
      if (choice === 'ASSOCIATION') {
        cibleInput.type = 'hidden';
        cibleInput.value = associationSelect.value || '';
        associationSelect.required = true;
        const tx = cible.firstChild;
        if (tx && tx.nodeType === Node.TEXT_NODE) tx.textContent = '';
      } else if (choice === 'ORGANISATIONS') {
        cibleInput.type = 'hidden';
        cibleInput.value = '';
        associationSelect.required = false;
        orgSelect.required = true;
      } else {
        orgSelect.required = false;
        cibleInput.type = 'text';
        associationSelect.required = false;
        if (choice === 'DEPARTEMENT') {
          cibleInput.placeholder = 'Nom exact du département';
        } else if (choice === 'PROFIL') {
          cibleInput.placeholder = 'Nom exact du profil';
        }
        const tx = cible.firstChild;
        if (tx && tx.nodeType === Node.TEXT_NODE) tx.textContent = choice === 'DEPARTEMENT' ? 'Département ciblé ' : choice === 'PROFIL' ? 'Profil ciblé ' : '';
      }
      const name = options[choice] || 'Sélection non reconnue';
      const files = document.getElementById('publicationFichiers')?.files?.length || 0;
      summaryText.textContent = `Destinataires : ${name}. ${files ? files + ' fichier(s) joint(s).' : 'Aucune pièce jointe.'}`;
    }
    audienceSelect.addEventListener('change',sync);
    orgSelect.addEventListener('change',sync);
    associationSelect.addEventListener('change', () => {
      cibleInput.value = associationSelect.value;
      sync();
    });
    document.getElementById('publicationFichiers')?.addEventListener('change', sync);
    form.addEventListener('reset',()=>setTimeout(sync,0));
    form.addEventListener('submit', e => {
      if (audienceSelect.value === 'ASSOCIATION' && !associationSelect.value) {
        e.preventDefault(); e.stopImmediatePropagation();
        resultat.textContent = 'Sélectionnez une association effectivement connectée avant de publier.';
      }
    },true);

    async function loadAssociations() {
      if (!Number.isSafeInteger(orgId) || orgId <= 0 || !tenant) {
        associationInfo.textContent = 'Contexte institutionnel manquant : ouvrez la page depuis le dashboard.';
        associationSelect.disabled = true;
        return;
      }
      try {
        const resp = await fetch(`/api/organisations/${orgId}/ecosysteme?tenant=${encodeURIComponent(tenant)}`, {credentials:'same-origin',cache:'no-store'});
        if (!resp.ok) throw new Error('Accès au réseau indisponible (HTTP ' + resp.status + ')');
        const data = await resp.json();
        const active = Array.isArray(data.organisations) ? data.organisations.filter(item => String(item.type).toUpperCase() === 'ASSOCIATION' && item.relation_statut === 'ACTIVE') : [];
        active.forEach(item => {
          if (Number.isSafeInteger(Number(item.id)) && Number(item.id)>0 && item.nom) {
            associationSelect.appendChild(new Option(String(item.nom),String(item.id)));
          }
        });
        associationInfo.textContent = active.length ? 'Sélectionnez une association autorisée parmi les organisations connectées.' : 'Aucune association active connectée. Choisissez un autre public pour le moment.';
        associationSelect.disabled = !active.length;
      } catch (error) {
        associationInfo.textContent = 'Impossible de charger les associations : ' + (error.message || 'erreur inconnue') + '. Choisissez un autre public.';
        associationSelect.disabled = true;
      }
    }
    async function loadOrganisations() {
      if (!Number.isSafeInteger(orgId) || orgId <= 0 || !tenant) {
        orgInfo.textContent='Contexte institutionnel requis.';
        orgSelect.disabled=true;
        return;
      }
      try {
        const res=await fetch(`/api/organisations/${orgId}/communication-destinations?tenant=${encodeURIComponent(tenant)}`, {credentials:'same-origin',cache:'no-store'});
        if (!res.ok) throw new Error('HTTP '+res.status);
        const data=await res.json();
        orgSelect.replaceChildren();
        for (const item of data.organisations || []) {
          orgSelect.add(new Option(`${item.nom} (${item.type || 'Organisation'})`,String(item.id)));
        }
        orgSelect.disabled=!orgSelect.options.length;
        orgInfo.textContent=orgSelect.options.length ? 'Maintenez Cmd (Mac) ou Ctrl (Windows) pour en sélectionner plusieurs.' : 'Aucune organisation active connectée.';
      } catch(e) {
        orgSelect.disabled=true;
        orgInfo.textContent='Impossible de charger les organisations : '+e.message;
      }
    }
    loadAssociations();
    loadOrganisations();
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();
