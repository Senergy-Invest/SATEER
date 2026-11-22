# SATEER Energy — E-METER-1C3 R2 : relevés manuels rapprochés

**Statut : paquet de recette candidat.** Ni installé ni publié sur GitHub à la création. La validation ne sera prononcée qu'après rapport du Mac, preuves API et **examen des captures réelles du navigateur**.

## 1. Point de départ Git contrôlé

Dépôt `Senergy-Invest/SATEER`, branche `work/energy-mvp01`, SHA GitHub figé `039ea24476d417d275aa1b44b5f623f3c0838dfc` (NAV-R2 clôturé). Le référentiel REV2 local non suivi est conservé ; aucun chantier Energy nouveau n'est ouvert avant validation 1C3.

## 2. Résultats de l'audit préalable (21 novembre 2026)

Le rapport `SATEER-ENERGY-EMETER-1C3-AUDIT-20261121T170448Z-RESULTAT.zip` affirme `AUDIT_1C3_READ_ONLY_CONFORME_AUCUNE_MODIFICATION` ; 12/12 tests ; base et cluster `sateer_test` certifiés. PostgreSQL 061 définit `UNIQUE(register_id,releve_le)` ; deux relevés avec un horodatage strictement identique sont interdits. Index historiques présents : `ix_meter_readings_history`, `uq_meter_reading_instant`. Sur l'échantillon récent de 3 relevés, 0 paire était espacée de 60 secondes ou moins. Aucun champ n'a été modifié. Le plan `EXPLAIN` était sans `ANALYZE` et ne démontre pas les performances sur plusieurs milliers de relevés.

La nouvelle règle ne compare donc **jamais** deux relevés du même registre au même instant : ce serait contraire à la contrainte 061. Elle rapproche chaque relevé du précédent strictement antérieur dans le même registre, sous la même portée tenant/site/propriétaire.

## 3. Contrat 1C3

- Si le précédent relevé strictement antérieur est situé à **plus de 0 et au plus 60 secondes**, sur le même registre et dans la même unité, comparer **exactement** les chaînes décimales. Pas de `parseFloat`, différence d'index, conversion kWh ou calcul de consommation.
- `RELEVES_RAPPROCHES_DIFFERENTS` (niveau `A_VERIFIER`) : deux valeurs déclarées différentes. Plusieurs causes légitimes ou erronées sont possibles. Ne pas présumer une erreur.
- `RELEVES_RAPPROCHES_IDENTIQUES` (niveau `INFORMATION`) : mêmes valeurs déclarées. Ne pas présumer une consommation nulle.
- Aucun précédent, écart supérieur à 60 s ou unité différente : aucun signal de rapprochement ; aucun signal ne vaut certification.
- Une page de **50 relevés**, paginée, sans déduire un total exhaustif ; la précédente saisie peut être hors de la page visible mais recherchée par `LEFT JOIN LATERAL` sur le registre.
- Le seuil 60 s est une **convention de recette versionnée**, pas une exigence AEME/SENELEC ni une loi métrologique.

## 4. Architecture, droits et API

- `energy/energy-meter-proximity-domain.js` : règles pures et codes stables, en réutilisant la comparaison décimale exacte de 1C2.
- `energy/energy-meter-proximity-store.js` : `BEGIN READ ONLY`, SQL 061 existant, tenant actif, site du propriétaire Core, unité et registre identiques ; aucune table ou migration.
- `energy/energy-meter-proximity-http.js` : session Core + organisations autorisées, routes GET, codes 401/403/404, `Cache-Control: private, no-store`; aucune route d'écriture.
- `GET /api/energy/proximite/v1/sites?tenant=...`
- `GET /api/energy/proximite/v1/sites/:siteId/signaux?tenant=...&offset=0`
- `public/energie-rapproches.{html,js,css}` : écran dédié, rendu `textContent`, source du site autorisé, navigation vers 1C2. Ajout d'un lien depuis l'écran 1C2 sans altérer NAV-R2.
- Activation exclusivement `PGDATABASE=sateer_test`, drapeaux MVP01/MVP02 + METER 1A/1C2/1C3 à `1`, et tenant de recette exact.
- Le Core authentifie : **le propriétaire du site** ; aucune délégation C1 aux collaborateurs n'est inventée.

## 5. Protocole de recette probant (aucun « OUI » isolé)

1. Avant toute installation, vérifier Git branche/origin/SHA distants et sources cibles ; préserver REV2 ; sauvetage réversible des 15 fichiers concernés (14 cibles et `server.js`).
2. Exécuter les **38 tests 1C3** et les 6 tests NAV, puis 272 tests E-METER antérieurs, 101 C4C, 17 campagnes de régression.
3. Vérifier PostgreSQL `sateer_test` 11 assertions READ ONLY ; lancer l'application sur `127.0.0.1:3494` et vérifier **12 tests HTTP A/B**.
4. Après autorisation séparée `AUTORISER_3_RELEVES_FICTIFS_1C3`, créer **3 relevés totalement fictifs** 230 → 235 → 235, espacés de 30 secondes, sur le registre de recette existant du site `RECETTE SYNTHETIQUE MVP01D`. Les insertions sont **atomiques**, auditées et append-only ; jamais de création sur une organisation réelle.
5. Confronter leurs identifiants aux retours de l'API HTTP (les deux signaux doivent apparaître, 30 s et refus B=404/tenant=403/anonyme=401) ; stocker le JSON de preuve dans le rapport ZIP.
6. Capturer réellement **1C3 avec les deux signaux visibles**, puis **1C2 DOCUMENTS avec `REFERENCE_REPETEE` et `PIECE_NON_ASSOCIEE`** pour fermer la preuve visuelle restée ouverte. Les captures doivent montrer du texte suffisamment lisible pour être contrôlé par un examinateur externe. Le fait qu'un fichier PNG existe ne prouve pas qu'il montre les bons codes.
7. Produire un ZIP rapport et l'ouvrir dans Finder. **Aucun commit/push sur cette tranche R2** : il faudra d'abord l'examen externe des images et des données API. Ensuite seulement, un paquet distinct de finalisation Git avec autorisation humaine sera envisagé.

## 6. Limites et sécurité

- Le générateur crée 3 relevés de test **persistants** sur `sateer_test` ; la table historique est append-only, donc pas de purge improvisée. Le consentement est obligatoire ; aucun jeu fictif n'est créé pendant la phase d'audit ou de tests préalables.
- Pas de valeurs personnelles ni réelles. Aucun capteur ajouté ni obligatoire. Ne jamais approcher des parties électriques sous tension.
- Les signaux ne certifient ni fraude, ni panne, ni consommation. Pas de tarifs, coûts, économies, émissions, simulation énergétique ni décisions automatiques.
- Les performances sur 1 000+ registres/sites ne sont pas démontrées. Pas d'`EXPLAIN ANALYZE` destructif ; des essais de charge seront nécessaires avant usage élargi.
- Tous les fichiers restent maintenables et documentés dans VS Code, transférables à Codex sans dépendance à un agent pour la maintenance.
- La recette ne remplace pas la documentation de protection des données de production ; aucune utilisation publique de justificatifs sensibles.

## 7. Après la clôture 1C3

Rester dans E-METER-1 pour des tranches d'imports contrôlés et de remplacement de compteur, puis E-PARTICIPATION-1, E-METER-2 photo/OCR, E-METER-3 calculs. `Engineering/Simulation` reste un moteur distinct. Ne pas commencer avant clôture démontrée de 1C3.
