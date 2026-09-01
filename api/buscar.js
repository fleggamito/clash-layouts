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
    // 1. Calcula a data de exatamente 7 dias atrás no formato ISO
    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
    const publishedAfter = seteDiasAtras.toISOString();

    // 2. Busca abrangente com termos em inglês/português, limite de 50 vídeos e filtro dos últimos 7 dias
    const query = `TH${cv} OR "Town Hall ${cv}" OR "CV${cv}" base link layout clash of clans`;
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=50&order=date&publishedAfter=${publishedAfter}&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;
    
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (searchData.error) {
      return res.status(400).json({ error: `Erro do Google (${searchData.error.code}): ${searchData.error.message}` });
    }

    if (!searchData.items || searchData.items.length === 0) {
      return res.json({ success: true, total: 0, data: [] });
    }

    // 3. Extrai todos os IDs para checar as descrições completas em lote
    const videoIds = searchData.items.map(item => item.id.videoId).join(',');
    const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds}&key=${YOUTUBE_API_KEY}`;

    const videosRes = await fetch(videosUrl);
    const videosData = await videosRes.json();

    const cocLinkRegex = /https?:\/\/(?:[a-zA-Z0-9-]+\.)?clashofclans\.com\/[^\s"'>]+/gi;
    const resultados = [];

    // 4. Filtra apenas os vídeos que contêm links de layout reais
    for (const item of videosData.items) {
      const descricaoCompleta = item.snippet.description || '';
      const links = descricaoCompleta.match(cocLinkRegex);

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
