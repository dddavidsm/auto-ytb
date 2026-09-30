'use client';

export type VideoStyle = { id: string; name: string; description: string; swatch: string; prompt: string };

export const VIDEO_STYLES: VideoStyle[] = [
  { id: 'documentary', name: 'Documental cinematográfico', description: 'Vídeo real, cortes con intención y pruebas verificables.', swatch: 'style-swatch documentary', prompt: 'documental cinematográfico, luz natural, cámara observacional, cortes motivados y evidencia visual real' },
  { id: 'handdrawn-map', name: 'Mapa + muñeco de palo', description: 'Animación dibujada a mano con acción continua y mapas vivos.', swatch: 'style-swatch handdrawn', prompt: 'animación 2D dibujada a mano, muñeco de palo expresivo, mapa en movimiento, líneas que se trazan y cámara dinámica' },
  { id: 'explainer-2d', name: 'Explainer 2D', description: 'Personajes y objetos originales explicando una historia.', swatch: 'style-swatch explainer', prompt: 'animación 2D editorial limpia, personajes originales, acciones legibles, cambios de escala y composición en cada plano' },
  { id: 'editorial-collage', name: 'Collage editorial', description: 'Texturas, recortes y transiciones con ritmo de revista.', swatch: 'style-swatch collage', prompt: 'collage editorial animado, texturas de papel y recortes originales en movimiento, composición de revista y transiciones físicas' },
  { id: 'science-3d', name: 'Ciencia 3D', description: 'Volumen, cámara macro y visualización de procesos.', swatch: 'style-swatch science', prompt: 'visualización 3D científica premium, cámara macro, materiales realistas, proceso visible y movimiento continuo' },
  { id: 'kids-story', name: 'Serie infantil', description: 'Personaje consistente, colores claros y aprendizaje seguro.', swatch: 'style-swatch kids', prompt: 'serie infantil original, personaje consistente, animación cálida, colores legibles, expresiones claras y acción amable' },
];

export const SOURCE_MODES = [
  { id: 'AUTO', name: 'Automático', description: 'Elige entre recursos reales y clips generativos según el tema.', productionMode: 'AUTO' },
  { id: 'SOURCE_FIRST', name: 'Con recursos reales', description: 'Solo vídeo en movimiento autorizado; sin imágenes de relleno.', productionMode: 'SOURCE_FIRST' },
  { id: 'GENERATIVE', name: 'Generativo H3/Veo', description: 'Clips nuevos en movimiento; voz y subtítulos se montan aparte.', productionMode: 'GENERATIVE' },
] as const;

export function VideoStylePicker({ value, onChange }: { value: string; onChange: (style: VideoStyle) => void }) {
  return <div className="style-picker" role="radiogroup" aria-label="Estilo visual">
    {VIDEO_STYLES.map((style) => <button className={`style-card ${value === style.id ? 'selected' : ''}`} type="button" role="radio" aria-checked={value === style.id} key={style.id} onClick={() => onChange(style)}>
      <span className={style.swatch} aria-hidden="true"><span /></span><span className="style-card-copy"><strong>{style.name}</strong><small>{style.description}</small></span>
    </button>)}
  </div>;
}

export function SourceModePicker({ value, onChange }: { value: string; onChange: (mode: typeof SOURCE_MODES[number]) => void }) {
  return <div className="source-mode-picker" role="radiogroup" aria-label="Fuente visual">
    {SOURCE_MODES.map((mode) => <button className={`mode-card ${value === mode.id ? 'selected' : ''}`} type="button" role="radio" aria-checked={value === mode.id} key={mode.id} onClick={() => onChange(mode)}><strong>{mode.name}</strong><small>{mode.description}</small></button>)}
  </div>;
}
