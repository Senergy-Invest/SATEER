# SUNU COURANT — E-METER-1C1 : rectifications versionnées des factures et recharges

**Statut à la préparation : candidat non exécuté sur le Mac ; aucun commit ni push réalisé.**

**Base GitHub verrouillée :** `Senergy-Invest/SATEER`, `work/energy-mvp01`, SHA `4b3e5e2db9c6b2b5f7a3a108f3ff296ac41c732b` (clôture E-METER-1B2). Aucun lancement des autres travaux avant la clôture de 1C1.

## 1. Place dans la feuille de route figée

E-ARCH → E-METER-1A (index) → E-METER-1B1 (factures/recharges déclarées) → E-METER-1B2 (justificatifs privés fictifs) → **E-METER-1C1 (présente tranche)** → autres lots E-METER-1 (qualité/imports/remplacement de compteurs, séparément) → E-PARTICIPATION-1 → E-METER-2 photo/OCR → E-METER-3 calculs. Engineering/Simulation reste indépendant.

**Pourquoi maintenant :** une somme ou une date peut être erronée. Les tables 062 sont volontairement **append-only** ; les modifier en place pour corriger une déclaration détruirait la traçabilité. Nous créons une nouvelle déclaration canonique et un lien versionné sans toucher à la version originale ou ses justificatifs 063.

## 2. Contrat fonctionnel

1. Le propriétaire consulte les **racines** des déclarations du site (pagination par 50) sans compter les versions corrigées comme de nouveaux documents.
2. Il choisit une déclaration, visualise l'original, les révisions successives et la version actuelle.
3. Le formulaire reprend explicitement les **valeurs actuelles**, en demandant le **motif obligatoire** de 12 à 400 caractères et un changement réel d'au moins une valeur déclarative.
4. Un POST idempotent produit **une nouvelle ligne `energy_billing_declarations`**, un événement historique `BillingDeclarationRecorded.v1` avec indication `origine: RECTIFICATION`, et une ligne immuable `energy_billing_rectifications` qui relie l'original et la nouvelle version. La transaction est indivisible et est sérialisée par verrou sur l'original.
5. L'historique présente `v0` (original) et `v1..v20` maximum. L'original conserve exactement ses valeurs ; aucune suppression, `UPDATE`, reconstruction silencieuse, annulation de paiement ou correction officielle n'existe.
6. Les pièces 1B2 **restent attachées à leur déclaration d'origine**. Aucune copie, aucun transfert automatique des preuves. Une pièce différente peut ultérieurement être associée à la nouvelle déclaration via l'API 1B2 existante sous ses droits actuels ; la première tranche ne le fait pas elle-même.

Les règles 1B1 sont réutilisées sans divergence : nature (`FACTURE`/`RECHARGE`), énergie, date/période, devise sur trois lettres, montant **chaîne décimale exacte**, référence textuelle et point/compteur facultatifs. Aucun tarif, kWh, Woyofal, solde ou économie n'est inféré.

## 3. Données, SQL et frontières

La migration **064 additive** crée `energy_billing_rectifications` et l'index composite référencé sur la table 062. FK composites pour l'original, la nouvelle déclaration et le site : impossible de relier un document d'un autre site, propriétaire ou tenant. Un trigger garde l'origine canonique et exige que la nouvelle déclaration ait **la même clé d'idempotence et le même auteur** que la rectification. Un trigger append-only interdit UPDATE/DELETE du lien. `revision` unique par original et bornée à 20 ; `corrected_declaration_id` unique ; `(site_id,owner_personne_id,request_key)` unique. Le store verrouille la racine pendant le calcul de `revision + 1`. Il ne crée pas un nouveau moteur documentaire ou une identité Energy parallèle.

Le propriétaire ne peut corriger **que les déclarations de son propre site**, après contrôle Core/tenant sur chaque requête. Aucune permission par affectation C1 n'est inventée pour les collaborateurs dans cette tranche ; la délégation attend E-PARTICIPATION-1.

