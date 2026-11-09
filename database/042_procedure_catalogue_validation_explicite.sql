-- SATEER / P3.3.5Q / MIGRATION 042
-- Reproductibilité d'un changement déjà appliqué sur la base de RECETTE.
-- Vérifier l'ordre avec le runner de migrations du projet avant application.
-- NON APPLIQUÉE par P3.3.5Y. Aucune approbation implicite des fiches historiques.
BEGIN;
ALTER TABLE public.organisation_procedure_catalogue
  ADD COLUMN IF NOT EXISTS validation_explicite BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS date_validation TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS date_publication TIMESTAMPTZ;
COMMIT;
