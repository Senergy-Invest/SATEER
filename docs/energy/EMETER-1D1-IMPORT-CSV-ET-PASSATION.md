# SATEER Energy / SUNU COURANT — E-METER-1D1 — Import CSV de relevés déclaratifs

**Statut : candidat R1 pour recette sur Mac. Pas publié tant que les preuves locales, la revue humaine et la vérification du SHA distant ne sont pas terminées.**

## 1. Contrat et héritage

- Référence de reprise : `Senergy-Invest/SATEER`, `work/energy-mvp01`, base `cdaf497bc82a825fe999c6e2854606b744c7cc3b` (1C3 clôturé et GitHub vérifié).
- Documents canoniques : `docs/energy/INDEX-ACTIF-REV3.md`, `ROADMAP-MVP-REV3.md`, `MATRICE-MOTEURS-REV3.md`, `EMETER-1A-POINTS-COMPTEURS-REGISTRES-RELEVES.md`, `EMETER-1C3-RELEVES-RAPPROCHES.md`.
- Audit préalable 1D0 : 417/417 tests, 17/17 régressions, 81 contraintes PostgreSQL inventoriées sur 061–064, base/cluster vérifiés, aucune écriture, SHA local=distant. Rapport `SATEER-ENERGY-EMETER-1D0-AUDIT-20261122T100755Z-RESULTAT.zip` (preuve externe, pas à commiter).
- Ordre figé : E-METER-1D1 → E-METER-1 (remplacement du compteur, connecteurs selon besoin réel) → E-PARTICIPATION-1 → E-METER-2 (photo/OCR) → E-METER-3 (calculs). Pas de nouvelle expérience en parallèle.

## 2. Décision technique 1D1 : PAS DE MIGRATION

Un import CSV lancé et explicitement confirmé par une personne dans l'interface est une **saisie manuelle assistée**. La base 061 impose `provenance='SAISIE_MANUELLE'` et `qualification='DECLARE_A_VERIFIER'`, et l'append-only sur les relevés et événements. Nous conservons exactement ces contraintes.

Le **mode de saisie** est séparé de la provenance : `details.modeSaisie='IMPORT_CSV_V1'` sur chaque événement existant `MeterReadingDeclared.v1`, avec `fichierSha256`, `hashLot`, `lotIdempotence`, `ligne`, `registreId`, `unite`, `qualification` et auteur Core dans `acteur_personne_id`. Le fichier brut n'est ni stocké en base, ni placé dans le webroot. La preuve lie les déclarations à une empreinte, sans inventer de source certifiée.

Ce contrat est valable **uniquement pour l'import manuel actuel**. Tout import automatisé, télérelève, canal institutionnel ou fichier d'un tiers doit être conçu dans un lot distinct, avec provenance explicite, permission et migration versionnée si nécessaire. Ne pas élargir le CHECK de 061 en douce.

## 3. Architecture — une responsabilité par couche

```text
public/energie-import.{html,js,css}              [SUNU COURANT — interface]
     | fichier CSV côté navigateur -> JSON après choix volontaire
     v
Core exigerSession + tenant/owner              [Core — propriété identitaire]
     |
energy/energy-meter-import-http.js              [HTTP — Origin, session, format, idempotence]
     |
energy/energy-meter-import-domain.js            [Pur — CSV v1, décimales, horodatages, hash]
     |
energy/energy-meter-import-store.js             [SQL paramétré, même site/tenant/propriétaire]
     | prévisualiser -> BEGIN READ ONLY / ROLLBACK
     | importer      -> BEGIN -> verrou site -> revalider -> INSERT+audit -> COMMIT
     v
energy_meter_readings + energy_meter_events     [Energy — source canonique immuable]
     |
API existante 1A + contrôles indicatifs 1C2/1C3 [Zéro nouvelle source de mesure]
```

`server.js` ne fait **qu'un montage protégé** (feature flag `SATEER_ENABLE_ENERGY_METER_1D1=1`, base `sateer_test`, 1A, MVP01/02) ; pas de logique métier dans son routeur central. Aucun nouveau Core Auth, moteur Data Quality, Communication, Monitoring, Invest ou Engineering/Simulation.

## 4. Format CSV v1

