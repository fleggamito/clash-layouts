module.exports = async (req, res) => {
  const { cv } = req.query;
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

  if (!YOUTUBE_API_KEY) {
    return res.status(500).json({ error: 'A variável YOUTUBE_API_KEY não foi encontrada nas Environment Variables da Vercel.' });
  }

  const query = `TH${cv} base link clash of clans`;
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;

  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url);
    const data = await response.json();

    // Retorna a resposta real do Google caso haja recusa de permissão
    if (data.error) {
      return res.status(400).json({ 
        error: `Resposta do Google (${data.error.code}): ${data.error.message}` 
      });
    }

    return res.json({ success: true, total: data.items ? data.items.length : 0, data });
  } catch (error) {
    return res.status(500).json({ error: `Erro no servidor Node.js: ${error.message}` });
  }
};
