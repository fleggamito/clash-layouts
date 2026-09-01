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
    // 1. Busca vídeos publicados nos últimos 45 dias
    const quarentaECincoDiasAtras = new Date();
    quarentaECincoDiasAtras.setDate(quarentaECincoDiasAtras.getDate() - 45);
    const publishedAfter = quarentaECincoDiasAtras.toISOString();

    // Palavras-chave expandidas (incluindo BASE, BASES e RANKED)
    const query = `"TH${cv}" OR "Town Hall ${cv}" OR "CV${cv}" base bases layout ranked clash of clans`;
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
    
    // Filtro rígido no título
    const cvStrictRegex = new RegExp(`\\b(TH${cv}|Town\\s*Hall\\s*${cv}|CV${cv})\\b`, 'i');
    const outroCvRegex = new RegExp(`\\b(TH|Town\\s*Hall|CV)\\s*(?!${cv}\\b)\\d+\\b`, 'i');

    const resultados = [];

    for (const item of videosData.items) {
      const titulo = item.snippet.title || '';
      const descricaoCompleta = item.snippet.description || '';

      if (!cvStrictRegex.test(titulo)) continue;
      if (outroCvRegex.test(titulo)) continue;

      const links = descricaoCompleta.match(cocLayoutRegex);

      if (links && links.length > 0) {
        const linksUnicos = [...new Set(links)].map(link => link.replace(/[.,;)]+$/, ''));

        resultados.push({
          titulo: item.snippet.title,
          thumbnail: item.snippet.thumbnails.high ? item.snippet.thumbnails.high.url : item.snippet.thumbnails.default.url,
          videoUrl: `https://www.youtube.com/watch?v=${item.id}`,
          publicadoEm: item.snippet.publishedAt,
          layoutLinks: linksUnicos
        });
      }
    }

    // Ordenação inicial do mais recente para o mais antigo
    resultados.sort((a, b) => new Date(b.publicadoEm) - new Date(a.publicadoEm));

    return res.json({ success: true, total: resultados.length, data: resultados });
  } catch (error) {
    return res.status(500).json({ error: `Erro no servidor: ${error.message}` });
  }
};
