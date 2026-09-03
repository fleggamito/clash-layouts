module.exports = async (req, res) => {
  const { cv } = req.query;
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

  if (!YOUTUBE_API_KEY) {
    return res.status(500).json({ error: 'A chave YOUTUBE_API_KEY não foi configurada na Vercel.' });
  }

  // Validação do parâmetro de entrada
  if (!cv || !/^\d+$/.test(cv.toString().trim())) {
    return res.status(400).json({ error: 'Informe um nível válido do Centro de Vila (somente números).' });
  }

  const cvLevel = cv.toString().trim();

  try {
    // 1. Data limite: 45 dias atrás
    const quarentaECincoDiasAtras = new Date();
    quarentaECincoDiasAtras.setDate(quarentaECincoDiasAtras.getDate() - 45);
    const publishedAfter = quarentaECincoDiasAtras.toISOString();

    const query = `TH${cvLevel} OR "Town Hall ${cvLevel}" OR "CV ${cvLevel}" OR "Centro de Vila ${cvLevel}" base layout clash of clans`;

    // Busca primária (Página 1)
    const urlPage1 = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=50&order=date&publishedAfter=${publishedAfter}&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;
    
    const resPage1 = await fetch(urlPage1);
    const dataPage1 = await resPage1.json();

    if (dataPage1.error) {
      return res.status(400).json({ error: `Erro do Google (${dataPage1.error.code}): ${dataPage1.error.message}` });
    }

    let itemsBusca = dataPage1.items || [];

    // Página 2 (se houver)
    if (itemsBusca.length > 0 && dataPage1.nextPageToken) {
      const urlPage2 = `${urlPage1}&pageToken=${dataPage1.nextPageToken}`;
      const resPage2 = await fetch(urlPage2);
      const dataPage2 = await resPage2.json();
      
      if (dataPage2.items && dataPage2.items.length > 0) {
        itemsBusca.push(...dataPage2.items);
      }
    }

    if (itemsBusca.length === 0) {
      return res.json({ success: true, total: 0, data: [] });
    }

    // IDs de vídeos sem duplicatas
    const videoIdsArray = [...new Set(itemsBusca.map(item => item.id?.videoId).filter(Boolean))];

    // Detalhes dos vídeos em lotes de 50
    let videoItems = [];
    for (let i = 0; i < videoIdsArray.length; i += 50) {
      const chunkIds = videoIdsArray.slice(i, i + 50).join(',');
      const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${chunkIds}&key=${YOUTUBE_API_KEY}`;
      const videosRes = await fetch(videosUrl);
      const videosData = await videosRes.json();

      if (videosData.items) {
        videoItems.push(...videosData.items);
      }
    }

    // Regex para capturar links de layout
    const cocLayoutRegex = /https?:\/\/(?:[a-zA-Z0-9-]+\.)?clashofclans\.com\/[^\s"'>]*action=OpenLayout[^\s"'>]*/gi;

    // Regex para validar o id=TH{cv} dentro do próprio link (ex: id=TH18%3A ou id=TH18:)
    const linkThRegex = new RegExp(`[?&]id=TH${cvLevel}(?:%3A|:|&|$)`, 'i');

    // Regex auxiliares de título/descrição
    const cvTargetRegex = new RegExp(`\\b(TH|CV|Town\\s*Hall|Townhall|Centro\\s*de\\s*Vila)[-_\\s]*${cvLevel}\\b`, 'i');
    const outroCvRegex = new RegExp(`\\b(TH|CV|Town\\s*Hall|Townhall|Centro\\s*de\\s*Vila)[-_\\s]*(?!${cvLevel}\\b)\\d+\\b`, 'i');

    const resultados = [];

    for (const item of videoItems) {
      const titulo = item.snippet.title || '';
      let descricao = item.snippet.description || '';

      descricao = descricao
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"');

      const ehTargetNoTitulo = cvTargetRegex.test(titulo);
      const ehOutroCvNoTitulo = outroCvRegex.test(titulo);

      if (ehOutroCvNoTitulo && !ehTargetNoTitulo) {
        continue;
      }

      if (!ehTargetNoTitulo) {
        const ehTargetNaDescricao = cvTargetRegex.test(descricao);
        const ehOutroCvNaDescricao = outroCvRegex.test(descricao);

        if (!ehTargetNaDescricao || ehOutroCvNaDescricao) {
          continue;
        }
      }

      // Extração e Filtragem Estrita dos Links
      const matches = descricao.match(cocLayoutRegex);

      if (matches && matches.length > 0) {
        const linksValidados = matches
          .map(link => link.replace(/[.,;)]+$/, ''))
          .filter(link => linkThRegex.test(link)); // Valida se o link pertence realmente ao TH pesquisado

        // Se encontrou links válidos correspondentes ao CV
        if (linksValidados.length > 0) {
          const linksUnicos = [...new Set(linksValidados)];

          resultados.push({
            titulo: item.snippet.title,
            thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
            videoUrl: `https://www.youtube.com/watch?v=${item.id}`,
            publicadoEm: item.snippet.publishedAt,
            layoutLinks: linksUnicos
          });
        }
      }
    }

    resultados.sort((a, b) => new Date(b.publicadoEm) - new Date(a.publicadoEm));

    return res.json({ success: true, total: resultados.length, data: resultados });
  } catch (error) {
    return res.status(500).json({ error: `Erro no servidor: ${error.message}` });
  }
};
