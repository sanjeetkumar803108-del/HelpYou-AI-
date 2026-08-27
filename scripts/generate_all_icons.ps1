Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\VICTUS\Downloads\WhatsApp Image 2026-08-26 at 8.06.44 PM.jpeg"
if (-not (Test-Path $srcPath)) {
    Write-Error "Source image not found: $srcPath"
    exit 1
}

$srcImage = [System.Drawing.Image]::FromFile($srcPath)

# 1. Create a clean square 512x512 master bitmap with white background
$masterSize = 512
$masterBmp = New-Object System.Drawing.Bitmap($masterSize, $masterSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gMaster = [System.Drawing.Graphics]::FromImage($masterBmp)
$gMaster.Clear([System.Drawing.Color]::White)
$gMaster.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gMaster.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gMaster.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$gMaster.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

# Draw the source image centered inside 512x512 master (padding for clean edges)
$targetPadding = 16
$availWidth = $masterSize - ($targetPadding * 2)
$availHeight = $masterSize - ($targetPadding * 2)

$scale = [Math]::Min($availWidth / $srcImage.Width, $availHeight / $srcImage.Height)
$drawW = [int]($srcImage.Width * $scale)
$drawH = [int]($srcImage.Height * $scale)
$drawX = [int](($masterSize - $drawW) / 2)
$drawY = [int](($masterSize - $drawH) / 2)

$gMaster.DrawImage($srcImage, $drawX, $drawY, $drawW, $drawH)
$gMaster.Dispose()
$srcImage.Dispose()

# Save master PNG to web assets
$masterBmp.Save("c:\Users\VICTUS\Ai\HelpYou-AI-\src\assets\logo.png", [System.Drawing.Imaging.ImageFormat]::Png)
if (-not (Test-Path "c:\Users\VICTUS\Ai\HelpYou-AI-\public")) {
    New-Item -ItemType Directory -Path "c:\Users\VICTUS\Ai\HelpYou-AI-\public" -Force | Out-Null
}
$masterBmp.Save("c:\Users\VICTUS\Ai\HelpYou-AI-\public\logo.png", [System.Drawing.Imaging.ImageFormat]::Png)
$masterBmp.Save("c:\Users\VICTUS\Ai\HelpYou-AI-\public\favicon.png", [System.Drawing.Imaging.ImageFormat]::Png)

# 2. Android mipmap densities, legacy launcher sizes, and adaptive foreground sizes (108dp base)
$densities = @(
    @{ Folder = "mipmap-mdpi"; LegacySize = 48; FgSize = 108 },
    @{ Folder = "mipmap-hdpi"; LegacySize = 72; FgSize = 162 },
    @{ Folder = "mipmap-xhdpi"; LegacySize = 96; FgSize = 216 },
    @{ Folder = "mipmap-xxhdpi"; LegacySize = 144; FgSize = 324 },
    @{ Folder = "mipmap-xxxhdpi"; LegacySize = 192; FgSize = 432 }
)

$resDir = "c:\Users\VICTUS\Ai\HelpYou-AI-\android\app\src\main\res"

foreach ($d in $densities) {
    $folderPath = Join-Path $resDir $d.Folder
    if (-not (Test-Path $folderPath)) {
        New-Item -ItemType Directory -Path $folderPath -Force | Out-Null
    }
    
    # Generate Legacy Launcher Icon (Full bleed / square)
    $sz = $d.LegacySize
    $bmpLegacy = New-Object System.Drawing.Bitmap($sz, $sz, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $gLegacy = [System.Drawing.Graphics]::FromImage($bmpLegacy)
    $gLegacy.Clear([System.Drawing.Color]::White)
    $gLegacy.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gLegacy.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $gLegacy.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $gLegacy.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $gLegacy.DrawImage($masterBmp, 0, 0, $sz, $sz)
    $gLegacy.Dispose()

    $icPath = Join-Path $folderPath "ic_launcher.png"
    $icRoundPath = Join-Path $folderPath "ic_launcher_round.png"
    $bmpLegacy.Save($icPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmpLegacy.Save($icRoundPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmpLegacy.Dispose()

    # Generate Adaptive Icon Foreground (108dp base canvas with inner 72dp ~66% safe zone centered)
    $fgSz = $d.FgSize
    $bmpFg = New-Object System.Drawing.Bitmap($fgSz, $fgSz, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $gFg = [System.Drawing.Graphics]::FromImage($bmpFg)
    $gFg.Clear([System.Drawing.Color]::Transparent)
    $gFg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gFg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $gFg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $gFg.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    # Safe zone content sizing (~68% of 108dp canvas)
    $safeContentSize = [int]($fgSz * 0.68)
    $fgDrawX = [int](($fgSz - $safeContentSize) / 2)
    $fgDrawY = [int](($fgSz - $safeContentSize) / 2)
    $gFg.DrawImage($masterBmp, $fgDrawX, $fgDrawY, $safeContentSize, $safeContentSize)
    $gFg.Dispose()

    $icFgPath = Join-Path $folderPath "ic_launcher_foreground.png"
    $bmpFg.Save($icFgPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmpFg.Dispose()
    
    Write-Output "Generated icons in $($d.Folder) (Legacy: $($sz)x$($sz), Foreground: $($fgSz)x$($fgSz))"
}

$masterBmp.Dispose()
Write-Output "All launcher icon densities successfully generated from WhatsApp Image!"
