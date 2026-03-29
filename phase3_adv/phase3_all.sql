-- Phase 3 consolidated script
-- Runs trigger + procedure + view creation in one execution.
-- Usage:
-- mysql -u root -p < phase3_adv/phase3_all.sql

USE careops_oltp;

DROP TRIGGER IF EXISTS trg_long_stay;
DROP TRIGGER IF EXISTS trg_long_stay_insert;
DROP TRIGGER IF EXISTS trg_long_stay_update;
DROP PROCEDURE IF EXISTS admit_patient;
DROP VIEW IF EXISTS vw_doctor_performance;

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

CREATE PROCEDURE admit_patient(
    IN  p_patient_id  INT,
    IN  p_doctor_id   INT,
    IN  p_ward_id     INT,
    IN  p_visit_type  VARCHAR(20),
    OUT p_visit_id    INT
)
BEGIN
    DECLARE ward_cap     INT;
    DECLARE current_occ  INT;

    SELECT capacity INTO ward_cap
    FROM Ward
    WHERE ward_id = p_ward_id;

    SELECT COUNT(*) INTO current_occ
    FROM BedAllocation
    WHERE ward_id = p_ward_id
    AND discharge_date IS NULL;

    IF current_occ >= ward_cap THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Ward is at full capacity. Cannot admit patient.';
    ELSE
        INSERT INTO Visit (patient_id, doctor_id, visit_date, visit_type)
        VALUES (p_patient_id, p_doctor_id, CURDATE(), p_visit_type);

        SET p_visit_id = LAST_INSERT_ID();

        INSERT INTO BedAllocation (patient_id, ward_id, admit_date)
        VALUES (p_patient_id, p_ward_id, CURDATE());
    END IF;
END$$

DELIMITER ;

CREATE VIEW vw_doctor_performance AS
SELECT
    d.doctor_id,
    d.specialization,
    d.experience_years,
    COUNT(DISTINCT v.visit_id) AS total_visits,
    AVG(ba.days_stayed) AS avg_patient_stay,
    SUM(CASE WHEN o.status = 'Recovered' THEN 1 ELSE 0 END) AS recovered_count,
    SUM(CASE WHEN o.status = 'Readmitted' THEN 1 ELSE 0 END) AS readmission_count,
    ROUND(
        SUM(CASE WHEN o.status = 'Recovered' THEN 1 ELSE 0 END)
        / COUNT(DISTINCT v.visit_id) * 100,
    2) AS recovery_rate_pct
FROM Doctor d
LEFT JOIN Visit v ON d.doctor_id = v.doctor_id
LEFT JOIN BedAllocation ba ON v.patient_id = ba.patient_id
LEFT JOIN Outcome o ON v.visit_id = o.visit_id
GROUP BY d.doctor_id, d.specialization, d.experience_years;
