# SATEER Energy · MVP02A-2 — Lecture locale et confirmation d'étiquette

**Base contractuelle :** `work/energy-mvp01`, commit `eb0e943809d184780e4ba8abb135ff4ed08f6a4a` (MVP02A-1 livré en recette le 18/11/2026). **Statut initial :** candidat à la recette sur Mac. Une preuve de clôture requiert le rapport ZIP, les tests réels, la validation visuelle et le même SHA local/distant GitHub.

## Problème résolu

MVP02A-1 autorise une fiche individuelle avec photo de l'appareil, photo de plaque et QR privé, mais ne lit aucune caractéristique. Le ménage ne doit pas recopier une plaque technique peu compréhensible. La nouvelle façade propose marque, modèle, puissance nominale en W et tension en V **lorsque l'image est lisible**, laisse l'utilisateur corriger, puis attend l'action explicite « Confirmer et enregistrer ». Les quatre champs sont tous facultatifs ; on peut reprendre ultérieurement.

## Flux et limites

1. Depuis une fiche de passeport existante, prendre une **photo ETIQUETTE** (pas une photo APPAREIL) ; même stockage chiffré `EquipmentPhotoVault` que MVP02A-1, aucune nouvelle copie en clair.
2. Un appel POST privé `/api/energy/labels/:passportId/analyser?tenant=...` récupère la photo *uniquement après* avoir vérifié session Core, tenant, propriétaire, passeport, photo active et type ETIQUETTE. Le serveur transmet les octets déchiffrés au moteur local par **STDIN**, sans fichier temporaire non chiffré ni API cloud.
3. Adaptateur Apple Vision `VNRecognizeTextRequest` compilé localement au moyen des outils de développement macOS (`xcrun swiftc`), binaire privé hors du dépôt. Le moteur OCR est plafonné à 22 secondes, 3 Mo, 60 lignes/25 Ko de réponse. En cas d'échec, saisie guidée manuelle possible, sans prétendre que l'analyse a réussi.
4. Le parseur propose de façon conservatrice seulement 4 caractéristiques. Ne jamais transformer kWh/an en watts, ni une plage de tension en valeur unique. Modèles et marques peuvent être manquants. Les propositions restent non vérifiées ; le texte brut OCR n'est ni journalisé ni enregistré.
5. Les candidats utiles sont conservés en métadonnées privées pour **20 minutes maximum de validité**, dans `energy_equipment_label_proposals`; ils ne sont pas acceptés comme données validées tant qu'aucune confirmation explicite n'a lieu. Une proposition est utilisable une fois, limitée à 12 analyses par passeport/jour. Le ménage peut supprimer un candidat ou corriger une erreur.
6. La confirmation POST `/api/energy/labels/:passportId/confirmer` revérifie tous les droits, la durée et le rattachement de la photo. Chaque caractéristique saisie volontairement est enregistrée dans `energy_equipment_label_versions` avec `revision`, acteur autorisé, date, provenance `OCR_CONFIRME_PAR_UTILISATEUR`, `OCR_CORRIGE_PAR_UTILISATEUR` ou `SAISIE_MANUELLE`. Journal `EquipmentLabelFieldConfirmed.v1` sans recopier les valeurs brutes.
7. GET `/api/energy/labels/:passportId` renvoie **la dernière valeur confirmée pour chaque champ** avec version et provenance. Le groupe d'inventaire `energy_inventory_equipements` et sa `puissance_unitaire_w` ne sont jamais écrasés par un passeport individuel.
8. Suppression d'une photographie : son blob chiffré est effacé par MVP02A-1 ; les observations confirmées restent avec une référence historique à la photo supprimée. Politique de conservation et droit à l'effacement des observations à approfondir avant production.

## Garanties et frontières

