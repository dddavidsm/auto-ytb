param(
  [string]$Root = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'
$outputDir = Join-Path $Root 'apps/web/public/demo'
$workDir = Join-Path $Root '.data/production-demos'
$fps = 30
$sceneSeconds = 8
$sceneCount = 5
$videoSeconds = $sceneSeconds * $sceneCount
New-Item -ItemType Directory -Force -Path $outputDir, $workDir | Out-Null

function Invoke-Tool([string]$File, [string[]]$Arguments) {
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$File failed with exit code $LASTEXITCODE" }
}

function Invoke-Voice($slug, $text) {
  $textFile = Join-Path $workDir "$slug.txt"
  $audio = Join-Path $outputDir "$slug.mp3"
  $vtt = Join-Path $outputDir "$slug.vtt"
  Set-Content -LiteralPath $textFile -Value $text -Encoding utf8
  Invoke-Tool 'python' @('-m','edge_tts','--voice','es-ES-XimenaNeural','--rate=-8%','--pitch=-1Hz','--file',$textFile,'--write-media',$audio,'--write-subtitles',$vtt)
  if (!(Test-Path -LiteralPath $audio) -or !(Test-Path -LiteralPath $vtt)) { throw "Voice output missing for $slug" }
}

function Join-Filter([string[]]$Filters) { return ($Filters -join ',') }

function New-MotionScene($slug, $kind, $index, $label, $headline, $body, $accent) {
  $scene = Join-Path $workDir "$slug-motion-$index.mp4"
  $base = "color=c=0x08131f:s=1280x720:r=${fps}:d=${sceneSeconds}"
  $filters = @(
    'drawgrid=w=80:h=80:t=1:c=0x1b3344@0.55',
    "drawbox=x='mod(t*78\,1500)-200':y=104:w=260:h=3:color=0x${accent}@0.82:t=fill",
    "drawbox=x='mod(t*118+470\,1700)-260':y=612:w=360:h=2:color=0x${accent}@0.45:t=fill",
    "drawtext=font='Arial':text='$label':fontcolor=0x${accent}:fontsize=22:x=72:y=54",
    "drawtext=font='Arial':text='$headline':fontcolor=white:fontsize=58:x=72:y=112"
  )

  if ($kind -eq 'battery') {
    switch ($index) {
      1 {
        $filters += @(
          "drawtext=font='Arial':text='108 GW':fontcolor=0x${accent}:fontsize=104:x=72:y=245",
          "drawtext=font='Arial':text='capacidad nueva en 2025':fontcolor=white:fontsize=28:x=82:y=372",
          'drawbox=x=82:y=438:w=1110:h=54:color=0x102b3b@0.9:t=fill',
          "drawbox=x=82:y=438:w='min(1110\,t*150)':h=54:color=0x${accent}:t=fill",
          "drawtext=font='Arial':text='+40 PCT':fontcolor=0xffc857:fontsize=34:x=1040:y=366",
          "drawtext=font='Arial':text='un salto medido en un solo año':fontcolor=0xb9c9d6:fontsize=21:x=82:y=520"
        )
      }
      2 {
        $filters += @(
          "drawtext=font='Arial':text='La red necesita flexibilidad':fontcolor=white:fontsize=36:x=72:y=242",
          "drawbox=x=150:y='540-(110+45*sin(t*1.25))':w=108:h='110+45*sin(t*1.25)':color=0x${accent}:t=fill",
          "drawbox=x=320:y='540-(185+42*sin(t*1.25+0.7))':w=108:h='185+42*sin(t*1.25+0.7)':color=0x51b8d4:t=fill",
          "drawbox=x=490:y='540-(255+38*sin(t*1.25+1.4))':w=108:h='255+38*sin(t*1.25+1.4)':color=0xffc857:t=fill",
          "drawbox=x=660:y='540-(325+34*sin(t*1.25+2.1))':w=108:h='325+34*sin(t*1.25+2.1)':color=0x${accent}:t=fill",
          "drawbox=x=830:y='540-(395+30*sin(t*1.25+2.8))':w=108:h='395+30*sin(t*1.25+2.8)':color=0x51b8d4:t=fill",
          "drawbox=x=1000:y='540-(455+26*sin(t*1.25+3.5))':w=108:h='455+26*sin(t*1.25+3.5)':color=0xffc857:t=fill",
          "drawtext=font='Arial':text='sol  -  almacenamiento  -  demanda':fontcolor=0xb9c9d6:fontsize=22:x=150:y=578"
        )
      }
      3 {
        $filters += @(
          "drawtext=font='Arial':text='LFP gana terreno':fontcolor=white:fontsize=42:x=72:y=236",
          "drawtext=font='Arial':text='más ciclos · menor coste':fontcolor=0xffc857:fontsize=28:x=74:y=300",
          'drawbox=x=170:y=395:w=150:h=120:color=0x173b4c:t=fill',
          'drawbox=x=350:y=395:w=150:h=120:color=0x1d5061:t=fill',
          'drawbox=x=530:y=395:w=150:h=120:color=0x236b70:t=fill',
          'drawbox=x=710:y=395:w=150:h=120:color=0x2a897b:t=fill',
          'drawbox=x=890:y=395:w=150:h=120:color=0x31a987:t=fill',
          "drawbox=x='mod(t*170\,1000)+120':y=428:w=42:h=54:color=0xffffff@0.82:t=fill",
          "drawtext=font='Arial':text='01':fontcolor=0x86d6cd:fontsize=20:x=225:y=535",
          "drawtext=font='Arial':text='02':fontcolor=0x86d6cd:fontsize=20:x=405:y=535",
          "drawtext=font='Arial':text='03':fontcolor=0x86d6cd:fontsize=20:x=585:y=535",
          "drawtext=font='Arial':text='04':fontcolor=0x86d6cd:fontsize=20:x=765:y=535",
          "drawtext=font='Arial':text='05':fontcolor=0x86d6cd:fontsize=20:x=945:y=535"
        )
      }
      4 {
        $filters += @(
          "drawtext=font='Arial':text='El cuello de botella cambia':fontcolor=white:fontsize=38:x=72:y=235",
          'drawbox=x=160:y=420:w=420:h=4:color=0x2f5366:t=fill',
          'drawbox=x=580:y=420:w=340:h=4:color=0x2f5366:t=fill',
          'drawbox=x=920:y=420:w=170:h=4:color=0x2f5366:t=fill',
          'drawbox=x=145:y=405:w=30:h=30:color=0x4fd1c5:t=fill',
          "drawbox=x='mod(t*100\,430)+160':y=405:w=30:h=30:color=0xffc857:t=fill",
          "drawbox=x='mod(t*72\,520)+590':y=405:w=30:h=30:color=0x51b8d4:t=fill",
          "drawtext=font='Arial':text='producir  -  guardar  -  entregar':fontcolor=0xb9c9d6:fontsize=25:x=160:y=484"
        )
      }
      5 {
        $filters += @(
          "drawtext=font='Arial':text='La pregunta importante':fontcolor=0xffc857:fontsize=28:x=72:y=242",
          "drawtext=font='Arial':text='¿quién construirá la red?':fontcolor=white:fontsize=64:x=72:y=302",
          "drawbox=x='640+180*sin(t*1.4)':y='450+90*cos(t*1.4)':w=22:h=22:color=0x${accent}:t=fill",
          "drawbox=x='640+300*sin(t*1.4+1)':y='450+150*cos(t*1.4+1)':w=14:h=14:color=0xffc857:t=fill",
          "drawtext=font='Arial':text='BATERÍAS · ENERGÍA · RED':fontcolor=0xb9c9d6:fontsize=22:x=76:y=520"
        )
      }
    }
  } else {
    switch ($index) {
      1 {
        $filters += @(
          "drawtext=font='Arial':text='Rayos X débiles':fontcolor=white:fontsize=48:x=72:y=238",
          "drawtext=font='Arial':text='ultravioleta intensa':fontcolor=0xffc857:fontsize=48:x=72:y=300",
          "drawbox=x='640-(130+34*sin(t))':y='360-(130+34*sin(t))':w='260+68*sin(t)':h='260+68*sin(t)':color=0x${accent}@0.65:t=8",
          "drawbox=x='640-(220+46*sin(t+0.6))':y='360-(220+46*sin(t+0.6))':w='440+92*sin(t+0.6)':h='440+92*sin(t+0.6)':color=0x51b8d4@0.35:t=6",
          "drawbox=x='640-(310+60*sin(t+1.2))':y='360-(310+60*sin(t+1.2))':w='620+120*sin(t+1.2)':h='620+120*sin(t+1.2)':color=0xffc857@0.18:t=4"
        )
      }
      2 {
        $filters += @(
          "drawtext=font='Arial':text='Siete candidatos':fontcolor=white:fontsize=48:x=72:y=238",
          "drawtext=font='Arial':text='en la galaxia del Molinete':fontcolor=0xb9c9d6:fontsize=28:x=74:y=310",
          'drawbox=x=120:y=450:w=850:h=3:color=0x345267:t=fill',
          'drawbox=x=120:y=370:w=3:h=160:color=0x345267:t=fill',
          "drawbox=x=230:y='450-(80+20*sin(t*1.6))':w=34:h='80+20*sin(t*1.6)':color=0x${accent}:t=fill",
          "drawbox=x=350:y='450-(150+25*sin(t*1.6+0.6))':w=34:h='150+25*sin(t*1.6+0.6)':color=0x51b8d4:t=fill",
          "drawbox=x=470:y='450-(105+18*sin(t*1.6+1.2))':w=34:h='105+18*sin(t*1.6+1.2)':color=0xffc857:t=fill",
          "drawbox=x=590:y='450-(195+30*sin(t*1.6+1.8))':w=34:h='195+30*sin(t*1.6+1.8)':color=0x${accent}:t=fill",
          "drawbox=x=710:y='450-(132+22*sin(t*1.6+2.4))':w=34:h='132+22*sin(t*1.6+2.4)':color=0x51b8d4:t=fill",
          "drawbox=x=830:y='450-(230+32*sin(t*1.6+3))':w=34:h='230+32*sin(t*1.6+3)':color=0xffc857:t=fill",
          "drawbox=x=950:y='450-(170+26*sin(t*1.6+3.6))':w=34:h='170+26*sin(t*1.6+3.6)':color=0x${accent}:t=fill"
        )
      }
      3 {
        $filters += @(
          "drawtext=font='Arial':text='No encajan en el catálogo':fontcolor=white:fontsize=42:x=72:y=240",
          "drawtext=font='Arial':text='conocido':fontcolor=0xffc857:fontsize=42:x=72:y=298",
          'drawbox=x=150:y=410:w=170:h=100:color=0x193449:t=fill',
          'drawbox=x=370:y=410:w=170:h=100:color=0x193449:t=fill',
          'drawbox=x=590:y=410:w=170:h=100:color=0x193449:t=fill',
          'drawbox=x=810:y=410:w=170:h=100:color=0x193449:t=fill',
          "drawtext=font='Arial':text='estrella':fontcolor=0xb9c9d6:fontsize=19:x=186:y=452",
          "drawtext=font='Arial':text='binaria':fontcolor=0xb9c9d6:fontsize=19:x=422:y=452",
          "drawtext=font='Arial':text='agujero negro':fontcolor=0xb9c9d6:fontsize=19:x=620:y=452",
          "drawtext=font='Arial':text='¿otro tipo?':fontcolor=0xffc857:fontsize=19:x=850:y=452",
          "drawbox=x='mod(t*150\,900)+120':y=400:w=4:h=120:color=0x${accent}:t=fill"
        )
      }
      4 {
        $filters += @(
          "drawtext=font='Arial':text='La pista está en la luz':fontcolor=white:fontsize=46:x=72:y=238",
          "drawtext=font='Arial':text='no solo en los rayos X':fontcolor=0xffc857:fontsize=38:x=74:y=302",
          'drawbox=x=140:y=445:w=950:h=3:color=0x345267:t=fill',
          "drawbox=x='140+mod(t*105\,900)':y=420:w=60:h=52:color=0x${accent}:t=fill",
          "drawbox=x='140+mod(t*105+300\,900)':y=420:w=60:h=52:color=0x51b8d4:t=fill",
          "drawbox=x='140+mod(t*105+600\,900)':y=420:w=60:h=52:color=0xffc857:t=fill",
          "drawtext=font='Arial':text='X':fontcolor=0x08131f:fontsize=28:x=158:y=431",
          "drawtext=font='Arial':text='UV':fontcolor=0x08131f:fontsize=20:x=428:y=435",
          "drawtext=font='Arial':text='?':fontcolor=0x08131f:fontsize=26:x=738:y=431"
        )
      }
      5 {
        $filters += @(
          "drawtext=font='Arial':text='A veces el descubrimiento':fontcolor=0xffc857:fontsize=28:x=72:y=242",
          "drawtext=font='Arial':text='es una pregunta nueva':fontcolor=white:fontsize=62:x=72:y=300",
          "drawbox=x='640-(150+45*sin(t))':y='360-(150+45*sin(t))':w='300+90*sin(t)':h='300+90*sin(t)':color=0x${accent}@0.62:t=8",
          "drawbox=x='640-(255+65*sin(t+0.8))':y='360-(255+65*sin(t+0.8))':w='510+130*sin(t+0.8)':h='510+130*sin(t+0.8)':color=0x51b8d4@0.28:t=5",
          "drawtext=font='Arial':text='ASTRONOMÍA · LUZ · MISTERIO':fontcolor=0xb9c9d6:fontsize=22:x=76:y=520"
        )
      }
    }
  }

  $drawFont = "fontfile='C\:/Windows/Fonts/arial.ttf'"
  $filter = (Join-Filter $filters).Replace("font='Arial'", $drawFont)
  Invoke-Tool 'ffmpeg' @('-y','-hide_banner','-loglevel','error','-f','lavfi','-i',$base,'-vf',$filter,'-an','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p',$scene)
  if (!(Test-Path -LiteralPath $scene)) { throw "Motion scene missing for $slug-$index" }
  return $scene
}

function Invoke-ProductionVideo($slug, $source, $text, $kind, $accent) {
  Invoke-Voice $slug $text
  $sceneData = if ($kind -eq 'battery') {
    @(
      @('ENERGÍA · DATOS 01','108 gigavatios','La expansión del almacenamiento eléctrico','Una cifra que cambia el mapa'),
      @('ENERGÍA · DATOS 02','LA RED','La energía no solo se produce','también se entrega a tiempo'),
      @('ENERGÍA · DATOS 03','QUÍMICA','La tecnología importa','más ciclos y menor coste'),
      @('ENERGÍA · DATOS 04','SISTEMA','El reto ya no es guardar','es coordinar toda la red'),
      @('ENERGÍA · DATOS 05','CIERRE','La red que viene','Baterías, energía y decisiones')
    )
  } else {
    @(
      @('ASTRONOMÍA · ALERTA 01','UNA SEÑAL EXTRAÑA','Rayos X débiles','ultravioleta intensa'),
      @('ASTRONOMÍA · ALERTA 02','EL HALLAZGO','Siete candidatos','en la galaxia del Molinete'),
      @('ASTRONOMÍA · ALERTA 03','EL PROBLEMA','No encajan en el catálogo','conocido'),
      @('ASTRONOMÍA · ALERTA 04','LA PISTA','La respuesta puede estar','en la luz que falta'),
      @('ASTRONOMÍA · ALERTA 05','CIERRE','Una pregunta nueva','también es un descubrimiento')
    )
  }
  $scenes = @()
  for ($i = 0; $i -lt $sceneData.Count; $i++) {
    $row = $sceneData[$i]
    $scenes += New-MotionScene $slug $kind ($i + 1) $row[0] $row[1] $row[2] $accent
  }
  $concat = Join-Path $workDir "$slug-motion-concat.txt"
  ($scenes | ForEach-Object { "file '$($_ -replace "'", "'\\''")'" }) | Set-Content -LiteralPath $concat -Encoding ascii
  $mp4 = Join-Path $outputDir "$slug.mp4"
  $audio = Join-Path $outputDir "$slug.mp3"
  $vtt = Join-Path $outputDir "$slug.vtt"
  $vttFilterPath = $vtt.Replace('\', '/').Replace(':', '\:')
  $filter = "subtitles='$vttFilterPath':charenc=UTF-8:force_style='FontName=Arial,FontSize=14,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1,Alignment=2,MarginV=24'"
  Invoke-Tool 'ffmpeg' @('-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',$concat,'-i',$audio,'-map','0:v:0','-map','1:a:0','-vf',$filter,'-af','loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,apad','-t',[string]$videoSeconds,'-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-ar','48000','-ac','2','-movflags','+faststart',$mp4)
  if (!(Test-Path -LiteralPath $mp4)) { throw "Final video missing for $slug" }
  $thumb = Join-Path $outputDir "$slug-thumbnail.jpg"
  Invoke-Tool 'ffmpeg' @('-y','-hide_banner','-loglevel','error','-ss','4','-i',$mp4,'-frames:v','1','-q:v','2',$thumb)
  $metadata = Join-Path $outputDir "$slug-media.json"
  Invoke-Tool 'ffprobe' @('-v','error','-show_entries','format=duration,size','-show_entries','stream=codec_name,codec_type,width,height,sample_rate,channels','-of','json',$mp4) | Set-Content -LiteralPath $metadata -Encoding utf8
  Write-Output "$slug source=$source duration=$videoSeconds seconds"
}

Invoke-ProductionVideo 'battery-grid-2026' 'IEA Global Energy Review 2026' 'En 2025 se instalaron ciento ocho gigavatios nuevos de baterías. El salto fue del cuarenta por ciento en un solo año. Pero la historia no va solo de almacenar energía solar: va de entregarla justo cuando la red la necesita. Las baterías LFP ganan terreno por su coste y su resistencia. El verdadero reto es coordinar producción, almacenamiento y demanda. La red que viene se está diseñando ahora.' 'battery' '4fd1c5'
Invoke-ProductionVideo 'misterio-rayos-x' 'NASA Chandra, septiembre de 2026' 'Astrónomos han encontrado una clase extraña de objetos en otras galaxias. Emiten rayos X sorprendentemente débiles, pero una radiación ultravioleta intensa. Chandra detectó siete candidatos en la galaxia del Molinete. No encajan con las fuentes conocidas y podrían abrir una nueva pista sobre estrellas compactas y agujeros negros. Lo fascinante no es tener la respuesta. Es descubrir una pregunta nueva en el cielo.' 'xray' '9f7cff'

Write-Output 'Motion-graphics production videos built successfully.'
