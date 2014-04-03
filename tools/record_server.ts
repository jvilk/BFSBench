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
app.use(express.json({limit: '50mb'}));
app.all('/BFSWriteFile/*', function (req, res) {
  // Append body to file.
  fs.writeFileSync(__dirname + req.url, new Buffer(req.body.data, 'binary'));
  res.send({status: 'ok'});
});

app.listen(8080);
console.log("Listening on port 8080.");