DROP TRIGGER IF EXISTS trg_long_stay_insert;
DROP TRIGGER IF EXISTS trg_long_stay_update;

DELIMITER $$

CREATE TRIGGER trg_long_stay_insert
AFTER INSERT ON BedAllocation
FOR EACH ROW
BEGIN
    IF NEW.days_stayed IS NOT NULL AND NEW.days_stayed > 14 THEN
        INSERT INTO AlertLog (patient_id, ward_id, days_stayed, alert_message)
        VALUES (
            NEW.patient_id,
            NEW.ward_id,
            NEW.days_stayed,
            CONCAT('Patient ', NEW.patient_id,
                   ' has stayed ', NEW.days_stayed,
                   ' days in ward ', NEW.ward_id,
                   '. Review required.')
        );
    END IF;
END$$

CREATE TRIGGER trg_long_stay_update
AFTER UPDATE ON BedAllocation
FOR EACH ROW
BEGIN
    IF NEW.days_stayed IS NOT NULL
       AND NEW.days_stayed > 14
       AND (OLD.days_stayed IS NULL OR OLD.days_stayed <= 14) THEN
        INSERT INTO AlertLog (patient_id, ward_id, days_stayed, alert_message)
        VALUES (
            NEW.patient_id,
            NEW.ward_id,
            NEW.days_stayed,
            CONCAT('Patient ', NEW.patient_id,
                   ' has stayed ', NEW.days_stayed,
                   ' days in ward ', NEW.ward_id,
                   '. Review required.')
        );
    END IF;
END$$

DELIMITER ;
