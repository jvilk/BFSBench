/// <reference path="../lib/DefinitelyTyped/node/node.d.ts" />
import event_logger = require('./event_logger');
var argv = process.argv;

if (argv.length !== 4) {
  console.log("Usage: node " + argv[1] + " [name of record] [data directory]");
  process.exit();
}

process.chdir(argv[3]);
var replayer = new event_logger.EventReplay(argv[2]);

process.on('exit', () => {
  replayer.end();
});
