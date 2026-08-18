// Función serverless (Vercel) que recibe una imagen en base64 + un prompt
// y llama a la API de OpenAI (modelo de imágenes, ver IMAGE_MODEL abajo)
// para generar una versión fotorrealista. No usa ninguna librería externa:
// solo fetch/FormData/Blob, que ya vienen incluidos en el runtime de
// Node 18+ de Vercel.
//
// Modelo por defecto: gpt-image-1.5 (buena calidad/precio, ampliamente
// disponible). Si quieres el máximo realismo posible y tu cuenta de OpenAI
// tiene acceso, puedes cambiarlo a "gpt-image-2" añadiendo la variable de
// entorno OPENAI_IMAGE_MODEL=gpt-image-2 en Vercel (algo más caro).
//
// IMPORTANTE: para usar estos modelos, OpenAI puede pedirte verificar tu
// organización en https://platform.openai.com/settings/organization/general
// antes de que la API key funcione para generación de imágenes.
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error:
        'Falta la variable de entorno OPENAI_API_KEY en el servidor. Añádela en la configuración del proyecto en Vercel y vuelve a desplegar.',
    });
    return;
  }

  try {
    const { imageBase64, prompt, quality, size, password } = req.body || {};

    // Si hay una contraseña configurada en el servidor (SITE_PASSWORD), la
    // exigimos aquí también, no solo en la pantalla de acceso: así, aunque
    // alguien intente llamar directamente a esta función sin pasar por la
    // web, no puede generar imágenes (y gastar tu saldo de OpenAI) sin la
    // contraseña correcta.
    const sitePassword = process.env.SITE_PASSWORD;
    if (sitePassword && password !== sitePassword) {
      res.status(401).json({ error: 'Contraseña incorrecta o sesión caducada. Recarga la página e inténtalo de nuevo.' });
      return;
    }

    if (!imageBase64 || !prompt) {
      res.status(400).json({ error: 'Falta la imagen o la descripción (prompt).' });
      return;
    }

    // imageBase64 llega como data URL: "data:image/png;base64,AAAA..."
    const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(imageBase64);
    if (!match) {
      res.status(400).json({ error: 'La imagen recibida no tiene un formato válido.' });
      return;
    }
    const mimeType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    const allowedQualities = ['low', 'medium', 'high'];
    const safeQuality = allowedQualities.includes(quality) ? quality : 'medium';

    // El tamaño se elige en el frontend según el formato original de la foto
    // (panorámico, vertical o cuadrado) para no recortar partes del espacio.
    const allowedSizes = ['1024x1024', '1536x1024', '1024x1536'];
    const safeSize = allowedSizes.includes(size) ? size : '1024x1024';

    const extension = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1];

    const formData = new FormData();
    formData.append('model', IMAGE_MODEL);
    formData.append('prompt', prompt.slice(0, 4000));
    formData.append('quality', safeQuality);
    formData.append('size', safeSize);
    // input_fidelity "high" pide al modelo que respete con más precisión los
    // detalles del original (disposición, muebles, proporciones) en vez de
    // reinterpretarlos libremente — clave para renders de arquitectura.
    formData.append('input_fidelity', 'high');
    formData.append('image', new Blob([buffer], { type: mimeType }), `input.${extension}`);

    const openaiRes = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      const message = data?.error?.message || 'Error al llamar a la API de OpenAI.';
      res.status(openaiRes.status).json({ error: message });
      return;
    }

    const resultB64 = data?.data?.[0]?.b64_json;
    if (!resultB64) {
      res.status(502).json({ error: 'La API de OpenAI no devolvió ninguna imagen.' });
      return;
    }

    res.status(200).json({ imageBase64: resultB64 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor: ' + (err.message || 'desconocido') });
  }
};
