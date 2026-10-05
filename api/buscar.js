module.exports = async (req, res) => {
  const { cv } = req.query;
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

  if (!YOUTUBE_API_KEY) {
    return res.status(500).json({
      error: 'A chave YOUTUBE_API_KEY não foi configurada na Vercel.'
    });
  }

  if (!cv) {
    return res.status(400).json({
      error: 'Informe o nível do Centro de Vila.'
    });
  }

  try {
    // Últimos 45 dias
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - 45);

    const publishedAfter = dataLimite.toISOString();

    // Busca principal
    const query = `TH${cv} base layout Clash of Clans`;

    let itemsBusca = [];

    const urlPage1 =
      `https://www.googleapis.com/youtube/v3/search?` +
      `part=snippet` +
      `&maxResults=50` +
      `&order=date` +
      `&publishedAfter=${publishedAfter}` +
      `&q=${encodeURIComponent(query)}` +
      `&type=video` +
      `&key=${YOUTUBE_API_KEY}`;

    const resPage1 = await fetch(urlPage1);
    const dataPage1 = await resPage1.json();

    if (dataPage1.error) {
      return res.status(400).json({
        error: `Erro do Google (${dataPage1.error.code}): ${dataPage1.error.message}`
      });
    }

    if (dataPage1.items?.length) {
      itemsBusca.push(...dataPage1.items);

      if (dataPage1.nextPageToken) {
        const urlPage2 =
          `${urlPage1}&pageToken=${dataPage1.nextPageToken}`;

        const resPage2 = await fetch(urlPage2);
        const dataPage2 = await resPage2.json();

        if (dataPage2.items?.length) {
          itemsBusca.push(...dataPage2.items);
        }
      }
    }

    if (itemsBusca.length === 0) {
      return res.json({
        success: true,
        total: 0,
        data: []
      });
    }

    // Remove IDs duplicados
    const videoIds = [
      ...new Set(
        itemsBusca
          .map(item => item.id?.videoId)
          .filter(Boolean)
      )
    ];

    let videoItems = [];

    // Consulta detalhes dos vídeos
    for (let i = 0; i < videoIds.length; i += 50) {
      const chunkIds = videoIds
        .slice(i, i + 50)
        .join(',');

      const videosUrl =
        `https://www.googleapis.com/youtube/v3/videos?` +
        `part=snippet` +
        `&id=${chunkIds}` +
        `&key=${YOUTUBE_API_KEY}`;

      const videosRes = await fetch(videosUrl);
      const videosData = await videosRes.json();

      if (videosData.items?.length) {
        videoItems.push(...videosData.items);
      }
    }

    // Captura links de layouts do Clash of Clans
    const cocLayoutRegex =
      /https?:\/\/(?:[a-zA-Z0-9-]+\.)?clashofclans\.com\/[^\s"'<>]*/gi;

    const resultados = [];

    for (const item of videoItems) {
      const descricao =
        (item.snippet.description || '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>');

      const linksEncontrados =
        descricao.match(cocLayoutRegex) || [];

      if (!linksEncontrados.length) {
        continue;
      }

      const linksCvCorreto = [];

      for (const link of linksEncontrados) {
        const linkLimpo = link.replace(/[.,;)]+$/, '');

        let linkDecodificado;

        try {
          linkDecodificado = decodeURIComponent(linkLimpo);
        } catch {
          linkDecodificado = linkLimpo;
        }

        /*
           Exemplos:
           id=TH17:...
           id=TH18:...
           id=TH19:...
        */
        const match = linkDecodificado.match(/id=TH(\d+)/i);

        if (match && match[1] === String(cv)) {
          linksCvCorreto.push(linkLimpo);
        }
      }

      // Remove duplicados
      const linksUnicos = [...new Set(linksCvCorreto)];

      // Se não houver layout exatamente do CV buscado, descarta o vídeo
      if (linksUnicos.length === 0) {
        continue;
      }

      resultados.push({
        titulo: item.snippet.title,
        thumbnail:
          item.snippet.thumbnails?.high?.url ||
          item.snippet.thumbnails?.medium?.url ||
          item.snippet.thumbnails?.default?.url,

        videoUrl: `https://www.youtube.com/watch?v=${item.id}`,

        publicadoEm: item.snippet.publishedAt,

        layoutLinks: linksUnicos
      });
    }

    // Remove vídeos duplicados
    const videosUnicos = [];
    const idsProcessados = new Set();

    for (const video of resultados) {
      if (!idsProcessados.has(video.videoUrl)) {
        idsProcessados.add(video.videoUrl);
        videosUnicos.push(video);
      }
    }

    videosUnicos.sort(
      (a, b) =>
        new Date(b.publicadoEm) -
        new Date(a.publicadoEm)
    );

    return res.json({
      success: true,
      total: videosUnicos.length,
      data: videosUnicos
    });

  } catch (error) {
    return res.status(500).json({
      error: `Erro no servidor: ${error.message}`
    });
  }
};
