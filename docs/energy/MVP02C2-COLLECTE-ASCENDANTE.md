# SUNU Courant — MVP02-C2 : collecte localisée et validation ascendante

**Date** : 19 novembre 2026. **Branche** : `work/energy-mvp01`. **Base verrouillée** : `aab0dfe051db1f9604aa174560b67bf18f286822` (C1 validé). **Statut** : livraison candidate, **non validée sur Mac** avant l'intégralité des tests et la validation visuelle ; pas de partenariat AEME/CEDEAO ni de production.

## Règles métier conservées

1. **Une personne = plusieurs responsabilités possibles**, chaque responsabilité est un grant `energy_scope_grants` C1 rattaché à un nœud `energy_scope_nodes` du site existant. La personne ne choisit pas ses permissions côté client.
2. Un `OCCUPANT` déclare uniquement dans son nœud ; un `RESPONSABLE` peut déclarer dans son sous-arbre, mais ne peut ni modifier un équipement canonique ni voir les branches sœurs. Le coordinateur conserve le formulaire d'inventaire canonique existant pour ses propres appareils.
3. La proposition (`energy_scope_proposals`) est attachée à **l'identifiant de l'affectation source**, au **nœud exact**, et à une personne Core authentifiée ; aucune insertion dans `energy_inventory_equipements` avant la fin des validations.
4. La revue suit **la chaîne de délégation immuable C1** (`parent_grant_id`) : occupant → responsable direct → responsable supérieur → coordinateur. Le parent doit être actif et distinct du déclarant ; les cycles et les chaînes révoquées sont refusés. Deux responsables pairs peuvent coexister sur un nœud mais ne se valident pas mutuellement par simple coappartenance.
5. Chaque responsable peut **APPROUVER** (transmet à son parent), **REFUSER** (arrête) ou **A_CORRIGER** (retour au déclarant). Une correction est une nouvelle version, avec remise au premier superviseur. L'auteur ne peut pas valider sa propre proposition.
6. **Seul le coordinateur** (propriétaire canonique du site) finalise et ajoute une ligne dans le moteur `energy_inventory_equipements` 051, avec clé d'idempotence dérivée de la proposition et provenance `DECLAREE`. La table `energy_scope_equipment_locations` relie le nouvel équipement à son bureau exact sans inventer un deuxième catalogue ni altérer les zones 051. Deux propositions portant exactement le même nom et la même famille dans le même bureau C2 déclenchent `DOUBLON_POTENTIEL_A_QUALIFIER` et ne sont pas intégrées automatiquement ; cela ne constitue pas une identification sûre de toutes les machines physiques.
7. Le journal `energy_scope_proposal_events` est append-only, avec décision, auteur, date, version et étapes. La correction ne détruit pas les preuves antérieures. La demande d'énergie reste strictement privée ; ni institution, ni financier, ni photos/QR d'autres utilisateurs ouverts.
8. **Pas de promesse d'économie** : puissance déclarée ≠ consommation mesurée ; aucune facture obligatoire ; aucune donnée issue d'une plaque n'est réputée certifiée. La sensibilisation, les tableaux de bord et les mesures font partie des étapes C4 et suivantes.

## Portée et limites explicites

- **C2 livré en candidat** : écran `energie-collecte.html`, API `/api/energy/collecte/v1`, modèles métier/test, migration additive **056**, revue et correction, liaison avec inventaire canonique, tests rollback PG et Core A/B. Le système reste paramétré en **recette locale** par les mêmes drapeaux Energy que C1, plus `SATEER_ENABLE_ENERGY_MVP02C2=1`.
- Les anciens codes B1 restent disponibles en transition pour ne rien casser. Le parcours cible d'une grande organisation passe par les invitations nominatives et les permissions C1. Une migration fonctionnelle d'onboarding sans compte existant, puis dépréciation B1, reste à planifier.
- La **carte organisationnelle C1** et la **carte physique historique 051** restent distinguées. Les nouveaux équipements C2 ont une liaison précise au nœud C1, le champ `zone_id` canonique 051 utilisant un emplacement legacy existant ou technique tant que la convergence cartographique C4 n'est pas livrée. Ne pas interpréter ce champ comme le vrai bureau.
- L'interface récupère les 100 dernières déclarations et jusqu'à 8 pages de 100 nœuds par responsabilité. C'est une limitation d'affichage/recette, **pas une borne métier de profondeur**. Pagination serveur complète et recherche à la charge seront nécessaires avant grand hôtel/campus.
- Le test de **quatre personnes** vérifie uniquement la logique de chaîne. La campagne **Core réelle** couvre A/B, car seuls deux comptes fictifs sont actuellement autorisés. Une recette A→B→C→D réellement authentifiée reste à organiser avec comptes supplémentaires et autorisation explicite.
- **C3** apportera le catalogue famille/sous-famille/modèle/appareil, déduplication et candidats comme compresseurs industriels. À ce stade un compresseur peut être déclaré dans la famille `MOTEUR` et nommé librement, sans entraînement IA automatique ni promotion dans un catalogue partagé.
- **C4** : tableaux de bord occupant/bureau/bâtiment/gestionnaire, cartes physique/fonctionnelle/électrique, campagne pédagogique et analyses à partir de données qualifiées.

## Validation Mac, autorisations et traçabilité

1. Prouver SHA local et distant C1, branche dédiée, absence d'autres modifications. Sans `reset`, `clean`, `stash`, `pull`, `rebase` ou `force-push`.
2. Vérifier le ZIP par SHA256, installer uniquement les fichiers C2 ; changements ciblés de `server.js` et `energie-responsabilites.html`, sans écrasement hors lot.
3. Exécuter les tests C2 et la non-régression Energy/Core/P1/Ambassade/Diaspora ; simuler **056 avec ROLLBACK** sur `sateer_test` et contrôler le `system_identifier` PostgreSQL épinglé.
4. Demander explicitement `AUTORISER_MIGRATION_MVP02C2` avant **toute écriture permanente** ; ne jamais intervenir sur une autre base.
5. Démarrer l'instance indépendante **3478**, réaliser E2E Core A/B : envoi, isolation, version/correction, acceptation, refus, révocation et aucun doublon.
6. Contrôler le mobile, l'accessibilité et la réalité de chaque action. Ne saisir `VALIDER_VISUEL_MVP02C2` qu'après revue effective.
7. Faire commit ciblé, push normal, comparaison du SHA distant et rapport consolidé ZIP dans `~/Downloads` avec ouverture Finder.

**Interdiction** : traiter le succès de tests unitaires synthétiques comme preuve d'une recette réelle multi-comptes ; aucune garantie énergétique, sécurité institutionnelle ou préparation production n'est donnée.
