const express = require('express');
const app = express();

const FISKALY_BASE = 'https://rksv.fiskaly.com';

app.use(express.raw({ type: '*/*', limit: '5mb' }));

app.get('/health', (req, res) => res.status(200).send('ok'));

app.all('/api/v1/*', async (req, res) => {
  const targetUrl = FISKALY_BASE + req.originalUrl;

  const headers = { ...req.headers };
  delete headers.host;
  delete headers['content-length'];

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
    });

    res.status(response.status);
    response.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower !== 'content-encoding' && lower !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    });

    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(502).json({ error: 'Proxy error', message: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Fiskaly proxy running on port ${PORT}`));
