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
    // 1. Define data limite: 45 dias atrás
    const quarentaECincoDiasAtras = new Date();
    quarentaECincoDiasAtras.setDate(quarentaECincoDiasAtras.getDate() - 45);
    const publishedAfter = quarentaECincoDiasAtras.toISOString();

    // Query de busca abrangente enviada ao YouTube
    const query = `TH${cv} OR "Town Hall ${cv}" OR "CV ${cv}" OR "Centro de Vila ${cv}" base layout clash of clans`;

    let itemsBusca = [];

    // Busca primária (Página 1 - até 50 vídeos)
    const urlPage1 = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=50&order=date&publishedAfter=${publishedAfter}&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;
    const resPage1 = await fetch(urlPage1);
    const dataPage1 = await resPage1.json();

    if (dataPage1.error) {
      return res.status(400).json({ error: `Erro do Google (${dataPage1.error.code}): ${dataPage1.error.message}` });
    }

    if (dataPage1.items && dataPage1.items.length > 0) {
      itemsBusca.push(...dataPage1.items);

      // Página 2 para aumentar a amostragem
      if (dataPage1.nextPageToken) {
        const urlPage2 = `${urlPage1}&pageToken=${dataPage1.nextPageToken}`;
        const resPage2 = await fetch(urlPage2);
        const dataPage2 = await resPage2.json();
        if (dataPage2.items && dataPage2.items.length > 0) {
          itemsBusca.push(...dataPage2.items);
        }
      }
    }

    if (itemsBusca.length === 0) {
      return res.json({ success: true, total: 0, data: [] });
    }

    // Extrai IDs únicos de vídeos
    const videoIdsArray = [...new Set(itemsBusca.map(item => item.id.videoId))];

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

    // Regex para capturar links de layout oficiais do Clash of Clans
    const cocLayoutRegex = /https?:\/\/(?:[a-zA-Z0-9-]+\.)?clashofclans\.com\/[^\s"'>]*action=OpenLayout[^\s"'>]*/gi;

    // Regex abrangente para todas as variações do CV selecionado
    const cvTargetRegex = new RegExp(`\\b(TH|CV|Town\\s*Hall|Townhall|Centro\\s*de\\s*Vila)[-_\\s]*${cv}\\b`, 'i');

    // Regex para identificar QUALQUER OUTRO número de CV
    const outroCvRegex = new RegExp(`\\b(TH|CV|Town\\s*Hall|Townhall|Centro\\s*de\\s*Vila)[-_\\s]*(?!${cv}\\b)\\d+\\b`, 'i');

    // Regex da sua ideia: verifica se o próprio link contém id=TH{cv} (ou th{cv})
    const linkThRegex = new RegExp(`[?&]id=TH${cv}(%3A|:|_|&|$)`, 'i');

    const resultados = [];

    for (const item of videoItems) {
      const titulo = item.snippet.title || '';
      let descricaoCompleta = item.snippet.description || '';

      // Limpa entidades HTML na descrição
      descricaoCompleta = descricaoCompleta
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

      const ehTargetNoTitulo = cvTargetRegex.test(titulo);
      const ehOutroCvNoTitulo = outroCvRegex.test(titulo);

      // 1. Se o título menciona OUTRO nível de CV e NÃO menciona o pesquisado, descarta
      if (ehOutroCvNoTitulo && !ehTargetNoTitulo) {
        continue;
      }

      // 2. Se o título não especifica o CV pesquisado:
      if (!ehTargetNoTitulo) {
        const ehTargetNaDescricao = cvTargetRegex.test(descricaoCompleta);
        const ehOutroCvNaDescricao = outroCvRegex.test(descricaoCompleta);

        if (!ehTargetNaDescricao || ehOutroCvNaDescricao) {
          continue;
        }
      }

      // 3. Extração dos links de Layout
      const links = descricaoCompleta.match(cocLayoutRegex);

      if (links && links.length > 0) {
        const linksLimpos = [...new Set(links)].map(link => 
          link.replace(/[.,;)]+$/, '')
        );

        // Filtra os links usando a sua ideia do id=TH{cv}
        // Se o link especificar um TH diferente (ex: id=TH15), descarta. Se não tiver ID explícito ou for o TH certo, mantém.
        const linksFiltrados = linksLimpos.filter(link => {
          const temOutroThNoLink = /[?&]id=TH\d+/i.test(link);
          if (temOutroThNoLink) {
            return linkThRegex.test(link);
          }
          return true; // Se o link não tiver a tag TH no id, mantém por garantia
        });

        if (linksFiltrados.length > 0) {
          resultados.push({
            titulo: item.snippet.title,
            thumbnail: item.snippet.thumbnails.high ? item.snippet.thumbnails.high.url : item.snippet.thumbnails.default.url,
            videoUrl: `https://www.youtube.com/watch?v=${item.id}`,
            publicadoEm: item.snippet.publishedAt,
            layoutLinks: linksFiltrados
          });
        }
      }
    }

    // Ordenação: mais recentes primeiro
    resultados.sort((a, b) => new Date(b.publicadoEm) - new Date(a.publicadoEm));

    return res.json({ success: true, total: resultados.length, data: resultados });
  } catch (error) {
    return res.status(500).json({ error: `Erro no servidor: ${error.message}` });
  }
};
