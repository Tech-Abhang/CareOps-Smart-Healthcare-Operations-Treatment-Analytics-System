import random
import datetime
import mysql.connector

# ============================================================
# CareOps — Complete Data Generator
# Run this ONCE after creating all 11 tables
# ============================================================

random.seed(42)  # Makes data reproducible — same data every run

# ────────────────────────────────────────
# CHANGE THESE TO MATCH YOUR MYSQL SETUP
# ────────────────────────────────────────
conn = mysql.connector.connect(
    host     = "localhost",
    user     = "root",
    password = "",   # ← change this
    database = "careops_oltp"
)
cur = conn.cursor()
print("✅ Connected to MySQL")


# ============================================================
# STEP 1 — DOCTORS (50 rows)
# ============================================================
print("\n⏳ Inserting Doctors...")

doctors = [
    ("Cardiologist",       12, "Cardiology"),
    ("Neurologist",         8, "Neurology"),
    ("Pediatrician",        5, "Pediatrics"),
    ("Orthopedic Surgeon", 15, "Orthopedics"),
    ("Dermatologist",       6, "Dermatology"),
    ("Gastroenterologist", 10, "Gastroenterology"),
    ("Pulmonologist",       9, "Pulmonology"),
    ("Oncologist",         14, "Oncology"),
    ("Endocrinologist",     7, "Endocrinology"),
    ("Nephrologist",       11, "Nephrology"),
]

specializations = doctors * 5  # 10 types × 5 = 50 doctors
for i, (spec, exp, dept) in enumerate(specializations):
    exp_varied = exp + random.randint(-2, 5)  # slightly vary experience
    cur.execute(
        "INSERT INTO Doctor (specialization, experience_years, department) VALUES (%s, %s, %s)",
        (spec, max(1, exp_varied), dept)
    )

conn.commit()
print("✅ Doctors inserted: 50 rows")


# ============================================================
# STEP 2 — DISEASES (30 rows) — Real ICD-10 codes
# ============================================================
print("\n⏳ Inserting Diseases...")

diseases = [
    ("J18.9",  "Pneumonia",                    "Respiratory",     "High"),
    ("J06.9",  "Acute Upper Respiratory Infection", "Respiratory", "Low"),
    ("J45.9",  "Asthma",                        "Respiratory",    "Moderate"),
    ("I21.9",  "Acute Myocardial Infarction",   "Cardiac",        "Critical"),
    ("I10",    "Hypertension",                  "Cardiac",        "Moderate"),
    ("I50.9",  "Heart Failure",                 "Cardiac",        "High"),
    ("I63.9",  "Cerebral Infarction (Stroke)",  "Neurological",   "Critical"),
    ("G40.9",  "Epilepsy",                      "Neurological",   "Moderate"),
    ("G43.9",  "Migraine",                      "Neurological",   "Low"),
    ("K29.7",  "Gastritis",                     "Gastrointestinal","Low"),
    ("K80.2",  "Gallstones",                    "Gastrointestinal","Moderate"),
    ("K92.1",  "GI Bleeding",                   "Gastrointestinal","High"),
    ("E11.9",  "Type 2 Diabetes",               "Endocrine",      "Moderate"),
    ("E10.9",  "Type 1 Diabetes",               "Endocrine",      "High"),
    ("E03.9",  "Hypothyroidism",                "Endocrine",      "Low"),
    ("N18.9",  "Chronic Kidney Disease",        "Renal",          "High"),
    ("N39.0",  "Urinary Tract Infection",       "Renal",          "Low"),
    ("N20.0",  "Kidney Stones",                 "Renal",          "Moderate"),
    ("M54.5",  "Lower Back Pain",               "Musculoskeletal","Low"),
    ("M16.9",  "Hip Osteoarthritis",            "Musculoskeletal","Moderate"),
    ("S72.0",  "Femur Fracture",                "Musculoskeletal","High"),
    ("A09",    "Gastroenteritis",               "Infectious",     "Low"),
    ("A41.9",  "Sepsis",                        "Infectious",     "Critical"),
    ("B34.9",  "Viral Infection",               "Infectious",     "Low"),
    ("C34.9",  "Lung Cancer",                   "Oncology",       "Critical"),
    ("C18.9",  "Colon Cancer",                  "Oncology",       "Critical"),
    ("D50.9",  "Iron Deficiency Anemia",        "Hematology",     "Low"),
    ("L50.9",  "Urticaria (Hives)",             "Dermatology",    "Low"),
    ("J02.9",  "Acute Pharyngitis",             "Respiratory",    "Low"),
    ("R51",    "Headache",                      "Neurological",   "Low"),
]

