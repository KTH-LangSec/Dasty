const express = require('express');
const multer = require('multer');

const app = express();

// this only works before multer is called (boring)
Object.prototype.dest = __dirname + '/tmp/secret/';
const upload = multer();

app.get('/inject', (req, res) => {
    Object.prototype.maxDataSize = 0;
    res.sendStatus(200);
});

// Route for handling file upload
app.post('/upload', upload.single('file'), (req, res) => {
    res.sendStatus(200);
});

// Route for serving the HTML form
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>File Upload</title>
      </head>
      <body>
        <h1>File Upload Example</h1>
        <form action="/upload" method="post" enctype="multipart/form-data">
          <input type="file" name="file" />
          <input type="submit" value="Upload" />
        </form>
      </body>
    </html>
  `);
});

// Start the server
const port = 3000;
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});