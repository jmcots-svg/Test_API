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

// Función para obtener las URLs de los PDFs (MEJORADA)
function getPdfUrls(): string[] {
  const urls = [];
  const grausUrl = Deno.env.get("PDF_URL_graus");
  const notasUrl = Deno.env.get("PDF_URL_notas");
  
  if (grausUrl && grausUrl.trim()) {
    urls.push(grausUrl.trim());
  }
  if (notasUrl && notasUrl.trim()) {
    urls.push(notasUrl.trim());
  }
  
  console.log(`PDFs configurados: ${urls.length}`);
  console.log(`PDF graus: ${grausUrl ? 'SÍ' : 'NO'}`);
  console.log(`PDF notes: ${notasUrl ? 'SÍ' : 'NO'}`);
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
// Reemplaza tu endpoint /test-pdfs por este más detallado:
if (req.method === "GET" && url.pathname === "/test-pdfs") {
  const grausUrl = Deno.env.get("PDF_URL_graus");
  const notasUrl = Deno.env.get("PDF_URL_notas");
  
  return new Response(
    JSON.stringify({
      message: "Debug de variables PDF",
      variables: {
        PDF_URL_graus: {
          exists: !!grausUrl,
          value: grausUrl || "UNDEFINED",
          length: grausUrl ? grausUrl.length : 0,
          trimmed: grausUrl ? grausUrl.trim() : "N/A"
        },
        PDF_URL_notas: {
          exists: !!notasUrl,
          value: notasUrl || "UNDEFINED", 
          length: notasUrl ? notasUrl.length : 0,
          trimmed: notasUrl ? notasUrl.trim() : "N/A"
        }
      },
      finalUrls: getPdfUrls()
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

// Endpoint para ver todas las rutas
if (req.method === "GET" && url.pathname === "/debug") {
  return new Response(
    JSON.stringify({
      method: req.method,
      pathname: url.pathname,
      fullUrl: req.url,
      headers: [...req.headers.entries()],
      env_count: Object.keys(Deno.env.toObject()).length
    }),
    { headers }
  );
}
  return new Response("Not Found", { status: 404, headers });
});