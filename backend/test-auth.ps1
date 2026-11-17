Write-Host "=== TESTARE TASK 12: AUTENTIFICARE GANGSTYLE ===" -ForegroundColor Cyan
Write-Host ""

$tests = @(
    @{
        Name = "1. Login ADMIN (admin@gangstyle.ro)"
        Url = "http://localhost:8080/api/auth/login"
        Body = @{ email = "admin@gangstyle.ro"; password = "AdminPass123!" }
        Expected = 200
    },
    @{
        Name = "2. Login FRIZER Filip (filip@gangstyle.ro)"
        Url = "http://localhost:8080/api/auth/login"
        Body = @{ email = "filip@gangstyle.ro"; password = "FilipPass123!" }
        Expected = 200
    },
    @{
        Name = "3. Login CLIENT (client@gangstyle.ro)"
        Url = "http://localhost:8080/api/auth/login"
        Body = @{ email = "client@gangstyle.ro"; password = "ClientPass123!" }
        Expected = 200
    },
    @{
        Name = "4. Login PAROLĂ GREȘITĂ (Securitate)"
        Url = "http://localhost:8080/api/auth/login"
        Body = @{ email = "admin@gangstyle.ro"; password = "ParolaGresita" }
        Expected = 401
    },
    @{
        Name = "5. Înregistrare CLIENT NOU"
        Url = "http://localhost:8080/api/auth/register"
        Body = @{
            email = "demo.$([Guid]::NewGuid().ToString().Substring(0,8))@example.com"
            password = "DemoPass123!"
            displayName = "Demo Client"
            phone = "+40733123456"
        }
        Expected = 201
    }
)

foreach ($test in $tests) {
    Write-Host "Rulare: $($test.Name)..." -NoNewline
    $json = $test.Body | ConvertTo-Json
    try {
        $res = Invoke-RestMethod -Uri $test.Url -Method POST -Headers @{"Content-Type"="application/json"} -Body $json
        if ($test.Expected -in @(200, 201)) {
            Write-Host " [SUCCES $($test.Expected)]" -ForegroundColor Green
            Write-Host "   Role primit: $($res.role), Email: $($res.email)" -ForegroundColor Gray
            Write-Host "   Token JWT: $($res.token.Substring(0, 30))..." -ForegroundColor DarkGray
        } else {
            Write-Host " [FAIL: Așteptam $($test.Expected), dar a returnat 200]" -ForegroundColor Red
        }
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($status -eq $test.Expected) {
            Write-Host " [SUCCES $($status) conform așteptărilor]" -ForegroundColor Green
        } else {
            Write-Host " [EROARE: Cod $status primit]" -ForegroundColor Red
        }
    }
    Write-Host ""
}
