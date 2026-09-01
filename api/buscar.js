module.exports = async (req, res) => {
  const { cv } = req.query;
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

  if (!cv) {
    return res.status(400).json({ error: 'Informe o nível do Centro de Vila.' });
  }

  const query = `TH${cv} war base`;
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&order=date&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;

  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.items) {
      return res.json({ success: true, data: [] });
    }

    const cocLinkRegex = /https:\/\/link\.clashofclans\.com\/[^\s"]+/g;
    const resultados = [];

    for (const item of data.items) {
      const descricao = item.snippet.description || '';
      const links = descricao.match(cocLinkRegex);

      if (links && links.length > 0) {
        resultados.push({
          titulo: item.snippet.title,
          thumbnail: item.snippet.thumbnails.high.url,
          videoUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`,
          layoutLink: links[0]
        });
      }
    }

    return res.json({ success: true, data: resultados });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao consultar a API do YouTube.' });
  }
};
