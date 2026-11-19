# SUNU Courant — MVP02-C1 : organisation et délégation récursive

**Date :** 19 novembre 2026. **Base figée :** `work/energy-mvp01` commit `100e7e57921b175284dbb261bedb81f12f578bbb`. **Statut :** livraison candidate de recette, à valider par tests Mac et revue visuelle. Les référentiels REV3 et l'audit méthodologique du 19 novembre demeurent la source métier. **Aucun partenariat AEME/CEDEAO ni droit institutionnel n'est supposé.**

## Pourquoi cette tranche

MVP02-B1 n'autorise qu'un propriétaire à inviter un contributeur, sans sous-délégation ni arborescence arbitraire. Ce n'est pas le modèle de mobilisation que SUNU Courant doit respecter. **MVP02-C1 corrige d'abord l'architecture de responsabilité**, avant de modifier les contributions d'équipements ou de livrer des chiffres d'économie.

## Contrat figé conservé

- **Périmètres de responsabilité distincts de la carte physique et des personnes** : `energy_scope_nodes` (racine site, unités d’organisation, parent immuable, récursion sans niveau arbitraire, correspondance facultative `legacy_zone_id` avec la carte physique 051) et `energy_scope_grants` (personne, périmètre, rôle, parent de délégation, statut). Plusieurs responsables peuvent recevoir des droits sur la même unité ; une personne peut recevoir plusieurs périmètres. Le lieu ne disparaît pas lorsqu'une personne part.
- **Délégation en cascade** : Coordinateur du site → responsables de bâtiment/service/étage → responsables de bureaux/équipes → occupants. Une personne habilitée peut ajouter des sous-unités et inviter des pairs ou subordonnés dans son seul sous-arbre. Les droits ne peuvent s'étendre à une branche sœur. Les personnes déjà présentes dans la chaîne de tutelle ne peuvent recevoir une invitation qui boucle vers elles.
- **Invitation nominative** : l'émetteur renseigne l'identifiant interne de compte SATEER communiqué par le destinataire ; seule cette personne voit l'invitation dans son compte, après authentification et rattachement au tenant. Aucune recherche publique de personnes et aucun mot de passe échangé. Les invitations expirent après 48 h, peuvent être annulées par l'émetteur avant acceptation et ne deviennent pas publiques. L'automatisation via Communication/annuaire Core reste à développer ; ne pas ajouter un deuxième moteur de notifications.
- **Révocation** : retirer une affectation retire aussi ses sous-affectations, sans effacer lieux, appareils et historiques. Les invitations en attente émises par une affectation révoquée ne sont plus acceptables.
- **Un site canonique** : chaque espace est rattaché à l'identifiant du site Energy existant ; aucun second dossier `EnergyCase`, registre Equipment, Auth ni coffre photos. Le nouveau moteur est une version sous `/api/energy/collab/v2`, sans modification destructive de B1 ni des migrations 050 à 054.
- **Provenance/permissions** : les listes de périmètres sont privées ; les endpoints ne lisent **aucun** passeport, photo, QR, plaque ou donnée d'équipement. Seuls les espaces et responsabilités autorisés sont visibles. Tous les POST exigent Core Auth, appartenance Energy, Origin exact et idempotence où nécessaire.

## Portée exactement livrée en C1

- Initialiser l'organigramme depuis le site existant (idempotent).
- Créer des périmètres d’organisation avec niveau libre (`BATIMENT`, `ETAGE`, `BUREAU`, `SERVICE`, `ATELIER`, `LOCAL`, `INSTALLATION`, `ZONE`, `EXTERIEUR`, `AUTRE`). Parent physiquement immuable pour éviter les cycles silencieux ; les changements futurs seront des opérations versionnées et auditées.
- Inviter un compte SATEER cible (`personne.id`) en tant que `RESPONSABLE` ou `OCCUPANT` sur un nœud précis, accepter dans son propre compte, voir ses responsabilités, créer plusieurs niveaux/branches/égaux dans son périmètre si responsable.
- Annuler invitation en attente, révoquer un responsable et ses délégations ; tableau d'avancement initial limité au **nombre d'unités**, sans puissance agrégée, économie ou diagnostic automatique.
- Un nouvel écran mobile-first `energie-responsabilites.html` relié à l'inventaire actuel ; les formulaires techniques ne sont pas imposés aux occupants.
- Migration additive 055 et tests de contrats, PG rollback et auth Core A/B de recette.

