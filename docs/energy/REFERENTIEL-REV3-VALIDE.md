# SATEER Energy / SUNU Courant — Référentiel métier consolidé REV3

**Date :** 16 novembre 2026. **État :** décisions métier validées en conversation pour REV1–REV2, enrichies de demandes explicites REV3 ; **pas** de preuve d'implémentation. **Principe :** une seule révision active, la REV2 historique intégralement conservée dans les références du paquet, aucune suppression de principe métier.

Les sections REV2 ci-dessous sont incluses sans suppression pour assurer la continuité. Les ajouts REV3 en fin de document sont à lire comme des contraintes complémentaires. En cas de collision de vocabulaire, REV3 précise les responsabilités sans révoquer les invariants de sécurité REV2.

---

## A. Socle REV2 conservé intégralement

# SATEER Energy / SUNU Courant — Référentiel métier REV2

**Édition :** 2026-11-16 · **Statut métier :** REV1 confirmé par le porteur dans la conversation du 16/11/2026, avec ajouts explicites concernant Academy, Éducation, PIT, Data Operations et isolation des moteurs. **Statut technique :** document de cadrage ; n'atteste ni l'existence des modules ni leur validation E2E. **Révision :** REV2, aucune suppression de périmètre REV1.

## 1. Intention fondatrice

SATEER est issu du secteur énergétique. Il est devenu une plateforme transversale Core + capacités partagées + expériences ; **SATEER Energy demeure un domaine prioritaire fondateur**. Objectif Sénégal puis sous-région : relier citoyens, collectivités, opérateurs, institutions, ingénieurs, entreprises, projets, exploitants et investisseurs, sans présumer de partenariat réel, de mandat de tutelle ou de partage automatique de données.

Parcours unifié : **besoin → collecte → qualité des données → prédiagnostic → sobriété/efficacité → BEI/étude/validation → projet technique → [handoff autorisé vers Invest] → réalisation/réception → actifs → monitoring/M&V/maintenance → impact → retours pédagogiques**. Les étapes peuvent être reprises et ajustées ; aucune étape financière n'est un raccourci vers une validation technique.

## 2. Doctrine d'architecture figée

- Réutiliser **SATEER Core** (identités, personnes, organisations, unités, relations, territoire, permissions, audit, dossiers génériques, documents, workspace) ; **SATEER Communication** unique (publications, canaux, abonnements, notifications), **Workflows** unique (états, tâches, file, approbations), **Data Quality** transverse (import, normalisation, déduplication, provenance, validation), **Monitoring**, **Engineering/Simulation**, **Learning**, **IA** par contrats séparés.
- **SUNU Courant** est une expérience du domaine Energy et un outil de besoins et de prédiagnostic accessible aux non-techniciens ; **BEI** est l'expérience pour les études professionnelles et validations d'ingénieurs ; **SATEER Invest** est l'univers financier autonome ; **SATEER Academy et SATEER Éducation** sont des expériences pédagogiques partageant les moteurs Learning et Engineering, sans recopier les calculs.
- Monolithe modulaire au départ, avec ports/adaptateurs et contrats versionnés ; extraction éventuelle des moteurs en services uniquement si les besoins de charge, d'isolation et d'exploitation le justifient. Aucun nouveau serveur Core, nouvel auth ou deuxième moteur Communication.
- Chaque calcul scientifique fonctionne avec des entrées/sorties documentées et des tests indépendants de l'interface. Les modèles de factures, tarifs, tarifs pays/opérateur, compteurs, équipements, baselines, M&V, énergie thermique, qualité réseau, PV/stockage/pompage et données de télémétrie restent isolés.
- **Dossier énergétique canonique évolutif** : EnergyCase/Site et événements versionnés, état des données (déclarée, estimée, mesurée, inférée, validée), unité, incertitude, période, provenance, auteur, preuves, niveau de vérification, permissions. PDF = livrable, jamais source métier.

## 3. SUNU Courant : tout profil, tout mode d'alimentation

