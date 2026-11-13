# Mon Ambassade — A1 (13 novembre 2026)

## Objet

Première façade institutionnelle pour une organisation de type `AMBASSADE`, accessible depuis **Mon SATEER** après rattachement à la session. **Aucune nouvelle API métier, aucune table, aucun droit, aucun compte et aucune donnée institutionnelle n'est créé.** Bordeaux reste inchangé.

Le site public https://www.ambasenparis.gouv.sn/lambassadeur/ sert uniquement de référence documentaire. Son contenu n'est ni ingéré ni synchronisé. Une ambassade et chaque consulat sont des organisations distinctes ; les relations entre eux exigent des conventions et des permissions explicites.

## Contrats existants réutilisés

- `auth-client.js` : vérification session + `/api/context` ; le client ne peut afficher que les organisations que le backend a retenues pour la session.
- `app.js` : accueil personnel ; seule la carte Ambassade est ajoutée ; la carte et le résumé Consulat restent inchangés.
- `institution-experience-entry.js` : présentation générique d'expériences institutionnelles ; **ne constitue ni une permission ni une activation organisationnelle**.
- `organisation-experience-availability.js` : contrat backend futur, non connecté ici, afin de ne pas casser Bordeaux.
- Capacités communication, workflow, notifications et reporting : **non dupliquées et non raccordées dans A1**. Les prochaines intégrations doivent passer par ces API communes, avec validation explicite des accès.

## Sécurité

La page HTML statique n'est pas une barrière de sécurité. Les données personnelles ne sont jamais chargées hors des API protégées. Les paramètres URL (`organisation`, `tenant`) ne donnent aucun droit, et sont vérifiés contre le contexte authentifié. **Pas de publication, courrier, dossier, message réel ou affectation par ce lot.** Aucune hypothèse sur les rôles réels de l'ambassade.

## Contrôles

`node scripts/test-ambassade-a1.js` et `node --check public/app.js` + contrôles statiques existants. Ces tests sans DB ne démontrent pas un E2E réel. Le prochain lot devra tester des vrais refus HTTP inter-organisations en recette isolée avant tout branchement métier.

## Prochain lot A2

Cartographier les droits des endpoints existants et le type d'organisation attendu. Réutiliser l'API de publications pour des informations **autorisées par l'institution**, avec tests de visibilité publique, d'audience et d'isolation tenant/org, sans extrapoler les pouvoirs de la mission diplomatique.