## Ce que C1 ne prétend pas livrer

- **C2 — Workflow ascendant** : soumission des occupants dans leur unité, validation locale puis remontée contrôlée de niveau en niveau, consolidation canonique, correction/refus versionnés. L'ancienne revue B1 par le seul propriétaire reste distincte jusque-là.
- **C3 — Catalogue technique évolutif** : famille→sous-famille→modèle→appareil physique ; nouveaux compresseurs et autres types en candidat local, contrôles Data Quality, références réutilisées une fois validées. Les appareils du ménage restent des cartes simples, sans l'interdire aux industriels.
- **C4 — Trois cartes et tableaux de bord** : rattachement canonique équipements→espaces, agrégation par bureau/bâtiment/site, cartes physique/fonctionnelle/électrique, sensibilisation ; ensuite données de consommations et économie mesurée avec méthode/baseline.
- **C5 — Photos contributeurs, onboarding invité, annuaire Core et campagnes** : dépendances à qualifier sans exposition de photos ni droits institutionnels.
- Pas de production, pas d'interface réseau réelle pour QR `localhost`, pas de performances « infinies » ni de 4 comptes authentifiés disponibles aujourd'hui. La profondeur n'a **pas de seuil métier**, mais des tests de charge et une pagination seront nécessaires pour les sites gigantesques.

## Séquence de recette sur Mac

1. Vérifier le SHA local ET GitHub et l'absence de modifications inattendues dans le worktree Energy uniquement.
2. Lancer tous les tests déjà présents Energy/Core/P1/Ambassade/Diaspora ; vérifier l'application de la migration 055 en transaction rollback sur **le cluster `sateer_test` épinglé**.
3. Obtenir la phrase `AUTORISER_MIGRATION_MVP02C1` avant persistance. Appliquer seulement 055 ; aucune création Core et aucune autre base.
4. Démarrer l'instance 3477 sans arrêter 3472–3476, lancer la recette réelle A/B : propriétaire A initialise, invite le compte B, B accepte, crée 6 sous-niveaux ; les branches sœurs sont refusées, puis A révoque B et toute poursuite devient impossible.
5. Revérifier visuellement page `/energie-responsabilites.html?tenant=ENERGY_MVP01D_RECETTE&case=<dossier autorisé>`, affichage mobile et les interdictions d'accès ; saisir `VALIDER_VISUEL_MVP02C1` seulement si conforme.
6. Commit uniquement des fichiers de la tranche, push normal et **SHA distant identique**, ZIP rapport consolidé dans `~/Downloads`, Finder automatique. Aucune force-push, reset, clean, stash, pull ou rebase.

## Validation fonctionnelle supplémentaire avant C2

La recette actuelle possède uniquement les comptes fictifs Energy A/B. Cela ne permet pas de prouver une chaîne de **quatre personnes distinctes** ni des pairs multiples authentifiés. Les contrats PostgreSQL et la récursion 6+ niveaux peuvent être testés, mais la démonstration humaine A→B→C→D et l'échelle grands sites exigent des comptes fictifs supplémentaires **avec autorisation explicite** et une campagne dédiée. Ne jamais annoncer ces critères comme validés par les seuls tests A/B.

## Contrat de sécurité et migrations

Les FKs composites site/tenant/propriétaire sont conservées, les parentés organisationnelles et délégations sont immuables, les cycles et accès latéraux refusés. Le schéma 055 n'altère pas les tables Core ni B1. Le traitement des personnes réaffectées reste traçable ; les grandes organisations nécessiteront résolution paginée et contrôle de charge. Aucun entraînement IA sur photographies privées sans autorisation distincte.
