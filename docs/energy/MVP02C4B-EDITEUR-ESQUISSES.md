# SUNU Courant — MVP02-C4B : esquisses 2D sur cartographie structurée

**Date** : 20 novembre 2026. **Base vérifiée** : `work/energy-mvp01` `4d3b098dba82dc34b736687cdc271ecaa59a2209` (C4A). **Statut** : candidat à la recette Mac. Pas de migration ou push avant les contrôles et les autorisations humaines.

## Règles figées et conformité

- L'expérience SUNU Courant reste gratuite et simple à découvrir : **aucun dessin, appareil de mesure ou contrat imposé** pour faire son inventaire individuel. L'esquisse approfondie ne constitue pas encore une prestation professionnelle ; toute mise à disposition à un client sous contrat exigera la vérification du contrat, des habilitations et du consentement.
- Les **lieux** sont `energy_scope_nodes` C1 (055), les **machines** sont `energy_inventory_equipements` (051/C2), les **éléments électriques et leurs liens** sont `energy_topology_assets`/`links` C4A (059), les **droits des collaborateurs** restent C1/C2. Rien n'est copié dans C4B.
- C4B ajoute uniquement deux tables 060 : `energy_sketch_positions` (position 2D, vue physique/électrique/fonctionnelle, référence canonique, version optimiste) et `energy_sketch_events` (journal append-only des déplacements).
- Une esquisse **n'est pas un schéma électrique certifié**. Les liaisons visibles proviennent strictement de C4A : aucun algorithme ne déduit un câble, une puissance, une consommation ou une mesure depuis les positions. Les liaisons `MESURE`, `DESSERT`, `ALIMENTE` sont déclaratives, à vérifier sur place.
- Création d'un bâtiment/bureau depuis l'éditeur : confirmation explicite, puis **appel API C1** sous le grant `COORDINATEUR` actif, jamais insertion directe C4B ni attribution automatique. Création d'un compteur/tableau : confirmation, puis **API C4A** ; aucun raccordement créé. Aucun lien de parenté ou d'alimentation n'est modifié par déplacement de bloc.
- Une image de plan peut servir temporairement de fond depuis le navigateur : **URL objet locale, aucun upload et aucune persistance**. Ne jamais inclure des plans hospitaliers privés dans les logs, rapports ou exemples d'illustration.
- Accès C4B **propriétaire Core du site uniquement**, `sateer_test`, tenant Energy autorisé, Origin exacte pour les écritures, clés d'idempotence, FK composites, versions en écriture et refus des champs non contractuels. Pas de droits institutionnels présumés.

## Limites conscientes de C4B

- Esquisse SVG 2D, **pas** BIM, CAO, 3D, modèle géoréférencé ou vérification électrique réelle.
- Pagination et navigation limitées à 500 items par liste côté navigateur en première tranche (API paginées à 100) ; signaler explicitement une carte partielle. Les sites massifs imposent recherche, pagination incrémentale, rendu virtuel et tests de charge.
- La création des lieux exige un grant C1 et ne crée pas les permissions du responsable ; les invitations et collectes C1/C2 sont inchangées.
- Les relations C4A visibles sont une représentation **des relations déclarées**, pas un workflow de validation technique.
- Aucune télémétrie, tarification, kWh, capteur, plainte SENELEC ni API institutionnelle dans C4B ; lire le référentiel REV2 pour leurs chantiers **après C4C**.
- La démonstration réelle A→B→C→D et les tests multi-utilisateurs grands sites sont encore à réaliser ; la recette Mac C4B utilise les comptes fictifs A/B préexistants.

## Recette Mac prévue

1. Vérifier SHA local et distant (4d3b...), branche et fichiers sous contrôle ; refuser toute divergence sans reset/clean/stash/pull/rebase/force-push.
2. Installer en ciblant **server.js**, **energie-cartographie.html** et nouveaux fichiers C4B, plus copies documentaires du référentiel REV2 et reprise Codex.
3. Tests Node C4B et toutes régressions Energy/Core/P1/Ambassade/Diaspora ; migration 060 testée avec `ROLLBACK` sur cluster `7699611241381229531`, base `sateer_test`.
4. Demander explicitement `AUTORISER_MIGRATION_MVP02C4B` avant application persistante ; ne pas rejouer si les deux tables existent.
5. Démarrer instance **3483**, authentification Core A/B, vérifier isolation, idempotence, versions, création C1/C4A et absence d'inférence électrique.
6. Validation manuelle dans `/energie-esquisse.html?tenant=ENERGY_MVP01D_RECETTE` puis `VALIDER_VISUEL_MVP02C4B` ; commit ciblé, push normal, SHA distant identique, worktree propre et ZIP résultat Finder.

## Prochaine étape

**C4C** : tableaux de bord participatifs par unité, qualité et progrès d'inventaire, sans économies chiffrées artificielles. Le développement d'un compteur universel Woyofal/SENELEC/SOMELEC et la séparation du moteur Energy doivent attendre la consolidation fixée dans REV2. Les développeurs humains doivent pouvoir ouvrir le dépôt sous VS Code et comprendre l'ensemble des contrats sans outil IA.
