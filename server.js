const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.use(express.static(path.join(__dirname, 'css')));
app.use(express.static(path.join(__dirname, 'js')));
app.use(express.static(path.join(__dirname, 'pages')));
app.use(express.static(__dirname));

app.get('*', (req, res) => {
  const requestPath = req.path === '/' ? '/index.html' : req.path;
  const filePath = path.join(__dirname, requestPath);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(err.status || 404).send('Страница не найдена');
    }
  });
});

app.listen(PORT, HOST, () => {
  console.log(`ARES server running on http://${HOST}:${PORT}`);
});
