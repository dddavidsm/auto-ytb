export type IdeaLabMode = 'niches' | 'ideas' | 'kids_series' | 'education';

type SeedInput = { mode: IdeaLabMode; brief: string; language: 'es' | 'en'; count: number };

export type IdeaSeed = {
  title: string;
  angle: string;
  hook: string;
  audience: string;
  niche: string;
  format: 'LONG_HORIZONTAL' | 'SHORT_VERTICAL';
  score: number;
  grade: string;
  seriesProfile?: Record<string, unknown>;
  risks: string[];
  rationale: string[];
};

const nicheSeeds = [
  ['Microhistorias de inventos cotidianos', 'Cómo nacieron objetos que usamos cada día y qué problema resolvieron.', 'La historia que nadie te contó sobre algo que tienes delante ahora mismo.'],
  ['Ciencia visual para familias', 'Experimentos seguros, explicados con animación y una conclusión verificable.', 'En 60 segundos puedes ver una ley científica delante de tus ojos.'],
  ['Habilidades socioemocionales animadas', 'Personajes originales que convierten conflictos infantiles en decisiones prácticas.', 'Una historia breve para entender lo que sientes y saber qué hacer después.'],
  ['Mapas de negocios y tecnología', 'Explicadores visuales de productos, modelos de negocio y cambios que afectan a la vida real.', 'El mapa sencillo para entender una industria antes de que cambie.'],
  ['Rankings verificables de curiosidades', 'Listas comparables con fuentes, contexto y un criterio editorial transparente.', 'No es una lista al azar: cada puesto se puede comprobar.'],
];

const educationSeeds = [
  ['El laboratorio de Luma', 'Cada episodio parte de una pregunta infantil y la resuelve con un experimento seguro.', '¿Por qué algunas cosas flotan y otras se hunden?', '4-7 años', 'Ciencia y observación'],
  ['Código con los Mapaches', 'Una pandilla aprende pensamiento computacional resolviendo pequeños retos cotidianos.', 'El reto de hoy: ordenar el caos con instrucciones exactas.', '8-12 años', 'Lógica y programación'],
  ['Atlas de las emociones', 'Historias de personajes que identifican una emoción, la nombran y prueban una herramienta.', 'Cuando la preocupación crece, el equipo dibuja un plan.', '5-9 años', 'Educación emocional'],
  ['La vuelta al mundo en una merienda', 'Cultura, geografía y hábitos saludables a través de recetas y relatos familiares.', 'Un ingrediente, una familia y un viaje para descubrir su historia.', '6-11 años', 'Cultura y geografía'],
];

const cleanBrief = (value: string) => value.trim().replace(/\s+/g, ' ').slice(0, 260);

export function generateIdeaSeeds(input: SeedInput): IdeaSeed[] {
  const brief = cleanBrief(input.brief) || 'un canal original con potencial evergreen';
  const limit = Math.max(1, Math.min(8, Math.floor(input.count || 4)));
  if (input.mode === 'niches') {
    return nicheSeeds.slice(0, limit).map((seed, index) => ({
      title: seed[0], angle: `${seed[1]} Contexto del usuario: ${brief}.`, hook: seed[2], audience: 'Audiencia amplia interesada en aprender', niche: seed[0], format: (index % 2 ? 'SHORT_VERTICAL' : 'LONG_HORIZONTAL') as 'SHORT_VERTICAL' | 'LONG_HORIZONTAL', score: 86 - index * 2, grade: index < 2 ? 'A' : 'B+', risks: ['Validar fuentes antes de publicar', 'No usar material de terceros sin derechos'], rationale: ['Interés evergreen y fácil de serializar', 'Permite probar formatos largos y cortos', 'Tiene una promesa clara para título y miniatura'],
    }));
  }
  if (input.mode === 'kids_series' || input.mode === 'education') {
    return educationSeeds.slice(0, limit).map((seed, index) => ({
      title: seed[0], angle: `${seed[1]} ${brief !== 'un canal original con potencial evergreen' ? `Adaptada a: ${brief}.` : ''}`.trim(), hook: seed[2], audience: seed[3], niche: seed[4], format: 'LONG_HORIZONTAL', score: 91 - index * 2, grade: index < 3 ? 'A' : 'B+', risks: ['Usar personajes, música y recursos originales o licenciados', 'Revisión adulta de seguridad y adecuación por edad', 'Evitar afirmaciones educativas no verificadas'], rationale: ['Motor de episodios repetible', 'Personajes y reglas fáciles de mantener', 'Permite crear temporadas y derivados verticales'], seriesProfile: { seriesName: seed[0], ageRange: seed[3], learningArea: seed[4], episodeEngine: seed[1], seasonPremise: `Una primera temporada de 12 episodios sobre ${brief}.`, characterBible: ['Protagonista curioso y resolutivo', 'Compañero que hace preguntas', 'Guía que verifica la explicación'], safetyRules: ['Sin retos peligrosos', 'Sin datos personales de menores', 'Cierre con recordatorio de pedir ayuda a un adulto'] },
    }));
  }
  return [
    { title: `La guía definitiva sobre ${brief}`, angle: `Una pieza principal que responde la pregunta central con ejemplos, fuentes y una conclusión útil.`, hook: `La respuesta clara a ${brief}, sin relleno y con pruebas.`, audience: 'Personas que buscan una explicación práctica', niche: brief, format: 'LONG_HORIZONTAL' as const, score: 89, grade: 'A', risks: ['Separar hechos de opinión', 'Revisar actualidad y derechos de recursos'], rationale: ['Intención clara de búsqueda', 'Buen punto de partida para una serie de derivados'], },
    { title: `${brief}: 7 ideas que sí cambian la decisión`, angle: 'Lista argumentada con criterio explícito, ejemplos y un cierre accionable.', hook: 'Siete ideas, una forma de decidir y cero humo.', audience: 'Audiencia interesada en decisiones rápidas', niche: brief, format: 'SHORT_VERTICAL' as const, score: 84, grade: 'B+', risks: ['Evitar titulares engañosos', 'Verificar cada dato'], rationale: ['Formato modular', 'Fácil de convertir en clips y carruseles'], },
    { title: `Lo que nadie explica de ${brief}`, angle: 'Investigación narrativa que compara la versión popular con la evidencia disponible.', hook: 'La parte incómoda de la historia está en los detalles.', audience: 'Audiencia curiosa y crítica', niche: brief, format: 'LONG_HORIZONTAL' as const, score: 87, grade: 'A-', risks: ['Equilibrar perspectivas', 'Citar fuentes primarias'], rationale: ['Diferenciación editorial', 'Fomenta comentarios y conversación'], },
  ].slice(0, limit);
}

export function modeLabel(mode: IdeaLabMode) {
  return ({ niches: 'Nichos', ideas: 'Ideas de vídeo', kids_series: 'Series infantiles', education: 'Educativo' } as Record<IdeaLabMode, string>)[mode];
}
