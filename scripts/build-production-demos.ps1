param(
  [string]$Root = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'
$assetDir = Join-Path $Root 'apps/web/public/generated'
$outputDir = Join-Path $Root 'apps/web/public/demo'
$workDir = Join-Path $Root '.data/production-demos'
New-Item -ItemType Directory -Force -Path $outputDir, $workDir | Out-Null

function Invoke-Voice($slug, $text) {
  $textFile = Join-Path $workDir "$slug.txt"
  $audio = Join-Path $outputDir "$slug.mp3"
  $vtt = Join-Path $outputDir "$slug.vtt"
  Set-Content -LiteralPath $textFile -Value $text -Encoding utf8
  python -m edge_tts --voice es-ES-AlvaroNeural --file $textFile --write-media $audio --write-subtitles $vtt
  if (!(Test-Path -LiteralPath $audio) -or !(Test-Path -LiteralPath $vtt)) { throw "Voice output missing for $slug" }
}

function Invoke-Scene($slug, $image, $index) {
  $scene = Join-Path $workDir "$slug-$index.mp4"
  $zoom = if ($index % 2 -eq 0) { "min(zoom+0.00065,1.10)" } else { "min(zoom+0.00045,1.08)" }
  $x = if ($index % 2 -eq 0) { "iw/2-(iw/zoom/2)" } else { "0" }
  ffmpeg -y -hide_banner -loglevel error -loop 1 -i $image -t 10 -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,zoompan=z='$zoom':x='$x':y='ih/2-(ih/zoom/2)':d=300:s=1280x720:fps=30,setsar=1" -an -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p $scene
  if (!(Test-Path -LiteralPath $scene)) { throw "Scene output missing for $slug-$index" }
  return $scene
}

function Invoke-ProductionVideo($slug, $title, $source, $text, [string[]]$images) {
  Invoke-Voice $slug $text
  $scenes = @()
  for ($i = 0; $i -lt $images.Count; $i++) {
    $scenes += Invoke-Scene $slug (Join-Path $assetDir $images[$i]) ($i + 1)
  }
  $concat = Join-Path $workDir "$slug-concat.txt"
  ($scenes | ForEach-Object { "file '$($_ -replace "'", "'\\''")'" }) | Set-Content -LiteralPath $concat -Encoding ascii
  $mp4 = Join-Path $outputDir "$slug.mp4"
  $audio = Join-Path $outputDir "$slug.mp3"
  $vtt = Join-Path $outputDir "$slug.vtt"
  $vttFilterPath = $vtt.Replace('\', '/').Replace(':', '\:')
  $filter = "subtitles='$vttFilterPath':charenc=UTF-8:force_style='FontName=Arial,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1,Alignment=2,MarginV=34'"
  ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i $concat -i $audio -map 0:v:0 -map 1:a:0 -vf $filter -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p -c:a aac -b:a 160k -ar 48000 -ac 2 -shortest -movflags +faststart $mp4
  if (!(Test-Path -LiteralPath $mp4)) { throw "Final video missing for $slug" }
  ffmpeg -y -hide_banner -loglevel error -i (Join-Path $assetDir $images[0]) -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720" -frames:v 1 -q:v 2 (Join-Path $outputDir "$slug-thumbnail.jpg")
  ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_name,codec_type,width,height,sample_rate,channels -of json $mp4 | Set-Content -LiteralPath (Join-Path $outputDir "$slug-media.json") -Encoding utf8
}

Invoke-ProductionVideo `
  'battery-grid-2026' `
  'BATERIAS: LA RED QUE VIENE' `
  'Fuente: IEA Global Energy Review 2026' `
  'En 2025 se instalaron ciento ocho gigavatios nuevos de baterías para almacenar electricidad en todo el mundo. El salto fue del cuarenta por ciento en un solo año. La clave no es solo guardar energía solar: es poder moverla a la hora exacta en que la red la necesita. Y mientras el litio sigue dominando, las baterías LFP ganan terreno porque son más baratas y soportan muchos ciclos. La pregunta es quién construirá la red que viene.' `
  @('battery-01.png','battery-02.png','battery-03.png','battery-04.png')

Invoke-ProductionVideo `
  'misterio-rayos-x' `
  'EL MISTERIO DE LOS RAYOS X' `
  'Fuente: NASA Chandra, septiembre de 2026' `
  'Astrónomos han encontrado una clase extraña de objetos en otras galaxias: emiten rayos X sorprendentemente débiles, pero una radiación ultravioleta intensa. El observatorio Chandra detectó siete candidatos en la galaxia del Molinete. No parecen comportarse como las fuentes conocidas, y podrían ayudar a resolver dos enigmas sobre estrellas compactas y agujeros negros. Lo fascinante no es tener una respuesta: es haber encontrado una pregunta nueva en el cielo.' `
  @('xray-01.png','xray-02.png','xray-03.png','xray-04.png')

Write-Output 'Production demo videos built successfully.'
