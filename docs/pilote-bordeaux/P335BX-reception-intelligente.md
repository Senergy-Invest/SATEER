# SATEER Bordeaux P335BX — Files de courriers fictifs, sans acte opérationnel

## Finalité et frontières

P335BX valide le tri par intention **avant** le thème, la séparation serveur des files et le paramétrage manuel du Vice-Consul A01. Le module reste dans le pilote Bordeaux : org 70, tenant P6V_3B5AC5AB9DB04657, base PostgreSQL `sateer_test`, messages `DEMO_SYNTHETIQUE` uniquement.

**Aucun** IMAP, SMTP, LLM de réponse, création de dossier, transfert au bureau, publication, validation institutionnelle, assignation d'agent ou envoi automatique. Une file `BUREAU_A_VERIFIER` est une **proposition**, non une arrivée dans l'espace bureau. Une file `ASSISTANT_A_VERIFIER` est une préparation, non une réponse envoyée. Les deux restent visibles au Vice-Consul.

## Règles

- Intention `SECRETARIAT` ou thème ambigu : file `SECRETARIAT_INTERVENTION`, jamais déclassée par une simple présence de mots-clés.
- Sans règle active : file Secrétariat par défaut. Aucune perte silencieuse.
- Intention `INFORMATION` + règle `PROPOSITION` : `ASSISTANT_A_VERIFIER`, sans fiche présumée valide et sans envoi.
- Intention `DEMANDE` + règle `PROPOSITION` + bureau actif habilité : `BUREAU_A_VERIFIER`, identité/pièces/consentement non vérifiés, aucun dossier créé.
- Intention `DEMANDE` + bureau indisponible/inactif : retour au Secrétariat.
- Les règles e-mail sont distinctes des règles `MON_CONSULAT`. Modes permis : `MANUEL` ou `PROPOSITION` ; aucun mode d'exécution automatique n'existe dans BX.

## API et autorisations

| Route | Secrétariat (`VIEW_CONSULAR_MAIL_DEMO`) | Vice (`VIEW_OPERATIONAL_DASHBOARD`) |
|---|---|---|
| `GET /triage/secretariat` | Sa file uniquement | Peut aussi la voir |
| `GET /triage/vice` | 403 | Toutes les files synthétiques |
| `GET /triage/regles`, `/triage/bureaux` | 403 | Lecture |
| `PUT /triage/regles/:categorie` | 403 | A01 seulement avec `CONFIGURE_CONSULAR_MAIL_DEMO`, Origin vérifiée, bureaux habilités |
| `GET /triage/audit` | 403 | Réservé au compte configurateur |
| Anciens `GET /messages` et détails | Filtrage de la même file côté serveur, même en appel direct | Tous les courriers synthétiques |

Le compte A01 reçoit la permission de configuration via un **rôle de recette dédié** attribué uniquement à sa personne, sans modification des autres rôles. L'opération est transactionnelle et idempotente. Les nouvelles tables stockent seulement des règles de file et leurs audits.

Les endpoints sont limités à 500 courriers fictifs ; au-delà, ils refusent le résultat (503) au lieu d'afficher une liste incomplète comme exhaustive. La pagination UI affiche 50 premiers messages sur chaque file ; cette limite doit être repensée pour la production.

## Tests requis

- Cas synthétiques : FAQ passeport, demande explicite, ambiguïté carte consulaire, plainte individuelle, question multi-thèmes, sujet normalisé FAQ.
- Autorisations : anonymes, Consul stratégique, Secrétariat et Vice-Consul, tenant erroné ; accès aux anciennes API ; cross-file refusé.
- Règles : mode et catégorie invalides, Origin incorrecte, bureau inexistant/non habilité, transaction et audit.
- Non-régression : P335BW noyau pur, P335BR permissions, ancien lecteur de courriers.
- Contrôles navigateur : Secrétariat ne voit que ses cas ; Vice-Consul retrouve tous les courriers et peut consulter la page de configuration. Sans règles, tout est placé par défaut en file humaine.

## Hors périmètre — suite BY/BZ

P335BY : vrai workflow de transmission contrôlée bureau et attribution équitable aux agents, compteurs de charge, dates de première réponse / document prêt / document remis, supervision des SLA. P335BZ : connecteur e-mail institutionnel seulement avec autorisation, boîte existante préservée, déduplication et journalisation, réponses automatiques uniquement sur sources officiellement approuvées et règles signées.
