const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config();

const DEFAULT_FROM = "2022-01-01";
const DEFAULT_TO = "2023-12-31";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FORCE_PASSWORD_PROMPT =
  String(process.env.CAREOPS_REQUIRE_PASSWORD_PROMPT || "").trim() === "1";
const AUTH_ERROR_CODES = new Set([
  "ER_ACCESS_DENIED_ERROR",
  "ER_ACCESS_DENIED_NO_PASSWORD_ERROR",
  "ER_DBACCESS_DENIED_ERROR",
]);

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json());

const baseConfig = {
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
};

const dwDatabase = process.env.MYSQL_DW_DATABASE || "careops_dw";
const oltpDatabase = process.env.MYSQL_OLTP_DATABASE || "careops_oltp";

let dwPool = null;
let oltpPool = null;

function parseDateRange(query) {
  const from = query.from || DEFAULT_FROM;
  const to = query.to || DEFAULT_TO;

  if (!ISO_DATE_PATTERN.test(from) || !ISO_DATE_PATTERN.test(to)) {
    const error = new Error("Date filters must be in YYYY-MM-DD format.");
    error.status = 400;
    throw error;
  }

  if (from > to) {
    const error = new Error("'from' date cannot be after 'to' date.");
    error.status = 400;
    throw error;
  }

  return [from, to];
}

function handleApiError(res, error, publicMessage, context) {
  const status = error.status || 500;

  if (status >= 500) {
    console.error(`[${context}]`, error);
  } else {
    console.warn(`[${context}]`, error.message);
  }

  res.status(status).json({ message: publicMessage });
}

function escapeIdentifier(value) {
  return `\`${String(value).replace(/`/g, "``")}\``;
}

function toCsvValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function escapeCsv(value) {
  const text = toCsvValue(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function isConfigured() {
  return Boolean(dwPool && oltpPool);
}

function ensureConfigured(res) {
  if (isConfigured()) return true;
  res.status(503).json({
    message: "Database is not configured. Enter password in the app first.",
    code: "DB_NOT_CONFIGURED",
  });
  return false;
}

async function closePools() {
  const tasks = [];
  if (dwPool) tasks.push(dwPool.end());
  if (oltpPool) tasks.push(oltpPool.end());
  await Promise.all(tasks);
  dwPool = null;
  oltpPool = null;
}

async function configureDatabase(password) {
  if (typeof password !== "string" || password.length === 0) {
    const error = new Error("Password is required.");
    error.status = 400;
    throw error;
  }

  const dwCandidate = mysql.createPool({
    ...baseConfig,
    password,
    database: dwDatabase,
    connectionLimit: 8,
  });

  const oltpCandidate = mysql.createPool({
    ...baseConfig,
    password,
    database: oltpDatabase,
    connectionLimit: 4,
  });

  try {
    await Promise.all([
      dwCandidate.query("SELECT 1 AS ok"),
      oltpCandidate.query("SELECT 1 AS ok"),
    ]);
  } catch (error) {
    await Promise.allSettled([dwCandidate.end(), oltpCandidate.end()]);
    throw error;
  }

  await closePools();
  dwPool = dwCandidate;
  oltpPool = oltpCandidate;
}

function isAuthFailure(error) {
  return AUTH_ERROR_CODES.has(error?.code);
}

function mapConfigureError(error) {
  if (isAuthFailure(error)) {
    return { status: 401, message: "Incorrect MySQL password." };
  }

  if (error?.code === "ECONNREFUSED") {
    return {
      status: 503,
      message: `Cannot reach MySQL at ${baseConfig.host}:${baseConfig.port}. Start MySQL service and try again.`,
    };
  }

  if (error?.code === "ENOTFOUND") {
    return {
      status: 503,
      message: `MySQL host '${baseConfig.host}' was not found. Check MYSQL_HOST in server/.env.`,
    };
  }

  if (error?.code === "ER_BAD_DB_ERROR") {
    return {
      status: 503,
      message:
        "Required databases are missing (careops_oltp or careops_dw). Run the SQL setup + ETL first.",
    };
  }

  if (error?.code === "ETIMEDOUT") {
    return {
      status: 503,
      message:
        "Timed out while connecting to MySQL. Verify host/port and network access.",
    };
  }

  return null;
}

async function fetchTableDataset() {
  const dbTargets = [
    {
      databaseName: process.env.MYSQL_OLTP_DATABASE || "careops_oltp",
      label: "OLTP",
      pool: oltpPool,
    },
    {
      databaseName: process.env.MYSQL_DW_DATABASE || "careops_dw",
      label: "Data Warehouse",
      pool: dwPool,
    },
  ];

  const databases = await Promise.all(
    dbTargets.map(async ({ databaseName, label, pool }) => {
      const [tableRows] = await pool.query(
        `SELECT TABLE_NAME AS tableName
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME`,
        [databaseName],
      );

      const tables = await Promise.all(
        tableRows.map(async ({ tableName }) => {
          const [rows] = await pool.query(
            `SELECT *
             FROM ${escapeIdentifier(databaseName)}.${escapeIdentifier(tableName)}`,
          );

          return {
            tableName,
            rowCount: rows.length,
            rows,
          };
        }),
      );

      return {
        databaseName,
        label,
        tableCount: tables.length,
        totalRows: tables.reduce((sum, table) => sum + table.rowCount, 0),
        tables,
      };
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    totalDatabases: databases.length,
    totalTables: databases.reduce((sum, db) => sum + db.tableCount, 0),
    totalRows: databases.reduce((sum, db) => sum + db.totalRows, 0),
    databases,
  };
}

app.get("/api/health", async (_req, res) => {
  if (!ensureConfigured(res)) return;

  try {
    const [dwRows] = await dwPool.query("SELECT 1 AS ok");
    const [oltpRows] = await oltpPool.query("SELECT 1 AS ok");

    res.json({
      status: "ok",
      dw: dwRows[0]?.ok === 1,
      oltp: oltpRows[0]?.ok === 1,
    });
  } catch (error) {
    handleApiError(res, error, "Database health check failed.", "health");
  }
});

app.get("/api/session/status", (_req, res) => {
  res.json({
    configured: isConfigured(),
    requiresPasswordPrompt: FORCE_PASSWORD_PROMPT,
  });
});

app.post("/api/session/configure", async (req, res) => {
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";

  if (password.length === 0) {
    res.status(400).json({ message: "Password is required." });
    return;
  }

  try {
    await configureDatabase(password);
    res.json({ configured: true });
  } catch (error) {
    const mapped = mapConfigureError(error);
    if (mapped) {
      if (mapped.status >= 500) {
        console.error("[session-configure]", error);
      }
      res.status(mapped.status).json({ message: mapped.message });
      return;
    }

    handleApiError(
      res,
      error,
      "Failed to connect to MySQL databases.",
      "session-configure",
    );
  }
});

app.get("/api/meta", async (_req, res) => {
  if (!ensureConfigured(res)) return;

  try {
    const [rows] = await dwPool.query(
      `SELECT MAX(dd.full_date) AS lastFactDate, COUNT(*) AS factRows
       FROM Fact_Treatment ft
       JOIN Dim_Date dd ON dd.date_id = ft.date_id`,
    );

    res.json(rows[0]);
  } catch (error) {
    handleApiError(res, error, "Failed to read metadata.", "meta");
  }
});

app.get("/api/table-inventory", async (_req, res) => {
  if (!ensureConfigured(res)) return;

  try {
    const dbTargets = [
      {
        databaseName: process.env.MYSQL_OLTP_DATABASE || "careops_oltp",
        label: "OLTP",
        pool: oltpPool,
      },
      {
        databaseName: process.env.MYSQL_DW_DATABASE || "careops_dw",
        label: "Data Warehouse",
        pool: dwPool,
      },
    ];

    const databases = await Promise.all(
      dbTargets.map(async ({ databaseName, label, pool }) => {
        const [tableRows] = await pool.query(
          `SELECT TABLE_NAME AS tableName
           FROM INFORMATION_SCHEMA.TABLES
           WHERE TABLE_SCHEMA = ?
           ORDER BY TABLE_NAME`,
          [databaseName],
        );

        const tables = await Promise.all(
          tableRows.map(async ({ tableName }) => {
            const [countRows] = await pool.query(
              `SELECT COUNT(*) AS rowCount
               FROM ${escapeIdentifier(databaseName)}.${escapeIdentifier(tableName)}`,
            );

            const [columnRows] = await pool.query(
              `SELECT
                 COLUMN_NAME AS columnName,
                 COLUMN_TYPE AS columnType,
                 IS_NULLABLE AS isNullable,
                 COLUMN_KEY AS columnKey
               FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
               ORDER BY ORDINAL_POSITION`,
              [databaseName, tableName],
            );

            return {
              tableName,
              rowCount: Number(countRows[0]?.rowCount || 0),
              columnCount: columnRows.length,
              columns: columnRows,
            };
          }),
        );

        return {
          databaseName,
          label,
          tableCount: tables.length,
          totalRows: tables.reduce((sum, table) => sum + table.rowCount, 0),
          tables,
        };
      }),
    );

    res.json({
      generatedAt: new Date().toISOString(),
      totalDatabases: databases.length,
      totalTables: databases.reduce((sum, db) => sum + db.tableCount, 0),
      totalRows: databases.reduce((sum, db) => sum + db.totalRows, 0),
      databases,
    });
  } catch (error) {
    handleApiError(
      res,
      error,
      "Failed to load table inventory.",
      "table-inventory",
    );
  }
});

app.get("/api/table-dataset", async (_req, res) => {
  if (!ensureConfigured(res)) return;

  try {
    const payload = await fetchTableDataset();

    const timestamp = new Date().toISOString().slice(0, 10);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"careops_dataset_${timestamp}.json\"`,
    );
    res.json(payload);
  } catch (error) {
    handleApiError(
      res,
      error,
      "Failed to export table dataset.",
      "table-dataset",
    );
  }
});

app.get("/api/table-dataset.csv", async (_req, res) => {
  if (!ensureConfigured(res)) return;

  try {
    const payload = await fetchTableDataset();
    const header = ["database", "table", "row_number", "column", "value"];
    const csvLines = [header.join(",")];

    payload.databases.forEach((database) => {
      database.tables.forEach((table) => {
        table.rows.forEach((row, rowIndex) => {
          Object.entries(row).forEach(([column, value]) => {
            csvLines.push(
              [
                escapeCsv(database.databaseName),
                escapeCsv(table.tableName),
                escapeCsv(rowIndex + 1),
                escapeCsv(column),
                escapeCsv(value),
              ].join(","),
            );
          });
        });
      });
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"careops_dataset_${timestamp}.csv\"`,
    );
    res.type("text/csv").send(`${csvLines.join("\n")}\n`);
  } catch (error) {
    handleApiError(
      res,
      error,
      "Failed to export CSV dataset.",
      "table-dataset-csv",
    );
  }
});

app.get("/api/analytics-cube", async (req, res) => {
  if (!ensureConfigured(res)) return;

  try {
    const [from, to] = parseDateRange(req.query);
    const [rows] = await dwPool.query(
      `SELECT
          CONCAT(dd.year_num, '-', LPAD(dd.month_num, 2, '0')) AS monthLabel,
          dis.disease_code AS diseaseCode,
          dis.disease_name AS diseaseName,
          doc.doctor_id AS doctorId,
          doc.specialization AS specialization,
          ward.ward_id AS wardId,
          ward.ward_name AS wardName,
          ward.capacity AS capacity,
          SUM(ft.total_cases) AS totalCases,
          SUM(ft.recovered_cases) AS recoveredCases,
          SUM(ft.readmitted_cases) AS readmittedCases,
          ROUND(AVG(ft.avg_treatment_cost), 2) AS avgCost,
          SUM(ft.total_bed_days) AS totalBedDays
       FROM Fact_Treatment ft
       JOIN Dim_Date dd ON dd.date_id = ft.date_id
       JOIN Dim_Disease dis ON dis.disease_sk = ft.disease_sk
       JOIN Dim_Doctor doc ON doc.doctor_sk = ft.doctor_sk
       LEFT JOIN Dim_Ward ward ON ward.ward_sk = ft.ward_sk
       WHERE dd.full_date BETWEEN ? AND ?
       GROUP BY
          dd.year_num,
          dd.month_num,
          dis.disease_code,
          dis.disease_name,
          doc.doctor_id,
          doc.specialization,
          ward.ward_id,
          ward.ward_name,
          ward.capacity
       ORDER BY dd.year_num, dd.month_num`,
      [from, to],
    );

    res.json(rows);
  } catch (error) {
    handleApiError(
      res,
      error,
      "Failed to load analytics cube.",
      "analytics-cube",
    );
  }
});

app.get("/api/data-quality", async (_req, res) => {
  if (!ensureConfigured(res)) return;

  try {
    const [rows] = await dwPool.query(
      `SELECT
          MAX(dd.full_date) AS lastFactDate,
          COUNT(*) AS factRows,
          DATEDIFF(CURDATE(), MAX(dd.full_date)) AS stalenessDays,
          SUM(CASE WHEN ft.ward_sk IS NULL THEN 1 ELSE 0 END) AS nullWardRows,
          SUM(CASE WHEN dis.disease_sk IS NULL THEN 1 ELSE 0 END) AS missingDiseaseKeys,
          SUM(CASE WHEN doc.doctor_sk IS NULL THEN 1 ELSE 0 END) AS missingDoctorKeys,
          SUM(CASE WHEN ft.ward_sk IS NOT NULL AND ward.ward_sk IS NULL THEN 1 ELSE 0 END) AS missingWardKeys
       FROM Fact_Treatment ft
       JOIN Dim_Date dd ON dd.date_id = ft.date_id
       LEFT JOIN Dim_Disease dis ON dis.disease_sk = ft.disease_sk
       LEFT JOIN Dim_Doctor doc ON doc.doctor_sk = ft.doctor_sk
       LEFT JOIN Dim_Ward ward ON ward.ward_sk = ft.ward_sk`,
    );

    res.json(rows[0]);
  } catch (error) {
    handleApiError(
      res,
      error,
      "Failed to load quality metrics.",
      "data-quality",
    );
  }
});

app.get("/api/alerts", async (_req, res) => {
  if (!ensureConfigured(res)) return;

  try {
    const [rows] = await oltpPool.query(
      `SELECT alert_id AS alertId, patient_id AS patientId, ward_id AS wardId, days_stayed AS daysStayed, alert_message AS alertMessage, created_at AS createdAt
       FROM AlertLog
       ORDER BY created_at DESC
       LIMIT 10`,
    );

    res.json(rows);
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      res.json([]);
      return;
    }

    handleApiError(res, error, "Failed to load alerts.", "alerts");
  }
});

const server = app.listen(port, () => {
  console.log(`CareOps API running at http://localhost:${port}`);
});

if (!FORCE_PASSWORD_PROMPT && process.env.MYSQL_PASSWORD) {
  (async () => {
    try {
      await configureDatabase(process.env.MYSQL_PASSWORD);
      console.log("MySQL pools configured from environment password.");
    } catch (error) {
      console.error("Failed to configure MySQL pools from environment.", error);
    }
  })();
} else {
  console.log("MySQL password prompt mode is active.");
}

async function shutdown(signal) {
  console.log(`Received ${signal}. Closing connections...`);

  try {
    await closePools();
    server.close(() => {
      process.exit(0);
    });
  } catch (error) {
    console.error("Failed during shutdown", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
