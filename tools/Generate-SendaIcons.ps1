[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$sendaRoot=Split-Path $PSScriptRoot -Parent
$sendaAssets=Join-Path $sendaRoot 'assets/branding'
$sendaPng=Join-Path $sendaAssets 'png'
New-Item -ItemType Directory -Path $sendaPng -Force | Out-Null
$sendaSizes=@(16,20,24,32,40,48,64,128,256)
foreach($sendaSize in $sendaSizes) {
    $sendaBitmap=[Drawing.Bitmap]::new($sendaSize,$sendaSize,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $sendaGraphics=[Drawing.Graphics]::FromImage($sendaBitmap)
    $sendaGraphics.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $sendaGraphics.ScaleTransform([single]($sendaSize/64),[single]($sendaSize/64))
    $sendaShape=[Drawing.Drawing2D.GraphicsPath]::new()
    $sendaShape.AddArc(1,1,32,32,180,90); $sendaShape.AddArc(31,1,32,32,270,90)
    $sendaShape.AddArc(31,31,32,32,0,90); $sendaShape.AddArc(1,31,32,32,90,90); $sendaShape.CloseFigure()
    $sendaBrush=[Drawing.Drawing2D.LinearGradientBrush]::new([Drawing.Rectangle]::new(0,0,64,64),[Drawing.ColorTranslator]::FromHtml('#3c7bd4'),[Drawing.ColorTranslator]::FromHtml('#174593'),[single]45)
    $sendaGraphics.FillPath($sendaBrush,$sendaShape)
    $sendaRoute=[Drawing.Drawing2D.GraphicsPath]::new()
    $sendaRoute.AddLine(44,18,29,18); $sendaRoute.AddBezier(29,18,15,18,15,34,29,34)
    $sendaRoute.AddLine(29,34,35,34); $sendaRoute.AddBezier(35,34,46,34,46,48,35,48); $sendaRoute.AddLine(35,48,20,48)
    $sendaPen=[Drawing.Pen]::new([Drawing.Color]::White,[single]5.5)
    $sendaPen.StartCap=$sendaPen.EndCap=[Drawing.Drawing2D.LineCap]::Round
    $sendaGraphics.DrawPath($sendaPen,$sendaRoute)
    $sendaDot=[Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#bce9fa'))
    $sendaGraphics.FillEllipse($sendaDot,40,14,8,8); $sendaGraphics.FillEllipse($sendaDot,16,44,8,8)
    $sendaBitmap.Save((Join-Path $sendaPng "$sendaSize.png"),[Drawing.Imaging.ImageFormat]::Png)
    if($sendaSize -in @(16,32)) {
        # Chromium tints the NTP favicon as a mask. Keep its background transparent.
        $sendaGraphics.Clear([Drawing.Color]::Transparent)
        $sendaGraphics.DrawPath($sendaPen,$sendaRoute)
        $sendaGraphics.FillEllipse($sendaDot,40,14,8,8); $sendaGraphics.FillEllipse($sendaDot,16,44,8,8)
        $sendaBitmap.Save((Join-Path $sendaPng "ntp-$sendaSize.png"),[Drawing.Imaging.ImageFormat]::Png)
    }
    $sendaDot.Dispose(); $sendaPen.Dispose(); $sendaRoute.Dispose(); $sendaBrush.Dispose(); $sendaShape.Dispose(); $sendaGraphics.Dispose(); $sendaBitmap.Dispose()
}
$sendaImages=@($sendaSizes | ForEach-Object {,[IO.File]::ReadAllBytes((Join-Path $sendaPng "$_.png"))})
$sendaStream=[IO.MemoryStream]::new()
$sendaWriter=[IO.BinaryWriter]::new($sendaStream)
$sendaWriter.Write([uint16]0); $sendaWriter.Write([uint16]1); $sendaWriter.Write([uint16]$sendaSizes.Count)
$sendaOffset=6+16*$sendaSizes.Count
for($sendaIndex=0;$sendaIndex -lt $sendaSizes.Count;$sendaIndex++) {
    $sendaDimension=if($sendaSizes[$sendaIndex] -eq 256){0}else{$sendaSizes[$sendaIndex]}
    $sendaWriter.Write([byte]$sendaDimension); $sendaWriter.Write([byte]$sendaDimension)
    $sendaWriter.Write([byte]0); $sendaWriter.Write([byte]0); $sendaWriter.Write([uint16]1); $sendaWriter.Write([uint16]32)
    $sendaWriter.Write([uint32]$sendaImages[$sendaIndex].Length); $sendaWriter.Write([uint32]$sendaOffset)
    $sendaOffset+=$sendaImages[$sendaIndex].Length
}
foreach($sendaImage in $sendaImages){$sendaWriter.Write([byte[]]$sendaImage)}
[IO.File]::WriteAllBytes((Join-Path $sendaAssets 'senda.ico'),$sendaStream.ToArray())
$sendaWriter.Dispose(); $sendaStream.Dispose()
foreach($sendaScale in @(1,2)) {
    foreach($sendaWhite in @($false,$true)) {
        $sendaBitmap=[Drawing.Bitmap]::new(110*$sendaScale,22*$sendaScale)
        $sendaGraphics=[Drawing.Graphics]::FromImage($sendaBitmap)
        $sendaGraphics.ScaleTransform($sendaScale,$sendaScale)
        $sendaGraphics.TextRenderingHint=[Drawing.Text.TextRenderingHint]::AntiAliasGridFit
        $sendaImage=[Drawing.Image]::FromFile((Join-Path $sendaPng '256.png'))
        $sendaGraphics.DrawImage($sendaImage,0,0,22,22)
        $sendaFont=[Drawing.Font]::new('Segoe UI',[single]16,[Drawing.FontStyle]::Regular,[Drawing.GraphicsUnit]::Pixel)
        $sendaColor=if($sendaWhite){[Drawing.Color]::White}else{[Drawing.ColorTranslator]::FromHtml('#20394d')}
        $sendaText=[Drawing.SolidBrush]::new($sendaColor)
        $sendaGraphics.DrawString('Senda',$sendaFont,$sendaText,[single]27,[single]0)
        $sendaSuffix=if($sendaWhite){'-white'}else{''}
        $sendaBitmap.Save((Join-Path $sendaAssets "wordmark-$($sendaScale*22)$sendaSuffix.png"),[Drawing.Imaging.ImageFormat]::Png)
        $sendaText.Dispose(); $sendaFont.Dispose(); $sendaImage.Dispose(); $sendaGraphics.Dispose(); $sendaBitmap.Dispose()
    }
}
Write-Output 'Icono Senda: nueve tamaños, ICO y marcas para escalas 100/200%.'
