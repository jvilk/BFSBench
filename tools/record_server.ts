/// <reference path="../lib/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../lib/DefinitelyTyped/express/express.d.ts" />
/**
 * An express-based webserver that records BrowserFS file system events.
 */
import express = require('express');
import fs = require('fs');
var app = express(),
  root = process.cwd(),
  streams: {[fname: string]: fs.WriteStream} = {};

app.use(express.static(root))
app.use(express.json({limit: '50mb'}));
app.all('/BFSWriteFile/*', function (req, res) {
  if (streams[req.url] == null) {
    streams[req.url] = fs.createWriteStream(__dirname + req.url, {flags: 'ax'});
  }
  //console.log("Writing " + req.body.data.length + " to " + req.url);
  streams[req.url].write(new Buffer(req.body.data, 'binary'));
  res.send({status: 'ok'});
});
app.all('/BFSEndFile/*', function(req, res) {
  if (streams[req.url] != null) {
    //console.log("Ending " + req.url);
    streams[req.url].end();
    delete streams[req.url];
  }
  res.send({status: 'ok'});
});

app.listen(8080);
console.log("Listening on port 8080.");