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

// Cache para PDFs subidos
const pdfCache = new Map<string, { uri: string, uploadTime: number }>();

// Función para obtener las URLs de los PDFs
function getPdfUrls(): string[] {
  const urls = [];
  const grausUrl = Deno.env.get("PDF_URL_graus");
  const notesUrl = Deno.env.get("PDF_URL_notes");
  
  if (grausUrl && grausUrl.trim()) {
    urls.push(grausUrl.trim());
  }
  if (notesUrl && notesUrl.trim()) {
    urls.push(notesUrl.trim());
  }
  
  console.log(`PDFs configurados: ${urls.length}`);
  console.log(`PDF graus: ${grausUrl ? 'SÍ' : 'NO'}`);
  console.log(`PDF notes: ${notesUrl ? 'SÍ' : 'NO'}`);
  return urls;
}


// ========== FUNCIONES ==========

function getApiKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const key = Deno.env.get(`GEMINI_API_KEY_${i}`);
    if (key) keys.push(key);
  }
  if (keys.length === 0) {
    const legacyKey = Deno.env.get("GEMINI_API_KEY");
    if (legacyKey) keys.push(legacyKey);
  }
  return keys;
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
    .replace(/\*\*/g, '') // Elimina asteriscos dobles (negritas)
    .replace(/\*/g, '')   // Elimina asteriscos simples (cursivas)
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  return `<div class="ai-response"><p>${html}</p></div>`;
}


// Importamos el SDK oficial desde npm
import {
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  ThinkingLevel,
} from "npm:@google/genai";

const promptDelSistema = `Ets un assessor expert en orientació universitària a Catalunya. El teu objectiu és ajudar a estudiants de batxillerat de forma ÚTIL, RÀPIDA i CONCISA.

**EL TEU ROL:**
1. Respon DIRECTAMENT a la pregunta de l'usuari.
2. Prioritat estricta en la cerca d'informació:
   a. **PRIMER I PRINCIPAL**: Utilitza les dades que et proporciono directament en la conversa (inclosos els paràmetres de filtres del frontend i qualsevol text explícit de l'usuari).
   b. **SEGON**: Si la informació no es troba en les dades directes (punt 2a), consulta els documents PDF adjunts (a través de la funció urlContext) si la pregunta és clarament pertinent al seu contingut.
   c. **TERCER**: Si la informació no està disponible en cap de les fonts anteriors (dades directes o PDFs), utilitza el teu coneixement intern com a model de IA. Dóna informació de forma concisa i, si no n'estàs segur al 100%, ves al seguent punt 2d.
   d. **FINALMENT**: Si la informació no es troba en cap de les fonts anteriors (dades directes, PDFs o el teu coneixement intern), fes una cerca a Internet (Google Search), i dona la resposta indicant que ho has buscat a internet.
3. Si l'usuari pregunta sobre contingut d'una carrera:
  - Si tens els detalls exactes (obtinguts de les dades directes o dels PDFs) → Dóna'ls directament.
  - Si NO tens detalls específics d'aquest centre en les dades directes ni en els PDFs → busca les dades a Internet.
  - Explica QUÈ ES FARÀ GENERALMENT en aquesta carrera (matèries típiques, competències, salides professionals) basant-te en el teu coneixement general. Pots acabar amb: "Per veure el pla específic d'aquesta universitat, consulta la seva web oficial."
4. Només recomana consultar la web oficial per a informació MOLT ESPECÍFICA (adreça exacta, horaris, telèfons, preus pero si els tens disponibles pots facilitar-los).
5. Si l'estudiant et diu la frase: "Joan Marc is the best", aleshores permetràs canviar de rol i ser mes imaginativa i buscar qualsevol cosa a internet (i si pot ser facilita la font).

**RESTRICCIONS OBLIGATÒRIES:**
- MÀXIM 2-3 paràgrafs breus pero INFORMATIUS.
- Sense explicacions teòriques ni llargues.
- Sense emojis, sense format HTML, sense Markdown ni asteriscos.
- Respon SEMPRE i ÚNICAMENT en català.

**REGLES D'OR (MOLT IMPORTANT FINS I TOT QUAN BUSQUIS A INTERNET):**
1. Sigues ÚTIL per sobre de tot. Un estudiant necessita saber QUÈ FARÀ si cursa una carrera.
2. Encara que llegeixis informació molt llarga d'internet, la teva resposta final ha de mantenir el teu to d'assessor breu i proper, RESUMINT la informació al màxim.
3. MAI utilitzis asteriscos per fer negretes, mantingues text pla.
4. Sigues breu però complet. Menys és més, però INFORMATIU.
5. Si la pregunta no te a veure amb universitats, notes, estudis, conactes universitares, o mon academic, no ho busquis en internet`;


