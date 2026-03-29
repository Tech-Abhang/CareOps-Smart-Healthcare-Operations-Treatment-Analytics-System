# CareOps Project Status Report and Run Guide

Date: 2026-03-24
Workspace: DBMW_project

## 1. Executive Summary

The project has substantial implementation completed across OLTP, advanced DBMS features, data simulation, data warehouse schema, and ETL scripts.

Current practical status is ahead of the README status table. Several folders expected by README naming are empty, while equivalent implementation exists in differently named folders.

## 2. Phase-by-Phase Status

| Phase | Expected Deliverable | Current Status | Evidence |
|---|---|---|---|
| 0 | Scope lock | Done | phase0_scope_lock/scope_lock.md exists and is complete |
| 1 | Requirements | Done | phase1_requirements/requirements.md exists and is complete |
| 2 | OLTP schema | Done | phase2_oltp/oltp_table.sql defines 11 tables |
| 3 | Trigger + Procedure + View | Done (implemented in split files) | phase3_adv/3a_oltp_trigger.sql, 3b_procedure.sql, 3c_view.sql |
| 4 | Data simulation | Done | phase4_genData/data.py generates doctors, diseases, medicines, patients, visits, diagnosis, treatment, bed allocation, outcomes |
| 5 | DW schema + dimension preparation | Done | phase5_datawarehouse/createDW.sql and addData.py |
| 6 | ETL pipeline | Done (Python ETL implemented, SQL file empty) | phase6_etl/etl_code.py implemented; phase6_etl/etl.sql is empty |
| 7 | Analytics queries | Pending | phase7_analytics folder is empty |

## 3. Folder and Naming Gaps to Resolve

1. README uses different folder/file names than current workspace content.
2. Empty folders exist where README expects implementation:
   - phase3_advanced_dbms is empty, while SQL is in phase3_adv.
   - phase4_data_simulation is empty, while generator is in phase4_genData/data.py.
   - phase5_data_warehouse is empty, while DW files are in phase5_datawarehouse.
3. phase7_analytics is empty (remaining major implementation item).
4. phase6_etl/etl.sql is empty (not blocking if Python ETL is the intended final ETL deliverable).

## 4. What Is Remaining

### Critical remaining work

1. Create Phase 7 analytics SQL file with 5 required business queries:
   - Disease resource consumption trend
   - Doctor recovery performance ranking
   - Ward over-utilization analysis
   - Treatment cost trend over time
   - Readmission rate by disease

### Recommended cleanup

1. Align folder names with README or update README to match actual paths.
2. Consolidate Phase 3 SQL into one script for one-click execution (optional but useful for demos).
3. Move hardcoded credentials to environment variables or config file.
4. Add an end-to-end runner document for viva/demo use (this report can serve as base).

## 5. Detailed Steps to Run the Project

These steps follow the actual files currently present in this workspace.

## 5.1 Prerequisites

1. MySQL 8.x running locally.
2. Python 3.10+ installed.
3. Python package mysql-connector-python installed.
4. Optional: Faker (not required by current data.py, but listed in README stack).

Install package command:

pip install mysql-connector-python faker

## 5.2 Configure credentials in Python files

Before running Python scripts, edit DB credentials in:
1. phase4_genData/data.py
2. phase5_datawarehouse/addData.py
3. phase6_etl/etl_code.py

Ensure username/password/database values match your MySQL setup.

## 5.3 Create OLTP schema

Run:

mysql -u root -p < phase2_oltp/oltp_table.sql

Expected result:
- Database careops_oltp created
- 11 tables created

## 5.4 Apply advanced DBMS features (Phase 3)

Run in this order:

mysql -u root -p careops_oltp < phase3_adv/3a_oltp_trigger.sql
mysql -u root -p careops_oltp < phase3_adv/3b_procedure.sql
mysql -u root -p careops_oltp < phase3_adv/3c_view.sql

Expected result:
- Trigger trg_long_stay created
- Procedure admit_patient created
- View vw_doctor_performance created

## 5.5 Generate OLTP data (Phase 4)

Run:

python phase4_genData/data.py

Expected result:
- Reference entities inserted
- 500 patients
- 2000 visits
- Diagnosis, treatment, bed allocation, outcomes populated

## 5.6 Create Data Warehouse schema (Phase 5)

Run:

mysql -u root -p < phase5_datawarehouse/createDW.sql

Expected result:
- Database careops_dw created
- Dimension tables + Fact_Treatment table created

## 5.7 Populate dimension tables (Phase 5 support)

Run:

python phase5_datawarehouse/addData.py

Expected result:
- Dim_Date, Dim_Disease, Dim_Doctor, Dim_Ward, Dim_Outcome populated

## 5.8 Run ETL to load fact table (Phase 6)

Run:

python phase6_etl/etl_code.py

Expected result:
- Data extracted from careops_oltp
- Aggregated transformations applied
- Fact_Treatment populated in careops_dw

## 5.9 Run analytics (Phase 7)

Current status: pending because no analytics SQL script exists yet in phase7_analytics.

Temporary workaround:
- Execute ad-hoc analytical queries directly on careops_dw using Fact_Treatment and dimensions.

## 6. Suggested Verification Queries (Post-Run)

Run these to verify end-to-end load health:

1. OLTP table counts
   - SELECT COUNT(*) FROM careops_oltp.Patient;
   - SELECT COUNT(*) FROM careops_oltp.Visit;
   - SELECT COUNT(*) FROM careops_oltp.Outcome;

2. DW table counts
   - SELECT COUNT(*) FROM careops_dw.Dim_Date;
   - SELECT COUNT(*) FROM careops_dw.Dim_Disease;
   - SELECT COUNT(*) FROM careops_dw.Fact_Treatment;

3. Sanity checks
   - SELECT outcome_label, COUNT(*) FROM careops_dw.Dim_Outcome GROUP BY outcome_label;
   - SELECT year_num, month_num, SUM(total_cases) FROM careops_dw.Fact_Treatment ft JOIN careops_dw.Dim_Date dd ON ft.date_id = dd.date_id GROUP BY year_num, month_num ORDER BY year_num, month_num;

## 7. Risks / Notes

1. Credentials are hardcoded in multiple scripts.
2. Some scripts use empty password while others use a non-empty password; unify before execution.
3. ETL joins BedAllocation by patient and date condition; if multiple allocations overlap for a patient, metric duplication risk exists.
4. README implementation status is outdated relative to actual code in repository.

## 8. Overall Completion Estimate

Estimated completion by project phases:
- Completed: Phase 0, 1, 2, 3, 4, 5, 6
- Remaining: Phase 7 (analytics script finalization), plus documentation/path cleanup

Approximate completion percentage: 85% to 90%
