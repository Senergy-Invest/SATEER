# Pilote Bordeaux — état, ordre et reprise

**Point de référence : 9 novembre 2026, d'après les résultats de recette transmis.**
Les états ci-dessous sont des **constats transmis**, pas une recette exhaustive exécutée sur ce dépôt au moment de la génération.

## Étape active : CONSOLIDATION ARCHITECTURE / GIT

**Pourquoi cette pause ?** Les correctifs du pilote se sont accumulés ; la maintenance par des développeurs humains exige une cartographie, des commits ciblés, une documentation et des tests réexécutables. Pas de réécriture générale ni de nouveau service inutile.

### Ordre impératif des prochaines étapes

- [ ] **C1 — Inventorier Git et les sources réellement servies** ; distinguer code utile, scripts de recette, sauvegardes, fichiers générés. Lire `ETAT-GIT-LOCAL.md` ; examiner les changements sensibles avant de les intégrer.
- [ ] **C2 — Vérifier les frontières** du Core, des capacités transversales et de l'expérience Consulat ; documenter les API, permissions, données et migrations réellement implémentées. Préférer consolider les modules existants au déplacement aveugle de fichiers.
- [ ] **C3 — Définir et exécuter une batterie de non-régression locale** : isolation org/tenant, rôles, communication, dossiers, courrier simulé, démarches, dashboards. Les tests réellement exécutés et leurs résultats doivent être inscrits ici.
- [ ] **C4 — Nettoyer la stratégie Git sans perte** : examiner les sauvegardes déjà suivies, décider des exclusions et des retraits de l'index avec revue explicite. Aucun `git add .`, `git clean`, `git reset --hard` ou `git rm` aveugle.
- [ ] **C5 — Créer des commits thématiques après revue** du diff, et garder un état de travail reproductible. Ne pas confondre tests simulés de kits et validation sur le vrai dépôt.
- [ ] **RETOUR OBLIGATOIRE AU CATALOGUE** : reprendre exactement à la fiche `[DEMO BORDEAUX] Renouvellement de passeport — test fictif`, encore **BROUILLON** ; ne pas cocher « vérifié avec l'autorité consulaire » pour du fictif.

## À reprendre au catalogue — après C1 à C5

- [ ] Prévoir un **mode de validation/publication de recette explicitement séparé** des approbations officielles, avec garde serveur ; ne jamais utiliser une fausse attestation institutionnelle.
- [ ] Tester **brouillon → validation de recette → publication de recette → modification qui révoque validation**, avec droits et audit, sans publier de pièces fictives comme exigences réelles.
- [ ] Vérifier que la réponse guidée par e-mail trouve uniquement une **fiche exacte, publiée, validée** ; distinguer première demande et renouvellement. Si aucune fiche éligible : pas de réponse officielle inventée.
- [ ] Créer un **lien public vers la fiche précise** dans Mon Consulat pour l'information générale sans compte obligatoire, et vérifier le trajet depuis le brouillon e-mail.

## Suivi de l'ensemble du pilote — ne pas perdre ces chantiers

### Déjà démontré, selon les sorties utilisateur

- Parcours des dossiers synthétiques : orientation → prise en charge → message sans clôture → document prêt → remise fictive → clôture. Dossier n°132 `TRAITEE`, journal agent en lecture seule, suivi citoyen.
- Tableau du Vice-Consul : synthèse et registre paginé, 6 dossiers (au dernier état affiché : 2 nouvelles, 0 en cours, 4 traitées), dossier urgent n°133 et attente n°137.
- Communication institutionnelle et association de recette connectée ; preuves de réception et diffusion à conserver.
- Courriers fictifs : classification **intention puis thème** ; question générale ≠ dépôt ; cas ambigu au secrétariat ; aucune connexion à la boîte officielle, aucun envoi réel.
- Démarches : une fiche de passeport fictive en **BROUILLON**, une ancienne fiche carte consulaire **À REVALIDER** ; droit `MANAGE_PROCEDURES` pour le compte de recette, attribution `MANAGE_PUBLICATIONS` constatée pour la personne 322 / organisation 70 (portée large, révocable).

### Reste à vérifier/démontrer avant présentation

- [ ] Tableau stratégique du **Consul**, cohérent avec Vice-Consul et résultats réels.
- [ ] Vérification globale des profils, permissions et parcours authentifiés (citoyens, agents, secrétaire, Vice-Consul, Consul, associations).
- [ ] Couplage abonnements/canaux de communication et **notifications réellement consultables**, pas seulement enregistrées.
- [ ] Traitement courrier : réponses FAQ institutionnelles pré-approuvées, gestion des exceptions du secrétariat, dédoublonnage et trace ; maintenir la boîte officielle existante utilisable.
- [ ] **Boîte officielle réelle** : connecteur uniquement après accord, provenance, protocole, sécurité, confidentialité et recette synthétique ; aucune connexion implicite.
- [ ] Modalités de retrait documentaires structurées et configurables, sans dates ni lieux inventés.
- [ ] Présentation finale : Vice-Consul publie → citoyens concernés informés → associations relaient si autorisées → demandes/e-mails routés → agents traitent → Vice-Consul supervise → Consul voit les résultats.

## Invariants de protection

- Environnements de recette uniquement pour des données synthétiques ; isoler organisation/tenant, droits et SQL.
- Le mail d'information générale renvoie vers la fiche officielle **et n'ouvre pas un dossier**.
- La présence du mot « passeport » ou d'un objet normalisé ne justifie jamais un routage par elle-même.
- Le traitement des e-mails réels et les réponses automatiques ne sont **pas actuellement raccordés/validés**.
- Le code et sa documentation doivent rester maintenables par une équipe humaine autonome.

## Discipline de reprise

À la fin de chaque lot : inscrire date, commit, tests passés/échoués, problèmes encore ouverts, **prochain lot exact**. Si une étape est suspendue, garder son identifiant et la condition précise de reprise ici.
