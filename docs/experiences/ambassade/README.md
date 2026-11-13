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


## A2 — Lecture des publications institutionnelles (13 novembre 2026)

La route **GET `/api/institution-communications/:organisationId/publications?tenant=SN`** est un simple adaptateur de lecture. Elle réutilise `listerPublicationsVisiblesPourPersonneDatabase` du moteur Communication : pas de table, pas de requête métier dupliquée, pas de permission créée et aucune modification de `/api/mon-consulat`. Le backend exige une session, une relation personne–organisation effective dans le tenant demandé et vérifie que l'organisation réellement lue en base est de type `AMBASSADE`. Un identifiant dans l'URL ne confère aucun droit.

La réponse projette uniquement les champs de publication utiles à l'affichage, sans exposer les pièces ou métadonnées de publication. L'interface insère le contenu avec `textContent` et reste en lecture seule. Si aucune publication n'est autorisée, le fil est vide. **Aucune publication fictive ou officielle n'est créée dans ce lot.**

Les tests `node scripts/test-ambassade-a2.js` sont des tests de contrats injectés **sans réseau, sans PostgreSQL** ; ils ne démontrent pas le fonctionnement HTTP avec authentification réelle ou les audiences sur une vraie base. Ces tests devront être effectués dans un environnement autorisé et isolé avant toute exploitation institutionnelle. Aucune configuration d'activation ou rôle d'ambassade n'est supposé.