- Particulier, Pro (commerce, PME, agriculture) et Organisation (industrie, administration, bâtiment public) ; énergie SENELEC, Woyofal, pré/postpayé, compteur traditionnel/intelligent, solaire autonome, groupe, mini-réseau, hybride et **site sans compteur** ; ne pas imposer une facture.
- Entrée progressive par problème : facture élevée, coupures/qualité, confort, froid/climatisation, pompage/forage, nouveau projet, rénovation, efficacité, production solaire ; assistance et parcours accessibles. Inventaire participatif de pièces/étages/bâtiments/équipements/usages/extérieurs, plusieurs contributeurs habilités, responsable validateur.
- Séquence : comprendre → mesurer ou estimer explicitement → fiabiliser → comparer → optimiser avant solaire → étudier/dimensionner → mettre en œuvre → mesurer l'effet.
- L'opérateur et les tarifs sont des référentiels/adaptateurs versionnés (SENELEC/Woyofal initialement), jamais codés comme vérité universelle. Réclamations préqualifiées transmises à l'opérateur seulement si convention et interface autorisées.

## 4. Communication partagée, Workflows et opérations internes : séparation impérative

**Réponse d'architecture : garder SATEER Communication unique ; créer un espace/équipe internes `SATEER Data & Technical Operations`, PAS un deuxième moteur Communication.**

| Capacité / bureau | Responsable | Ce qu'il ne fait pas |
|---|---|---|
| Communication (transverse) | Publications, campagnes, canaux, opt-ins, alertes, diffusion institutionnelle autorisée | Nettoyage de données, décision institutionnelle, calcul scientifique |
| Workflow (transverse) | Admission de dossiers, tâches, états, escalade, validation, audit | Prendre la décision métier à la place de l'organisation |
| Data Quality (moteur transverse) | Parsing, standardisation, provenance, dédoublonnage, contrôle des unités/valeurs, score de complétude/qualité, versioning | Modifier silencieusement une mesure, délivrer une autorisation |
| SATEER Data Operations (équipe interne) | Préqualifier, corriger avec trace, enquêter anomalies, constituer lots et KPI exploitables, produire rapports facturables | Valider à la place de l'AEME ou d'un organisme compétent |
| SATEER Technical Operations / BEI | Expertises et études techniques, besoin de visite terrain, revues et validation humaine de la qualité de calcul | Déléguer automatiquement une signature d'ingénieur à l'IA |
| Institution (AEME/PIT, ANER, ASER, SENELEC) | Vérifications terrain par agents habilités, sélection/approbation, déploiements, décisions, suivi de programme | Accès illimité à tous les dossiers individuels SATEER |

La synthèse présentée à une direction est d'abord agrégée, avec origine, période, indicateurs, échantillons, règles de calcul, incertitudes et drill-down **uniquement si les habilitations le permettent**. Les contributions et pièces brutes sont protégées. Les accès d'un PIT, d'un membre du personnel et d'un prestataire sont distincts.

**Scalabilité :** ingestion par lots, tâches asynchrones contrôlées, rejouabilité/idempotence, journaux d'erreurs, contrôle de schéma, séparation des données brutes/qualifiées/publiées. Volume de plusieurs centaines de milliers de contributions : ambition d'architecture à tester, pas performance actuellement démontrée.

## 5. AEME : PIT, bâtiments publics, programmes et rapport de résultats

**PIT = Points d'Information Territorialisés de l'AEME** ; vérifier partenariat et mandat pour chaque dispositif. Leur rôle réel comprend proximité, sensibilisation, assistance, orientation et actions terrain (sources AEME ci-dessous). Nos écrans sont des propositions pour renforcer leurs méthodes, pas leur procédure officielle.

**Cas prioritaire Bâtiment public participatif :** organisation/site → bâtiment → étage/zone/pièce → usages, appareillages, climatiseurs, éclairage, pompes, eau, groupe/solaire → informations factures/relevés → contrôles Data Quality → constat baseline & incertitude → prédiagnostic BEI → interventions proposées → décision AEME → exécution → comparaison avant/après → KPI. Les données sensibles sont protégées ; estimations et mesures sont distinguées.

