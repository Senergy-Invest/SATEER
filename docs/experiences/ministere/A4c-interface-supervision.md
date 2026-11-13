# A4c — Première interface de lecture de la supervision ministérielle

Statut : **interface de recette uniquement, A4b sans fournisseur configuré**.

- Accueil Mon SATEER : carte de navigation pour les organisations `MINISTERE` déjà rattachées à la session. **La carte ne vaut pas droit de lecture.**
- `public/ministry-worldwide.html` : page dédiée indépendante des expériences Ambassade et Consulat. Les règles métier restent dans les modules Core/Reporting A4a–A4b.
- Les données viennent exclusivement de `GET /api/ministry-worldwide/:organisationId?tenant=...&periode=YYYY-MM`, sous session + `VIEW_MINISTRY_WORLDWIDE` organisationnelle, route désactivée par défaut et fournisseur actuellement `chargerLotNonConfigure`.
- Refus / indisponibilité => aucun contenu statistique laissé affiché ; ne jamais inventer ni embarquer une liste de postes ou des rapports « officiels ».
- Vue : état du déploiement, provenance, limites de couverture, arborescence du réseau approuvé. Les chiffres visibles ne concernent que les rapports valides reçus ; une absence de rapport ne vaut jamais 0.
- Tous les champs de source passent par `textContent`, pas d'HTML fourni par la réponse, pas de lien dynamique provenant de la source. Limite à 200 postes visibles côté UI ; l'API conserve son propre plafond.
- Les permissions nationales, la provenance authentique, le raccordement multi-tenant et un dashboard réellement alimenté sont **hors A4c**.
- Aucun nouveau moteur, migration, publication, liaison officielle, import de site ni changement Bordeaux.

Tests : `node scripts/test-ministry-worldwide-ui.js`, A4b, A4a, A3d, P3.1, `npm test`.
