# SATEER — Bordeaux P335BW · Circuit des courriers, Secrétariat et répartition des dossiers

**Statut :** conception du circuit cible + noyau de décision PUR testé + correction du retour navigateur. **Non opérationnel pour les courriers institutionnels** : aucune ingestion IMAP/OAuth, aucun SMTP ni affectation réelle des dossiers par ce lot.

## Constat du dépôt au 11/11/2026

- `public/email-secretariat-demo.js` redirigeait le bouton `back` systématiquement vers `dashboard-vice-consul.html`, même sous le compte Secrétariat. Les refus 403 observés sont corrects ; le lien est mauvais.
- `bordeaux-email-demo-http.js` permet la lecture seule des messages `DEMO_SYNTHETIQUE` pour `VIEW_CONSULAR_MAIL_DEMO` ou `VIEW_OPERATIONAL_DASHBOARD` et ne connaît pas de file « exceptions uniquement ».
- `public/sateer-mail-intent-core.js` distingue INFORMATION, DEMANDE, SECRETARIAT ; **classifier ne déclenche pas d'action**.
- `pilot-routing-rules.js` sait orienter automatiquement une demande **créée dans Mon Consulat** (`source='MON_CONSULAT'`). Il n'autorise pas l'orientation réelle d'un e-mail entrant.
- Le tableau de bord opérationnel P2 existe, ainsi que l'annuaire des agents éligibles ; des métriques de bout en bout par agent ne sont pas encore établies comme contrat de lecture fiable.

## Parcours métier cible : intention avant thème

1. **Réception** (uniquement après convention, configuration technique et autorisation du consulat) : import non destructif de la boîte existante, dédoublonnage durable `mailbox_id + message_id`, conservation du message/source et horodatage.
2. **Préqualification** : information / demande actionnable / exception. Le mot « passeport » dans l'objet ne suffit jamais à identifier une demande ; un manque de confiance conduit au Secrétariat. Journaliser motif, version de règle, source, date et éventuelle intervention humaine.
3. **Information générale** : rechercher exclusivement dans le catalogue institutionnel **publié, explicitement validé et applicable** ; vérifier modèle de réponse, destinataire, langue et autorisation. Préparer une réponse et proposer « Mon SATEER / Mon Consulat » ; l'envoi autonome est un réglage distinct, OFF par défaut et activé seulement après autorisation institutionnelle. Sans validation suffisante → Secrétariat, jamais une invention de l'IA.
4. **Demande actionnable** : reconnaître la démarche, vérifier lien avec une personne/identité, consentement, pièces, doublons et règle `source='COURRIER_ENTRANT'` dédiée. Puis orienter au bureau habilité ou à sa file « pièces à compléter ». Aucun dossier créé seulement à partir du mot-clé. Règles de `MON_CONSULAT` réutilisables **comme suggestion**, pas comme preuve d'autorisation du canal e-mail.
5. **Exception** : dossier personnel, réclamation, ambiguïté, thème inconnu, contradiction, dossier incomplet sans bureau habilité, erreur de connexion, absence de source officielle. Secrétariat : examiner, répondre ou escalader, conserver l'historique.
6. **Traitement du bureau** : réception, prise en charge, premier retour, attente de pièces, document prêt, remise effective, clôture. La première réponse, la résolution et la remise sont des événements différents.

## Vues et RBAC

| Rôle | Vue principale | Règle d'accès |
|---|---|---|
| Secrétariat | **File humaine** : exceptions, ambiguïtés, échecs de vérification, actions à arbitrer | `VIEW_CONSULAR_MAIL_DEMO` en recette puis permission production dédiée ; le filtrage doit être imposé par l'API, y compris `/messages/:id` et `/conseil` |
| Vice-Consul | **Tous les courriers** : automatiques, bureau, secrétariat, échecs et historique | Permission de supervision **et** appartenance à l'organisation ; lecture de contenus sensibles selon l'habilitation, audit et masquage nécessaire |
| Responsable de bureau | Dossiers de son bureau, capacité des agents, affectations | `UNIT` et `ASSIGN_MEMBER` selon les règles RBAC existantes |
| Agent | Dossiers effectivement accessibles/affectés, pas toute la boîte | Règles de propriété et périmètre agent |
| Consul | Synthèse agrégée, sans courrier personnel brut par défaut | `VIEW_STRATEGIC_DASHBOARD` ; données agrégées non sensibles |

Le Secrétariat ne doit pas simplement masquer des courriers dans le navigateur : l'API doit **refuser** les détails des messages appartenant à une autre file. Un compte conservant deux permissions devrait avoir une vue explicitement déterminée par le serveur.

## Paramétrage du Vice-Consul

Écran « Qui reçoit quoi ? — Courriers entrants » DISTINCT du routage des dossiers `MON_CONSULAT` :
- Source e-mail autorisée, classification, règle de catégorie → bureau, actif/inactif, exceptions ; test de règle avant activation ; fallback Secrétariat ; version/acteur/date de changement.
- Réponses automatiques : OFF par défaut ; template officiel approuvé ; canal/expéditeur ; catégories admissibles ; contrôle de fiabilité ; seuil d'erreur ; possibilité pause d'urgence.
- Affectation intra-bureau : MANUEL, AUTO, ou PROPOSITION_AUTO_AVEC_VALIDATION ; seules les personnes rattachées, actives, habilitées et non absentes peuvent être proposées.
- Journaliser chaque décision ; ne jamais permettre au Vice-Consul de modifier directement l'historique des messages.