**Cas PIT / campagne :** AEME définit campagne et destinataires autorisés → Communication diffuse → SUNU recueille contributions avec consentement → Data Operations qualifie → PIT/agent vérifie sur site si habilité → AEME arbitre → programme exécuté → Monitoring suit. Exemple historique déjà travaillé : **Ecofridges à Tambacounda** avec une proposition de distribution des dossiers aux PIT et décision finale AEME ; ce scénario n'est pas une procédure officielle acquise. Campagnes de sobriété, éclairage efficace, marchés, réseaux de femmes, collectivités, SONAGED et équipements à remplacer doivent être modélisés en programmes réutilisables.

Deux vues de suivi : **population générale** (sensibilisation et tendances agrégées) et **cohorte de bénéficiaires** (avant / pendant / après, économies qualifiées). La validation humaine et les raisons d'exclusion sont historisées. Les tableaux de bord doivent rester vivants, export PDF optionnel.

**Références vérifiées le 16/11/2026 :**
- AEME PIT : https://www.aeme.sn/pit/
- AEME partenariat PIT Touba et services de proximité : https://www.aeme.sn/%F0%9D%90%82%F0%9D%90%A8%F0%9D%90%A7%F0%9D%90%AF%F0%9D%90%9E%F0%9D%90%A7%F0%9D%90%AD%F0%9D%90%A2%F0%9D%90%A8%F0%9D%90%A7-%F0%9D%90%9D%F0%9D%90%9E-%F0%9D%90%A9%F0%9D%90%9A%F0%9D%90%AB%F0%9D%90%AD/
- AEME actualité plan 2026 sur PIT, Ecofridges, éclairage efficace : https://www.aeme.sn/
- Rapport AEME 2023 (PIT, SARDEL et assistance technique) : https://www.aeme.sn/wp-content/uploads/2025/06/RAPPORT-ANNUEL-2023_compressed.pdf

## 6. Institutionnels supplémentaires : expériences dédiées sans duplication

- **ANER :** projets renouvelables, PV, pompage solaire, éclairage public, actifs, partenaires, exploitation, maintenance ; bureau de suivi de programme et interventions. Référence https://www.aner.sn/ .
- **ASER :** rural, sites isolés, demandes d'accès, mini-réseaux, équipements sociaux/productifs, projets et bénéficiaires, impact. Référence https://aser.sn/ .
- **SENELEC :** information pré/post-paiement/Woyofal, facture/recharge expliquée, plaintes préqualifiées, pièces, contrôle, attribution territoriale à des **agents propres à SENELEC**, compte rendu terrain, validation de résolution par client ; aucune API ni traitement officiel présumé. Référence https://www.senelec.sn/woyofal/faq/ .
- Les responsables institutionnels disposent de leurs propres Workspaces et tableaux de bord filtrés. SATEER coordonne mais ne se substitue pas à l'opérateur ni aux administrations. Les validations techniques ou financières restent sous responsabilité humaine.

## 7. BEI / Engineering et retour d'expérience sur réalisations

- Étude énergie structurée versionnée, modèles scientifiques isolés, hypothèses affichées, scénarios comparaison, mesures terrain et revues d'ingénieur. Calcul ne signifie pas étude validée ; IA ne signe ni ne certifie.
- Chaîne comparative : **avant étude / étude / ouvrage réalisé / mesuré en exploitation**. Expliquer les écarts, qualité des données, contraintes, entretien, performance et paramètres pays.
- Les études réelles peuvent enrichir un **catalogue de cas pédagogiques** seulement après consentement/licence, retrait des identifiants et éléments contractuels, contrôle du risque de réidentification, revue technique et autorisation de publication. Prévoir des **cas entièrement synthétiques** dès les premiers tests.

## 8. SATEER Éducation & SATEER Academy (ajout REV2 validé en principe)

