# PowerShell Script to Publish Version 3.0 to GitHub
# Repository: https://github.com/VinodSridharan/Credit-Karma-Clean-Transactions-Exporter.git

Write-Host "=== Publishing CreditKarmaTxDownloader v3.0 to GitHub ===" -ForegroundColor Green
Write-Host ""

# Navigate to project directory
$projectPath = "C:\Users\ceoci\OneDrive\Desktop\Docs of desktop\Tech channels\Automation Efforts\CK auto\Gold version\CreditKarmaExtractor-main\CK_Tx_Downloader"
Set-Location $projectPath

Write-Host "📁 Current Directory: $projectPath" -ForegroundColor Cyan
Write-Host ""

# Check if git is initialized
if (-not (Test-Path ".git")) {
    Write-Host "🔄 Initializing git repository..." -ForegroundColor Yellow
    git init
    git branch -M main
}

# Check remote
Write-Host "🔍 Checking remote repository..." -ForegroundColor Cyan
$remoteExists = git remote -v 2>$null | Select-String "VinodSridharan/Credit-Karma-Clean-Transactions-Exporter"
if (-not $remoteExists) {
    Write-Host "➕ Adding remote repository..." -ForegroundColor Yellow
    git remote remove origin 2>$null
    git remote add origin https://github.com/VinodSridharan/Credit-Karma-Clean-Transactions-Exporter.git
    Write-Host "✅ Remote added: https://github.com/VinodSridharan/Credit-Karma-Clean-Transactions-Exporter.git" -ForegroundColor Green
} else {
    Write-Host "✅ Remote already configured" -ForegroundColor Green
    git remote -v
}

Write-Host ""
Write-Host "📋 Checking what will be committed..." -ForegroundColor Cyan
git status --short

Write-Host ""
Write-Host "⚠️  Ready to commit and push. Continue? (Y/N)" -ForegroundColor Yellow
$response = Read-Host

if ($response -eq "Y" -or $response -eq "y") {
    Write-Host ""
    Write-Host "📦 Adding all files..." -ForegroundColor Cyan
    git add .
    
    Write-Host "💬 Creating commit..." -ForegroundColor Cyan
    git commit -m "Version 3.0 - Production Ready Release

🚀 Major Release: CreditKarmaTxDownloader v3.0

Key Features:
- Dual boundary checking for 100% accuracy
- 5 date presets (Last Month, This Month, This Year, Last 5 Years, Last 8 Years)
- Visible progress indicators with max scrolls display
- Pending transaction detection and display in export summary
- Strict boundaries for all transactions (including pending)
- Auto-recovery on interruption (saves every 10 scrolls)
- Calendar month detection for accurate 'This Month' preset
- 8-year transaction history support

Test Results (Verified):
✅ This Month: 52 transactions
✅ Last Month: 133 transactions (100% accuracy)
✅ This Year: 1,530 transactions
✅ Last 5 Years: 3,888 transactions
✅ Last 8 Years: 4,009 transactions

Production Ready: November 15, 2025"
    
    Write-Host ""
    Write-Host "🚀 Pushing to GitHub..." -ForegroundColor Cyan
    git push -u origin main
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Successfully published to GitHub!" -ForegroundColor Green
        Write-Host "🔗 Repository: https://github.com/VinodSridharan/Credit-Karma-Clean-Transactions-Exporter" -ForegroundColor Cyan
    } else {
        Write-Host ""
        Write-Host "❌ Push failed. You may need to:" -ForegroundColor Red
        Write-Host "   1. Pull existing changes first: git pull origin main --allow-unrelated-histories" -ForegroundColor Yellow
        Write-Host "   2. Resolve any conflicts" -ForegroundColor Yellow
        Write-Host "   3. Try pushing again: git push -u origin main" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "❌ Cancelled. Files prepared but not committed." -ForegroundColor Yellow
}