- Encodage UTF-8 valide, BOM facultatif ; séparateur virgule ; `CRLF`/`LF` acceptés. Les quatre colonnes doivent être **exactement dans cet ordre** : `registre_id,releve_le,valeur_index,observation`.
- `registre_id` : UUID existant d'un registre actif du site possédé par la session Core. Aucun point/compteur/registre créé depuis l'import.
- `releve_le` : RFC3339 avec `Z` ou décalage explicite et secondes ; normalisé en UTC après vérification du jour civil ; pas de date sans zone, date fictive postérieure à +5 minutes, ou date avant l'an 2000.
- `valeur_index` : chaîne décimale de 1 à 14 chiffres entiers et jusqu'à 6 décimales, point décimal seulement. Aucun flottant JavaScript, conversion d'unité, différence de kWh ni consommation.
- `observation` : facultative jusqu'à 240 caractères ; guillemets CSV et virgules citées pris en charge ; multiligne, contrôles et préfixes à formule rejetés.
- **Maximum** 50 lignes de données, 65 536 octets UTF-8. Aucune cellule n'excède 512 caractères, ni champ inconnu ajouté. En cas de doublon (registre, instant UTC) dans le fichier ou en base : import complet refusé.
- L'unité provient de `energy_meter_registers.unite` et est figée dans `unite_snapshot`. L'import est strictement déclaratif.

## 5. API privée v1

Les URL sont sous `/api/energy/import/v1`, paramètre `?tenant=ENERGY_MVP01D_RECETTE` en recette.

| Route | Effet | Préconditions |
|---|---|---|
| `GET /sites` | Sites privés du propriétaire, 50 max, `suivant` | Session Core, tenant autorisé |
| `POST /sites/:siteId/apercu` | Analyse JSON `{ "csv": "..." }`, résultat des lignes et motifs | Session, `Origin` exact, site propriétaire, SELECT en READ ONLY |
| `POST /sites/:siteId/valider` | JSON `{ "csv": "...", "confirmation": "CONFIRMER_IMPORT" }` | Session, `Origin`, `Idempotency-Key` UUID, vérifications re-jouées dans transaction atomique |

- Retour 401 session absente, 403 tenant/Origin interdit, 404 site étranger, 400 format/confirmation incorrect, 409 conflit d'instant/clés ; 503 sans détail SQL si indisponible.
- `Idempotency-Key` réutilisée **sur le même site et pour le même propriétaire** avec lot strictement identique : réponse 200 avec `nouveau=false` ; contenu différent : 409. Le contrat v1 ne fournit pas d’unicité globale inter-sites. La clé doit néanmoins être générée neuve pour chaque opération et les `request_key` des relevés sont dérivées de manière déterministe (UUID v4 conforme) du lot et du numéro de ligne.
- Le verrouillage de la ligne du site (`FOR UPDATE OF s`) sérialise les imports avec les saisies 1A déjà protégées par ce verrou. Le serveur re-vérifie l'activité des registres, les collisions existantes et la propriété dans la transaction. Échec d'une seule ligne → rollback complet. Les traces d'événements sont enregistrées dans la même transaction.
- Aucune API d'effacement ou correction en place, aucun tarif, facture, kWh consommés ou résultat certifié.

## 6. Sécurité, limites et maintenance

