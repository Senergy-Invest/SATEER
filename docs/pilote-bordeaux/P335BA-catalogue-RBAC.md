# SATEER Bordeaux — catalogue des démarches et droits (P3.3.5BA)

## Périmètre

Ce commit versionne exclusivement les évolutions du catalogue : liste des démarches, brouillon, révision optimiste, validation institutionnelle explicite, publication et retrait, interface P7 et séparation des permissions d'édition/publication.

Le module de simulation non officielle reste **séparé**. Aucune validation institutionnelle ou publication n'est lancée par ce paquet.

## Contrats d'autorisation

- Consultation administrative : droits organisationnels spécifiques (`VIEW_OPERATIONAL_DASHBOARD`, `MANAGE_PROCEDURES`, `CREATE_UNIT` ou `MANAGE_PUBLICATIONS`) selon le rôle de consultation, sans octroi implicite d'écriture.
- **Édition du brouillon : `MANAGE_PROCEDURES` exclusivement**, dans le tenant et l'organisation ciblés.
- **Validation / publication / retrait : `MANAGE_PUBLICATIONS`**, même portée organisationnelle, confirmation explicite et origine HTTP vérifiée.
- `CREATE_UNIT` sert à administrer les bureaux, **pas** à éditer le catalogue.
- Une modification invalide l'ancienne validation et retire la fiche de la publication.
- L'ancien champ `actif: true` ne permet jamais de contourner la publication explicite.
- Le catalogue citoyen ne propose que les fiches actives ayant une validation explicite et un validateur identifié.

## Tests et limites

Lancer : `node --test scripts/maintenance/test-bordeaux-catalogue-rbac.js`.

Ces tests sont **sans PostgreSQL**, contrôlent la fonction de décision, la portée et plusieurs invariants des routes. Ils ne remplacent pas des tests HTTP authentifiés multi-rôles ni les tests en base isolée avec données métier. Aucun test d'écriture sur `sateer_test` n'est effectué par ce paquet.

Le fichier partagé `pilot-procedures-http.js` contient aussi des évolutions de supervision, expressément **exclues** de ce commit par indexation partielle. La séparation physique de ces responsabilités dans des modules distincts doit être traitée dans le lot de supervision, avec tests et interfaces documentées.

## Reprise

Branche `work/bordeaux-pilot`. Toujours vérifier `git diff --cached` avant commit, ne jamais faire `git add .`, conserver les autres modifications locales et ne pas déplacer les droits de recette d'A01/A03 implicitement.