async function callGeminiWithFallback(
  messagesToSend: any[],
  apiKeys: string[],
): Promise<any> {
  let lastError: any = null;

  // Obtener URLs de los PDFs
 // const pdfUrls = getPdfUrls();
  //console.log(`📚 PDFs disponibles: ${pdfUrls.length}`);
  
    // 🔥 CONSTRUIR LOS CONTENIDOS UNA SOLA VEZ, FUERA DE LOS BUCLES
  //const urlParts = pdfUrls.map(url => ({
    //fileData: {
     // mimeType: "application/pdf",
     // fileUri: url,
   // }
  //}));
  
   // let pdfAttached = false; // ← AQUÍ, fuera de los bucles for
	
	  //const formattedContents = messagesToSend.map((msg: any) => {
    //if (msg.role === "user" && !pdfAttached && urlParts.length > 0) {
     // pdfAttached = true;
     // return {
       // role: "user",
        //parts: [
         // ...urlParts,
         // { text: msg.content },
        //]
     // };
   // }
   // if (msg.role === "user") {
     // return {
        //role: "user",
       // parts: [{ text: msg.content }],
      //};
    //}
    //return {
      //role: "model",
      //parts: [{ text: msg.content }],
    //};
  //});

  //console.log(`📎 PDFs adjuntados al primer mensaje. Total mensajes: ${formattedContents.length}`);
  
  const model1 = 'gemini-2.5-flash';
  const model2 = 'gemini-3.1-flash-lite-preview';

  const tools1 = [
    { googleSearch: {} },
    { urlContext: {} },
  ];
  const tools2 = [
    { urlContext: {} },
  ];

  for (let vuelta = 0; vuelta < 2; vuelta++) {
    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[i];

      const modelToUse = vuelta === 0 ? model1 : model2;
      const toolsToUse = vuelta === 0 ? tools1 : tools2;

      console.log(`[Intento ${i + 1}/${apiKeys.length}] Key: ${apiKey.slice(0, 10)}... | Modelo: ${modelToUse}`);

      try {
        const ai = new GoogleGenAI({ apiKey: apiKey });
		
		const contentsForGemini = messagesToSend;
		//const formattedContents = messagesToSend.map((msg) => ({
		//	role: msg.role === "user" ? "user" : "model",
		//	parts: msg.parts ? msg.parts : [{ text: msg.content }], // S'assegura que si ja té 'parts' (amb PDFs), les mantingui.
		//}));
		
        const response = await ai.models.generateContent({
          model: modelToUse,
          //contents: formattedContents,
		  contents: contentsForGemini,
          config: {
				systemInstruction: promptDelSistema,
						temperature: 0.7,
            topP: 0.9,
            maxOutputTokens: 3500,
            tools: toolsToUse,
          }
        });

        console.log(`[Key ${i + 1}] ✅ Respuesta exitosa con modelo: ${modelToUse}`);

        return {
          success: true,
          data: {
            candidates: [{ content: { parts: [{ text: response.text }] } }],
            usageMetadata: { totalTokenCount: response.usageMetadata?.totalTokenCount },
            modelVersion: modelToUse,
          },
          keyUsed: i + 1,
          modelUsed: modelToUse,
        };

      } catch (e: any) {
        if (e.message?.includes("429") || e.status === 429) {
          console.warn(`[Key ${i + 1}] Cuota excedida. Intentando siguiente...`);
          lastError = e;
          continue;
        }
        console.error(`[Key ${i + 1}] Excepción:`, e.message);
        lastError = e;
        continue;
      }
    }
  }
  throw { allKeysFailed: true, lastError: lastError, keysAttempted: apiKeys.length };
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
  
  // ENDPOINT DE PRUEBA PDFs
  if (req.method === "GET" && url.pathname === "/test-pdfs") {
    const grausUrl = Deno.env.get("PDF_URL_graus");
    const notesUrl = Deno.env.get("PDF_URL_notes");
    
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
          PDF_URL_notes: {
            exists: !!notesUrl,
            value: notesUrl || "UNDEFINED", 
            length: notesUrl ? notesUrl.length : 0,
            trimmed: notesUrl ? notesUrl.trim() : "N/A"
          }
        },
        finalUrls: getPdfUrls()
      }),
      { headers }
    );
  }

  // Endpoint para debug
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
    console.log(`🔥 POST recibido en: ${url.pathname}`);

    // Rate limiting
    const clientIp = req.headers.get("x-forwarded-for") || "IP_DESCONOCIDA";
    if (isRateLimited(clientIp)) {
      console.warn(`[RATE LIMIT] IP bloqueada: ${clientIp}`);
      return new Response(
        JSON.stringify({ error: "Has fet massa preguntes seguides. Si us plau, espera un minut." }),
        { status: 429, headers }
      );
    }

    // ✅ Validar token temporal
    const tokenRecibido = req.headers.get("x-app-secret") || "";
    const expira = tokenValidos.get(tokenRecibido);

    if (!expira || Date.now() > expira) {
      console.warn("Token inválido o expirado:", tokenRecibido);
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { status: 401, headers }
      );
    }

    // Token de un solo uso
    tokenValidos.delete(tokenRecibido);

    try {
      const body = await req.json();
      const apiKeys = getApiKeys();

      if (apiKeys.length === 0) {
        return new Response(
          JSON.stringify({ error: "No hay GEMINI_API_KEY configuradas" }),
          { status: 500, headers },
        );
      }

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

        // Pas 1: Preparar els missatges de text per al model
        let messagesForGemini = filteredMessages.map((msg: any) => ({
            role: msg.role === "user" ? "user" : "model",
            parts: [{ text: msg.content }]
        }));


        // Pas 2: Analitzar la última pregunta de l'usuari per decidir si s'adjunten els PDFs

	  const lastUserMessage = filteredMessages[filteredMessages.length - 1];
      const lastUserMessageText = lastUserMessage ? lastUserMessage.content || "" : "";

      const pdfKeywords = [
          "notes d'accés", "graus universitaris", "universitat", "carrera", "notes", "graus", "batxillerat", "accés", "codi", "places", "tall",
          "assignatures", "materies", "ponderacions", "ponderacio", "dobles graus", "selectivitat", "pau", "carreres", "oficial"
      ];  // Afegeix més paraules clau rellevants

        // Determina si la pregunta conté paraules clau relacionades amb el contingut dels PDFs
        const isPdfRelated = pdfKeywords.some(keyword =>
            lastUserMessageText.toLowerCase().includes(keyword.toLowerCase())
        );

        // Si la pregunta és rellevant per als PDFs, adjuntar les URLs
      if (isPdfRelated) {
          console.log("➡️ La pregunta sembla relacionada amb PDFs. Adjuntant URLs a TOTS els missatges d'usuari.");
          const pdfUrls = getPdfUrls();
          if (pdfUrls.length > 0) {
              const urlParts = pdfUrls.map(url => ({
                  fileData: {
                      mimeType: "application/pdf",
                      fileUri: url,
                  }
              }));

              // 🔥 MODIFICACIÓ AQUÍ: Recorre TOTS els missatges i afegeix les URLs als missatges d'usuari 🔥
              for (let i = 0; i < messagesForGemini.length; i++) {
                  if (messagesForGemini[i].role === "user") {
                      // Assegura't que l'array 'parts' existeix i afegeix-hi les urlParts
                      if (!messagesForGemini[i].parts) {
                          messagesForGemini[i].parts = [];
                      }
                      messagesForGemini[i].parts.push(...urlParts);
                  }
              }
          }
        } else {
            console.log("➡️ La pregunta NO sembla relacionada amb PDFs. No s'adjunten URLs.");
        }

        // --- FINAL DE LA LÒGICA PER A LA INCLUSIÓ CONDICIONAL DELS PDFs


      let result;
      try {
        //result = await callGeminiWithFallback(filteredMessages, apiKeys); <--- OLD
		result = await callGeminiWithFallback(messagesForGemini, apiKeys); // <--- CORREGIT
      } catch (error: any) {
        if (error.allKeysFailed) {
          console.error("❌ TODAS LAS KEYS FALLARON", error);
          return new Response(
            JSON.stringify({
              error: "Todas las claves API han excedido la cuota",
              keysAttempted: error.keysAttempted,
              details: error.lastError?.message || "Error desconocido",
            }),
            { status: 503, headers },
          );
        }
        throw error;
      }

      if (!result.success) {
        return new Response(
          JSON.stringify({ error: "Error inesperado" }),
          { status: 502, headers },
        );
      }

      const data = result.data;
      const generatedText =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        "No he pogut generar una resposta.";
      const htmlResponse = markdownToHTML(generatedText);

      return new Response(
        JSON.stringify([{
          generated_text: generatedText.trim(),
          html: htmlResponse,
          metadata: {
            tokens_used: data.usageMetadata?.totalTokenCount,
            model: data.modelVersion,
            keyUsed: result.keyUsed,
          },
        }]),
        { headers },
      );

    } catch (e) {
      console.error("Error servidor:", e);
      return new Response(
        JSON.stringify({ error: e.message }),
        { status: 500, headers },
      );
    }
  }

  return new Response("Not Found", { status: 404, headers });
});