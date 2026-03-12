import datetime
import mysql.connector

# ============================================================
# CareOps — Populate Dimension Tables
# Run AFTER creating careops_dw schema in MySQL Workbench
# ============================================================

# ────────────────────────────────────────
# CHANGE PASSWORD TO MATCH YOUR SETUP
# ────────────────────────────────────────
conn = mysql.connector.connect(
    host     = "localhost",
    user     = "root",
    password = "",  # ← change this
    database = "careops_dw"
)
cur = conn.cursor()
print("✅ Connected to careops_dw")


# ============================================================
# 1. Dim_Date — one row per day from 2022-01-01 to 2023-12-31
# ============================================================
print("\n⏳ Populating Dim_Date...")

start = datetime.date(2022, 1, 1)
end   = datetime.date(2023, 12, 31)
current = start

date_count = 0
while current <= end:
    date_id     = int(current.strftime('%Y%m%d'))  # 20220101
    day_of_week = current.strftime('%A')            # Monday
    day_num     = current.day                       # 1-31
    month_num   = current.month                     # 1-12
    month_name  = current.strftime('%B')            # January
    quarter     = (current.month - 1) // 3 + 1     # 1-4
    year_num    = current.year                      # 2022 or 2023

    cur.execute("""
        INSERT INTO Dim_Date
        (date_id, full_date, day_of_week, day_num, month_num, month_name, quarter, year_num)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """, (date_id, current, day_of_week, day_num, month_num, month_name, quarter, year_num))

    current += datetime.timedelta(days=1)
    date_count += 1

conn.commit()
print(f"✅ Dim_Date populated: {date_count} rows")


# ============================================================
# 2. Dim_Disease — copy from OLTP
# ============================================================
print("\n⏳ Populating Dim_Disease...")

oltp_conn = mysql.connector.connect(
    host     = "localhost",
    user     = "root",
    password = "Thane@01",  # ← change this
    database = "careops_oltp"
)
oltp_cur = oltp_conn.cursor()

oltp_cur.execute("SELECT disease_code, disease_name, category, severity_tier FROM Disease")
diseases = oltp_cur.fetchall()

for disease in diseases:
    cur.execute("""
        INSERT INTO Dim_Disease (disease_code, disease_name, category, severity_tier)
        VALUES (%s, %s, %s, %s)
    """, disease)

conn.commit()
print(f"✅ Dim_Disease populated: {len(diseases)} rows")


# ============================================================
# 3. Dim_Doctor — copy from OLTP + add experience_band
# ============================================================
print("\n⏳ Populating Dim_Doctor...")

oltp_cur.execute("SELECT doctor_id, specialization, experience_years, department FROM Doctor")
doctors = oltp_cur.fetchall()

for doctor_id, specialization, experience_years, department in doctors:
    # Create experience band from raw years
    if experience_years <= 5:
        band = '0-5 yrs'
    elif experience_years <= 10:
        band = '6-10 yrs'
    else:
        band = '11+ yrs'

    cur.execute("""
        INSERT INTO Dim_Doctor (doctor_id, specialization, experience_band, department)
        VALUES (%s, %s, %s, %s)
    """, (doctor_id, specialization, band, department))

conn.commit()
print(f"✅ Dim_Doctor populated: {len(doctors)} rows")


# ============================================================
# 4. Dim_Ward — copy from OLTP
# ============================================================
print("\n⏳ Populating Dim_Ward...")

oltp_cur.execute("SELECT ward_id, ward_name, ward_type, capacity FROM Ward")
wards = oltp_cur.fetchall()

for ward in wards:
    cur.execute("""
        INSERT INTO Dim_Ward (ward_id, ward_name, ward_type, capacity)
        VALUES (%s, %s, %s, %s)
    """, ward)

conn.commit()
print(f"✅ Dim_Ward populated: {len(wards)} rows")


# ============================================================
# 5. Dim_Outcome — just 4 fixed labels
# ============================================================
print("\n⏳ Populating Dim_Outcome...")

outcomes = ['Recovered', 'Improved', 'Readmitted', 'Deceased']
for label in outcomes:
    cur.execute(
        "INSERT INTO Dim_Outcome (outcome_label) VALUES (%s)",
        (label,)
    )

conn.commit()
print(f"✅ Dim_Outcome populated: 4 rows")


# ============================================================
# VERIFY — show row counts
# ============================================================
print("\n" + "="*50)
print("📊 DIMENSION TABLE ROW COUNTS")
print("="*50)

tables = ['Dim_Date', 'Dim_Disease', 'Dim_Doctor', 'Dim_Ward', 'Dim_Outcome']
for table in tables:
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    count = cur.fetchone()[0]
    print(f"  {table:<20} {count:>6} rows")

print("="*50)
print("✅ All dimension tables populated!")
print("👉 Next: Run the ETL pipeline to fill Fact_Treatment")

oltp_cur.close()
oltp_conn.close()
cur.close()
conn.close()