L'enseignement couvre **élèves, collégiens, lycéens, étudiants et professionnels**. Un même projet réalisé peut être étudié à différents niveaux : compréhension de la facture et des gestes, bilan de puissance, estimation de consommation, rendement, dimensionnement PV, coût technique, simulation, courbes prévues/réelles, mesure des économies.

- **SATEER Éducation** : expérience école/collège/lycée, enseignants, classes, exercices et tableaux de bord scolaires. Adaptation par âge, prévention de l'exposition des données de mineurs, accès parental/institutionnel selon règles, pas de dataset réel sensible.
- **SATEER Academy** : étudiants, techniciens, agents terrain, professionnels et ingénieurs ; parcours, études guidées, exercices, scénarios d'audit et validation pédagogique.
- **Moteur `Learning` partagé** : contenus versionnés, `LearningCase`, progression, scénarios, évaluation, feedback, droits d'auteur, licences, anonymisation, publication pédagogique. **Moteur `Engineering/Simulation` partagé** : calcul scientifique et paramètres ; mode pédagogique isolé (sandbox, dataset synthétique/dé-identifié, calcul déterministe), aucune mutation des actifs/projets réels par une simulation d'élève.
- **Doctrine :** « Les projets réels nourrissent des études de cas pédagogiques autorisées ; les simulations pédagogiques ne modifient jamais les projets réels ». L'usage de cas réellement anonymisés dépend de l'analyse d'autorisation et de confidentialité, pas d'un simple effacement du nom.
- L'architecture Academy/Éducation est décidée comme **séparation de façades et réutilisation des moteurs** ; les parcours de classe détaillés et les évaluations restent à spécifier MVP par MVP.

## 9. Invest, actifs et Monitoring

- **Energy** = besoins, audit, ingénierie technique et administrative, estimations de coût technique et économies attendues ; **Invest** = origination financière, structuration, investisseurs, autorisation de publication des opportunités, data room, engagements et portefeuille. Handoff Energy→Invest explicite, consentement/revocation et version du dossier, aucun transfert implicite.
- **Actifs/Project OS** = réalisation, EPC, réception, installateur, exploitant, mainteneur, garanties, interventions, événements ; **Monitoring** = capteurs ou relevés manuels, mesures, anomalies, maintenances, M&V; **Invest** consulte seulement les KPI techniques autorisés pour reporting des investissements.
- Aucun paiement, levée de fonds ou gestion de titres sans cadre et acteurs financiers habilités. L'éligibilité au financement et les rendements ne sont jamais inventés.

## 10. Règles de livraison et transmission Codex

- Worktree Energy autonome à partir du commit P1 GitHub **`d2eb6ee673145cea5a5c5f23fe9d1329a81bbee7`**, à vérifier en local avant chaque opération. N'altérer ni `work/bordeaux-pilot`, ni les worktrees Ambassade/Diaspora/P1, ni leurs données.
- Chaque MVP : critères d'acceptation + tests unitaires de moteurs purs + tests contrat/API + sécurité RBAC/tenant/site/consentement + tests E2E selon périmètre + rollback de fixtures + revue UI + documentation + preuves + commit local ciblé + push non forcé + SHA distant vérifié. Aucun changement de comptes ou de base sans précontrôles et autorisation.
- Scripts groupés Terminal, rapport ZIP unique, Finder `open -R`; pas de Codex requis aujourd'hui.
- Codex doit lire le registre des décisions, la roadmap, les interfaces, les rapports et les SHA déjà validés. Il doit vérifier l'état réel du dépôt sans réexaminer artificiellement les décisions métier figées, et ne doit pas présumer qu'un document validé constitue une preuve d'implémentation.

## 11. Frontières ouvertes, à décider au bon MVP

Détailler plus tard : politique de publication des opportunités Invest, contrat Energy→Invest, habilitations institutionnelles réelles, règles de consentement mineurs pour Éducation, licences des cas réels, modèles scientifiques et référentiels techniques, SLA de Data Operations, précision des méthodes M&V et fonctionnement hors ligne. **Aucune de ces questions ne bloque la validation du périmètre stratégique REV2.**

