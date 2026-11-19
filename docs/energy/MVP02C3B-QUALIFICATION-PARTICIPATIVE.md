# SUNU Courant — MVP02-C3B · Qualification technique collaborative

**Date de préparation :** 19 novembre 2026. **Commit de départ immuable :** `b6908e14e10759f49530aac1da09505c01218a00`, branche `work/energy-mvp01`. **Statut :** proposition de livraison, non validée tant que migration et recette Mac ne sont pas terminées. **Environnements :** `sateer_test`, cluster `7699611241381229531`, `localhost:3481`, Core fictif A/B. Aucun mandat institutionnel supposé.

## Continuité métier C1 → C2 → C3A → C3B

- **C1** conserve l'arborescence de lieux, les affectations nominatives, la cascade des responsabilités et les révocations.
- **C2** crée une contribution d'équipement par un occupant, puis la transmet au coordinateur ; l'équipement n'entre dans `energy_inventory_equipements` qu'une fois intégré. L'emplacement précis demeure dans `energy_scope_equipment_locations`.
- **C3A** conserve le **catalogue technique privé de chaque site**, les références CANDIDATE/REFERENCE_INTERNE/REJETEE, les liens aux passeports individuels et les champs de plaque confirmés, sans photographie ni OCR partagé.
- **C3B** permet à **l'auteur d'une contribution C2 déjà intégrée** d'identifier sa machine : famille existante, sous-famille et désignation libres, fabricant/modèle/puissance/tension facultatifs. Une proposition C3B reste séparée de C3A tant que sa chaîne de responsables ne l'a pas validée.
- **Au dernier niveau seulement**, le coordinateur peut **créer une CANDIDATE C3A** (à revoir encore par le propriétaire) ou **rapprocher explicitement** le signalement d'une REFERENCE_INTERNE du même site et de la même empreinte de modèle. Aucun passeport n'est affecté automatiquement. Un doublon identifié renvoie `MODELE_EXISTANT_A_RAPPROCHER`.
- Les décisions intermédiaires `APPROUVER` transmettent au parent C1 actif. Les décisions `A_CORRIGER` et `REFUSER` conservent un historique ; les corrections augmentent la version et renvoient au premier niveau. Le déclarant ne peut valider son propre signalement ; les révocations C1 bloquent les revues en attente.

## Pourquoi une tranche spécifique

Les collaborateurs peuvent reconnaître visuellement qu'un appareil est un **compresseur**, un **moteur** ou une **machine industrielle**, mais ils ne doivent pas pouvoir publier directement un modèle technique dans un catalogue d'entreprise ni consulter les plaques/photos de collègues. C3B résout cette tension sans reproduire les registres d'équipements, d'authentification ou de droits.

## Tables et compatibilité

Migration **additive 058** : `energy_catalog_collab_proposals` (source canonique C2 intégrée, auteur, affectation C1, champs techniques, version, résultat de rapprochement ou de transfert) et `energy_catalog_collab_events` (append-only) ; index composite de portée sur `energy_scope_proposals` pour une FK stricte. L'écriture finale réutilise `energy_catalog_references` et `energy_catalog_events` de C3A dans la **même transaction PostgreSQL** ; aucun doublon d'équipement, de passeport, de photo, de QR ou de modèle confirmé.

API `/api/energy/catalogue-collab/v1` sous `exigerSession` : `GET /mes-equipements-c2`, `GET /mes-propositions`, `POST /sites/:siteId/propositions` avec `Idempotency-Key`, `GET /sites/:siteId/a-verifier?grantId=...`, `POST /sites/:siteId/propositions/:proposalId/decision`, `POST /sites/:siteId/propositions/:proposalId/corriger`, `GET /propositions/:proposalId/historique`. Les accès sont dérivés de Core Auth, du tenant, des affectations C1 et de l'auteur C2, jamais d'un rôle soumis par le navigateur. `Origin` exact sur tous POST. Les listes sont limitées à 100 éléments par page dans cette tranche : ne pas prétendre qu'une grande organisation de 10 000 équipements est déjà couverte sans pagination, recherche et charge.

