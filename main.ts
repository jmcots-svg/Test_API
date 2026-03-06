// main.ts - Proxy a Groq API con una sola key + secret simple

const APP_SECRET = Deno.env.get("APP_SECRET") || "";
const rateLimitMap = new Map<string, { count: number; startTime: number }>();

const ALLOWED_ORIGINS = [
  "https://www.batxi2uni.run.place",
  "https://batxi2uni.run.place",
  "https://api.batxi2uni.run.place",
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

async function callGroq(
  messagesToSend: any[],
): Promise<any> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw { error: "No GROQ_API_KEY configurada" };
  }

  console.log(`Usando key: ${apiKey.slice(0, 10)}...`);

  try {
    const promptDelSistema = `Ets un assessor expert en orientació universitària a Catalunya. El teu objectiu és ajudar a estudiants de batxillerat de forma ÚTIL, RÀPIDA i CONCISA.

    **EL TEU ROL:**
    1. Respon DIRECTAMENT a la pregunta de l'usuari.
    2. Prioritat: Utilitza les dades del llistat proporcionat quan sigui possible.
    3. Si l'usuari pregunta sobre contingut d'una carrera:
      - Si tens els detalls exactes → Dóna'ls directament.
      - Si NO tens detalls específics d'aquest centre → Explica QUÈ ES FARÀ GENERALMENT en aquesta carrera (matèries típiques, competències, salides professionals) basant-te en el teu coneixement general.
      - Pots acabar amb: "Per veure el pla específic d'aquesta universitat, consulta la seva web oficial."
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

    const messagesForGroq = [
      { role: "system", content: promptDelSistema },
      ...messagesToSend.map((msg: any) => ({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content,
      })),
    ];

    const groqResponse = await fetch(
      `https://api.groq.com/openai/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama3-70b-8192",  // Modelo rápido y capaz; puedes cambiarlo
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
      const errorDetails = await groqResponse.text();
      console.error(`Error ${groqResponse.status}:`, errorDetails);
      throw { status: groqResponse.status, message: errorDetails };
    }

    console.log("✅ Respuesta exitosa");
    const data = await groqResponse.json();
    return { success: true, data: data };

  } catch (e) {
    console.error("Excepción:", e.message);
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

  // POST / - Consulta IA
  if (req.method === "POST") {

    // Rate limiting
    const clientIp = req.headers.get("x-forwarded-for") || "IP_DESCONOCIDA";
    if (isRateLimited(clientIp)) {
      console.warn(`[RATE LIMIT] IP bloqueada: ${clientIp}`);
      return new Response(
        JSON.stringify({ error: "Has fet massa preguntes seguides. Si us plau, espera un minut." }),
        { status: 429, headers }
      );
    }

    // ✅ Validar secret simple (x-app-secret == APP_SECRET)
    const secretRecibido = req.headers.get("x-app-secret") || req.headers.get("X-App-Secret") || "";
    if (APP_SECRET && secretRecibido !== APP_SECRET) {
      console.warn("Secret inválido:", secretRecibido.slice(0, 10));
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { status: 401, headers }
      );
    }

    // Verificar key
    const apiKey = getApiKey();
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "No hay GROQ_API_KEY configurada" }),
        { status: 500, headers },
      );
    }

    try {
      const body = await req.json();

      let chatMessages = body.messages;
      if (!chatMessages) {
        const text = body.inputs || body.prompt || "";
        chatMessages = [{ role: "user", content: text }];
      }

      let filteredMessages = chatMessages.filter((msg: any) => msg.role !== "system");
      if (filteredMessages.length > 40) {
        filteredMessages = filteredMessages.slice(-40);
      }

      if (filteredMessages.length === 0) {
        return new Response(
          JSON.stringify({ error: "No hay mensajes para procesar" }),
          { status: 400, headers },
        );
      }

      const result = await callGroq(filteredMessages);

      if (!result.success) {
        return new Response(
          JSON.stringify({ error: "Error inesperado" }),
          { status: 502, headers },
        );
      }

      const data = result.data;
      const generatedText =
        data.choices?.[0]?.message?.content ||
        "No he pogut generar una resposta.";
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
        { headers },
      );

    } catch (e: any) {
      console.error("Error Groq o servidor:", e);
      if (e.status === 429) {
        return new Response(
          JSON.stringify({ error: "Cuota API excedida. Intenta més tard." }),
          { status: 429, headers },
        );
      }
      return new Response(
        JSON.stringify({ error: e.message || "Error del servidor" }),
        { status: 500, headers },
      );
    }
  }

  return new Response("Not Found", { status: 404, headers });
});