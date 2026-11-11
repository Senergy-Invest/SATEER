# Bordeaux P335BY — Gestion des dossiers par bureau et agent

## Périmètre et principe

- Base locale `sateer_test`, organisation **70**, tenant **P6V_3B5AC5AB9DB04657** seulement.
- Dossiers existants, champ canonique `demandes.assignee_a`, statuts `NOUVELLE`, `EN_COURS`, `TRAITEE` ; pas de copie métier concurrente.
- Un droit **ASSIGN_CONSULAR_CASES_PILOT** attribué nominativement au Vice-Consul A01, **en plus** de `VIEW_OPERATIONAL_DASHBOARD`. Pas de droit Secrétariat, Association, Agent ou Consul par défaut.
- Éligibilité agent : rattachement actif à l'unité, relation organisation de type personnel, droit effectif `TAKE_CASE` dans l'unité ou l'organisation et capacité `TAKE_CASES` active dans le bureau. Disponibilité configurable par A01 ; la capacité relative est entre 0,25 et 2.
- Modes : **MANUEL** (agent choisi explicitement), **AUTO ASSISTÉ** (proposition calculée et appliquée après clic), et **LOT** (jusqu'à 20 dossiers non affectés après confirmation). Aucune tâche planifiée, aucune affectation déclenchée par la réception d'un e-mail.
- Seuls les dossiers **NOUVELLE** déjà orientés vers un bureau peuvent être affectés. La prise en charge reste l'action de l'agent, qui passe le dossier en `EN_COURS`. Une réaffectation de dossier en attente exige un motif explicite ; une réaffectation d'un dossier en cours n'est pas permise dans ce lot.
- La répartition minimise la charge courante des dossiers `NOUVELLE` + `EN_COURS` par unité de capacité. Les agents indisponibles ou non habilités sont exclus ; le même calcul est réévalué sous verrou transactionnel, et chaque décision est auditée. Le calcul ne garantit pas une égalité parfaite en cas de dossiers hétérogènes.
- Le code de prise en charge et de réponse doit refuser un autre agent lorsque `assignee_a` est déjà renseigné. Cela préserve la responsabilité et l'historique.

## Lecture et supervision

- Vue par bureau : dossiers reçus, nouveaux, en cours, traités, non affectés et agents avec charge.
- Vue par agent : capacité, disponibilité, charge des dossiers ouverts, nombre de dossiers traités, délais observés entre réception, première réponse et remise.
- Les moyennes sont calculées sur les dossiers dont les horodatages sont réellement présents dans `demande_history` et `demandes` ; `NULL` signifie absence de mesure, **jamais zéro garanti**. Réponse et clôture sont séparées.
- Pagination serveur de 50 dossiers ; mesure détaillée d'ancienneté plafonnée à 3 000 dossiers par bureau avec erreur explicite au-delà, sans troncature trompeuse. Les agrégations de charge ne sont pas plafonnées.
- Audit des décisions dans `pilot_case_dispatch_audit` : auteur, bureau, dossier, agent, ancien et nouvel état, motif et date. Les réglages de disponibilité/capacité sont également audités.

## Risques traités

- Contrôle de session, droits calculés côté serveur, isolation organisation/tenant, base et identifiant PostgreSQL de recette, origine des écritures.
- Verrou de transaction PostgreSQL par bureau pour les affectations, lignes dossiers verrouillées ; statut et ancienne affectation revérifiés dans la requête `UPDATE`.
- Aucun courrier fictif n'est converti en dossier par P335BY ; aucun IMAP, SMTP, envoi, publication ni paiement.
- Aucun changement à la route de création citoyenne ni aux règles de triage P335BX ; les préaffectations sont uniquement faites via une commande autorisée du Vice-Consul.
- Révision fonctionnelle requise après installation : tester A01, un agent du bureau Passeport et le Secrétariat ; ne pas attribuer les données d'essai à un agent sans vérifier les habilitations.

## Suites après P335BY

- Améliorer l'expérience agent pour prioriser ses **propres** dossiers affectés et la traçabilité des réaffectations en cours sous contrôle hiérarchique.
- Connecter ultérieurement le moteur de triage e-mail et l'entrée dossiers **après** configuration de vraies règles et autorisation du Consulat ; ce lot ne transforme aucune proposition e-mail en acte.
- Ajouter des SLA paramétrés par bureau et des périodes de disponibilité synchronisées avec les plannings, au lieu d'inférer des délais de service.
