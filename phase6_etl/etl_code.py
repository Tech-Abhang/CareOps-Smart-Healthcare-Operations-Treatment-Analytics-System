import mysql.connector

# ============================================================
# CareOps — ETL Pipeline
# Reads from careops_oltp → Transforms → Loads into careops_dw
# ============================================================

MY_PASSWORD = "Thane@01"   # ← change this

# Two connections — one for each database
oltp_conn = mysql.connector.connect(
    host     = "localhost",
    user     = "root",
    password = MY_PASSWORD,
    database = "careops_oltp"
)

dw_conn = mysql.connector.connect(
    host     = "localhost",
    user     = "root",
    password = MY_PASSWORD,
    database = "careops_dw"
)

oltp_cur = oltp_conn.cursor()
dw_cur   = dw_conn.cursor()

print("✅ Connected to both databases")
print("="*50)


# ============================================================
# STAGE 1 — EXTRACT
# Read from all 5 OLTP tables and combine into one raw result
# ============================================================
print("\n⏳ STAGE 1: Extracting from OLTP...")

oltp_cur.execute("""
    SELECT
        v.visit_id,
        v.visit_date,
        v.doctor_id,
        d.disease_code,
        o.status        AS outcome_status,
        ba.days_stayed,
        ba.ward_id,
        (
            SELECT SUM(t2.dosage_mg * m2.unit_cost)
            FROM Treatment t2
            JOIN Medicine m2 ON t2.medicine_id = m2.medicine_id
            WHERE t2.visit_id = v.visit_id
        ) AS treatment_cost

    FROM Visit v
    JOIN Diagnosis     d  ON v.visit_id   = d.visit_id
    LEFT JOIN Outcome  o  ON v.visit_id   = o.visit_id
    LEFT JOIN BedAllocation ba ON v.patient_id = ba.patient_id
              AND ba.admit_date <= v.visit_date
""")

extracted_data = oltp_cur.fetchall()
print(f"✅ Extracted {len(extracted_data)} raw rows from OLTP")

# Show sample of what was extracted
print("\n   Sample extracted row:")
print("   visit_id | date       | doctor | disease | outcome   | days | ward | cost")
print("   " + "-"*75)
for row in extracted_data[:3]:
    print(f"   {str(row[0]):<9}| {str(row[1]):<11}| {str(row[2]):<7}| {str(row[3]):<8}| {str(row[4]):<10}| {str(row[5]):<5}| {str(row[6]):<5}| {str(row[7])}")


# ============================================================
# STAGE 2 — TRANSFORM
# Group by date + disease + doctor + ward
# Calculate all metrics
# ============================================================
print("\n⏳ STAGE 2: Transforming and aggregating...")

from collections import defaultdict

# Group rows by (date, disease_code, doctor_id, ward_id)
groups = defaultdict(lambda: {
    'total_cases'     : 0,
    'recovered_cases' : 0,
    'readmitted_cases': 0,
    'days_list'       : [],
    'cost_list'       : []
})

for visit_id, visit_date, doctor_id, disease_code, outcome_status, days_stayed, ward_id, treatment_cost in extracted_data:

    # Create the group key
    key = (
        int(visit_date.strftime('%Y%m%d')),  # date_id format: 20220101
        disease_code,
        doctor_id,
        ward_id
    )

    # Accumulate metrics
    groups[key]['total_cases'] += 1

    if outcome_status == 'Recovered':
        groups[key]['recovered_cases'] += 1

    if outcome_status == 'Readmitted':
        groups[key]['readmitted_cases'] += 1

    if days_stayed is not None:
        groups[key]['days_list'].append(days_stayed)

    if treatment_cost is not None:
        groups[key]['cost_list'].append(float(treatment_cost))

# Calculate averages and totals
transformed_data = []
for (date_id, disease_code, doctor_id, ward_id), metrics in groups.items():

    avg_days = (
        round(sum(metrics['days_list']) / len(metrics['days_list']), 2)
        if metrics['days_list'] else None
    )

    avg_cost = (
        round(sum(metrics['cost_list']) / len(metrics['cost_list']), 2)
        if metrics['cost_list'] else None
    )

    total_bed_days = (
        sum(metrics['days_list'])
        if metrics['days_list'] else None
    )

    transformed_data.append((
        date_id,
        disease_code,
        doctor_id,
        ward_id,
        metrics['total_cases'],
        metrics['recovered_cases'],
        metrics['readmitted_cases'],
        avg_days,
        avg_cost,
        total_bed_days
    ))

print(f"✅ Transformed into {len(transformed_data)} aggregated rows")
print(f"   (2000 visits collapsed into {len(transformed_data)} unique combinations)")

# Show sample of transformed data
print("\n   Sample transformed row:")
print("   date_id  | disease | doctor | ward | cases | recovered | cost")
print("   " + "-"*65)
for row in transformed_data[:3]:
    print(f"   {row[0]}| {str(row[1]):<8}| {str(row[2]):<7}| {str(row[3]):<5}| {str(row[4]):<6}| {str(row[5]):<10}| {str(row[8])}")