for disease in diseases:
    cur.execute(
        "INSERT INTO Disease (disease_code, disease_name, category, severity_tier) VALUES (%s, %s, %s, %s)",
        disease
    )

conn.commit()
print("✅ Diseases inserted: 30 rows")


# ============================================================
# STEP 3 — MEDICINES (60 rows)
# ============================================================
print("\n⏳ Inserting Medicines...")

medicines = [
    # Antibiotics
    ("Amoxicillin",     "Antibiotic",   12.50),
    ("Azithromycin",    "Antibiotic",   18.00),
    ("Ciprofloxacin",   "Antibiotic",   15.75),
    ("Doxycycline",     "Antibiotic",   10.00),
    ("Metronidazole",   "Antibiotic",    8.50),
    ("Ceftriaxone",     "Antibiotic",   45.00),
    ("Levofloxacin",    "Antibiotic",   22.00),
    ("Clarithromycin",  "Antibiotic",   20.00),
    # Analgesics / Pain relief
    ("Paracetamol",     "Analgesic",     3.00),
    ("Ibuprofen",       "Analgesic",     5.50),
    ("Aspirin",         "Analgesic",     4.00),
    ("Diclofenac",      "Analgesic",     7.00),
    ("Tramadol",        "Analgesic",    14.00),
    ("Morphine",        "Opioid",       55.00),
    ("Codeine",         "Opioid",       18.00),
    # Cardiac
    ("Atorvastatin",    "Statin",       12.00),
    ("Amlodipine",      "Antihypertensive", 9.00),
    ("Metoprolol",      "Beta Blocker", 11.00),
    ("Lisinopril",      "ACE Inhibitor", 8.00),
    ("Warfarin",        "Anticoagulant", 6.00),
    ("Clopidogrel",     "Antiplatelet", 25.00),
    ("Digoxin",         "Cardiac Glycoside", 10.00),
    # Respiratory
    ("Salbutamol",      "Bronchodilator", 15.00),
    ("Prednisolone",    "Corticosteroid", 9.00),
    ("Montelukast",     "Antileukotriene", 20.00),
    ("Budesonide",      "Corticosteroid", 35.00),
    # Diabetes
    ("Metformin",       "Antidiabetic",  7.00),
    ("Insulin Glargine","Insulin",       80.00),
    ("Glibenclamide",   "Antidiabetic",  5.00),
    ("Sitagliptin",     "Antidiabetic", 45.00),
    # Gastrointestinal
    ("Omeprazole",      "PPI",           8.00),
    ("Ranitidine",      "H2 Blocker",    6.00),
    ("Ondansetron",     "Antiemetic",   12.00),
    ("Domperidone",     "Prokinetic",    5.00),
    ("Lactulose",       "Laxative",      7.00),
    # Neurological
    ("Phenytoin",       "Anticonvulsant", 10.00),
    ("Valproate",       "Anticonvulsant", 15.00),
    ("Levetiracetam",   "Anticonvulsant", 40.00),
    ("Sumatriptan",     "Antimigraine",  30.00),
    ("Gabapentin",      "Neuropathic",   18.00),
    # Steroids / Anti-inflammatory
    ("Dexamethasone",   "Corticosteroid", 11.00),
    ("Hydrocortisone",  "Corticosteroid", 14.00),
    ("Methylprednisolone","Corticosteroid", 25.00),
    # IV / Hospital
    ("Normal Saline",   "IV Fluid",      5.00),
    ("Ringer Lactate",  "IV Fluid",      6.00),
    ("Dextrose 5%",     "IV Fluid",      5.50),
    ("Albumin",         "Plasma Expander", 120.00),
    # Vitamins / Supplements
    ("Vitamin C",       "Supplement",    2.00),
    ("Vitamin D3",      "Supplement",    4.00),
    ("Iron Supplement", "Supplement",    3.50),
    ("Folic Acid",      "Supplement",    2.00),
    # Antihistamines
    ("Cetirizine",      "Antihistamine", 4.00),
    ("Loratadine",      "Antihistamine", 5.00),
    ("Chlorphenamine",  "Antihistamine", 3.00),
    # Renal
    ("Furosemide",      "Diuretic",      7.00),
    ("Spironolactone",  "Diuretic",      9.00),
    ("Calcium Carbonate","Phosphate Binder", 6.00),
    # Oncology
    ("Ondansetron HCl", "Antiemetic",   22.00),
    ("Filgrastim",      "Growth Factor", 200.00),
    ("Dexamethasone Inj","Corticosteroid", 30.00),
]

