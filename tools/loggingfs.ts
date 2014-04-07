/// <reference path="../lib/DefinitelyTyped/node/node.d.ts" />
/// <amd-dependency path="buffer" />
/**
 * LoggingFS
 * A wrapper for Node's file system that efficiently logs all file system
 * accesses for later replay.
 */
import event_logger = require('./event_logger');
import fs = require('fs');
var Buffer = require('buffer').Buffer;
declare var BrowserFS;

class FakeWriteStream {
  private endCb: Function;
  private data: NodeBuffer[] = [];
  private size: number = 0;
  constructor(private fname: string) {}
  public write(data: NodeBuffer): void {
    this.size += data.length;
    this.data.push(data);
  }
  public on(eventName: string, cb: Function): void {
    if (eventName === 'end') this.endCb = cb;
  }
  public end(): void {
    // Write out the data!
    var currSlice: number = 0,
      sliceSize: number = 5000,
      nextSlice = () => {
        if (currSlice < this.data.length) {
          // Send the slice!
          // We don't really need to make a slice, but I do so to neatly handle
          // the end case where slice.length < sliceSize.
          var slice: NodeBuffer[] = this.data.slice(currSlice, currSlice + sliceSize),
            i: number, data: string = "";
          for (i = 0; i < slice.length; i++) {
            data += slice[i].toString('binary');
          }
          currSlice += sliceSize;

          // Send the slice.
          var xhr = new XMLHttpRequest();
          xhr.open('PUT', '/BFSWriteFile/' + this.fname, true);
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.onreadystatechange = () => {
            console.log(this.fname + ': ' + currSlice + '/' + this.data.length + ' - ' + xhr.readyState);
            if (xhr.readyState === 4) {
              nextSlice();
            }
          };
          xhr.send(JSON.stringify({data: data}));
        } else {
          // Done.
          var xhr = new XMLHttpRequest();
          xhr.open('PUT', '/BFSEndFile/' + this.fname, false);
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.send();
          console.log(this.fname + ': Done.');
          if (typeof(this.endCb) !== 'undefined') {
            this.endCb();
          }
        }
      };
    // Kick off.
    nextSlice();
  }
}

// BrowserFS hack.
if (typeof BrowserFS !== 'undefined') {
  // Emulate createWriteStream.
  fs['createWriteStream'] = function(fname: string) {
    return new FakeWriteStream(fname);
  };
}

var log = new event_logger.EventLog('dataLog'), loggingFs = {}, prop;

Object.keys(fs).forEach((prop) => {
  loggingFs[prop] = (...args) => {
    return log.logEvent.apply(log, [prop].concat(<any>args));
  };
});

loggingFs['exit'] = (cb: Function) => {
  log.end(cb);
};

export = loggingFs;
