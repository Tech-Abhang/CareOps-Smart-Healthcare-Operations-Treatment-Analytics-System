REATE DATABASE IF NOT EXISTS careops_oltp;
USE careops_oltp;

-- ─────────────────────────────────────────
-- 1. PATIENT (no dependencies)
-- ─────────────────────────────────────────
CREATE TABLE Patient (
    patient_id   INT AUTO_INCREMENT PRIMARY KEY,
    age_group    VARCHAR(20) NOT NULL,         -- '18-30', '31-45', etc.
    gender       CHAR(1)     NOT NULL CHECK (gender IN ('M','F','O')),
    blood_group  VARCHAR(5),                   -- 'A+', 'O-', etc.
    city         VARCHAR(50)
);

-- ─────────────────────────────────────────
-- 2. DOCTOR (no dependencies)
-- ─────────────────────────────────────────
CREATE TABLE Doctor (
    doctor_id         INT AUTO_INCREMENT PRIMARY KEY,
    specialization    VARCHAR(80) NOT NULL,
    experience_years  INT         NOT NULL CHECK (experience_years >= 0),
    department        VARCHAR(60)
);

-- ─────────────────────────────────────────
-- 3. DISEASE (no dependencies)
-- ─────────────────────────────────────────
CREATE TABLE Disease (
    disease_code  VARCHAR(10)  PRIMARY KEY,
    disease_name  VARCHAR(100) NOT NULL,
    category      VARCHAR(60)  NOT NULL,       -- Respiratory, Cardiac, etc.
    severity_tier VARCHAR(20)  NOT NULL CHECK (severity_tier IN ('Low','Moderate','High','Critical'))
);

-- ─────────────────────────────────────────
-- 4. MEDICINE (no dependencies)
-- ─────────────────────────────────────────
CREATE TABLE Medicine (
    medicine_id    INT AUTO_INCREMENT PRIMARY KEY,
    medicine_name  VARCHAR(100) NOT NULL,
    medicine_type  VARCHAR(50),                -- Antibiotic, Analgesic, etc.
    unit_cost      DECIMAL(10,2) NOT NULL CHECK (unit_cost >= 0)
);

-- ─────────────────────────────────────────
-- 5. WARD (no dependencies)
-- ─────────────────────────────────────────
CREATE TABLE Ward (
    ward_id    INT AUTO_INCREMENT PRIMARY KEY,
    ward_name  VARCHAR(60) NOT NULL,
    ward_type  VARCHAR(40) NOT NULL,           -- ICU, General, Pediatric, etc.
    capacity   INT         NOT NULL CHECK (capacity > 0)
);

-- ─────────────────────────────────────────
-- 6. VISIT (depends on Patient + Doctor)
-- ─────────────────────────────────────────
CREATE TABLE Visit (
    visit_id    INT AUTO_INCREMENT PRIMARY KEY,
    patient_id  INT         NOT NULL,
    doctor_id   INT         NOT NULL,
    visit_date  DATE        NOT NULL,
    visit_type  VARCHAR(20) NOT NULL CHECK (visit_type IN ('OPD','IPD','Emergency')),
    FOREIGN KEY (patient_id) REFERENCES Patient(patient_id),
    FOREIGN KEY (doctor_id)  REFERENCES Doctor(doctor_id)
);

-- ─────────────────────────────────────────
-- 7. DIAGNOSIS (depends on Visit + Disease)
-- ─────────────────────────────────────────
CREATE TABLE Diagnosis (
    visit_id      INT         NOT NULL,
    disease_code  VARCHAR(10) NOT NULL,
    severity      VARCHAR(20) NOT NULL CHECK (severity IN ('Mild','Moderate','Severe')),
    PRIMARY KEY (visit_id, disease_code),      -- composite primary key
    FOREIGN KEY (visit_id)     REFERENCES Visit(visit_id),
    FOREIGN KEY (disease_code) REFERENCES Disease(disease_code)
);

-- ─────────────────────────────────────────
-- 8. TREATMENT (depends on Visit + Medicine)
-- ─────────────────────────────────────────
CREATE TABLE Treatment (
    treatment_id  INT AUTO_INCREMENT PRIMARY KEY,
    visit_id      INT           NOT NULL,
    medicine_id   INT           NOT NULL,
    dosage_mg     DECIMAL(8,2)  NOT NULL,
    duration_days INT           NOT NULL CHECK (duration_days > 0),
    FOREIGN KEY (visit_id)    REFERENCES Visit(visit_id),
    FOREIGN KEY (medicine_id) REFERENCES Medicine(medicine_id)
);

-- ─────────────────────────────────────────
-- 9. BEDALLOCATION (depends on Patient + Ward)
-- ─────────────────────────────────────────
CREATE TABLE BedAllocation (
    allocation_id   INT AUTO_INCREMENT PRIMARY KEY,
    patient_id      INT  NOT NULL,
    ward_id         INT  NOT NULL,
    admit_date      DATE NOT NULL,
    discharge_date  DATE,                      -- NULL means still admitted
    days_stayed     INT GENERATED ALWAYS AS
                    (DATEDIFF(discharge_date, admit_date)) STORED,
    FOREIGN KEY (patient_id) REFERENCES Patient(patient_id),
    FOREIGN KEY (ward_id)    REFERENCES Ward(ward_id)
);

-- ─────────────────────────────────────────
-- 10. OUTCOME (depends on Visit)
-- ─────────────────────────────────────────
CREATE TABLE Outcome (
    outcome_id    INT AUTO_INCREMENT PRIMARY KEY,
    visit_id      INT         NOT NULL UNIQUE,  -- one outcome per visit
    status        VARCHAR(20) NOT NULL CHECK (status IN ('Recovered','Improved','Readmitted','Deceased')),
    outcome_date  DATE        NOT NULL,
    FOREIGN KEY (visit_id) REFERENCES Visit(visit_id)
);

-- ─────────────────────────────────────────
-- 11. ALERTLOG (standalone — filled by trigger)
-- ─────────────────────────────────────────
CREATE TABLE AlertLog (
    alert_id       INT AUTO_INCREMENT PRIMARY KEY,
    patient_id     INT          NOT NULL,
    ward_id        INT          NOT NULL,
    days_stayed    INT,
    alert_message  VARCHAR(255),
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────
-- VERIFY — run this after all tables are created
-- ─────────────────────────────────────────
SHOW TABLES;
-- Expected output: 11 tables listed