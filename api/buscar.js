module.exports = async (req, res) => {
  const { cv } = req.query;
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

  if (!YOUTUBE_API_KEY) {
    return res.status(500).json({ error: 'A chave YOUTUBE_API_KEY não foi configurada na Vercel.' });
  }

  if (!cv) {
    return res.status(400).json({ error: 'Informe o nível do Centro de Vila.' });
  }

  try {
    // Busca vídeos dos últimos 14 dias para não perder conteúdos do final do mês
    const duasSemanasAtras = new Date();
    duasSemanasAtras.setDate(duasSemanasAtras.getDate() - 14);
    const publishedAfter = duasSemanasAtras.toISOString();

    const query = `"TH${cv}" OR "Town Hall ${cv}" OR "CV${cv}" base layout clash of clans`;
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=50&order=date&publishedAfter=${publishedAfter}&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;
    
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (searchData.error) {
      return res.status(400).json({ error: `Erro do Google (${searchData.error.code}): ${searchData.error.message}` });
    }

    if (!searchData.items || searchData.items.length === 0) {
      return res.json({ success: true, total: 0, data: [] });
    }

    const videoIds = searchData.items.map(item => item.id.videoId).join(',');
    const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds}&key=${YOUTUBE_API_KEY}`;

    const videosRes = await fetch(videosUrl);
    const videosData = await videosRes.json();

    const cocLayoutRegex = /https?:\/\/(?:[a-zA-Z0-9-]+\.)?clashofclans\.com\/[^\s"'>]*action=OpenLayout[^\s"'>]*/gi;
    const cvStrictRegex = new RegExp(`\\b(TH${cv}|Town\\s*Hall\\s*${cv}|CV${cv})\\b`, 'i');

    const resultados = [];

    for (const item of videosData.items) {
      const titulo = item.snippet.title || '';
      const descricaoCompleta = item.snippet.description || '';

      // O Título precisa ter o CV selecionado
      if (!cvStrictRegex.test(titulo)) continue;

      // O Título não pode citar outros CVs principais
      const outrosCvsRegex = new RegExp(`\\b(TH|Town\\s*Hall|CV)\\s*(?!\b${cv}\b)\\d+\\b`, 'i');
      if (outrosCvsRegex.test(titulo)) continue;

      const links = descricaoCompleta.match(cocLayoutRegex);

      if (links && links.length > 0) {
        const linksUnicos = [...new Set(links)].map(link => link.replace(/[.,;)]+$/, ''));

        resultados.push({
          titulo: item.snippet.title,
          thumbnail: item.snippet.thumbnails.high ? item.snippet.thumbnails.high.url : item.snippet.thumbnails.default.url,
          videoUrl: `https://www.youtube.com/watch?v=${item.id}`,
          layoutLinks: linksUnicos
        });
      }
    }

    return res.json({ success: true, total: resultados.length, data: resultados });
  } catch (error) {
    return res.status(500).json({ error: `Erro no servidor: ${error.message}` });
  }
};
