export interface IssueCodeInfo {
  title: string;
  description: string;
  howToFix: string;
  learnMoreUrl?: string;
}

const DEFAULT_INFO: IssueCodeInfo = {
  description: 'Se detectó una condición que puede afectar al posicionamiento o la experiencia.',
  howToFix: 'Revisa el detalle y aplica las correcciones pertinentes.',
  title: 'Incidencia SEO',
};

const ISSUE_CODE_DICTIONARY: Record<string, IssueCodeInfo> = {
  AI_CRAWLERS_BLOCKED: {
    description:
      'El robots.txt bloquea rastreadores de IA como GPTBot, ClaudeBot, PerplexityBot, etc.',
    howToFix:
      'Evalúa si deseas aparecer en motores de IA. Si sí, elimina las directivas Disallow específicas.',
    title: 'Bots de IA bloqueados',
  },
  BROKEN_LINK: {
    description: 'Un enlace devuelve 4xx o 5xx.',
    howToFix: 'Actualiza o elimina el enlace, o ajusta el destino para evitar errores HTTP.',
    title: 'Enlace roto',
  },
  CANONICAL_MISMATCH: {
    description: 'El canonical apunta a una URL distinta de la actual o a un dominio externo.',
    howToFix:
      'Revisa la coherencia del canonical: debe coincidir con la URL servida o señalar la versión maestra.',
    title: 'Canonical inconsistente',
  },
  CANONICAL_NOT_ABSOLUTE: {
    description: 'El canonical usa una URL relativa en lugar de una URL absoluta.',
    howToFix:
      'Define el canonical con protocolo y dominio completos, por ejemplo https://dominio.com/ruta.',
    title: 'Canonical no absoluto',
  },
  DOMAIN_UNREACHABLE: {
    description: 'El sitio no respondió a la solicitud HTTP desde nuestro bot.',
    howToFix:
      'Verifica que el dominio resuelva correctamente, que el servidor esté activo y que no esté bloqueando a user-agents desconocidos.',
    title: 'Dominio inalcanzable',
  },
  DOM_TOO_LARGE: {
    description: 'La página tiene un exceso de nodos HTML.',
    howToFix:
      'Simplifica la estructura, elimina wrappers innecesarios y considera paginar listados largos.',
    title: 'DOM demasiado grande',
  },
  DUPLICATE_CONTENT: {
    description: 'Se detectaron páginas con alta similitud textual dentro del propio dominio.',
    howToFix:
      'Unifica con 301, canonical o rewrite. Refuerza las páginas con contenido diferencial.',
    title: 'Contenido duplicado',
  },
  HEADING_HIERARCHY_SKIP: {
    description: 'Se detectó un salto (por ejemplo de H1 a H3) que rompe la estructura.',
    howToFix: 'Ordena los encabezados de forma secuencial: H1 → H2 → H3 sin saltos.',
    title: 'Jerarquía de encabezados rota',
  },
  IMAGE_WITHOUT_ALT: {
    description: 'Hay imágenes sin texto alternativo, lo que perjudica accesibilidad y SEO.',
    howToFix:
      'Añade alt descriptivo a cada imagen relevante; deja alt="" solo en imágenes decorativas.',
    title: 'Imágenes sin atributo alt',
  },
  IMAGE_MISSING_DIMENSIONS: {
    description:
      'Hay imágenes sin width/height explícitos, lo que puede provocar saltos de layout.',
    howToFix:
      'Añade width y height reales o usa contenedores con aspect-ratio estable para cada imagen.',
    title: 'Imágenes sin dimensiones',
  },
  INVALID_HREFLANG: {
    description:
      'Se detectaron etiquetas hreflang duplicadas, con idioma inválido o href inválido.',
    howToFix: 'Usa códigos BCP 47 válidos, URLs absolutas resolubles y una sola URL por idioma.',
    title: 'Hreflang inválido',
  },
  INVALID_STRUCTURED_DATA: {
    description: 'El JSON-LD existe pero contiene errores de parseo o no cumple el esquema.',
    howToFix: 'Valida con el Rich Results Test de Google y corrige los campos obligatorios.',
    title: 'Datos estructurados inválidos',
  },
  META_DESCRIPTION_TOO_LONG: {
    description: 'La meta description excede ~160 caracteres y Google la truncará.',
    howToFix: 'Reduce el texto por debajo de 160 caracteres manteniendo la llamada a la acción.',
    title: 'Meta description demasiado larga',
  },
  META_DESCRIPTION_TOO_SHORT: {
    description: 'La meta description es muy breve para aprovechar el espacio del snippet.',
    howToFix: 'Amplía el texto a 120-160 caracteres con el valor diferencial del contenido.',
    title: 'Meta description demasiado corta',
  },
  META_NOFOLLOW: {
    description:
      'La página marca nofollow evitando que se transmita autoridad a enlaces salientes.',
    howToFix:
      'Si no es intencional, retira el nofollow para que Google rastree los enlaces de la página.',
    title: 'Nofollow global',
  },
  META_NOINDEX: {
    description: 'La página declara noindex y no se indexará en Google.',
    howToFix:
      'Si la página debe posicionar, elimina la meta noindex o la cabecera X-Robots-Tag: noindex.',
    title: 'Noindex detectado',
  },
  MISSING_ARTICLE_SCHEMA: {
    description: 'Una página tipo blog no declara Article/BlogPosting en JSON-LD.',
    howToFix:
      'Añade schema.org Article con headline, author, datePublished y image para rich snippets.',
    title: 'Sin schema Article',
  },
  MISSING_AUTHOR: {
    description: 'El artículo no expone un autor (E-E-A-T).',
    howToFix:
      'Añade autor visible y su referencia en schema Article (author con @type Person/Organization).',
    title: 'Sin autor declarado',
  },
  MISSING_CANONICAL: {
    description: 'La página no declara <link rel="canonical">.',
    howToFix:
      'Añade una etiqueta canonical apuntando a la URL definitiva para evitar contenido duplicado.',
    title: 'Falta canonical',
  },
  MISSING_COMPRESSION: {
    description: 'El servidor no envía gzip/br, aumentando el peso transferido.',
    howToFix: 'Activa compresión gzip o brotli en el servidor web / CDN.',
    title: 'Sin compresión',
  },
  MISSING_FAVICON: {
    description: 'El sitio no declara favicon.',
    howToFix: 'Añade <link rel="icon"> apuntando a un favicon en la raíz.',
    title: 'Falta favicon',
  },
  MISSING_H1: {
    description: 'La página no contiene un encabezado H1 visible.',
    howToFix: 'Añade un único <h1> que describa de forma clara el tema principal del contenido.',
    title: 'Falta el <h1>',
  },
  MISSING_HSTS: {
    description: 'El servidor no envía la cabecera Strict-Transport-Security.',
    howToFix:
      'Añade Strict-Transport-Security con max-age alto e includeSubDomains para reforzar HTTPS.',
    title: 'Falta HSTS',
  },
  MISSING_LANG: {
    description: 'El elemento <html> no tiene atributo lang.',
    howToFix: 'Añade lang="es" (o el idioma que corresponda) en <html>.',
    title: 'Falta atributo lang',
  },
  MISSING_META_DESCRIPTION: {
    description: 'La página no tiene atributo meta description.',
    howToFix:
      'Añade una meta description única de 120-160 caracteres que invite al clic y resuma el contenido.',
    title: 'Falta meta description',
  },
  MISSING_OPEN_GRAPH: {
    description: 'No se detectaron etiquetas og: básicas para compartir en redes.',
    howToFix: 'Añade og:title, og:description, og:image y og:url en <head>.',
    title: 'Falta Open Graph',
  },
  MISSING_ROBOTS: {
    description: 'No se encontró un archivo robots.txt en la raíz del dominio.',
    howToFix:
      'Publica /robots.txt con las directivas para los buscadores y la ubicación del sitemap.',
    title: 'Falta robots.txt',
  },
  MISSING_SITEMAP: {
    description: 'No se localizó un sitemap XML en rutas habituales ni en el robots.txt.',
    howToFix:
      'Genera /sitemap.xml y declara su ubicación con la directiva Sitemap: dentro de robots.txt.',
    title: 'Falta sitemap',
  },
  MISSING_STRUCTURED_DATA: {
    description: 'La página no declara JSON-LD ni microdatos que enriquezcan el resultado.',
    howToFix: 'Añade schema.org (Organization, Article, Product…) según el tipo de contenido.',
    title: 'Sin datos estructurados',
  },
  MISSING_TITLE: {
    description: 'La página no incluye un título o está vacío.',
    howToFix:
      'Añade un <title> único, descriptivo y con la palabra clave principal (50-60 caracteres ideal).',
    title: 'Falta la etiqueta <title>',
  },
  MISSING_TWITTER_CARD: {
    description: 'No hay metadatos twitter: que definan la tarjeta compartida.',
    howToFix: 'Incluye twitter:card, twitter:title, twitter:description y twitter:image en <head>.',
    title: 'Falta Twitter Card',
  },
  MISSING_VIEWPORT: {
    description: 'La página no declara el viewport y no será responsive en móviles.',
    howToFix:
      'Añade <meta name="viewport" content="width=device-width, initial-scale=1"> en <head>.',
    title: 'Falta meta viewport',
  },
  MIXED_CONTENT: {
    description: 'La página HTTPS carga recursos por HTTP.',
    howToFix: 'Sirve imágenes, scripts y estilos desde HTTPS para evitar bloqueos del navegador.',
    title: 'Contenido mixto',
  },
  MULTIPLE_H1: {
    description: 'Hay más de un H1 en la página.',
    howToFix:
      'Deja un único <h1> y convierte los demás en <h2>/<h3> según la jerarquía de contenido.',
    title: 'Múltiples <h1>',
  },
  MULTIPLE_CANONICALS: {
    description: 'La página declara más de una etiqueta canonical.',
    howToFix:
      'Deja un único canonical en el head; elimina duplicados generados por plugins, layouts o CMS.',
    title: 'Múltiples canonicals',
  },
  NO_HTTPS: {
    description: 'El sitio responde por HTTP sin redirección a HTTPS.',
    howToFix: 'Configura un certificado TLS y fuerza redirecciones 301 de HTTP a HTTPS.',
    title: 'Sin HTTPS',
  },
  NO_LAZY_IMAGES: {
    description: 'Hay muchas imágenes sin loading="lazy" que ralentizan la carga inicial.',
    howToFix:
      'Añade loading="lazy" a las imágenes por debajo del pliegue (mantén eager en la hero).',
    title: 'Imágenes sin lazy-load',
  },
  PAGE_TOO_HEAVY: {
    description: 'El peso total supera el umbral recomendado.',
    howToFix:
      'Optimiza imágenes (WebP/AVIF), aplica lazy-loading, minifica JS/CSS y activa compresión.',
    title: 'Página muy pesada',
  },
  POOR_READABILITY: {
    description: 'El texto supera la complejidad recomendada (frases largas, léxico técnico).',
    howToFix:
      'Acorta frases, usa voz activa, añade subtítulos y listas para segmentar el contenido.',
    title: 'Legibilidad baja',
  },
  REDIRECT_CHAIN: {
    description: 'Hay más de una redirección antes de llegar a la URL final.',
    howToFix: 'Apunta el primer redirect directamente al destino final con un 301.',
    title: 'Cadena de redirecciones',
  },
  ROBOTS_DISALLOWS_ALL: {
    description: 'El archivo robots.txt impide la indexación del sitio a todos los bots.',
    howToFix:
      'Elimina el "Disallow: /" global o limítalo a rutas concretas para permitir el rastreo.',
    title: 'robots.txt bloquea todo',
  },
  SHORT_BLOG_POST: {
    description: 'El artículo está por debajo de la longitud esperada para contenido editorial.',
    howToFix: 'Amplía a 800-1500 palabras con secciones H2/H3 y ejemplos prácticos.',
    title: 'Post de blog muy corto',
  },
  SITEMAP_EMPTY: {
    description: 'El sitemap no lista URLs.',
    howToFix: 'Regenera el sitemap incluyendo las URLs indexables del sitio.',
    title: 'Sitemap vacío',
  },
  SITEMAP_INVALID: {
    description: 'El sitemap no cumple la especificación XML.',
    howToFix:
      'Revisa que sea XML válido, con namespace correcto y URLs absolutas. Usa el validador de Google.',
    title: 'Sitemap inválido',
  },
  SOFT_404: {
    description: 'La página devuelve 200 pero aparenta ser un "no encontrado".',
    howToFix:
      'Devuelve un 404/410 real o reemplaza con contenido útil. Evita páginas vacías con 200.',
    title: 'Soft 404',
  },
  STALE_CONTENT: {
    description: 'La fecha de modificación es antigua frente a la frescura que Google prioriza.',
    howToFix: 'Actualiza el artículo con nueva información y refresca datePublished/dateModified.',
    title: 'Contenido desactualizado',
  },
  STRUCTURED_DATA_MISSING_TYPE: {
    description: 'Existe JSON-LD, pero no declara @type en el bloque raíz ni en @graph.',
    howToFix:
      'Incluye @type con el tipo schema.org correcto, como Organization, WebSite, Article o Product.',
    title: 'Schema sin @type',
  },
  THIN_CONTENT: {
    description: 'La página tiene muy pocas palabras para posicionar de forma competitiva.',
    howToFix:
      'Amplía con información útil, ejemplos y preguntas frecuentes (mínimo ~300 palabras relevantes).',
    title: 'Contenido escaso',
  },
  TITLE_TOO_LONG: {
    description: 'Google suele truncar títulos de más de ~60 caracteres.',
    howToFix:
      'Reescribe el título en menos de 60 caracteres priorizando la palabra clave al inicio.',
    title: 'Título demasiado largo',
  },
  TITLE_TOO_SHORT: {
    description: 'El título tiene menos caracteres de los recomendados.',
    howToFix: 'Amplía el título a 50-60 caracteres incluyendo la temática principal de la página.',
    title: 'Título demasiado corto',
  },
};