- Aucun nouveau compte, privilège institutionnel, transfert AEME, Ecofridges, ASER, SENELEC ni Invest.
- OCR effectué **localement sur le Mac** ; aucune requête réseau émise par notre adaptateur. Le compilateur Apple peut cependant devoir être installé sur la machine ; le script refusera d'appliquer la migration si la compilation ou la lecture d'une image synthétique échoue.
- Aucune notion de puissance mesurée ou consommation électrique réelle : valeurs **déclarées par utilisateur, non certifiées**. Le nom « puissance nominale W » ne suffit pas pour calculer un système PV.
- Aucun numéro de série ni information personnelle extrait : seulement marque, modèle, puissance et tension. Les identifiants de photos, propositions et champs restent privés dans Core / Energy tenant.
- Les photos restent en PNG/WebP nettoyées par le navigateur. En macOS 10.15, certaines images WebP peuvent être illisibles par ImageIO : un message d'échec propose de reprendre avec une nouvelle photo convertie en PNG. L'interface ne simule pas une lecture réussie.
- Aucun modèle IA externe, pas de dépendance SaaS, pas de serveur d'auth parallèle, pas de deuxième registre d'équipements.

## Contrat DB et migration 053

`database/053_energy_equipment_labels.sql`, épinglée par assertion `current_database()='sateer_test'`, contient les tables `energy_equipment_label_proposals` et `energy_equipment_label_versions`, FKs composite photo/passeport/tenant/propriétaire et historique append-only. L'unique changement à une table 052 consiste à autoriser le nouvel événement dans son CHECK. Migration persistante uniquement après `AUTORISER_MIGRATION_MVP02A2`, pas durant les tests rollback.

## Tests à prouver sur le Mac

- Préflight Git et SHA distant ; scripts unitaires nouveaux + MVP02A-1/UX1/inventaire/MVP01 + Core/P1/Ambassade/Diaspora, aucun assouplissement de sécurité d'origine.
- DB `sateer_test` / cluster épinglé : DDL 053 dans une transaction rollback, tests FKs cross-owner, révisions, événement, rollback intégral.
- Compilation locale d'Apple Vision et lecture d'une plaque **purement fictive** sans donnée de client ; texte brut conservé uniquement dans un dossier temporaire privé puis détruit. Une lecture défaillante arrête avant migration.
- Une fois autorisée, migration 053, instance isolée port `3475` ; vrai cookie Core A/B, photo fictive, OCR local, proposition sans validation implicite, confirmation, révision, refus origine tierce et autre tenant, refus B, expiration/rejeu, révocation de session.
- Recette visuelle sur téléphone/ordinateur : choisir une photo ETIQUETTE, lire les suggestions, modifier, confirmer, recharger, vérifier QR et photos MVP02A-1, puis essayer B. Ne saisir `VALIDER_VISUEL_MVP02A2` que si ces tests ont réussi.
- Git ciblé, commit/push **après** confirmation visuelle, SHA distant == SHA local, rapport ZIP unique `open -R`. Aucun `reset`, `clean`, `stash`, `pull`, `rebase` ou `force-push`.

## Suite obligatoire (non livrée)

**MVP02-B** : invitations temporaires, autorisations de contribution et revue par responsable. Les cas Ecofridges et dimensionnement solaire arriveront ensuite, sur des données qualifiées et des modèles métier propres. Pour exploitation réelle : étude de l'UX en wolof, automatisation de la sauvegarde/rotation, politique de purge des propositions anciennes, stratégie hors macOS, contrôle qualité OCR multi-appareils et protocole de validation terrain.

## Correctif R1 sur le test historique MVP02A-1

Le test d'interface `scripts/test-energy-mvp02a1.js` exigeait la mention « aucune valeur n'est extraite automatiquement », devenue incompatible avec l'activation volontaire de la lecture dans MVP02A-2. Le test est actualisé pour contrôler explicitement la présence des deux actions distinctes « Lire cette photo » et « Confirmer et enregistrer », ainsi que la provenance non certifiée. Les protections QR/photo, isolation et chiffrement des 31 autres tests du contrat MVP02A-1 restent inchangées. La mise à jour du test est incluse dans le commit cible.