## 4. API et interface privée

Flag explicite `SATEER_ENABLE_ENERGY_METER_1C1=1` plus 1A/1B1/1B2 et MVP01/02, **uniquement `PGDATABASE=sateer_test`** :

- `GET /api/energy/rectifications/v1/sites/:siteId/rectifications?tenant=...&offset=0` — liste des racines et valeurs courantes sans doublons, paginée.
- `GET /api/energy/rectifications/v1/sites/:siteId/declarations/:declarationId/rectifications?tenant=...` — original + révisions + valeur courante.
- `POST /api/energy/rectifications/v1/sites/:siteId/declarations/:declarationId/rectifications?tenant=...` — corps `{motif, valeurs}`, origine exacte et `Idempotency-Key` UUID. Un motif seul ne peut créer une révision, un payload avec identité de propriétaire est rejeté ; aucun PUT/PATCH/DELETE.

L'interface `http://localhost:3491/energie-rectifications.html?tenant=ENERGY_MVP01D_RECETTE` est accessible par lien depuis `energie-factures.html`. La liste de 1B1 est explicitement qualifiée de **registre brut** ; la nouvelle page est la vue consolidée des versions. L'utilisateur choisit une racine, examine son historique, corrige, et constate la nouvelle version. Les contenus serveur sont rendus avec `textContent` uniquement ; l'interface ne traite aucun fichier.

## 5. Limites et risques à transmettre

- **Exclusivement recette `sateer_test`, données fictives.** L'ancienne liste 1B1 continue à afficher les déclarations physiques du registre, qui incluent les nouvelles versions. Les utilisateurs devant consulter l'état en vigueur utilisent la vue 1C1 ; la consolidation de toutes les autres projections est un travail séparé avant exploitation publique.
- **Pas de certification** de montant, pièce, énergie, période, opérateur ou compteur ; une révision ne valide pas une donnée.
- **Aucun calcul** de différence d'index, solde, kWh, tarif, règlement ou économie. La correction de séries d'index manuels et les contrôles de qualité des mesures restent des tranches distinctes d'E-METER-1.
- **Pas de remplacement de compteur ni import CSV** en 1C1. Les traiter à part, avec leurs propres limites et contrôles ; pas de capteur imposé.
- Les justificatifs réels restent interdits en recette 1B2 (antivirus, rétention, effacement, sauvegarde et rotation à industrialiser).
- Le registre et les opérations n'ont **pas été éprouvés à 1 000+ unités**, conformément aux réserves E-ARCH. Pas de garantie de performance ou certification de sécurité.
- Lien de rectification unique par version et **limite de 20** : à réévaluer dans un lot séparé si des cas réels justifient davantage.

## 6. Validation et publication

Le lanceur Mac doit : vérifier Git local et distant au SHA figé, contrôler les sources et leur manifeste, installer les fichiers ciblés, lancer les tests 1C1 / 1B2 / 1B1 / 1A / C4C + 17 non-régressions ; exécuter le dryrun de migration 064 intégralement annulé ; demander **autorisation explicite** pour appliquer la migration **064** uniquement sur `sateer_test`, puis refaire `verify` ; lancer les tests HTTP A/B non destructifs ; recueillir la recette visuelle honnête d'une correction factice et de son historique ; demander ensuite **une autorisation distincte pour commit/push**. Aucun force-push, aucune migration automatique de production. Commit local ciblé et vérification du SHA GitHub distant identique, rapport consolidé ZIP automatiquement révélé dans Finder. Le référentiel local REV2 reste non suivi et jamais inclus.

**Reprise humaine et Codex :** lire ce document, `EMETER-1B1-FACTURES-RECHARGES-DECLARATIVES.md`, `EMETER-1B2-JUSTIFICATIFS-PRIVES.md`, `EARCH-A1-A2-DECISIONS-ET-PASSATION.md`, les migrations 061 à 064, puis les trois modules `energy-billing-revision-*` et leurs tests. Pas de dépendance à l'IA pour la maintenance.
