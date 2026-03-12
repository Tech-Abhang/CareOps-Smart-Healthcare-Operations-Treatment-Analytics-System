CREATE VIEW vw_doctor_performance AS
SELECT
    d.doctor_id,
    d.specialization,
    d.experience_years,

    -- How many patients this doctor saw
    COUNT(DISTINCT v.visit_id)                          AS total_visits,

    -- Average days patients stayed in hospital
    AVG(ba.days_stayed)                                 AS avg_patient_stay,

    -- Count of recovered patients
    SUM(CASE WHEN o.status = 'Recovered' THEN 1 ELSE 0 END) AS recovered_count,

    -- Count of readmitted patients
    SUM(CASE WHEN o.status = 'Readmitted' THEN 1 ELSE 0 END) AS readmission_count,

    -- Recovery rate percentage
    ROUND(
        SUM(CASE WHEN o.status = 'Recovered' THEN 1 ELSE 0 END)
        / COUNT(DISTINCT v.visit_id) * 100
    , 2)                                                AS recovery_rate_pct

FROM Doctor d
LEFT JOIN Visit       v  ON d.doctor_id  = v.doctor_id
LEFT JOIN BedAllocation ba ON v.patient_id = ba.patient_id
LEFT JOIN Outcome     o  ON v.visit_id   = o.visit_id

GROUP BY d.doctor_id, d.specialization, d.experience_years;