export function getIssueCodeInfo(code: string): IssueCodeInfo {
  return ISSUE_CODE_DICTIONARY[code] ?? { ...DEFAULT_INFO, title: humanizeCode(code) };
}

function humanizeCode(code: string) {
  return code
    .toLowerCase()
    .replaceAll(/_+/g, ' ')
    .replaceAll(/\b\w/g, (c) => c.toUpperCase());
}

export const SEVERITY_INFO: Record<
  'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
  { label: string; tooltip: string }
> = {
  CRITICAL: {
    label: 'Crítica',
    tooltip: 'Bloquea la indexación o daña drásticamente el SEO. Resuelve primero.',
  },
  HIGH: {
    label: 'Alta',
    tooltip: 'Alta probabilidad de impacto en posicionamiento. Priorizar tras las críticas.',
  },
  LOW: {
    label: 'Baja',
    tooltip: 'Buena práctica recomendable. Bajo impacto individual.',
  },
  MEDIUM: {
    label: 'Media',
    tooltip: 'Problema relevante pero no bloqueante. Mejora gradualmente.',
  },
};

export const CATEGORY_LABELS: Record<string, string> = {
  CONTENT: 'Contenido',
  CRAWLABILITY: 'Crawlability',
  MEDIA: 'Medios',
  ON_PAGE: 'On-page',
  PERFORMANCE: 'Rendimiento',
  SECURITY: 'Seguridad',
  STRUCTURED_DATA: 'Datos estructurados',
  TECHNICAL: 'Técnico',
};
