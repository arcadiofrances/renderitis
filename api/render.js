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
    const { imageBase64, prompt, quality } = req.body || {};

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

    const extension = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1];

    const formData = new FormData();
    formData.append('model', IMAGE_MODEL);
    formData.append('prompt', prompt.slice(0, 4000));
    formData.append('quality', safeQuality);
    formData.append('size', '1024x1024');
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
