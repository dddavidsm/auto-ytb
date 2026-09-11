# Metraje fuente para Shorts

AUTO-YTB puede intercalar metraje real aportado por el usuario o con licencia junto con material generado y gráficos explicativos.

## Preparar un lote de clips

Crea un JSON y pásalo al pipeline con `--source-footage=<ruta>`. El campo `beatIds` conecta el clip con el beat narrativo; si no se indica, el clip puede cubrir cualquier beat de la pieza.

```json
[
  {
    "id": "fencing-demo-01",
    "uri": "C:/Users/david/auto-ytb/assets/source-footage/fencing-demo.mp4",
    "title": "Demostración de esgrima",
    "sourceUrl": "https://example.com/original",
    "sourceId": "research-source-01",
    "beatIds": ["hook"],
    "startSec": 3.4,
    "endSec": 8.8,
    "license": "owned-or-written-permission",
    "rightsStatus": "CLEARED",
    "cropMode": "SMART_CENTER"
  }
]
```

`CLEARED` permite el flujo de producción. `VERIFY` sirve para una revisión privada y deja una advertencia de derechos. `BLOCKED` nunca se renderiza. El pipeline conserva el origen, la licencia, el recorte y la atribución en el manifiesto.

AUTO-YTB no descarga ni raspa automáticamente vídeos de YouTube/TikTok de terceros. Para usarlos hay que aportar un archivo que puedas reutilizar legalmente o una licencia/autorización verificable; poner créditos por sí solo no concede esos derechos.
