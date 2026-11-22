-- E-METER-1E1 : extension additive STRICTEMENT du catalogue d'evenements 061.
-- Ne creer aucune table nouvelle, ne modifier aucun releve, ne supprimer aucune preuve.
-- Avant toute execution persistante : audit cluster + tests sous ROLLBACK + consentement.
DO $contract$
DECLARE actual text;
BEGIN
 IF current_database() <> 'sateer_test' OR
    (SELECT system_identifier::text FROM pg_control_system()) <> '7699611241381229531'
 THEN RAISE EXCEPTION 'E_METER_1E1_REFUS_BASE_OU_CLUSTER'; END IF;
 SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint
 WHERE conrelid='energy_meter_events'::regclass AND conname='energy_meter_events_action_check' AND contype='c';
 IF actual IS NULL OR actual NOT LIKE '%MeterPointDeclared.v1%'
     OR actual NOT LIKE '%MeterDeviceDeclared.v1%'
     OR actual NOT LIKE '%MeterRegisterDeclared.v1%'
     OR actual NOT LIKE '%MeterReadingDeclared.v1%'
     OR actual LIKE '%MeterDeviceReplaced.v1%'
 THEN RAISE EXCEPTION 'E_METER_1E1_CONTRAT_EVENT_INATTENDU'; END IF;
END $contract$;
ALTER TABLE energy_meter_events DROP CONSTRAINT energy_meter_events_action_check;
ALTER TABLE energy_meter_events ADD CONSTRAINT energy_meter_events_action_check
 CHECK (action IN ('MeterPointDeclared.v1','MeterDeviceDeclared.v1',
  'MeterRegisterDeclared.v1','MeterReadingDeclared.v1','MeterDeviceReplaced.v1'));
