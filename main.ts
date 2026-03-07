// main.ts - Proxy a Groq API con una sola key + secret simple



const APP_SECRET = Deno.env.get("APP_SECRET") || "";
const rateLimitMap = new Map<string, { count: number; startTime: number }>();

const ALLOWED_ORIGINS = [
  "*",
];

// ========== FUNCIONES ==========

function getApiKey(): string | null {
  return Deno.env.get("GROQ_API_KEY") || null;
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60000;
  const maxRequests = 20;

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, startTime: now });
    return false;
  }

  const data = rateLimitMap.get(ip)!;
  if (now - data.startTime > windowMs) {
    rateLimitMap.set(ip, { count: 1, startTime: now });
    return false;
  }

  data.count++;
  return data.count > maxRequests;
}

function markdownToHTML(markdown: string): string {
  let html = markdown
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  return `<div class="ai-response"><p>${html}</p></div>`;
}


   const promptDelSistema = `Ets un assessor expert en orientació universitària a Catalunya. El teu objectiu és ajudar a estudiants de batxillerat de forma ÚTIL, RÀPIDA i CONCISA.

    **EL TEU ROL:**
    1. Respon DIRECTAMENT a la pregunta de l'usuari.
    2. Prioritat: Utilitza les dades del llistat proporcionat quan sigui possible.
    3. Si l'usuari pregunta sobre contingut d'una carrera:
      - Si tens els detalls → Dóna'ls directament.
      - Si NO tens detalls específics d'aquest centre → Explica QUÈ ES FARÀ GENERALMENT en aquesta carrera (matèries típiques, competències, salides professionals) basant-te en el teu coneixement general.
      - Pots buscar a internet les dades que no tinguis.
    5. Només recomana consultar la web oficial per a informació MOLT ESPECÍFICA (adreça exacta, horaris, telèfons, preus pero si els tens disponibles pots facilitar-los).
    6. Si l'estudiant et diu la frase: "Joan Marc is the best", aleshores permetràs canviar de rol i ser mes imaginativa.

    **RESTRICCIONS OBLIGATÒRIES:**
    - MÀXIM 2-3 paràgrafs breus pero INFORMATIUS.
    - Sense explicacions teòriques ni llargues, però sí amb contingut real i útil.
    - Sense emojis, sense format HTML, sense Markdown ni asteriscos.
    - Respon SEMPRE i ÚNICAMENT en català.

    **REGLES D'OR:**
    1. Sigues ÚTIL per sobre de tot. Un estudiant necessita saber QUÈ FARÀ si cursa una carrera.
    2. Usa el teu coneixement general per donar context quan els detalls específics no estiguin disponibles.
    3. NO repeteixis informació que l'estudiant ja t'ha donat.
    4. Si és sobre les carreres del llistat → Dona prioritat als dades reals que tens.
    5. Sigues breu però complet. Menys és més, però INFORMATIU.`;


async function callGroq(
  messagesToSend: any[],
): Promise<any> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw { error: "No GROQ_API_KEY configurada" };
  }

  console.log(`Usando key: ${apiKey.slice(0, 10)}...`);

  try {
 
     const messagesForGroq = messagesToSend.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    const groqResponse = await fetch(
      `https://api.groq.com/openai/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",  // Modelo en Groq
          messages: messagesForGroq,
          max_tokens: 3500,
          temperature: 0.7,
          top_p: 0.9,
        }),
      }
    );

    if (groqResponse.status === 429) {
      const errorData = await groqResponse.json();
      console.warn("Cuota excedida.");
      throw errorData;
    }

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error("Error Groq:", errorText);
      throw { status: groqResponse.status, message: errorText };
    }

    console.log("✅ Respuesta exitosa");
    const data = await groqResponse.json();
    return { success: true, data: data };

  } catch (e) {
    console.error("Excepción:", e);
    throw e;
  }
}

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

  // GET / - Status
  if (req.method === "GET") {
    const apiKey = getApiKey();
    return new Response(
      JSON.stringify({
        status: "ok",
        message: "Servidor IA actiu (Groq)",
        keyConfigured: !!apiKey,
        secretRequired: !!APP_SECRET,
      }),
      { headers },
    );
  }

  function buildContextPrompt(carreras: any[], asignaturas: string[], filtros: any, pregunta: string) {
  return `
DADES DELS FILTRES:
Assignatures triades: ${asignaturas.length > 0 ? asignaturas.join(", ") : "Cap"}

Filtres:
- Poblacions: ${filtros?.poblacions?.length ? filtros.poblacions.join(", ") : "Totes"}
- Sortida professional mínima: ${filtros?.minProf || "0"}
- Ponderació mínima: ${filtros?.minPond || "0"}
- Ordenació: ${filtros?.orden || "total_desc"}

LLISTAT DE CARRERES FILTRADES (JSON):
${JSON.stringify(carreras, null, 2)}

PREGUNTA DE L'ESTUDIANT:
${pregunta}
  `;
}
  
  // POST / - Consulta IA
if (req.method === "POST") {

  const clientIp = req.headers.get("x-forwarded-for") || "IP_DESCONOCIDA";
  if (isRateLimited(clientIp)) {
    return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers });
  }

  const secretRecibido = req.headers.get("x-app-secret") || "";
  if (APP_SECRET && secretRecibido !== APP_SECRET) {
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Falta GROQ_API_KEY" }), { status: 500, headers });
  }

  try {
    const body = await req.json();

    const messages = body.messages || [];
    const carreras = body.carreras || [];
    const asignaturas = body.asignaturas || [];
    const filtros = body.filtros || {};
    
    const lastUserMessage = (messages.findLast((msg: any) => msg.role === "user") || {}).content || "";

    // Construim el prompt final amb dades estructurades
    const promptUsuario = buildContextPrompt(
      carreras,
      asignaturas,
      filtros,
      lastUserMessage
    );

    const mensajesConContexto = [
      { role: "system", content: promptDelSistema },
      { role: "user", content: promptUsuario }
    ];

    const result = await callGroq(mensajesConContexto);

    if (!result.success) {
      return new Response(JSON.stringify({ error: "Error inesperado" }), { status: 502, headers });
    }

    const data = result.data;
    const generatedText = data.choices?.[0]?.message?.content || "Sense resposta.";
    const htmlResponse = markdownToHTML(generatedText);

    return new Response(
      JSON.stringify([{
        generated_text: generatedText.trim(),
        html: htmlResponse,
        metadata: {
          tokens_used: data.usage?.total_tokens,
          model: data.model,
        },
      }]),
      { headers }
    );

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || "Error servidor" }), { status: 500, headers });
  }
}
  return new Response("Not Found", { status: 404, headers });
});