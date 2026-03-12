DELIMITER $$

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

    -- Step 1: Get the ward's maximum capacity
    SELECT capacity INTO ward_cap
    FROM Ward
    WHERE ward_id = p_ward_id;

    -- Step 2: Count how many patients are currently admitted (no discharge yet)
    SELECT COUNT(*) INTO current_occ
    FROM BedAllocation
    WHERE ward_id = p_ward_id
    AND discharge_date IS NULL;

    -- Step 3: Compare — if full, throw error. If space, admit.
    IF current_occ >= ward_cap THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Ward is at full capacity. Cannot admit patient.';
    ELSE
        -- Create the Visit record
        INSERT INTO Visit (patient_id, doctor_id, visit_date, visit_type)
        VALUES (p_patient_id, p_doctor_id, CURDATE(), p_visit_type);

        -- Capture the auto-generated visit_id
        SET p_visit_id = LAST_INSERT_ID();

        -- Create the BedAllocation record
        INSERT INTO BedAllocation (patient_id, ward_id, admit_date)
        VALUES (p_patient_id, p_ward_id, CURDATE());

    END IF;
END$$

DELIMITER ;

## to call the procedure
-- Step 1: Call the procedure with real values
CALL admit_patient(1, 1, 1, 'IPD', @new_visit_id);

-- Step 2: See the visit_id that was created
SELECT @new_visit_id;