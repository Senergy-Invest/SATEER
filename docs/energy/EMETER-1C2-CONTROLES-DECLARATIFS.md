# SUNU COURANT — E-METER-1C2 : signaux de cohérence en lecture seule

**Statut à la préparation : candidat de recette.** Ce document ne vaut pas clôture. La preuve vient du rapport Mac, des tests, de l'autorisation humaine et du SHA GitHub distant identique au SHA local.

**Point de départ figé :** `Senergy-Invest/SATEER`, branche `work/energy-mvp01`, SHA `60b9f8b60d82d3d3764ef512c88f93f3a0957b27` (E-METER-1C1 clôturé).

## 1. Périmètre et ordre

E-METER-1A (points/compteurs/index), 1B1 (factures/recharges), 1B2 (pièces fictives), 1C1 (rectifications versionnées) sont déjà clos en recette. **1C2** ajoute une projection d'observations déterministes, en **READ ONLY**, fondée uniquement sur les tables existantes 061 à 064. Pas de migration 065. Le lot suivant de qualité avancée, l'import contrôlé, les historiques de remplacement de compteur, E-PARTICIPATION-1, E-METER-2 (photo/OCR), E-METER-3 (calculs), puis Engineering/Simulation restent distincts, conformément à REV3.

**Aucune modification de données :** aucune décision, certification, validation, révision, notification, estimation, charge, écriture PostgreSQL, ni opération sur des documents. On ne crée aucune autorisation déléguée C1 dans cette tranche.

## 2. Deux familles de constats

### Index manuels de registre (061)

- Le précédent est le relevé **strictement antérieur** du **même registre** (ordre `releve_le`, jamais l'ordre d'arrivée du navigateur). Un index n'est comparé qu'à une valeur exprimée dans l'unité immuable de ce registre. Aucune comparaison entre deux appareils ou deux registres.
- `INDEX_EN_BAISSE`, niveau `A_VERIFIER` : valeur déclarée inférieure à son précédent. Une remise à zéro, un bouclage de compteur, un remplacement, une erreur ou une autre raison peut l'expliquer. Le code ne décide pas laquelle.
- `INDEX_INCHANGE`, niveau `INFORMATION` : même valeur déclarée qu'au précédent. Cela ne prouve ni une panne ni une consommation nulle.
- Pas de précédent : aucun signal. Les comparaisons de chaînes décimales sont **exactes** (sans `parseFloat`, `Number`, différence d'index ni conversion d'unité).

### Factures et recharges (062–064)

- Rechercher **uniquement les déclarations racines** et leur **version courante** 1C1, sans compter les versions historiques comme doublons.
- `REFERENCE_REPETEE`, niveau `A_VERIFIER` : référence documentaire non vide identique entre deux racines distinctes du même site, **même nature et même énergie**. Cela ne prouve pas un doublon commercial ni une fraude. Les références sont comparées telles que déclarées, sans normalisation d'opérateur.
- `PIECE_NON_ASSOCIEE`, niveau `INFORMATION` : aucun fichier 1B2 rattaché à **cette version courante**. La pièce est facultative ; une version antérieure peut en posséder une. La référence de pièce saisie en texte 1B1 ne constitue pas une pièce jointe.
- Aucun autre calcul ni rapprochement automatique facture/index ; aucun statut officiel.

`AUCUNE_ALERTE_DETECTEE` signifie simplement qu'aucun signal de niveau `A_VERIFIER` n'a été trouvé selon ces règles — **pas** que la donnée soit correcte, complète ou certifiée. Les observations sont calculées à la lecture et ne sont pas persistées.

## 3. Architecture et sécurité

