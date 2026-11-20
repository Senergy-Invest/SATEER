# SATEER Energy — E-ARCH : décisions A1/A2 et passation

**Décision de périmètre :** clôturer l'audit de l'architecture existante en consignant les résultats démontrés et les limites. Ce document **n'atteste ni un déploiement de production, ni une tenue en charge à 1 000+ unités, ni une certification de sécurité**. Il devient la décision versionnée d'E-ARCH uniquement après validation humaine, commit local ciblé, push normal et vérification du SHA distant.

## 1. Base et preuves

- Dépôt `Senergy-Invest/SATEER`, branche `work/energy-mvp01`, base auditée `6a8c96f1b210b14505f95dc6b46d88eff9f84090` (C4C clôturé).
- A1 R2 : audit statique 9/9, tables attendues 9/9, tests C4C 101/101, campagnes de non-régression 17/17, PostgreSQL en lecture seule.
- A2 : `SATEER-ENERGY-EARCH-A2-20261120T212009Z-RESULTAT.zip`, SHA-256 `b63b6dc77a168115ec59937f698e57bae6264682e8b271a5bd319b26c049d1dc` ; résultat `A2_EXECUTE_REQUIERT_ANALYSE_ET_DECISION_HUMAINE`, code sortie 0. Ne pas confondre ce rapport de mesures avec une recette de production.
- A2 : 9/9 contrôles textuels ciblés, **5 plans** EXPLAIN ANALYZE sur `sateer_test`, **6 contrôles d'accès PASS**, **101/101 tests C4C**, **17/17 régressions**, 45 index et 35 contraintes FK recensés sur les neuf tables analysées. Git local/distant identique, aucune écriture métier, migration, serveur, commit ou push lors des audits.
- Le référentiel local `docs/energy/REFERENTIEL-REV2-EFFICACITE-PARTICIPATIVE.md` reste non suivi et **hors du commit**. REV3 publié demeure le référentiel actif.

## 2. Mesures SQL — uniquement la fixture de recette

| Requête C4C | Exécution (ms) |
|---|---:|
| Synthèse du périmètre | 1,195 |
| Unités, page 1 | 1,233 |
| Actions, page 1 | 0,564 |
| Unités, page 2 (`offset=50`) | 0,606 |
| Actions, page 2 (`offset=50`) | 0,300 |

Données de recette : 15 unités C1, 5 affectations C1, 8 propositions C2, 4 localisations, 5 actifs C4A, 6 liens C4A, 2 positions C4B. Les lectures sont faites en **READ ONLY** sur le cluster/test prévu. Les résultats mesurent un environnement local avec un faible volume et des pages 2 vides ; ils ne sont ni une preuve de performance à grande échelle ni un engagement de latence.

**Signal R1 :** les requêtes par unité comportent des agrégations corrélées et, pour la table de huit propositions C2, des `Seq Scan` répétés sur les lignes de la première page. Aucun index de `energy_scope_proposals` commençant par `scope_node_id` n'est recensé. Sur un si petit volume, PostgreSQL peut légitimement choisir un `Seq Scan`. Ni l'ajout d'index ni une réécriture ne sont autorisés sans une campagne de performance représentative, planifiée dans un lot isolé avant usage à grande échelle.

## 3. Décisions sur les risques

| Risque | Décision E-ARCH | Critère de réouverture |
|---|---|---|
| R1 — pagination/volumétrie C4C | **Ouvert et documenté, non bloquant pour la suite de recette**. Limite : pas de preuve à 1 000+ unités. | Avant déploiement grand site ou promesse de débit : fixture autorisée représentative, benchs, EXPLAIN/BUFFERS, budget de latence, puis éventuel index/requête/version de pagination. |
| R2 — `server.js` central volumineux | **Surveiller sans refonte**. Le routage Energy est modulaire et protégé, mais l'entrée unique est volumineuse. | Refactoring ciblé seulement avec défaut constaté, contrat clair et régressions démontrées. |
| R3 — compteur, relevés, facture, provenance | **À E-METER-1**, sans créer de modèle fictif dans E-ARCH. | Au démarrage du lot E-METER prévu dans REV3. |
| R4 — moteurs scientifiques | **Engineering/Simulation séparé** ; aucune équation avancée anticipée. | Aux MVP scientifiques prévus, selon les contrats versionnés et les tests de référence. |
| R5 — frontières Core/tenant/grant | **Contrôles ciblés A1/A2 satisfaisants**, sans revendication d'audit sécurité exhaustif. | Toute fuite intertenant/périmètre bloque la livraison ; continuer à tester refus, révocation, droits, publications. |
| R6 — compteur multi-bâtiments | **Aucune ventilation automatique des kWh** à partir de la topologie déclarative. | En E-METER, poser des relations de mesure prouvées, périodes et provenance avant tout calcul. |

**Décision proposée à l'issue d'A2 :** aucune migration ou correction de code n'est justifiée par les constats actuels. On peut clôturer **E-ARCH pour le périmètre audité en recette**, avec R1 et R5 comme vigilances explicites. Cette décision ne lève aucune obligation de tests de charge ou d'habilitations avant exploitation réelle.

## 4. Invariants pour E-METER-1 et la suite REV3

- Continuer le plan REV3 dans l'ordre, **E-METER-1 après E-ARCH**, puis E-PARTICIPATION-1, sans déplacer prématurément le moteur de calcul scientifique.
- Séparation : Core = identités/tenant/autorisations ; Energy = sites, équipements, topologie et données canoniques ; E-METER = relevés, périodes, provenance et tarifs versionnés ; Engineering/Simulation = moteurs déterministes réutilisables.
- Une topologie C4A ou esquisse C4B reste **déclarative** et ne prouve pas une alimentation, une mesure ou une répartition électrique.
- Conserver les catégories **déclaré / estimé / mesuré / vérifié** et les unités/périodes ; éviter de déguiser une estimation en mesure. Aucun kWh ni économie inventés.
- Préserver les permissions C1, l'appartenance tenant, l'isolement A/B et la séparation des scénarios de recette vis-à-vis de Bordeaux, Ambassade, Diaspora et P1.
- Pas de capteurs IoT obligatoires dès l'entrée : collecte manuelle et contributions réparties avant instrumentation progressive, conformément au cadre SUNU COURANT.

## 5. Réutilisation et entretien humain / Codex

Démarrer par cette note et par `docs/energy/ROADMAP-MVP-REV3.md`, `REFERENTIEL-REV3-VALIDE.md`, `MATRICE-MOTEURS-REV3.md`, `MVP02C4C-CLOTURE-GLOBALE-ET-PASSATION.md`. Pour les preuves, conserver **hors dépôt** le ZIP A2 contrôlé par son empreinte. Modules : `energy/energy-dashboard-{domain,store,http}.js`, `energy/energy-scope-*`, `energy/energy-collection-*`, migrations 050–060, `scripts/test-energy-mvp02c4c*.js` et suites de maintenance C4C.

**Clôture administrative Git :** une seule note documentaire ajoutée, aucun autre fichier modifié ; commit ciblé après consentement, push normal, SHA GitHub égal au SHA local. Le rapport produit par le lanceur de clôture fait foi pour cette dernière étape. Ne jamais considérer l'audit comme une migration ou une validation de production.