## Affectation équitable des agents

Proposition initiale `charge_ponderee / capacite_effective` : charge = dossiers actifs pondérés par urgence, âge et complexité (coefficients institutionnels configurables) ; capacité = disponibilité réelle pondérée par fraction de temps de travail. Trier par ratio croissant, puis ID stable comme règle de départage. Un agent absent, non habilité ou hors bureau est exclu. Aucune affectation si aucune personne admissible : file bureau « à attribuer ». Le responsable peut réassigner avec motif, contrôle RBAC et audit. La fonction de référence dans `pilot-mail-dispatch-core.js` utilise pour l'instant une charge numérique déjà calculée ; l'acquisition et la validation des charges ne sont **pas** implémentées.

## Tableaux de bord et horodatages

Compter sur une période configurable et pour une organisation donnée : total reçus, catégorisés, destinés à réponse, transmis au bureau, exceptions, échecs, non traités, dossiers sans agent ; taux auto **effectivement envoyé** distinct des **simulations** ; nombre par bureau, par agent, âge des plus anciens, retards selon délais fournis par le Consulat.

Distinguer quatre délais : **réception → orientation**, **orientation → prise en charge**, **prise en charge → première réponse**, **réception → document remis**. Donner moyenne et percentiles sur un échantillon daté ; ne pas remplacer les horodatages absents par zéro ; ne pas interpréter « document prêt » comme dossier clôturé. La consultation agrégée n'implique pas de droit d'accès au contenu individuel.

## Contrats cibles (pas encore des API actives)

- `GET /api/organisations/:orgId/email-dispatch/rules?tenant=...` : Vice-Consul configurateur, version courante.
- `PUT .../rules` : comparaison `expectedVersion`, validation du bureau, origine, RBAC, transaction et audit, sans affecter d'anciens courriers.
- `GET .../mail/queue?view=secretariat` : file serveur d'exceptions, pagination et filtrage de ressource.
- `GET .../mail/overview` : compte et états de TOUS les courriers pour le Vice-Consul, selon ses habilitations.
- `POST .../mail/:id/decision` : validation humaine idempotente avec journal ; **pas d'appel SMTP direct depuis cette route**.
- `GET .../offices/:id/assignments` + `POST .../assignments/preview` : charge, capacité et proposition sans mutation.
- `POST .../assignments/apply` : affectation transactionnelle sous RBAC, contrôle de concurrence, journal, notifications.

Prévoir persistance Postgres sous tables propres au canal COURRIER_ENTRANT et événements normalisés du moteur Workflows : ne pas mélanger les sources ni dupliquer les identités du Core. Aucun accès SQL croisé non contractualisé.

## Scénarios obligatoires de recette

1. Question passeport + mot-clé dans sujet → INFORMATION, jamais dossier automatique.
2. Question document administratif sans fiche publiée → Secrétariat ; aucune réponse inventée.
3. Demande explicite passeport avec dossier complet vérifié et règle active → Bureau Passeports (115) ; non avant.
4. Demande incomplète → bureau à compléter ou Secrétariat selon règle ; aucun envoi automatique non approuvé.
5. Réclamation de passeport et suivi personnel → Secrétariat même si le thème est détecté.
6. Deux thèmes ou catégorie inconnue → Secrétariat.
7. Boîte officielle non autorisée/indisponible → aucune ingestion ou réponse ; statut d'erreur explicite.
8. Vice-Consul peut voir l'intégralité et auditer les transitions ; Secrétariat ne peut lire directement les détails hors file.
9. Mode manuel : agent hors bureau ou inactif refusé, aucun transfert.
10. Mode AUTO : absences et capacités prises en compte ; absence d'agent = « à attribuer ».
11. Deux affectations simultanées : idempotence, verrouillage et historique.
12. Autonomie des profils : les liens de retour de la page courrier mènent à l'espace d'origine, jamais au pilotage par défaut.
13. Non-régression : parcours A01, Samba, association, agent, Consul et tests existants.
14. Isolation : mauvais tenant et autre organisation interdits ; aucun envoi SMTP ni mail réel dans les tests.

## Ordre de réalisation

**BW (fourni) :** correctif du retour Secrétariat/Vice-Consul + noyau métier pur/testé (non branché) + cadrage.
**BX (à implémenter) :** migrations et règles e-mail configurables, API et file Secrétariat **filtrée côté serveur**, supervision intégrale Vice-Consul ; simulations HTTP avec rollback.
**BY :** proposition et affectation MANUEL/AUTO dans les bureaux + métriques horodatées, tests de charge/concurrence.
**BZ :** connecteur réel entrant, réponses assistées et validation/envoi institutionnel sous autorisation expresse ; jamais inclus implicitement.

**Garantie de ce lot :** aucune action réelle déclenchée par `pilot-mail-dispatch-core.js`. Le module retourne toujours `execution:false` ; les tests prouvent cette propriété sur les scénarios fournis. L'intégration de BX/BY nécessitera une nouvelle recette ciblée et des commits distincts après validation.
