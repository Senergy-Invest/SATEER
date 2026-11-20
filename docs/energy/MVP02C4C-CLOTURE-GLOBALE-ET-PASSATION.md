# SUNU COURANT — MVP02/C4C : consolidation de clôture et passation

**Objet :** rassembler les preuves techniques et humaines des trois tranches C4C, achever une navigation compréhensible et préparer E-ARCH sans l'engager. **Ce fichier n'est pas une attestation de déploiement ou de performance énergétique.** L'attestation finale exige le rapport Mac de la présente recette et la concordance GitHub.

## Versions de référence

| Tranche | Commit publié et vérifié lors de sa clôture | Fonction |
|---|---|---|
| C4C1 | `0bee55bd0c5a1b2ca251cb5a3beecbeba71a4412` | Vue synthétique C1/C2/C4A/C4B par site/périmètre autorisé |
| C4C2 | `0d4b56bbf58f0f13953d500e2f502c1b1c9669f4` | File des propositions C2 en revue/à corriger |
| C4C3 R2 | `1d6ae4ce73783b73fa160ded8c4aa2ca8e720a81` | Diagnostic de relecteur actif, orientation C1/C2 et retour contextualisé |

La clôture précédente C4C3 R2 a une réserve documentaire : le champ « observation visuelle » contenait une **commande d'autorisation** et non une observation descriptive. Les preuves unitaires, PostgreSQL, HTTP, Git local/distant restent distinctes de cette lacune. **Ne pas présenter cette ancienne observation comme une preuve de navigation.**

## Correction ergonomique finale (tranche de consolidation)

Le tableau C4C3 ne présentait un accès C1 que dans une ligne de proposition sans relecteur actif. La recette du retour C1 devenait impossible lorsque ce cas était absent des données. Cette consolidation ajoute **un lien propriétaire stable** vers la page C1, et conserve le lien C2 historique :

- `public/energie-actions.html` : lien `versResponsabilites`, invisible par défaut (`hidden`) ;
- `public/energie-actions.js` : ce lien reste masqué pendant tout chargement/échec et n'est rendu visible que si l'API C4C renvoie `acces.complet=true`. L'URL est fabriquée par le contrat `SATEER_C4C3_NAV.vers` ;
- `public/energie-actions.css` : deux entrées accessibles sur écran étroit ; règle explicite pour `[hidden]` ;
- `scripts/test-energy-mvp02c4c-final.js` : 12 tests supplémentaires, dont tests de rendu simulé pour propriétaire, collaborateur, session invalide et API indisponible ;
- `scripts/maintenance/test-energy-mvp02c4c-final-http.js` : tests sur serveur local et isolation entre les comptes A/B fictifs.

Ce lien est une **aide de navigation**, pas une autorisation. Il ne pré-sélectionne pas nécessairement une mission dans C1 : les opérations et la présence de responsabilités actives sont déterminées par **C1** et par la session Core. Ni site ni grant ni rôle n'est déduit comme une permission depuis les paramètres URL. C4C ne décide aucune création, invitation, révocation, correction ou validation C2.

## Contrats conservés

- HTTP C4C : `GET /api/energy/pilotage/v1/sites`, `.../synthese`, `.../actions`; pas d'endpoint de modification ; vérification du tenant et du périmètre C1 côté serveur.
- Modèles de données : registre 051, C1 055, C2 056, C4A 059, C4B 060 ; aucune migration ou duplication dans cette tranche.
- Interprétation : les états, localisations, esquisses et dates sont **déclaratifs, non certifiés** ; aucun compteur de consommation, kWh, économie ou score de retard fabriqué.
- Confidentialité : pas de nom ou e-mail de contributeur, de document, photo, QR, mot de passe ni de données hospitalières en réponse C4C.
- Relation C1/C2 : le retour depuis C1/C2 utilise `from=c4c3` et un chemin canonique interne `/energie-actions.html`. L'utilisateur peut reprendre son site/filtre/page **si le site ou grant figure toujours dans la liste renvoyée par l'API**. Un grant révoqué ne sera jamais restauré comme autorisation.

## Critères de clôture réelle

Exécuter, sur le Mac et sur `work/energy-mvp01`, en partant du SHA C4C3 R2 ci-dessus :

1. Contrôler branche, origine GitHub, SHA local et distant, fichiers suivis et état hors lot ; ne pas prendre le document `REFERENTIEL-REV2-EFFICACITE-PARTICIPATIVE.md` dans le commit.
2. Réexécuter **101 tests Node** (89 existants + 12 nouveaux), les 17 campagnes de non-régression, et les trois contrôles PostgreSQL C4C1/C4C2/C4C3 en transactions de lecture seule sur `sateer_test`.
3. Démarrer une instance locale distincte au port `3487`, exécuter les tests HTTP A/B historiques C4C3 adaptés à ce port et les nouveaux contrôles HTTP C4C de consolidation.
4. Examiner visuellement depuis C4C3, avec **un compte propriétaire de recette** : ouverture C1 par le lien permanent, retour vers le **même site et les mêmes filtres** ; ouverture C2 et retour ; compatibilité mobile ; absence de chiffres énergétiques inventés.
5. Sur un compte collaborateur, confirmer que le lien permanent C1 du propriétaire est **masqué**. Vérifier que la page C1 ordinaire conserve ses anciennes règles de retour et qu'aucun nouveau droit n'est ajouté.
6. Enregistrer des **réponses séparées et explicites**, générer automatiquement l'observation factuelle structurée dans le rapport. Si une vérification n'a pas eu lieu ou est non conforme : **pas de commit/push**. Ne pas utiliser la commande de publication comme observation.
7. Après une demande d'autorisation distincte, commit/push **uniquement les six fichiers de cette consolidation** (trois interfaces, deux tests, ce document), sans force-push, puis comparer SHA Git local et `ls-remote` GitHub.

Le rapport ZIP est automatiquement révélé dans Finder. Seul ce rapport, rapproché de GitHub, permet de conclure « C4C clôturé ».

## Limites à transmettre à E-ARCH (non ouvertes ici)

- Scalabilité au-delà de 50 unités/pages et au-delà de 1 000 unités non démontrée : faire EXPLAIN/benchmarks et cadrer une pagination incrémentale lors d'un lot explicitement autorisé.
- Les pages C1/C2 historiques peuvent afficher les responsabilités de la session sans présélection garantie à l'ouverture. Une navigation n'est pas une délégation et ne garantit pas une action autorisée.
- Un relecteur actif est uniquement un grant C1 valide, pas un agent disponible. Pas d'échéance ou de SLA sans contrat métier configuré.
- Les équipements non localisés et les relations C4A non validées restent inconnus ou à vérifier ; aucune réconciliation technique automatique.
- Les futures mesures (E-METER), tâches/calendriers (E-PARTICIPATION), IA/OCR et métriques énergétiques exigent des modèles/contrats spécifiques ; ne pas les simuler dans C4C.
- Document de cadrage REV2 hors Git : reste non suivi, à traiter dans un lot documentaire explicitement décidé, jamais par inclusion accidentelle.

## Reprise VS Code / Codex

Ordre conseillé : cette note, `docs/energy/MVP02C4C-TABLEAUX-PARTICIPATIFS.md`, la note C4C2, la note C4C3, la note R2 navigation, puis les modules `energy/energy-dashboard-*` et `public/energie-actions*`. Les tests `scripts/test-energy-mvp02c4c*.js` et `scripts/maintenance/test-energy-mvp02c4c*-{pg,http}.js` constituent les contrats de non-régression. Toute évolution doit rester lisible et maintenable par un développeur humain sans assistance d'IA.
