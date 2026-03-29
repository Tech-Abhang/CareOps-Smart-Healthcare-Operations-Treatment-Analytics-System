Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:MySqlExe = $null
$script:PythonExe = $null
$global:CareOpsAuthFailure = $false
$global:CareOpsConnectionFailure = $false

function Import-EnvFile {
    param(
        [string]$Path = ".env"
    )

    if (-not (Test-Path $Path)) {
        Write-Host "No .env file found at $Path. Using existing environment variables/defaults." -ForegroundColor Yellow
        return
    }

    Write-Host "Loading environment variables from $Path" -ForegroundColor Cyan

    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
            return
        }

        $parts = $line.Split("=", 2)
        $key = $parts[0].Trim()
        $value = $parts[1].Trim().Trim('"').Trim("'")

        if ($key) {
            [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
}

function Test-MySqlConnectivity {
    $global:CareOpsAuthFailure = $false
    $global:CareOpsConnectionFailure = $false

    $mySqlArgs = Get-MySqlArgs
    $mySqlArgs += "--execute"
    $mySqlArgs += "SELECT 1;"

    $output = & {
        $ErrorActionPreference = "Continue"
        & $script:MySqlExe @mySqlArgs 2>&1
    }
    $exitCode = $LASTEXITCODE
    $outputText = ($output | Out-String).Trim()

    if ($exitCode -eq 0) {
        return $true
    }

    if ($outputText -like "*ERROR 1045*") {
        $global:CareOpsAuthFailure = $true
    }
    elseif ($outputText -like "*ERROR 2003*" -or $outputText -like "*Can't connect to MySQL server*") {
        $global:CareOpsConnectionFailure = $true
    }

    return $false
}

function Ensure-MySqlServiceRunning {
    $preferredOrder = @("MySQL80", "MySQL", "MySQL57", "MariaDB")

    try {
        $services = @(Get-Service | Where-Object {
            $_.Name -match "mysql|mariadb" -or $_.DisplayName -match "MySQL|MariaDB"
        })
    }
    catch {
        Write-Host "Could not query Windows services to auto-start MySQL: $($_.Exception.Message)" -ForegroundColor Yellow
        return $false
    }

    if (-not $services -or $services.Count -eq 0) {
        Write-Host "No MySQL service found for auto-start. Start your database server manually." -ForegroundColor Yellow
        return $false
    }

    foreach ($service in $services) {
        if ($service.Status -eq "Running") {
            Write-Host "MySQL service '$($service.Name)' is already running." -ForegroundColor Gray
            return $true
        }
    }

    $ordered = @()
    foreach ($name in $preferredOrder) {
        $matched = $services | Where-Object { $_.Name -eq $name }
        if ($matched) { $ordered += $matched }
    }
    $ordered += $services | Where-Object { $preferredOrder -notcontains $_.Name }

    foreach ($service in $ordered) {
        Write-Host "Attempting to start MySQL service '$($service.Name)'..." -ForegroundColor Yellow
        try {
            Start-Service -Name $service.Name -ErrorAction Stop
            $controller = Get-Service -Name $service.Name -ErrorAction Stop
            $controller.WaitForStatus("Running", [System.TimeSpan]::FromSeconds(15))
            $controller.Refresh()
            if ($controller.Status -eq "Running") {
                Write-Host "Started service '$($service.Name)' successfully." -ForegroundColor Green
                return $true
            }
        }
        catch {
            Write-Host "Could not start '$($service.Name)': $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }

    return $false
}

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )

    Write-Host "`n=== $Title ===" -ForegroundColor Green
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "Step failed: $Title"
    }
}

function Resolve-MySqlExe {
    $cmd = Get-Command mysql -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    $candidates = @(
        "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe",
        "C:\Program Files\MySQL\MySQL Workbench 8.0\mysql.exe",
        "C:\xampp\mysql\bin\mysql.exe"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    throw "mysql.exe not found. Add MySQL bin to PATH or install MySQL CLI tools."
}

function Resolve-PythonExe {
    $venvPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
    if (Test-Path $venvPython) {
        return $venvPython
    }

    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    throw "python executable not found. Install Python or create .venv in project root."
}

function Get-MySqlArgs {
    param(
        [string]$Database
    )

    $user = if ($env:CAREOPS_DB_USER) { $env:CAREOPS_DB_USER } else { "root" }
    $dbHost = if ($env:CAREOPS_DB_HOST) { $env:CAREOPS_DB_HOST } else { "127.0.0.1" }
    $dbPort = if ($env:CAREOPS_DB_PORT) { $env:CAREOPS_DB_PORT } else { "3306" }
    $password = if ($env:CAREOPS_DB_PASSWORD) { $env:CAREOPS_DB_PASSWORD } else { "" }

    $mySqlArgs = @("--host=$dbHost", "--port=$dbPort", "--user=$user")

    # Avoid mysql CLI password warning on stderr by using process-scoped MYSQL_PWD.
    if ($password -ne "") {
        [System.Environment]::SetEnvironmentVariable("MYSQL_PWD", $password, "Process")
    }
    else {
        [System.Environment]::SetEnvironmentVariable("MYSQL_PWD", $null, "Process")
    }

    if ($Database) {
        $mySqlArgs += "--database=$Database"
    }

    return $mySqlArgs
}

function Invoke-MySqlCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Sql,
        [string]$Database
    )

    $mySqlArgs = Get-MySqlArgs -Database $Database
    $mySqlArgs += "--execute"
    $mySqlArgs += $Sql

    # Debug: show what we are running (masking password since it's in MYSQL_PWD env)
    Write-Host "Executing: $script:MySqlExe $($mySqlArgs -join ' ')" -ForegroundColor Gray

    $output = & {
        $ErrorActionPreference = "Continue"
        & $script:MySqlExe @mySqlArgs 2>&1
    }
    $exitCode = $LASTEXITCODE
    $outputText = ($output | Out-String).Trim()

    if ($outputText) {
        Write-Host $outputText
    }

    if ($exitCode -ne 0) {
        if ($outputText -like "*ERROR 1045*") { $global:CareOpsAuthFailure = $true }
        if ($outputText -like "*ERROR 2003*" -or $outputText -like "*Can't connect to MySQL server*") { $global:CareOpsConnectionFailure = $true }
        throw "mysql command failed (exit $exitCode). SQL: $Sql"
    }
}

