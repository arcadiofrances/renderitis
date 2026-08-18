// Función serverless ligera que solo comprueba si la contraseña introducida
// coincide con la variable de entorno SITE_PASSWORD. No llama a la API de
// OpenAI ni tiene coste: se usa para dejar pasar (o no) a la pantalla de
// acceso, antes de que el usuario pueda generar ninguna imagen.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const sitePassword = process.env.SITE_PASSWORD;

  // Si no se ha configurado ninguna contraseña en el servidor (variable de
  // entorno SITE_PASSWORD), la web queda abierta sin restricción, igual que
  // antes de añadir esta función.
  if (!sitePassword) {
    res.status(200).json({ ok: true });
    return;
  }

  const { password } = req.body || {};

  if (typeof password === 'string' && password === sitePassword) {
    res.status(200).json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'Contraseña incorrecta.' });
  }
};
