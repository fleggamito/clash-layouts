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
    // 1. Data limite: últimos 45 dias
    const quarentaECincoDiasAtras = new Date();
    quarentaECincoDiasAtras.setDate(quarentaECincoDiasAtras.getDate() - 45);
    const publishedAfter = quarentaECincoDiasAtras.toISOString();

    // Termos de busca enviados para a API do YouTube
    const query = `TH${cv} OR "Town Hall ${cv}" OR "CV ${cv}" OR "Centro de Vila ${cv}" base layout clash of clans`;

    let itemsBusca = [];

    // Busca Página 1 (até 50 vídeos)
    const urlPage1 = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=50&order=date&publishedAfter=${publishedAfter}&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;
    const resPage1 = await fetch(urlPage1);
    const dataPage1 = await resPage1.json();

    if (dataPage1.error) {
      return res.status(400).json({ error: `Erro do Google (${dataPage1.error.code}): ${dataPage1.error.message}` });
    }

    if (dataPage1.items && dataPage1.items.length > 0) {
      itemsBusca.push(...dataPage1.items);

      // Busca Página 2 para maximizar a amostragem de resultados
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

    // Busca os detalhes dos vídeos em lotes
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

    // Regex para capturar os links oficiais de layout do Clash of Clans
    const cocLayoutRegex = /https?:\/\/(?:[a-zA-Z0-9-]+\.)?clashofclans\.com\/[^\s"'>]*action=OpenLayout[^\s"'>]*/gi;

    // Padrões para reconhecer o CV procurado (flexível para espaços, hífen e maiúsculas/minúsculas)
    // Cobre: TH14, TH 14, TH-14, CV14, CV 14, Town Hall 14, Townhall14, Centro de Vila 14, Centro de vila14
    const cvTargetRegex = new RegExp(`(TH|CV|Town\\s*Hall|Townhall|Centro\\s*de\\s*Vila)[-_\\s]*${cv}(?!\\d)`, 'i');

    // Padrão para reconhecer quando o título aponta claramente para OUTRO CV
    const outroCvNoTituloRegex = new RegExp(`(TH|CV|Town\\s*Hall|Townhall|Centro\\s*de\\s*Vila)[-_\\s]*(?!${cv}(?!\\d))\\d+`, 'i');

    const resultados = [];

    for (const item of videoItems) {
      const titulo = item.snippet.title || '';
      let descricaoCompleta = item.snippet.description || '';

      // Decodifica entidades HTML na descrição
      descricaoCompleta = descricaoCompleta
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

      // Primeiro verifica se o vídeo possui links do Clash
      const links = descricaoCompleta.match(cocLayoutRegex);
      if (!links || links.length === 0) {
        continue; // Sem link de base = ignora
      }

      const ehTargetNoTitulo = cvTargetRegex.test(titulo);
      const ehOutroCvNoTitulo = outroCvNoTituloRegex.test(titulo);

      // REGRA 1: Se o TÍTULO tem explicitamente OUTRO CV (ex: "Best TH18 Base") e NÃO tem o nosso CV, ignora.
      if (ehOutroCvNoTitulo && !ehTargetNoTitulo) {
        continue;
      }

      // REGRA 2: Se o TÍTULO fala do nosso CV (ex: "TH14 War Base"), APROVADO IMEDIATAMENTE!
      let aprovado = ehTargetNoTitulo;

      // REGRA 3: Se o TÍTULO não cita nenhum CV especificamente (ex: "Nova Base Indestrutível"):
      // Analisamos o início da descrição (primeiros 500 caracteres), que é onde o Youtuber descreve o conteúdo do vídeo atual.
      if (!aprovado) {
        const inicioDescricao = descricaoCompleta.substring(0, 500);
        if (cvTargetRegex.test(inicioDescricao)) {
          aprovado = true;
        }
      }

      // Se passou nas validações, adiciona aos resultados
      if (aprovado) {
        const linksUnicos = [...new Set(links)].map(link => 
          link.replace(/[.,;)]+$/, '')
        );

        resultados.push({
          titulo: item.snippet.title,
          thumbnail: item.snippet.thumbnails.high ? item.snippet.thumbnails.high.url : item.snippet.thumbnails.default.url,
          videoUrl: `https://www.youtube.com/watch?v=${item.id}`,
          publicadoEm: item.snippet.publishedAt,
          layoutLinks: linksUnicos
        });
      }
    }

    // Ordenação: vídeos mais recentes primeiro
    resultados.sort((a, b) => new Date(b.publicadoEm) - new Date(a.publicadoEm));

    return res.json({ success: true, total: resultados.length, data: resultados });
  } catch (error) {
    return res.status(500).json({ error: `Erro no servidor: ${error.message}` });
  }
};
