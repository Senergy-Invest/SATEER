# ADR-008 — Contrat de supervision ministérielle mondiale (A4a)

Date : 13 novembre 2026. Statut : **contrat de composition pur ; aucune API, base de données ni interface ministérielle opérationnelle ajoutée**.

## Objet

Le ministère sénégalais doit pouvoir visualiser son réseau mondial : missions diplomatiques et postes consulaires, leur rattachement validé, leur état de déploiement SATEER et les indicateurs **agrégés** transmis par les postes habilités. Un poste non déployé n'est pas un poste sans activité. Une mission peut être compétente sur plusieurs pays ; cette accréditation **n'est pas** une relation parent/enfant.

## Source canonique et isolation

- `organisation_relationships` reste la source des liens structurels **intra-tenant** ; `institution-network-database.js` et `institution-relationship-graph.js` conservent ces responsabilités. Aucune table de hiérarchie parallèle n'est créée.
- Des postes installés dans différents tenants ne peuvent **pas** être interrogés par des jointures SQL transversales : l'annuaire mondial futur doit être un référentiel institutionnel officiellement validé, fournissant des identifiants composites `(tenantCode, organisationId)`, ses seules relations structurelles approuvées, et l'état du raccordement.
- Le service Reporting commun devra plus tard produire des instantanés **agrégés, validés, versionnés, datés et autorisés** par poste ; jamais des listes de dossiers, d'usagers, de pièces ou de courriels.
- `ministry-worldwide-reporting.js` est un **adaptateur pur** qui compose une projection à partir des entrées déjà filtrées/validées par les fournisseurs autorisés. Il ne remplace ni Reporting, ni l'annuaire Core, ni la vérification RBAC.
- La couche d'accès HTTP (à développer ultérieurement) devra vérifier la session et une habilitation ministérielle explicite **avant** de collecter les données. La simple tutelle n'accorde aucun droit. A4a ne crée pas de permission et son paramètre `referencesAutorisees` n'est **pas** une authentification.

## Contrats A4a

Entrées :

- `postes[]` : références `(tenantCode, organisationId)`, nom, type (`MINISTERE`, `AMBASSADE`, `CONSULAT`), pays d'implantation, statut (`RACCORDE`, `EN_RECETTE`, `NON_DEPLOYE`). Le contrat ne prétend pas contenir la liste officielle exhaustive tant qu'un annuaire validé n'est pas branché.
- `relations[]` : parent, enfant, `SUPERVISION` ou `ADMINISTRATIVE_TUTELLE`, état, période et **approbation explicite**. Les relations de collaboration, d'association ou de diffusion sont exclues du graphe.
- `rapports[]` : référence du poste, période `YYYY-MM`, statut `VALIDE`, date de production et trois compteurs agrégés : `demandesRecues`, `demandesTraitees`, `dossiersEnCours`. Ces compteurs ne sont qu'une première proposition de contrat à stabiliser avec les postes, pas les indicateurs définitifs du Ministère.
- `referencesAutorisees[]` : projection préparée par le contrôle d'accès externe et non une permission calculée ici.

Sorties : projection **minimale**, relations structurées, indicateurs de couverture et totaux des **seuls rapports reçus et validés**. Aucune propriété arbitraire, aucun nom de personne ni donnée de dossier n'est conservé. Deux identifiants locaux égaux dans deux tenants demeurent distincts. Un rapport manquant, ancien ou non validé ne devient jamais un zéro.

Le statut `COMPLETE_PARMI_RACCORDES` signifie uniquement que tous les postes marqués `RACCORDE` **dans le périmètre autorisé fourni** ont transmis leurs rapports valides ; il ne signifie **pas** que le réseau mondial est exhaustif. L'indicateur `couvertureIntegralePerimetreAutorise` n'atteste pas que l'annuaire est mondial ni à jour. Les chiffres ne doivent donc pas être titrés « total du monde » tant que le périmètre n'est pas certifié.

## Non livré

Pas de données ministérielles réelles, pas d'API mondiale, pas de nouvel écran, pas de permission nationale, pas de migration, pas de transfert inter-tenant, pas de notification vers le Ministère ni de modification de Bordeaux. La branche Ambassade n'est pas une branche de production.

## Suite ordonnée

1. A4b : valider un contrat de référentiel des postes et de provenance des rapports, puis construire une API sécurisée avec autorisations ministérielles explicites, désactivée en production tant que non homologuée.
2. A4c : afficher un premier tableau de bord (état du déploiement, arborescence mondiale, agrégats **avec couverture**) à partir de cette API, sans cache dangereux, sans données synthétiques présentées comme réelles.
3. A4d : recette multi-tenant avec organisations fictives, autorisations, dégradations, synchronisation et reprise ; aucune connexion institutionnelle réelle sans convention.

## Tests

`node scripts/test-ministry-worldwide-reporting.js` : tests purement locaux et synthétiques, sans PostgreSQL ni HTTP ; tests du périmètre, relations, couverture, dates, absence de fuite de champs privés et séparation des identifiants inter-tenant. Les non-régressions A1–A3d et P3.1 sont reprises par le lanceur de paquet.