for med in medicines:
    cur.execute(
        "INSERT INTO Medicine (medicine_name, medicine_type, unit_cost) VALUES (%s, %s, %s)",
        med
    )

conn.commit()
print("✅ Medicines inserted: 60 rows")


# ============================================================
# STEP 4 — WARDS (10 rows)
# ============================================================
print("\n⏳ Inserting Wards...")

wards = [
    ("ICU",             "ICU",       10),
    ("Cardiac ICU",     "ICU",        8),
    ("General Ward A",  "General",   30),
    ("General Ward B",  "General",   30),
    ("Pediatric Ward",  "Pediatric", 20),
    ("Oncology Ward",   "Oncology",  15),
    ("Orthopedic Ward", "Orthopedic",20),
    ("Neurology Ward",  "Neurology", 18),
    ("Emergency Ward",  "Emergency", 12),
    ("Private Ward",    "Private",   10),
]

for ward in wards:
    cur.execute(
        "INSERT INTO Ward (ward_name, ward_type, capacity) VALUES (%s, %s, %s)",
        ward
    )

conn.commit()
print("✅ Wards inserted: 10 rows")


# ============================================================
# STEP 5 — PATIENTS (500 rows)
# ============================================================
print("\n⏳ Inserting Patients...")

age_groups  = ['0-17', '18-30', '31-45', '46-60', '61-75', '76+']
genders     = ['M', 'F', 'O']
blood_grps  = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
cities      = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata',
               'Hyderabad', 'Pune', 'Ahmedabad', 'Jaipur', 'Surat']

for _ in range(500):
    cur.execute(
        "INSERT INTO Patient (age_group, gender, blood_group, city) VALUES (%s, %s, %s, %s)",
        (random.choice(age_groups),
         random.choice(genders),
         random.choice(blood_grps),
         random.choice(cities))
    )

conn.commit()
print("✅ Patients inserted: 500 rows")


# ============================================================
# STEP 6 — VISITS (2000 rows)
# ============================================================
print("\n⏳ Inserting Visits...")

start_date  = datetime.date(2022, 1, 1)
visit_types = ['OPD', 'IPD', 'Emergency']
weights     = [0.6, 0.3, 0.1]          # 60% OPD, 30% IPD, 10% Emergency

for _ in range(2000):
    patient_id = random.randint(1, 500)
    doctor_id  = random.randint(1, 50)
    rand_days  = random.randint(0, 730)  # spread over 2 years
    visit_date = start_date + datetime.timedelta(days=rand_days)
    vtype      = random.choices(visit_types, weights=weights)[0]

    cur.execute(
        "INSERT INTO Visit (patient_id, doctor_id, visit_date, visit_type) VALUES (%s, %s, %s, %s)",
        (patient_id, doctor_id, visit_date, vtype)
    )

conn.commit()
print("✅ Visits inserted: 2000 rows")


# ============================================================
# STEP 7 — DIAGNOSIS (~2400 rows — 1.2 per visit avg)
# ============================================================
print("\n⏳ Inserting Diagnoses...")

disease_codes = [d[0] for d in diseases]
severities    = ['Mild', 'Moderate', 'Severe']
sev_weights   = [0.5, 0.35, 0.15]

cur.execute("SELECT visit_id FROM Visit")
all_visit_ids = [row[0] for row in cur.fetchall()]

