-- ============================================================
-- CareOps Data Warehouse — Full DDL
-- Run this in MySQL Workbench
-- ============================================================

CREATE DATABASE IF NOT EXISTS careops_dw;
USE careops_dw;

-- ─────────────────────────────────────────
-- 1. Dim_Date
-- ─────────────────────────────────────────
CREATE TABLE Dim_Date (
    date_id      INT PRIMARY KEY,   -- format: YYYYMMDD eg. 20220101
    full_date    DATE NOT NULL,
    day_of_week  VARCHAR(10),       -- Monday, Tuesday...
    day_num      INT,               -- 1 to 31
    month_num    INT,               -- 1 to 12
    month_name   VARCHAR(12),       -- January, February...
    quarter      INT,               -- 1 to 4
    year_num     INT                -- 2022, 2023
);

-- ─────────────────────────────────────────
-- 2. Dim_Disease
-- ─────────────────────────────────────────
CREATE TABLE Dim_Disease (
    disease_sk    INT AUTO_INCREMENT PRIMARY KEY,  -- surrogate key
    disease_code  VARCHAR(10)  NOT NULL,
    disease_name  VARCHAR(100),
    category      VARCHAR(60),
    severity_tier VARCHAR(20)
);

-- ─────────────────────────────────────────
-- 3. Dim_Doctor
-- ─────────────────────────────────────────
CREATE TABLE Dim_Doctor (
    doctor_sk        INT AUTO_INCREMENT PRIMARY KEY,  -- surrogate key
    doctor_id        INT NOT NULL,
    specialization   VARCHAR(80),
    experience_band  VARCHAR(20),   -- '0-5 yrs', '6-10 yrs', '11+ yrs'
    department       VARCHAR(60)
);

-- ─────────────────────────────────────────
-- 4. Dim_Ward
-- ─────────────────────────────────────────
CREATE TABLE Dim_Ward (
    ward_sk    INT AUTO_INCREMENT PRIMARY KEY,  -- surrogate key
    ward_id    INT NOT NULL,
    ward_name  VARCHAR(60),
    ward_type  VARCHAR(40),
    capacity   INT
);

-- ─────────────────────────────────────────
-- 5. Dim_Outcome
-- ─────────────────────────────────────────
CREATE TABLE Dim_Outcome (
    outcome_sk     INT AUTO_INCREMENT PRIMARY KEY,  -- surrogate key
    outcome_label  VARCHAR(20) NOT NULL  -- Recovered, Improved, Readmitted, Deceased
);

-- ─────────────────────────────────────────
-- 6. Fact_Treatment (create LAST)
-- ─────────────────────────────────────────
CREATE TABLE Fact_Treatment (
    fact_id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    date_id              INT NOT NULL,
    disease_sk           INT NOT NULL,
    doctor_sk            INT NOT NULL,
    ward_sk              INT,
    outcome_sk           INT,
    total_cases          INT           NOT NULL DEFAULT 0,
    recovered_cases      INT           NOT NULL DEFAULT 0,
    readmitted_cases     INT           NOT NULL DEFAULT 0,
    avg_recovery_days    DECIMAL(6,2),
    avg_treatment_cost   DECIMAL(10,2),
    total_bed_days       INT,
    FOREIGN KEY (date_id)    REFERENCES Dim_Date(date_id),
    FOREIGN KEY (disease_sk) REFERENCES Dim_Disease(disease_sk),
    FOREIGN KEY (doctor_sk)  REFERENCES Dim_Doctor(doctor_sk),
    FOREIGN KEY (ward_sk)    REFERENCES Dim_Ward(ward_sk),
    FOREIGN KEY (outcome_sk) REFERENCES Dim_Outcome(outcome_sk)
);

-- Verify
SHOW TABLES;
-- Should show: Dim_Date, Dim_Disease, Dim_Doctor, Dim_Ward, Dim_Outcome, Fact_Treatment