# ============================================================
# STAGE 3 — LOAD
# Look up surrogate keys from Dim tables
# Insert into Fact_Treatment
# ============================================================
print("\n⏳ STAGE 3: Loading into Fact_Treatment...")

# First clear existing fact data (safe to rerun)
dw_cur.execute("DELETE FROM Fact_Treatment")
dw_conn.commit()
print("   Cleared existing Fact_Treatment rows")

# Load surrogate key lookups into memory (faster than querying per row)
dw_cur.execute("SELECT disease_code, disease_sk FROM Dim_Disease")
disease_map = {row[0]: row[1] for row in dw_cur.fetchall()}
# disease_map = {'J18.9': 1, 'I21.9': 2, ...}

dw_cur.execute("SELECT doctor_id, doctor_sk FROM Dim_Doctor")
doctor_map = {row[0]: row[1] for row in dw_cur.fetchall()}
# doctor_map = {1: 1, 2: 2, ...}

dw_cur.execute("SELECT ward_id, ward_sk FROM Dim_Ward")
ward_map = {row[0]: row[1] for row in dw_cur.fetchall()}
# ward_map = {1: 1, 2: 2, ...}

print(f"   Loaded surrogate key maps:")
print(f"   disease_map: {len(disease_map)} entries")
print(f"   doctor_map:  {len(doctor_map)} entries")
print(f"   ward_map:    {len(ward_map)} entries")

# Insert each transformed row into Fact_Treatment
loaded_count  = 0
skipped_count = 0

for (date_id, disease_code, doctor_id, ward_id,
     total_cases, recovered_cases, readmitted_cases,
     avg_days, avg_cost, total_bed_days) in transformed_data:

    # Look up surrogate keys
    disease_sk = disease_map.get(disease_code)
    doctor_sk  = doctor_map.get(doctor_id)
    ward_sk    = ward_map.get(ward_id) if ward_id else None

    # Skip if dimension key not found
    if not disease_sk or not doctor_sk:
        skipped_count += 1
        continue

    # Check date exists in Dim_Date
    dw_cur.execute("SELECT COUNT(*) FROM Dim_Date WHERE date_id = %s", (date_id,))
    if dw_cur.fetchone()[0] == 0:
        skipped_count += 1
        continue

    # Insert into Fact_Treatment
    dw_cur.execute("""
        INSERT INTO Fact_Treatment (
            date_id, disease_sk, doctor_sk, ward_sk,
            total_cases, recovered_cases, readmitted_cases,
            avg_recovery_days, avg_treatment_cost, total_bed_days
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (
        date_id, disease_sk, doctor_sk, ward_sk,
        total_cases, recovered_cases, readmitted_cases,
        avg_days, avg_cost, total_bed_days
    ))
    loaded_count += 1

dw_conn.commit()
print(f"\n✅ Loaded {loaded_count} rows into Fact_Treatment")
if skipped_count > 0:
    print(f"   Skipped {skipped_count} rows (missing dimension keys)")


# ============================================================
# VERIFY — Final counts and sample output
# ============================================================
print("\n" + "="*50)
print("📊 ETL COMPLETE — FINAL VERIFICATION")
print("="*50)

dw_cur.execute("SELECT COUNT(*) FROM Fact_Treatment")
fact_count = dw_cur.fetchone()[0]
print(f"\n  Fact_Treatment: {fact_count} rows")

print("\n  Sample Fact_Treatment rows (with labels):")
dw_cur.execute("""
    SELECT
        dd.full_date,
        dis.disease_name,
        doc.specialization,
        dw.ward_name,
        ft.total_cases,
        ft.recovered_cases,
        ft.avg_treatment_cost
    FROM Fact_Treatment ft
    JOIN Dim_Date    dd  ON ft.date_id    = dd.date_id
    JOIN Dim_Disease dis ON ft.disease_sk = dis.disease_sk
    JOIN Dim_Doctor  doc ON ft.doctor_sk  = doc.doctor_sk
    LEFT JOIN Dim_Ward dw ON ft.ward_sk   = dw.ward_sk
    LIMIT 5
""")

rows = dw_cur.fetchall()
print(f"\n  {'Date':<12}| {'Disease':<30}| {'Doctor':<22}| {'Ward':<16}| {'Cases':<6}| {'Recovered':<10}| {'Avg Cost'}")
print("  " + "-"*115)
for row in rows:
    print(f"  {str(row[0]):<12}| {str(row[1]):<30}| {str(row[2]):<22}| {str(row[3]):<16}| {str(row[4]):<6}| {str(row[5]):<10}| {str(row[6])}")

print("\n" + "="*50)
print("✅ ETL Pipeline complete!")
print("👉 Next: Run the 5 analytics queries in MySQL Workbench")
print("="*50)

oltp_cur.close()
oltp_conn.close()
dw_cur.close()
dw_conn.close()