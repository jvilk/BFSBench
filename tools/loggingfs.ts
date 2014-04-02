/// <reference path="../lib/DefinitelyTyped/node/node.d.ts" />
/**
 * LoggingFS
 * A wrapper for Node's file system that efficiently logs all file system
 * accesses for later replay.
 */
import event_logger = require('./event_logger');
import fs = require('fs');
declare var BrowserFS;
declare var $;

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
    var uberBuffer: NodeBuffer = Buffer.concat(this.data, this.size);
    $.ajax({
       url: '/BFSWriteFile/' + this.fname,
       type: 'PUT',
       contentType: 'application/json',
       data: JSON.stringify({data: uberBuffer.toString('binary')}),
       dataType: 'json'
    }).done(() => {
      if (typeof(this.endCb) !== 'undefined') {
        this.endCb();
      }
    });
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
