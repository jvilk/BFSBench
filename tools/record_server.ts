/// <reference path="../lib/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../lib/DefinitelyTyped/express/express.d.ts" />
/**
 * An express-based webserver that records BrowserFS file system events.
 */
import express = require('express');
import fs = require('fs');
var app = express(),
  root = process.cwd();

app.use(express.static(root))
app.use(express.json());
app.all('/BFSWriteFile/*', function (req, res) {
  // Append body to file.
  console.log(req);
  console.log(req.body);
});


app.listen(8080);
console.log("Listening on port 8080.");