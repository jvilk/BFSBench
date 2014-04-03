/// <reference path="../lib/DefinitelyTyped/node/node.d.ts" />
/**
 * Produces a file list from an input stringpool.
 */
import fs = require('fs');
var argv = process.argv;

if (argv.length !== 3) {
  console.log("Usage: node " + argv[1] + " [path to stringpool.dat]");
  process.exit();
}
var stringPoolPath = argv[2],
  sp = fs.readFileSync(argv[2]),
  ptr: number = 0;

while (ptr < sp.length) {
  var strLen = sp.readUInt32LE(ptr);
  ptr += 4;
  console.log(sp.toString('utf-8', ptr, ptr + strLen));
  ptr += strLen;
}