## 12. Provenance et précision

- **Décisions conversationnelles** : éléments de « SATEER7-SUNU COURANT » et discussions Energy précédentes retrouvés par thème, complétés par les instructions du 16/11/2026. Texte intégral de l'ancienne discussion non récupéré comme transcription continue.
- **Sources externes** : sites officiels AEME/ANER/ASER/SENELEC ci-dessus, vérifiés le 16/11/2026. Les informations institutionnelles sont indépendantes des accords SATEER ; aucun mandat signé supposé.
- **Preuves techniques** : la branche P1 contient l'architecture et l'interface transversale ; les modules Energy/Invest/Learning nouveaux ne sont pas déclarés livrés dans ce document.

---

## B. Ajouts REV3 explicitement demandés

### B1. Maintenance industrielle et diagnostic automobile — deux spécialisations, un registre Equipment

- **Maintenance industrielle** : équipements électriques, mécaniques, HVAC, groupes, pompes, machines, installations PV, batteries, réseaux, etc. Maintenance préventive/corrective/conditionnelle, ordres de travail, interventions, disponibilité, historique, interventions terrain et alertes ; adaptation par type et niveau de risque.
- **Diagnostic automobile / flotte** : dossier véhicule, entretiens, pannes/symptômes, mesures, diagnostics assistés, passages atelier, compte-rendus d'un professionnel qualifié ; connecteurs OBD et constructeur seulement si autorisés et documentés. Ne jamais assimiler un diagnostic distant à une inspection sûre ni automatiser une action de conduite/commande sur véhicule.
- **Passeport numérique d'équipement (Equipment Passport)** : chaque objet technique reçoit un identifiant interne stable (UUID) indépendant de son fabricant, de son propriétaire et du site. Enregistrer identité, famille/type, modèle/référence/série si disponible, propriétaire, site, dates, état de service, caractéristiques, preuves et contrats.
- **Durabilité** : historique append-only d'événements audités, versions, liens de remplacement, transfert de responsabilité, archivage et sauvegarde/restauration testée. "Ne se perd jamais" est un **objectif de continuité**, pas une promesse de conservation absolue : rétention, suppression réglementaire et récupération encadrées. Pas de suppression silencieuse.
- L'inventaire et les maintenances relèvent de moteurs `Equipment Registry`, `Maintenance`, et d'adaptateurs `Industrial`/`Automotive`. La fiche equipment est **transversale** ; ni l'industrialisation ni la voiture ne créent un deuxième modèle canonique.

### B2. Intelligence stratégique / veille quotidienne et hebdomadaire

- **Objectif** : éviter que le porteur doive découvrir manuellement les appels d'offres, subventions, fonds climatiques, aides, projets, partenariats, évolutions réglementaires et nouvelles politiques/stratégies d'organismes publics.
- Créer une capacité autonome `Policy & Opportunity Intelligence` : sources officielles documentées (AEME, ANER, ASER, SENELEC, ARCOP/APPEL, banques, fonds et Nations unies) ; collecte autorisée et sourcée ; historisation des changements ; contrôle des délais, pays, critères et contacts. Les organismes sont des *sources* ou partenaires potentiels, jamais des clients fictifs.
- **Deux sorties** : page quotidienne "Nouvelles et échéances" et synthèse hebdomadaire "Priorités et opportunités" ; filtres par pays, structure, thème, moteur, type d'aide, délai, niveau de preuve et pertinence. En cas d'échec de source, afficher `non vérifié depuis...`, jamais un flux prétendu à jour.
- L'agent doit examiner d'abord un **registre autorisé de capacités SATEER** et les **métadonnées de projets existants / réalisés** visibles à son niveau, avant de recommander : (a) opportunité avec capacité réutilisable, (b) projet réexploitable, (c) partenariat à instruire, (d) fonctionnalité manquante à étudier. Ne pas supposer que la fonctionnalité existe si elle n'est pas livrée et testée.
- Produire un dossier de recommandation avec : source URL officielle, date de publication et date d'échéance, exigences, périmètre et admissibilité **non confirmée tant qu'une revue humaine n'a pas eu lieu**, liste de capacités effectivement disponibles / non disponibles, références de projets autorisées, score interprétable, risques, responsable et prochaine action.
- Les opportunités **financières** et relations avec investisseurs sont traitées dans `SATEER Invest`, via des contrats de transfert ; la veille et les recommandations sont une capacité transverse, sans paiement, soumission automatique ni création de droits.
- La recherche et le rapprochement sont **automatisables après déploiement d'un ordonnanceur et de connecteurs fiables**. Le paquet REV3 fournit le cadrage uniquement ; aucun agent autonome n'est mis en marche par la publication de la documentation.

