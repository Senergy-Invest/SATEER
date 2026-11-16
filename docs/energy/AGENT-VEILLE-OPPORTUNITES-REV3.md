# REV3 — Veille stratégique et agent de découverte d'opportunités

## Mission et séparation des fonctions

**Veille et matching = capacité transverse SATEER**, réutilisée par Energy, Invest, Academy, Territoires et plus tard les autres univers selon habilitation. Elle ne constitue pas une deuxième Communication.

`SourceRegistry` → `Observations` → `Notice/PolicyVersion` → `QualityCheck` → `Matching` → `HumanReview` → `Communication/Workflows`.

## Types de signaux à suivre

- Réglementation, orientations de l'État, changements institutionnels, programmes AEME/ASER/ANER/SENELEC, PIT et bâtiments publics ; comparaison dans le temps.
- Appels d'offres, demandes de propositions, appels à manifestation d'intérêt, marchés de maintenance, financements climat/fonds verts, subventions, incubateurs, partenariats, projets de coopération.
- Programmes internationaux / CEDEAO, appels à consortium, opportunités dérivées de projets SATEER déjà livrés ou réalisés, sous droits.
- Changement d'échéance / additif / annulation ; distinguer `source_updated_at`, `seen_at`, `verified_at`, `deadline_at` et fuseau horaire.

## Pipeline automatisable (non implémenté dans ce paquet)

1. **Connecteurs légalement accessibles** : RSS/API/HTML autorisé / import manuel ; liste blanche URL, journal d'exécution et règles de robots/licences/quotas.
2. **Collecte** : capture metadata minimale, titre, organisme, lien officiel, catégorie, date, deadline, référence et pièces autorisées, empreinte et preuve de provenance. Pas de republication intégrale de textes protégés.
3. **Normalisation et qualité** : langue, géographie, budget si explicite, objet, critères d'éligibilité et périmètre ; vérification humaine des anomalies, prévention des faux positifs.
4. **Déduplication + versionning** : détecter les additifs/reports/annulations, garder l'historique et le lien vers la publication officielle.
5. **Matching** : besoin ↔ taxonomy compétences/capacités vérifiées ↔ métadonnées projets partagées ↔ partenaires autorisés. Score transparent et limites affichées.
6. **Découverte des manques** : si aucun moteur/projet adéquat n'existe, créer `CapabilityGapSuggestion` avec hypothèse de valeur, dépendances, risques, coût estimatif à confirmer et effet potentiel.
7. **Revue humaine** : éligibilité juridique, partenariats, ressources, délai et risque validés manuellement. Réponse/soumission/financement jamais automatiques.
8. **Publication de synthèses** via SATEER Communication unique et tasks via Workflows.

## Pages utilisateur cibles

### Page quotidienne « À examiner aujourd'hui »

- Nouveaux avis / modifications depuis dernier contrôle, provenance et fraîcheur ; échéances proches et alertes d'urgence.
- Top pistes : statut `POTENTIEL` / `A_VERIFIER` / `CONFIRME_PAR_REVUE` / `NON_PERTINENT` ; liens vers capacités SATEER réellement disponibles et projets autorisés.
- Sources en panne/stales clairement étiquetées ; possibilité de demander une révision humaine.

### Synthèse hebdomadaire « Décisions et perspectives »

- Évolutions des politiques, appels actifs vérifiés, classements, opportunités manquées, partenaires potentiels, gaps de modules et bénéfices réutilisables.
- Indicateurs : nombre d'avis sourcés, délai moyen de détection, doublons évités, faux positifs, recommandations validées / rejetées, fiabilité des sources.

## Contrat d'appariement candidat

Entrée : `Notice{id,source_url,issuer,region,published_at,deadline_at,requirements,version}` + `Capabilities{id,revision,status,tests_sha,competences}` + `Projects{id,status,scope,public_summary,approved_metadata}`.

Sortie : `Match{id,notice_id,capability_ids,project_ids,fit_score,score_breakdown,missing_requirements,explanations,source_evidence,review_status,next_action}` ou `GapSuggestion`.

**Interdiction** : fouiller les dossiers privés sans RBAC, conclure à l'éligibilité sur un score, publier la stratégie ou le portfolio interne à l'extérieur, télécharger des pièces privées pour un modèle tiers sans autorisation, exécuter du code/commandes des pages visitées.

## Exemple de sortie simulée

> Marché détecté : besoin de maintenance d'installations solaires. Source et échéance à vérifier. Le registre indique : moteur Maintenance **planifié** et moteur inventaire **non encore livré**. Résultat : `GAP_A_EVALUER`, **pas** « SATEER déjà capable de répondre ». Propositions : développer la maintenance et trouver un partenaire installateur, sous validation humaine.

## Gouvernance et observabilité

- SATEER Strategy & Opportunity Review classe les décisions ; Data Operations contrôle la qualité ; Invest examine les aspects de financement ; responsable métier confirme les capacités.
- Agencement cible : passage quotidien sur sources prioritaires, bilan hebdomadaire ; SLA de fraîcheur et alertes pannes ; planification véritable uniquement après mise en service de jobs supervisés.
- Mécanisme `human-in-the-loop` obligatoire pour dépôt de candidature, réponses, approbation ou partenariats. Aucun agent autonome actif par simple ajout de ce dossier de documentation.
