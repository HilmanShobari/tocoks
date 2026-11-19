[CmdletBinding(SupportsShouldProcess = $true)]
param([switch]$SkipBackend, [switch]$SkipFrontend, [switch]$NoRestart)
$ErrorActionPreference = 'Stop'
$taskBrandRoot = $PSScriptRoot
$taskSlug = 'tocoks'
$taskBackendRoot = Join-Path $taskBrandRoot 'backend'
$taskBackendPort = 8120
$taskFrontendPort = 3021
$taskEnvFile = Join-Path $taskBackendRoot '.env'
if (Test-Path -LiteralPath $taskEnvFile) {
    $taskPortLine = Get-Content -LiteralPath $taskEnvFile | Where-Object { $_ -match '^\s*STOREFRONT_PORT\s*=' } | Select-Object -Last 1
    if ($taskPortLine) {
        $taskPortValue = ($taskPortLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
        if ($taskPortValue -notmatch '^\d+$') { throw 'STOREFRONT_PORT harus berupa angka tanpa komentar di akhir.' }
        $taskBackendPort = [int]$taskPortValue
    }
}
if ($taskBackendPort -lt 1 -or $taskBackendPort -gt 65535) { throw 'Port backend tidak valid.' }
if ($taskBackendPort -eq $taskFrontendPort) { throw 'Port backend dan frontend harus berbeda.' }
if (-not $SkipBackend) {
    # Never launch two workers for the migrated legacy orders.
    $taskLegacy = $null
    try { $taskLegacy = Invoke-RestMethod -Uri 'http://127.0.0.1:8090/health' -TimeoutSec 2 } catch { }
    if ($taskLegacy.data.service -eq 'dummy-brand-checkout' -and $taskLegacy.data.catalogs -gt 1) {
        throw 'Backend checkout bersama port 8090 masih aktif. Hentikan sendiri terlebih dahulu; launcher ini tidak menghentikannya. Migrasi ulang snapshot bila pesanan lama berubah.'
    }
}
$taskNode = (Get-Command node -ErrorAction Stop).Source
$taskVite = Join-Path $taskBrandRoot 'node_modules/vite/bin/vite.js'
if (-not $SkipBackend -and -not (Test-Path -LiteralPath (Join-Path $taskBackendRoot 'server.mjs'))) { throw 'backend/server.mjs tidak ditemukan.' }
if (-not $SkipFrontend -and -not (Test-Path -LiteralPath $taskVite)) { throw "Vite belum tersedia untuk $taskSlug; jalankan npm install di repo brand." }

function Get-BrandListener([string]$Role, [int]$Port) {
    $taskConnections = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    if ($taskConnections.Count -eq 0) { return $null }
    $taskOwners = @($taskConnections.OwningProcess | Select-Object -Unique)
    if ($taskOwners.Count -ne 1) { throw "Port $Port memiliki beberapa pemilik; tidak ada proses dihentikan." }
    $taskOwner = Get-CimInstance Win32_Process -Filter "ProcessId = $($taskOwners[0])"
    if (-not $taskOwner -or $taskOwner.Name -ne 'node.exe') { throw "Port $Port ditempati proses lain; tidak ada proses dihentikan." }
    if ($Role -eq 'backend') {
        $taskHealth = $null
        try { $taskHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2 } catch { }
        if ($taskHealth.data.service -ne 'dummy-brand-checkout' -or $taskHealth.data.brand -ne $taskSlug -or $taskHealth.data.catalogs -ne 1) {
            throw "Port backend $Port bukan backend $taskSlug yang sehat; restart manual atau pilih port lain. Tidak ada proses dihentikan."
        }
    }
    else {
        # npm may invoke node_modules/.bin/../vite/bin/vite.js; compare the resolved path.
        $taskMatch = [regex]::Match($taskOwner.CommandLine, '(?:"([^"\r\n]+vite[\\/]+bin[\\/]+vite\.js)"|(\S+vite[\\/]+bin[\\/]+vite\.js))', 'IgnoreCase')
        $taskScriptPath = $taskMatch.Groups[1].Value
        if (-not $taskScriptPath) { $taskScriptPath = $taskMatch.Groups[2].Value }
        if (-not $taskScriptPath -or -not [IO.Path]::IsPathRooted($taskScriptPath) -or [IO.Path]::GetFullPath($taskScriptPath) -ne [IO.Path]::GetFullPath($taskVite)) {
            throw "Port frontend $Port bukan Vite milik $taskSlug; tidak ada proses dihentikan."
        }
    }
    return [pscustomobject]@{ Id = [int]$taskOwner.ProcessId; Created = $taskOwner.CreationDate }
}

function Stop-BrandListener($Listener, [int]$Port) {
    # Recheck ownership immediately before stopping only the validated Node listener.
    $taskCurrent = Get-CimInstance Win32_Process -Filter "ProcessId = $($Listener.Id)"
    $taskConnections = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    if (-not $taskCurrent -or $taskCurrent.CreationDate -ne $Listener.Created -or @($taskConnections | Where-Object { $_.OwningProcess -ne $Listener.Id }).Count -gt 0) {
        throw "Pemilik port $Port berubah; restart dibatalkan."
    }
    Stop-Process -Id $Listener.Id -ErrorAction Stop
    for ($taskAttempt = 0; $taskAttempt -lt 40; $taskAttempt++) {
        if (-not (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)) { return }
        Start-Sleep -Milliseconds 250
    }
    throw "Port $Port belum kosong; proses baru tidak dijalankan."
}

# Validate both selected services before stopping either of them.
$taskServices = @()
if (-not $SkipBackend) { $taskServices += [pscustomobject]@{ Role = 'backend'; Port = $taskBackendPort; Listener = (Get-BrandListener 'backend' $taskBackendPort) } }
if (-not $SkipFrontend) { $taskServices += [pscustomobject]@{ Role = 'frontend'; Port = $taskFrontendPort; Listener = (Get-BrandListener 'frontend' $taskFrontendPort) } }
$taskLogRoot = Join-Path $taskBackendRoot 'logs'
$taskStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$taskPreviousPort = $env:STOREFRONT_PORT
$taskPreviousTarget = $env:VITE_CHECKOUT_PROXY_TARGET
try {
    foreach ($taskService in $taskServices) {
        $taskRole = $taskService.Role
        $taskPort = $taskService.Port
        $taskListener = $taskService.Listener
        if ($taskListener -and $NoRestart) {
            Write-Host "${taskSlug}: $taskRole $taskPort sudah aktif (PID $($taskListener.Id)); dipertahankan karena -NoRestart."
            continue
        }
        $taskAction = 'Jalankan'
        if ($taskListener) { $taskAction = "Restart PID $($taskListener.Id)" }
        if (-not $PSCmdlet.ShouldProcess("$taskSlug $taskRole port $taskPort", $taskAction)) { continue }
        if ($taskListener) { Stop-BrandListener $taskListener $taskPort }
        # Do not launch over a process that appeared after preflight.
        if (Get-NetTCPConnection -State Listen -LocalPort $taskPort -ErrorAction SilentlyContinue) { throw "Port $taskPort sudah terisi; proses baru tidak dijalankan." }
        New-Item -ItemType Directory -Path $taskLogRoot -Force | Out-Null
        $env:STOREFRONT_PORT = "$taskBackendPort"
        $env:VITE_CHECKOUT_PROXY_TARGET = "http://localhost:$taskBackendPort"
        $taskWorkdir = $taskBackendRoot
        $taskArguments = @('server.mjs')
        if ($taskRole -eq 'frontend') {
            $taskWorkdir = $taskBrandRoot
            $taskArguments = @(('"' + $taskVite + '"'), '--host', '127.0.0.1', '--port', "$taskFrontendPort", '--strictPort')
        }
        $taskProcess = Start-Process -FilePath $taskNode -ArgumentList $taskArguments -WorkingDirectory $taskWorkdir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogRoot "$taskRole-$taskStamp.out.log") -RedirectStandardError (Join-Path $taskLogRoot "$taskRole-$taskStamp.err.log") -PassThru
        $taskHealthy = $false
        for ($taskAttempt = 0; $taskAttempt -lt 40; $taskAttempt++) {
            try {
                if ($taskRole -eq 'backend') {
                    $taskHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$taskPort/health" -TimeoutSec 1
                    $taskHealthy = $taskHealth.data.brand -eq $taskSlug -and $taskHealth.data.catalogs -eq 1 -and $taskHealth.data.service -eq 'dummy-brand-checkout'
                }
                else {
                    $taskResponse = Invoke-WebRequest -Uri "http://127.0.0.1:$taskPort/" -UseBasicParsing -TimeoutSec 1
                    $taskHealthy = $taskResponse.StatusCode -eq 200
                }
                if ($taskHealthy) { break }
            } catch { }
            if ($taskProcess.HasExited) { break }
            Start-Sleep -Milliseconds 250
        }
        if (-not $taskHealthy) { throw "$taskRole $taskSlug belum sehat; periksa log di backend/logs/$taskRole-$taskStamp.err.log." }
        Write-Host "${taskSlug}: $taskRole http://localhost:$taskPort (PID $($taskProcess.Id)); siap."
    }
}
finally {
    if ($null -eq $taskPreviousPort) { Remove-Item Env:STOREFRONT_PORT -ErrorAction SilentlyContinue } else { $env:STOREFRONT_PORT = $taskPreviousPort }
    if ($null -eq $taskPreviousTarget) { Remove-Item Env:VITE_CHECKOUT_PROXY_TARGET -ErrorAction SilentlyContinue } else { $env:VITE_CHECKOUT_PROXY_TARGET = $taskPreviousTarget }
}