Interface `/energie-catalogue-participatif.html?tenant=ENERGY_MVP01D_RECETTE`, lien depuis la collecte C2 ; correction du lien `← Mes appareils` de C3A lorsque `case` manque : rediriger vers Mon énergie et non vers un inventaire invalide.

## Protections vérifiables

1. Une contribution C3B n'est créée que si `energy_scope_proposals.statut='INTEGREE'`, le même utilisateur est auteur et l'affectation C1 source reste active dans **toute** la chaîne.
2. La famille est héritée de C2 ; un contributeur ne transforme pas un moteur en une autre famille à son initiative.
3. Les descendants et collatéraux ne peuvent lire ou décider dans une file étrangère ; aucun GET C3B ne charge une photo/QR, un fichier de plaque ou le contenu privé du passeport.
4. Le coordinateur reste seul habilité à préparer une CANDIDATE C3A ; le référencement `REFERENCE_INTERNE` nécessite ensuite une seconde décision dans C3A.
5. Le rapprochement d'un modèle déjà référencé demande une action humaine `RAPPROCHER` avec identifiant UUID et empreinte strictement identique ; **n'associe aucun passeport**.
6. États et opérations audités, FK site/tenant/propriétaire, clés idempotentes et détection de version obsolète ; aucun recours automatique à l'IA.
7. Test 058 en transaction rollback avant toute demande de migration ; restriction explicite au cluster `sateer_test`.

## Parcours de recette A/B et limites

1. Vérifier Git local/distants sur le SHA C3A, l'état ciblé, les tests C1/C2/C3A, Core et pilotes institutionnels.
2. Tester le SQL 058 sous rollback. Autorisation `AUTORISER_MIGRATION_MVP02C3B` **uniquement après tests**.
3. Démarrer l'instance locale 3481 sans arrêter 3477–3480 ; scénario authentifié : A crée un bureau, invite B, B contribue dans C2, A intègre, B propose un modèle dans C3B, A demande correction, B renvoie v2, A crée candidate C3A, puis A la référence manuellement. Nouvelle proposition du même modèle → rapprochement humain ; révocation de B → nouvelles propositions et revues bloquées.
4. Validation visuelle `VALIDER_VISUEL_MVP02C3B` ; ensuite commit et push ciblés normaux, SHA distant identique, rapport ZIP Finder.

Cette recette A/B n'est **pas** la preuve d'une chaîne humaine A→B→C→D réelle. Le test unitaire à quatre niveaux vérifie uniquement le contrat de chaîne. Une campagne multi-comptes et des tests de charge devront être autorisés indépendamment.

## Décisions métier durables pour les lots suivants

Deux parcours toujours distincts : **découverte autonome** (inventaire simple, demande d'accompagnement possible) et **accompagnement sous contrat** avec gestionnaire SATEER à distance ou sur site. Pour grands hôpitaux, hôtels, usines ou bâtiments publics : organiser d'abord l'esquisse du site, les bâtiments, les tableaux principaux et secondaires, les circuits, compteurs principaux et secondaires et les équipements. Trois cartes **physique**, **électrique** et **fonctionnelle** distinctes, reliées en graphe (`situé dans`, `alimente`, `mesuré par`, `responsable de`, `sert à`). Un compteur secondaire peut couvrir plusieurs bâtiments ; un bâtiment peut recevoir plusieurs alimentations. Une esquisse n'établit jamais un raccordement réel sans vérification qualifiée.

**Ordre après C3B :** C4A données de cartographie structurée, C4B éditeur d'esquisses et création assistée d'unités C1 (validation humaine), C4C tableaux de bord, mobilisation et avancement. Plus tard : mesures avec baseline, prédiagnostic énergétique, monitoring, maintenance et IA sur données autorisées. Ne jamais imposer la cartographie technique au grand public ni présenter une économie extrapolée comme mesurée.
