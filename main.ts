// main.ts - Proxy a Google Gemini API con memoria + FALLBACK múltiples keys

const APP_SECRET = Deno.env.get("APP_SECRET") || "";
const rateLimitMap = new Map<string, { count: number; startTime: number }>();
const tokenValidos = new Map<string, number>();

const ALLOWED_ORIGINS = [
  "https://www.batxi2uni.run.place",
  "https://batxi2uni.run.place",
  "https://api.batxi2uni.run.place",
  "https://jmcots-svg.github.io",
];

// 🔥 MOVER AQUÍ - SCOPE GLOBAL
// Cache para PDFs subidos
const pdfCache = new Map<string, { uri: string, uploadTime: number }>();

// Función para obtener las URLs de los PDFs
function getPdfUrls(): string[] {
  const urls = [];
  const grausUrl = Deno.env.get("PDF_URL_graus");
  const notasUrl = Deno.env.get("PDF_URL_notas");
  
  if (grausUrl) urls.push(grausUrl);
  if (notasUrl) urls.push(notasUrl);
  
  console.log(`PDFs configurados: ${urls.length}`);
  return urls;
}

// ========== FUNCIONES (resto igual) ==========
function getApiKeys(): string[] {
  // ... tu código existente
}

// ... resto de tus funciones igual ...

// ========== SERVIDOR ==========

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const requestOrigin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : ALLOWED_ORIGINS[0];

  const headers = new Headers({
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, X-App-Secret, x-app-secret",
    "Content-Type": "application/json",
  });

  // OPTIONS
  if (req.method === "OPTIONS") {
    headers.set("Access-Control-Max-Age", "86400");
    headers.set("Vary", "Origin");
    return new Response(null, { status: 204, headers });
  }

  // GET /token - Genera token temporal
  if (req.method === "GET" && url.pathname === "/token") {
    // Limpiar tokens expirados
    for (const [t, exp] of tokenValidos.entries()) {
      if (Date.now() > exp) tokenValidos.delete(t);
    }
    const token = crypto.randomUUID();
    tokenValidos.set(token, Date.now() + 30000); // 30 segundos
    return new Response(JSON.stringify({ token }), { headers });
  }
  
  // 🔥 MOVER AQUÍ - ANTES DEL GET GENÉRICO
  // ENDPOINT DE PRUEBA PDFs
  if (req.method === "GET" && url.pathname === "/test-pdfs") {
    const urls = getPdfUrls();
    return new Response(
      JSON.stringify({
        message: "URLs de PDFs encontradas",
        count: urls.length,
        urls: urls.map(url => ({ url, domain: new URL(url).hostname }))
      }),
      { headers }
    );
  }

  // 🔥 HACER MÁS ESPECÍFICO - Solo raíz
  // GET / - Status  
  if (req.method === "GET" && url.pathname === "/") {
    const keys = getApiKeys();
    return new Response(
      JSON.stringify({
        status: "ok",
        message: "Servidor IA actiu (Google Gemini)",
        keysConfigured: keys.length,
      }),
      { headers },
    );
  }

  // POST / - Consulta IA
  if (req.method === "POST") {
    // ... tu código POST existente igual ...
  }

  return new Response("Not Found", { status: 404, headers });
});