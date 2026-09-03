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

    // Query de busca no YouTube
    const query = `TH${cv} OR "Town Hall ${cv}" OR "CV ${cv}" base layout clash of clans`; 

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

      // Busca Página 2
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

    // Captura links oficiais (clashofclans.com) E encurtadores comuns (clashofclans.fan)
    const cocLayoutRegex = /https?:\/\/(?:[a-zA-Z0-9-]+\.)?(?:clashofclans\.com|clashofclans\.fan)\/[^\s"'>]+/gi; 

    // Regex para validar presença do CV no Título/Descrição
    const cvStrictRegex = new RegExp(`\\b(TH[-_\\s]*${cv}|Town\\s*Hall[-_\\s]*${cv}|CV[-_\\s]*${cv})\\b`, 'i'); 
    const outroCvRegex = new RegExp(`\\b(TH|Town\\s*Hall|CV)[-_\\s]*(?!${cv}\\b)\\d+\\b`, 'i'); 

    // Regex específica para ler o TH de DENTRO do link (ex: id=TH18... ou id=TH18%3A...)
    const linkCvRegex = new RegExp(`id=TH${cv}(?:%3A|:|%3a|_)`, 'i');

    const resultados = []; 

    for (const item of videoItems) { 
      const titulo = item.snippet.title || ''; 
      let descricaoCompleta = item.snippet.description || ''; 

      descricaoCompleta = descricaoCompleta 
        .replace(/&amp;/g, '&') 
        .replace(/&lt;/g, '<') 
        .replace(/&gt;/g, '>'); 

      const ehTargetCv = cvStrictRegex.test(titulo); 
      const ehOutroCv = outroCvRegex.test(titulo); 

      if (!ehTargetCv && ehOutroCv) continue; 
      if (!ehTargetCv && !cvStrictRegex.test(descricaoCompleta)) continue; 

      const links = descricaoCompleta.match(cocLayoutRegex); 

      if (links && links.length > 0) { 
        const linksFiltrados = links
          .map(link => link.replace(/[.,;)!?\]]+$/, '')) // Limpa pontuações presas no final
          .filter(link => {
            const ehLayoutValido = link.includes('OpenLayout') || link.includes('clashofclans.fan');
            if (!ehLayoutValido) return false;

            // Se o link tiver o parâmetro id=THXX, confirma se é exatamente o CV pesquisado
            if (link.includes('id=TH') || link.includes('id=th')) {
              return linkCvRegex.test(link);
            }

            return true; // Se for link encurtado (fan) que não mostra o id na URL, mantém
          });

        const linksUnicos = [...new Set(linksFiltrados)]; 

        if (linksUnicos.length > 0) {
          resultados.push({ 
            titulo: item.snippet.title, 
            thumbnail: item.snippet.thumbnails.high ? item.snippet.thumbnails.high.url : item.snippet.thumbnails.default.url, 
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