diagnosis_count = 0
for visit_id in all_visit_ids:
    # 1 or 2 diagnoses per visit
    num_diagnoses = random.choices([1, 2], weights=[0.8, 0.2])[0]
    chosen_diseases = random.sample(disease_codes, num_diagnoses)

    for disease_code in chosen_diseases:
        severity = random.choices(severities, weights=sev_weights)[0]
        try:
            cur.execute(
                "INSERT INTO Diagnosis (visit_id, disease_code, severity) VALUES (%s, %s, %s)",
                (visit_id, disease_code, severity)
            )
            diagnosis_count += 1
        except:
            pass  # skip duplicate composite key

conn.commit()
print(f"✅ Diagnoses inserted: {diagnosis_count} rows")


# ============================================================
# STEP 8 — TREATMENT (~3000 rows — 1.5 per visit avg)
# ============================================================
print("\n⏳ Inserting Treatments...")

cur.execute("SELECT medicine_id FROM Medicine")
all_medicine_ids = [row[0] for row in cur.fetchall()]

treatment_count = 0
for visit_id in all_visit_ids:
    num_treatments = random.choices([1, 2, 3], weights=[0.4, 0.4, 0.2])[0]
    chosen_meds    = random.sample(all_medicine_ids, num_treatments)

    for medicine_id in chosen_meds:
        dosage_mg     = round(random.choice([50, 100, 200, 250, 500, 1000]) * random.uniform(0.5, 2), 2)
        duration_days = random.randint(3, 14)

        cur.execute(
            "INSERT INTO Treatment (visit_id, medicine_id, dosage_mg, duration_days) VALUES (%s, %s, %s, %s)",
            (visit_id, medicine_id, dosage_mg, duration_days)
        )
        treatment_count += 1

conn.commit()
print(f"✅ Treatments inserted: {treatment_count} rows")


# ============================================================
# STEP 9 — BED ALLOCATION (~800 rows — IPD + Emergency visits only)
# ============================================================
print("\n⏳ Inserting Bed Allocations...")

cur.execute("SELECT visit_id, patient_id, visit_date, visit_type FROM Visit WHERE visit_type IN ('IPD','Emergency')")
ipd_visits = cur.fetchall()

cur.execute("SELECT ward_id FROM Ward")
all_ward_ids = [row[0] for row in cur.fetchall()]

allocation_count = 0
for visit_id, patient_id, visit_date, visit_type in ipd_visits:
    ward_id    = random.choice(all_ward_ids)
    admit_date = visit_date
    stay_days  = random.randint(2, 21)  # 2 to 21 days stay
    discharge_date = admit_date + datetime.timedelta(days=stay_days)

    cur.execute(
        "INSERT INTO BedAllocation (patient_id, ward_id, admit_date, discharge_date) VALUES (%s, %s, %s, %s)",
        (patient_id, ward_id, admit_date, discharge_date)
    )
    allocation_count += 1

conn.commit()
print(f"✅ Bed Allocations inserted: {allocation_count} rows")


# ============================================================
# STEP 10 — OUTCOMES (2000 rows — one per visit)
# ============================================================
print("\n⏳ Inserting Outcomes...")

statuses     = ['Recovered', 'Improved', 'Readmitted', 'Deceased']
out_weights  = [0.55, 0.30, 0.12, 0.03]  # realistic distribution

cur.execute("SELECT visit_id, visit_date FROM Visit")
all_visits = cur.fetchall()

outcome_count = 0
for visit_id, visit_date in all_visits:
    status       = random.choices(statuses, weights=out_weights)[0]
    outcome_date = visit_date + datetime.timedelta(days=random.randint(1, 30))

    cur.execute(
        "INSERT INTO Outcome (visit_id, status, outcome_date) VALUES (%s, %s, %s)",
        (visit_id, status, outcome_date)
    )
    outcome_count += 1

conn.commit()
print(f"✅ Outcomes inserted: {outcome_count} rows")


# ============================================================
# FINAL — Verify row counts across all tables
# ============================================================
print("\n" + "="*50)
print("📊 FINAL ROW COUNTS")
print("="*50)

tables = ['Patient', 'Doctor', 'Disease', 'Medicine', 'Ward',
          'Visit', 'Diagnosis', 'Treatment', 'BedAllocation', 'Outcome']

for table in tables:
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    count = cur.fetchone()[0]
    print(f"  {table:<20} {count:>6} rows")

print("="*50)
print("✅ Data generation complete!")

cur.close()
conn.close()