### B3. Organisations et modes d'exploitation

- `SATEER Communication` reste **unique** pour la notification des nouvelles opportunités et campagnes. Le moteur de veille ne développe ni canal de notification autonome, ni second module Communication.
- `SATEER Data Quality` vérifie les données et preuves, y compris annonces collectées. `SATEER Data & Technical Operations` contrôle les pièces et mesures métier. `SATEER Strategy & Opportunity Review` est le **rôle d'analyse/qualification humaine** des opportunités ; ce n'est pas un nouvel Auth/Core ni une institution.
- Les politiques d'AEME, ASER, ANER, SENELEC et les programmes sous-régionaux sont suivis par pays/autorité/programme/version ; changements validés avant modification d'une règle métier. Aucun texte de veille ne devient règle de calcul ou décision administrative automatiquement.
- `Academy` / `Éducation` peuvent utiliser des données de machines/automobiles ou projets réalisés sous **cas pédagogiques autorisés et anonymisés** ; jamais accès direct à des dossiers privés, et pas de copie de moteurs scientifiques.

### B4. Exemple de correspondance (hypothétique, non éligibilité vérifiée)

Une institution publie un besoin d'inventaire et de maintenance d'équipements : l'agent compare le cahier des charges au registre SATEER des fonctionnalités **livrées**. SATEER peut éventuellement préparer un diagnostic, un inventaire des actifs, un suivi des interventions et des indicateurs, mais n'annonce une réponse possible que lorsque les compétences, qualifications, partenaires, délais et ressources sont vérifiés. Si un moteur manque, il crée **une proposition de chantier**, pas un module imaginaire.

### B5. Invariants de sécurité et d'exploitabilité

1. Registre de capacités vérifiable (`planned` / `in_development` / `tested` / `released` / `deprecated`) avec version, preuve Git, tests, responsable, secteurs et droits. Seuls `tested`/`released` peuvent être proposés comme réemploi effectif.
2. Le portfolio projets distingue `idéation` / `en_étude` / `validé` / `réalisé` / `en_exploitation`, avec partage explicite de métadonnées ; aucun accès aux fichiers privés sans droit.
3. Données externes non fiables : extraire comme données, neutraliser consignes injectées, ne jamais exécuter d'instructions trouvées dans un appel d'offres.
4. Prioriser source officielle, date et statut actifs ; dédoublonner les révisions/additifs, journaliser les erreurs, respecter licences/robots/quotas ; connecteurs en lecture seule.
5. Contrôle humain sur tout engagement, réponse à appel d'offres, transmission de données, dépense, partenariat, décision d'éligibilité.
6. Versions des calculs, normalisations, détections et recommandations archivées ; erreurs et faux positifs mesurés.

## C. Règle de progression figée

Toute amélioration Energy, Maintenance, Learning, Invest ou Intelligence stratégique : registre de décision → MVP isolé → code/test/contrat → rapport unique → validation humaine → commit ciblé + push GitHub + égalité SHA → mise à jour reprise Codex. Aucun changement aux pilotes Bordeaux/Ambassade/Diaspora/P1 depuis la branche Energy.