- Les identifiants d'autres sites ne sont jamais renvoyés comme données autorisées ; le retour d'une ligne inaccessible est `REGISTRE_NON_AUTORISE` sans information sur son propriétaire.
- `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`; HTML/JS sans `innerHTML` dynamique. Ne pas exporter les déclarations en formule CSV.
- Les CSV de recette contiennent des données **entièrement fictives** ; ne pas soumettre de pièces ou données personnelles réelles. Une importation acceptée est persistante sur `sateer_test` et append-only. Il n'y a pas de suppression « pour remettre à zéro ».
- **Contrat exact des deux phases** : le parcours navigateur impose un aperçu réussi puis une confirmation humaine liée à un snapshot (site, objet fichier, génération d’interface). Le serveur **ne prouve pas** qu’un appel `/apercu` a précédé `/valider` : un client API autorisé peut invoquer directement `/valider` avec CSV valide, confirmation et clé idempotente. L’invariant de sécurité est la **revalidation intégrale, côté serveur, dans la transaction** avant tout `INSERT`. Si un aperçu préalable obligatoire côté serveur devient une règle métier, une évolution de protocole et ses tests seront nécessaires.
- Un aperçu valide peut devenir invalide avant le clic de confirmation : revalidation serveur obligatoire, résultat 409 et aucune insertion partielle. Le navigateur rejette désormais les réponses d’aperçu périmées après modification du site ou du fichier, interdit les doubles clics pendant l’appel, et conserve la clé d’idempotence pour les rejeux après échec réseau.
- La pagination du catalogue 1A est limitée à 50 points ; la v1 ne couvre pas les registres hors de la page de site visible. Aucune preuve de performance gros site, sécurité de production ni certification métrologique.
- Les sources de l'UI et de la logique métier sont indépendantes. Maintenance VS Code humaine : consulter ce document, chaque fichier JS commenté, `scripts/test-energy-emeter1d1.js`, les scripts de maintenance HTTP/PG et les rapports non versionnés.

## 7. Recette et livraison

1. Contrôle Git strict sur SHA 1C3, branche, origine, état du dépôt avec REV2 autorisé en seul untracked ; vérifier l'intégrité du ZIP.
2. Installation locale réversible des nouveaux modules et seul montage central ; **aucune migration**, aucune fixture ajoutée par le script.
3. 51 tests Node nouveaux + 417 tests de la base + 17 campagnes de régression, `sateer_test` et cluster, PG READ ONLY, HTTP A/B en lecture/aperçu ; aucune écriture avant validation humaine.
4. Vérifier réellement l'interface et le CSV fictif généré depuis un registre actif déjà présent ; après confirmation explicite de la personne via case à cocher et clic « importer », seules deux valeurs fictives `230`, `235` sont enregistrées. Le script vérifie ensuite en SQL READ ONLY les événements et leurs relevés.
5. ZIP unique avec logs, manifeste, preuves PG et CSV fictif, révélé dans Finder. La preuve de navigation peut être apportée par texte copié depuis le navigateur si une capture PNG est impossible, mais doit être corroborée par API/PG ; ne pas appeler cela une capture.
6. **Aucun commit ni push dans le candidat R1.** Revue indépendante du rapport et du rendu, puis paquet distinct de clôture avec accord humain, commit ciblé, push normal, SHA GitHub revérifié. Pas de force-push.

L'audit 1D0 et les tests simulés d'une transaction ne constituent pas une preuve de vraie écriture dans la base : la fermeture de 1D1 réclame un import fictif contrôlé et sa vérification indépendante.


## 8. Recette macOS du sélecteur CSV et clôture Git

- V8/V9 : le dialogue de sélection macOS ne force plus `accept` ; certains fichiers CSV auparavant grisés deviennent sélectionnables. Après sélection, l'interface n'autorise la prévisualisation que pour un nom se terminant par `.csv`. Les `.numbers`, `.zip`, `.pdf` et `.csv.txt` sont refusés ; les contrôles serveur de format, de droits, d'horodatage et d'idempotence restent obligatoires.
- Test permanent : `node scripts/test-energy-emeter1d1-macos-selector.js` ; tests de domaine et de concurrence UI : `node --test scripts/test-energy-emeter1d1.js scripts/test-energy-emeter1d1-ui.js`.
- Recette navigateur du 22 novembre 2026 : site synthétique, fichier CSV de 233 octets déjà importé, deux lignes refusées `INSTANT_DEJA_SAISI`, zéro admissible. Historique de huit relevés constaté dans la page (deux relevés du 17 novembre UTC). Preuves par copie de texte de l'interface, **pas** par capture d'écran ; confirmations HTTP/SQL indépendantes dans rapports V5/V6/V7/V7B. Ne pas confondre preuve de recette et certification métrologique.
- Lors de la clôture, seul le lot E-METER-1D1 est versionné ; le document `REFERENTIEL-REV2-EFFICACITE-PARTICIPATIVE.md` est volontairement exclu. Les rapports de recette sont conservés hors dépôt dans `~/Documents/SATEER-RAPPORTS/`.
