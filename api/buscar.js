module.exports = async (req, res) => {
  const { cv } = req.query;
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

  if (!YOUTUBE_API_KEY) {
    return res.status(500).json({ error: 'A chave YOUTUBE_API_KEY não foi configurada na Vercel.' });
  }

  if (!cv) {
    return res.status(400).json({ error: 'Informe o nível do Centro de Vila.' });
  }

  const query = `TH${cv} base link clash of clans`;
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=15&order=date&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;

  try {
    // Usando o fetch nativo do Node.js
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: `Erro do Google (${data.error.code}): ${data.error.message}` });
    }

    if (!data.items) {
      return res.json({ success: true, data: [] });
    }

    const cocLinkRegex = /https?:\/\/(link\.clashofclans\.com|clashofclans\.link)[^\s"'>]+/gi;
    const resultados = [];

    for (const item of data.items) {
      const descricao = item.snippet.description || '';
      const links = descricao.match(cocLinkRegex);

      if (links && links.length > 0) {
        const linksUnicos = [...new Set(links)].map(link => link.replace(/[.,;)]+$/, ''));

        resultados.push({
          titulo: item.snippet.title,
          thumbnail: item.snippet.thumbnails.high ? item.snippet.thumbnails.high.url : item.snippet.thumbnails.default.url,
          videoUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`,
          layoutLinks: linksUnicos
        });
      }
    }

    return res.json({ success: true, total: resultados.length, data: resultados });
  } catch (error) {
    return res.status(500).json({ error: `Erro no servidor: ${error.message}` });
  }
};
