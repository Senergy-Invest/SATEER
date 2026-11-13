# ADR-004 — Disponibilite d'une experience vs autorisations utilisateur

**Etat : preparation P3.3.4A, non appliquee aux parcours de production.**

## Contexte

- `organisation_experience_activations` exprime une activation INSTITUTIONNELLE pour le couple tenant / organisation / experience.
- `experience_activations` reste une activation PERSONNELLE par tenant.
- `organisation_capabilities` exprime les capacites d'une organisation : ne pas confondre ces trois notions.
- `creerRegistreExperiencesOrganisation().estActive()` est reserve a l'administration : il impose `VIEW_ORGANISATION_EXPERIENCES`. Ce n'est **pas** un garde pour une route citoyenne.

## Decision

Ajouter `organisation-experience-availability.js`, service SQL interne strictement en lecture et sans permission d'administration. Il n'est utilisable que par du code serveur disposant d'un contexte **deja autorise** (`tenantId`, `organisationId`, `codeExperience`), determine a partir de l'organisation et de son tenant reels. Il **ne doit pas etre expose en route HTTP sans un controle d'acces supplementaire**.

`estDisponible()` retourne `true` seulement pour une experience cataloguée active et explicitement activee par l'organisation dans le bon tenant. Les enregistrements absents, desactives, ou rattaches a un tenant etranger donnent `false`. Une erreur SQL ne doit jamais produire `true`.

**Disponibilite != habilitation.** Le code metier doit toujours executer ses protections existantes : authentification, appartenance/delegation, public cible, permissions de dossier, controle des documents et des fichiers, etc. Une activation d'experience ne donne aucun acces a ces donnees.

## Transition Bordeaux

**Ne pas brancher automatiquement le nouveau controle aux routes existantes** : la table institutionnelle est vide ; un branchement general avec refus par defaut interromprait le pilote Bordeaux. Un inventaire des points d'entree et des publics doit preciser les routes a proteger, puis une activation explicite + verification d'absence de regression est necessaire avant tout basculement.

Les messages publics / informations deja publiees, les droits de retrait d'un dossier, les notifications et les traitements internes peuvent avoir des regles de transition distinctes de la creation de nouvelles demandes : les definir avant d'installer un garde metier.

## Preuves obtenues et limites

- Tests locaux du contrat : entree stricte, SQL parametre et filtre tenant/organisation/experience, absence = indisponible, isolation A/B/C simulatee, pas de bascule en cas de panne DB.
- **Pas encore** de preuve HTTP pour le service de disponibilite, aucune route metier modifiee et aucun test SQL reel de ce nouveau service.
- Prochaine etape : verifier la requete sur `sateer_test` avec des donnees synthetiques transactionnelles puis cartographier les entrees metier; seulement ensuite monter sous drapeau explicite, dans un contexte derive du serveur.
