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
  visualStyle: string;
  narrativeArc: string;
  evidencePlan: string[];
  resourceQueries: string[];
  estimatedShots: number;
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

const ideaAngles = [
  ['La historia oculta de', 'microdocumental causal', 'Origen, conflicto y consecuencia: seguir el mecanismo que convirtió el tema en algo relevante.', '¿Qué tuvo que pasar para que esto terminara cambiando la vida cotidiana?', 'gancho de contradicción y cadena causa-efecto'],
  ['7 pruebas para entender', 'ranking verificable', 'Ordenar casos reales con un criterio visible y subir la apuesta en cada entrada.', 'No es una lista arbitraria: hay una prueba concreta detrás de cada puesto.', 'ranking con evidencia y escalada'],
  ['Antes de que existiera', 'línea temporal visual', 'Contar la transformación desde el primer intento hasta el punto de inflexión que explica el presente.', 'La versión actual parece inevitable, pero empezó con un problema muy distinto.', 'timeline con revelación intermedia'],
  ['El mito contra los datos de', 'mito vs evidencia', 'Separar lo que se repite de lo que está documentado, mostrando dónde cambia la conclusión.', 'La explicación popular suena bien; los datos cuentan una historia más interesante.', 'contraste de afirmación y fuente'],
  ['La prueba real de', 'experimento documental', 'Plantear una pregunta comprobable y resolverla con observaciones, comparaciones y un resultado final.', 'Si cambiamos una sola variable, ¿qué ocurre de verdad?', 'pregunta, prueba, resultado y límite'],
  ['El mapa que explica', 'geografía de sistemas', 'Convertir un tema abstracto en un recorrido por lugares, flujos y decisiones visibles.', 'Cuando lo dibujas sobre el mapa, el patrón aparece en segundos.', 'mapa narrativo con zooms de contexto'],
  ['Quién gana y quién paga en', 'impacto humano', 'Conectar la tendencia con decisiones, costes y efectos concretos para personas y negocios.', 'La cifra grande importa menos que lo que cambia para alguien real.', 'caso humano más contexto'],
  ['Lo que viene después de', 'escenario documentado', 'Partir de señales actuales, distinguir hechos de hipótesis y cerrar con escenarios plausibles.', 'No hace falta adivinar el futuro: basta con seguir las señales que ya están aquí.', 'señales actuales y tres escenarios'],
];

const cleanBrief = (value: string) => value.trim().replace(/\s+/g, ' ').slice(0, 260);

export function generateIdeaSeeds(input: SeedInput): IdeaSeed[] {
  const brief = cleanBrief(input.brief) || 'un canal original con potencial evergreen';
  const limit = Math.max(1, Math.min(8, Math.floor(input.count || 4)));
  if (input.mode === 'niches') {
    return nicheSeeds.slice(0, limit).map((seed, index) => ({
      title: seed[0], angle: `${seed[1]} Contexto del usuario: ${brief}.`, hook: seed[2], audience: 'Audiencia amplia interesada en aprender', niche: seed[0], format: (index % 2 ? 'SHORT_VERTICAL' : 'LONG_HORIZONTAL') as 'SHORT_VERTICAL' | 'LONG_HORIZONTAL', score: 86 - index * 2, grade: index < 2 ? 'A' : 'B+', risks: ['Validar fuentes antes de publicar', 'No usar material de terceros sin derechos'], rationale: ['Interés evergreen y fácil de serializar', 'Permite probar formatos largos y cortos', 'Tiene una promesa clara para título y miniatura'],
      visualStyle: 'Documental editorial de cortes rápidos con vídeo real autorizado', narrativeArc: 'Señal → contexto → prueba → conclusión accionable', evidencePlan: ['Fuentes primarias', 'Recursos de vídeo con licencia', 'Verificación de afirmaciones'], resourceQueries: [seed[0], `${seed[0]} documentary footage`, `${seed[0]} real process b-roll`], estimatedShots: index % 2 ? 12 : 20,
    }));
  }
  if (input.mode === 'kids_series' || input.mode === 'education') {
    return educationSeeds.slice(0, limit).map((seed, index) => ({
      title: seed[0], angle: `${seed[1]} ${brief !== 'un canal original con potencial evergreen' ? `Adaptada a: ${brief}.` : ''}`.trim(), hook: seed[2], audience: seed[3], niche: seed[4], format: 'LONG_HORIZONTAL', score: 91 - index * 2, grade: index < 3 ? 'A' : 'B+', risks: ['Usar personajes, música y recursos originales o licenciados', 'Revisión adulta de seguridad y adecuación por edad', 'Evitar afirmaciones educativas no verificadas'], rationale: ['Motor de episodios repetible', 'Personajes y reglas fáciles de mantener', 'Permite crear temporadas y derivados verticales'], seriesProfile: { seriesName: seed[0], ageRange: seed[3], learningArea: seed[4], episodeEngine: seed[1], seasonPremise: `Una primera temporada de 12 episodios sobre ${brief}.`, characterBible: ['Protagonista curioso y resolutivo', 'Compañero que hace preguntas', 'Guía que verifica la explicación'], safetyRules: ['Sin retos peligrosos', 'Sin datos personales de menores', 'Cierre con recordatorio de pedir ayuda a un adulto'] },
      visualStyle: 'Aventura educativa con personajes originales, acciones legibles y continuidad visual', narrativeArc: 'Pregunta → exploración → descubrimiento → explicación → reto seguro', evidencePlan: ['Fuente educativa verificable', 'Recursos originales o licenciados', 'Revisión de edad y seguridad'], resourceQueries: [seed[0], `${seed[4]} educational activity`, `${seed[4]} real world footage`], estimatedShots: 18,
    }));
  }
  return ideaAngles.slice(0, limit).map((variant, index) => ({
    title: `${variant[0]} ${brief}`,
    angle: `${variant[2]} Tema: ${brief}.`,
    hook: variant[3],
    audience: index % 2 ? 'Audiencia curiosa que quiere datos comparables' : 'Personas que buscan entender el tema sin relleno',
    niche: brief,
    format: index % 3 === 1 ? 'SHORT_VERTICAL' as const : 'LONG_HORIZONTAL' as const,
    score: 92 - index * 2,
    grade: index < 2 ? 'A' : index < 5 ? 'A-' : 'B+',
    risks: ['Separar hechos, inferencias y opinión', 'Usar vídeo real con derechos y atribución cuando corresponda', 'Revisar datos actuales antes de publicar'],
    rationale: [`Ángulo distinto: ${variant[1]}`, variant[4], 'Se puede convertir en una serie de episodios sin repetir la misma promesa'],
    visualStyle: 'Documental explicativo de ritmo alto, vídeo real autorizado y cortes motivados',
    narrativeArc: variant[4],
    evidencePlan: ['Fuentes primarias o institucionales', 'Comparación de al menos tres casos', 'Control editorial de afirmaciones'],
    resourceQueries: [brief, `${brief} documentary footage`, `${brief} real world process`, `${brief} close up action`],
    estimatedShots: index % 3 === 1 ? 12 : 22,
  }));
}

export function modeLabel(mode: IdeaLabMode) {
  return ({ niches: 'Nichos', ideas: 'Ideas de vídeo', kids_series: 'Series infantiles', education: 'Educativo' } as Record<IdeaLabMode, string>)[mode];
}