function Invoke-MySqlFile {
    param(
        [Parameter(Mandatory = $true)][string]$SqlFile,
        [string]$Database
    )

    $mySqlArgs = Get-MySqlArgs -Database $Database
    $resolvedPath = (Resolve-Path $SqlFile).Path.Replace('\\', '/')
    $mySqlArgs += "--execute"
    $mySqlArgs += "source $resolvedPath"

    # Debug: show what we are running
    Write-Host "Executing: $script:MySqlExe $($mySqlArgs -join ' ')" -ForegroundColor Gray

    $output = & {
        $ErrorActionPreference = "Continue"
        & $script:MySqlExe @mySqlArgs 2>&1
    }
    $exitCode = $LASTEXITCODE
    $outputText = ($output | Out-String).Trim()

    if ($outputText) {
        Write-Host $outputText
    }

    if ($exitCode -ne 0) {
        if ($outputText -like "*ERROR 1045*") { $global:CareOpsAuthFailure = $true }
        if ($outputText -like "*ERROR 2003*" -or $outputText -like "*Can't connect to MySQL server*") { $global:CareOpsConnectionFailure = $true }
        throw "mysql failed for SQL file '$SqlFile' (exit $exitCode)."
    }
}

Set-Location -LiteralPath $PSScriptRoot
Import-EnvFile -Path (Join-Path $PSScriptRoot ".env")
$script:MySqlExe = Resolve-MySqlExe
$script:PythonExe = Resolve-PythonExe
$oltpDb = if ($env:CAREOPS_OLTP_DB) { $env:CAREOPS_OLTP_DB } else { "careops_oltp" }
$dwDb = if ($env:CAREOPS_DW_DB) { $env:CAREOPS_DW_DB } else { "careops_dw" }

try {
    Invoke-Step -Title "Check MySQL connectivity" -Action {
        if (-not (Test-MySqlConnectivity)) {
            if (-not $global:CareOpsAuthFailure) {
                Write-Host "Initial MySQL connectivity check failed. Trying to auto-start MySQL service..." -ForegroundColor Yellow
                $started = Ensure-MySqlServiceRunning
                if ($started) {
                    Write-Host "Retrying MySQL connectivity after service start..." -ForegroundColor Gray
                    if (Test-MySqlConnectivity) {
                        return
                    }
                }
                if (-not $global:CareOpsAuthFailure) {
                    $global:CareOpsConnectionFailure = $true
                }
            }
            throw "Cannot connect to MySQL. Ensure the MySQL service is running and host/port are correct."
        }
    }

    Invoke-Step -Title "Reset schemas" -Action {
        Invoke-MySqlCommand -Sql "DROP DATABASE IF EXISTS $dwDb; DROP DATABASE IF EXISTS $oltpDb;"
    }

    Invoke-Step -Title "Phase 2: Create OLTP schema" -Action {
        Invoke-MySqlFile -SqlFile "phase2_oltp\oltp_table.sql"
    }

    Invoke-Step -Title "Phase 3: Apply advanced DBMS features" -Action {
        Invoke-MySqlFile -SqlFile "phase3_adv\phase3_all.sql"
    }

    Invoke-Step -Title "Phase 4: Generate OLTP data" -Action {
        & $script:PythonExe phase4_genData\data.py
    }

    Invoke-Step -Title "Phase 5: Create DW schema" -Action {
        Invoke-MySqlFile -SqlFile "phase5_datawarehouse\createDW.sql"
    }

    Invoke-Step -Title "Phase 5 support: Populate dimensions" -Action {
        & $script:PythonExe phase5_datawarehouse\addData.py
    }

    Invoke-Step -Title "Phase 6: Run ETL" -Action {
        & $script:PythonExe phase6_etl\etl_code.py
    }

    Write-Host "`nAll demo steps completed successfully." -ForegroundColor Cyan
}
catch {
    if ($global:CareOpsAuthFailure) {
        Write-Host "`n[AUTH ERROR] MySQL Access Denied. Check your password." -ForegroundColor Red
        exit 2
    }
    if ($global:CareOpsConnectionFailure) {
        $dbHost = if ($env:CAREOPS_DB_HOST) { $env:CAREOPS_DB_HOST } else { "127.0.0.1" }
        $dbPort = if ($env:CAREOPS_DB_PORT) { $env:CAREOPS_DB_PORT } else { "3306" }
        Write-Host "`n[CONNECT ERROR] Cannot reach MySQL at ${dbHost}:${dbPort}. Start MySQL service (for example service name 'MySQL80') and retry." -ForegroundColor Red
        exit 1
    }
    Write-Host "`n[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