- `energy/energy-meter-quality-domain.js` : règle pure, codes stables, comparaisons décimales exactes.
- `energy/energy-meter-quality-store.js` : transactions `BEGIN READ ONLY`, sites appartenant au Core, tenant actif, `site_id + tenant_id + owner_personne_id` dans toutes les lectures ; `LEFT JOIN LATERAL` antécédent du registre ; version courante de chaque racine 1C1 ; pièces liées à `actuel_id`.
- `energy/energy-meter-quality-http.js` : session Core existante, tenant activé, sans aucune route POST/PUT/PATCH/DELETE. Code 404 pour un site non autorisé ; aucune donnée du site A pour le compte B.
- `public/energie-controles.{html,css,js}` : écran autonome accessible depuis la page des rectifications, avec deux vues, pagination de **50 éléments**, lien de retour et aucune écriture. Tout contenu reçu du serveur passe par `textContent`.
- **API** : `GET /api/energy/qualite/v1/sites?tenant=...` ; `GET /api/energy/qualite/v1/sites/:siteId/signaux?tenant=...&source=RELEVES|DOCUMENTS&offset=0`.
- **Activation** : `PGDATABASE=sateer_test` ; flags Energy MVP01/02 et METER 1A/1B1/1B2/1C1/1C2 à `1`. Aucun flag C1 grant inventé ; accès propriétaire seulement.

## 4. Performance et limites scientifiques

- Pagination limitante : une page de 50, avec curseur `offset` jusqu'à 10 000 ; absence de la page suivante ne certifie pas un examen exhaustif de toutes les données.
- Les signaux découlent des **déclarations**, pas d'une métrologie vérifiée. L'historique de remplacement des compteurs n'est pas encore mis en œuvre ; ne pas affirmer qu'une baisse est toujours une erreur.
- Les CTE et `EXISTS` des références documentaires peuvent devenir coûteux sur un grand site. Réouvrir le risque R1 de l'audit E-ARCH et mesurer avec des fixtures représentatives avant usage à 1 000+ unités ; pas d'index ajouté sans preuve.
- L'horodatage est affiché en UTC et dépend de la date déclarée, pas d'une heure de réception certifiée. Les indices anciens sont conservés.
- Pas de calcul de consommation, facture, coût énergétique, rendement, taux, économies ou émission CO₂. Ne jamais créer de kWh fictifs.
- Pas d'hébergement de justificatifs réels : absence de suppression, rétention, sauvegarde, analyse des PDF et rotation de clés (réserves 1B2).

## 5. Test, preuve, recette et publication

1. Git local/remote branche `work/energy-mvp01` au SHA de départ ; contrôle exact du manifeste, des 13 fichiers cibles, préservation du REV2 non suivi.
2. `node --test scripts/test-energy-emeter1c2.js` (tests métier, HTTP simulé, SQL en lecture seule), puis 1C1, 1B2, 1B1, 1A, C4C et 17 campagnes de régression existantes.
3. **PostgreSQL réel READ ONLY** : cluster `sateer_test` certifié, tables 061–064, accès A/B et lectures paginées sans insertion ni migration.
4. HTTP A/B sur port **3492** : route protégée, pagination, rôles, tenants et absence de POST.
5. Recette humaine : interface charge le site autorisé ; signaux synthétiques validés par tests et, si un scénario fictif a été créé, vérifier les alertes visibles ; sinon consigner explicitement que la démonstration visuelle du signal n'a pas été réalisée.
6. Après accord explicite séparé `VALIDER_EMETER_1C2_ET_POUSSER`, commit **13 fichiers ciblés**, push Git normal et vérification `ls-remote` de SHA identique. Le rapport ZIP est révélé automatiquement dans Finder, même en cas d'arrêt.

**Aucun consentement de migration demandé** : la tranche 1C2 est strictement READ ONLY.

## 6. Passation humaine / Codex

Lire `docs/energy/ROADMAP-MVP-REV3.md`, `EARCH-A1-A2-DECISIONS-ET-PASSATION.md`, `EMETER-1A-POINTS-COMPTEURS-REGISTRES-RELEVES.md`, `EMETER-1B1-FACTURES-RECHARGES-DECLARATIVES.md`, `EMETER-1B2-JUSTIFICATIFS-PRIVES.md`, `EMETER-1C1-RECTIFICATIONS-VERSIONNEES.md` puis cette note et les modules de qualité. Ne pas confondre des règles de revue simples avec le moteur transversal Engineering/Simulation.
