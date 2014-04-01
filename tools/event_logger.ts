/// <reference path="../lib/DefinitelyTyped/node/node.d.ts" />
/**
 * LoggingFS event logger API.
 */
import assert = require('assert');
import path = require('path');
import fs = require('fs');

/**
 * Event types.
 */
export enum EventType {
  /* Node API calls */
  rename, renameSync,
  ftruncate, ftruncateSync,
  truncate, truncateSync,
  stat, lstat, statSync, lstatSync,
  fstat, fstatSync,
  unlink, unlinkSync,
  rmdir, rmdirSync,
  mkdir, mkdirSync,
  readdir, readdirSync,
  close, closeSync,
  open, openSync,
  fsync, fsyncSync,
  write, writeSync,
  read, readSync,
  readFile, readFileSync,
  writeFile, writeFileSync,
  appendFile, appendFileSync,
  exists, existsSync,
  /* Logging events */
  EVENT_END // Used for asynchronous events.
}

export enum EncodingType {
  NA = 0, /* Reserve 0 for N/A */
  utf8, ascii, binary, ucs2, hex, base64, buffer
}

export function str2EncodingType(str: string): EncodingType {
  switch (str.toLowerCase()) {
    case 'utf8':
    case 'utf-8':
      return EncodingType.utf8;
    case 'ascii':
      return EncodingType.ascii;
    case 'binary':
      return EncodingType.binary;
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return EncodingType.ucs2;
    case 'hex':
      return EncodingType.hex;
    case 'base64':
      return EncodingType.base64;
    default:
      if (str === null) {
        return EncodingType.buffer;
      }
      throw new Error("Invalid encoding type: " + str);
  }
}

export function encodingType2Str(type: EncodingType): string {
  var str: string;
  if (type === EncodingType.buffer) {
    return null;
  }
  str = EncodingType[type];
  if (str === undefined) {
    throw new Error("Invalid encoding type: " + type);
  }
  if (str === 'NA') str = undefined;
  return str;
}

/**
 * Enum for all possible Node file flags.
 */
export enum FlagEnum {
  NA = 0, /* Reserve 0 for N/A */
  r, r_plus, rs, rs_plus, w, wx, w_plus, wx_plus, a, ax, a_plus, ax_plus
}

export function flag2Enum(flag: string): FlagEnum {
  switch(flag) {
    case 'r':
      return FlagEnum.r;
    case 'r+':
      return FlagEnum.r_plus;
    case 'rs':
      return FlagEnum.rs;
    case 'rs+':
      return FlagEnum.rs_plus;
    case 'w':
      return FlagEnum.w;
    case 'wx':
      return FlagEnum.wx;
    case 'w+':
      return FlagEnum.w_plus;
    case 'wx+':
      return FlagEnum.wx_plus;
    case 'a':
      return FlagEnum.a;
    case 'ax':
      return FlagEnum.ax;
    case 'a+':
      return FlagEnum.a_plus;
    case 'ax+':
      return FlagEnum.ax_plus;
    default:
      throw new Error("Invalid flag: " + flag);
  }
}

export function flagEnum2String(flag: FlagEnum): string {
  var str: string = FlagEnum[flag];
  str = str.replace('_plus', '+');
  if (str === 'NA') str = undefined;
  return str;
}

function options2Number(options: {flag: string; encoding: string}): number {
  var rv: number = 0;
  if (options != null && typeof options !== 'function') {
    if (options.flag) {
      rv |= flag2Enum(options.flag);
      rv << 16;
    }
    if (options.encoding) {
      rv |= str2EncodingType(options.encoding);
    }
  }
  return rv;
}

export function number2Options(opts: number): {flag: string; encoding: string} {
  return {
    flag: flagEnum2String(opts >>> 16),
    encoding: encodingType2Str(opts & 0xFFFF)
  };
}

export class EventLog {
  /**
   * Maps strings to their numerical IDs.
   */
  private stringPool: { [name: string]: number } = {};
  /**
   * Current offset in the string pool file.
   */
  private stringPoolPosition: number = 0;
  private fdMap: {[eventId: number]: number} = {};
  /**
   * Stream for the file holding the string pool.
   */
  private stringPoolStream: fs.WriteStream;
  /**
   * Stream for the file holding the events.
   */
  private eventStream: fs.WriteStream;
  /**
   * Number of events thus far.
   */
  private eventCount: number = 0;
  constructor(name: string) {
    this.eventStream = fs.createWriteStream(name + '_events.dat', { flags: 'w' });
    this.stringPoolStream = fs.createWriteStream(name + '_stringpool.dat', { flags: 'w' });
  }

  public end(cb: Function = () => { }): void {
    var counter: number = 2,
      ourCb = () => {
        if (--counter === 0) cb();
      };
    this.stringPoolStream.on('finish', ourCb);
    this.eventStream.on('finish', ourCb);
    this.stringPoolStream.end();
    this.eventStream.end();
  }

  public addString(str: string): number {
    var buff: NodeBuffer, lenBuff: NodeBuffer;
    // Check if present, otherwise write.
    if (this.stringPool[str] == null) {
      this.stringPool[str] = this.stringPoolPosition;
      lenBuff = new Buffer(4);
      buff = new Buffer(str);
      lenBuff.writeUInt32LE(buff.length, 0);
      this.stringPoolPosition += buff.length + 4;
      // Prefix each string by its length.
      this.stringPoolStream.write(lenBuff);
      this.stringPoolStream.write(buff);
    }
    return this.stringPool[str];
  }
  public addPathString(p: string): number {
    return this.addString(path.relative('.', path.resolve(p)));
  }

  public registerFd(eventId: number, fd: number): void {
    this.fdMap[fd] = eventId;
  }
  public getFdEvent(fd: number): number {
    if (this.fdMap[fd] == null) {
      throw new Error("Invalid fd.");
    }
    return this.fdMap[fd];
  }

  private recordEvent(event: Event): void {
    this.eventStream.write(event.data);
    this.eventCount++;
  }

  /**
   * Logs this function call, and then returns the result from forwarding it to
   * the true `fs` module.
   */
  public logEvent(methodName: string, arg1: any, arg2?: any, arg3?: any, arg4?: any, arg5?: any, arg6?: any): any {
    var type: EventType = EventType[methodName];
    switch (type) {
      /* (path) */
      case EventType.stat:
      case EventType.lstat:
      case EventType.unlink:
      case EventType.rmdir:
      case EventType.readdir:
      case EventType.exists:
      case EventType.statSync:
      case EventType.lstatSync:
      case EventType.unlinkSync:
      case EventType.rmdirSync:
      case EventType.readdirSync:
      case EventType.existsSync:
        assert(typeof arg1 === 'string');
        this.recordEvent(new Event(type, this.addPathString(arg1)));
        break;
      /* (path, path) */
      case EventType.rename:
      case EventType.renameSync:
        assert(typeof arg1 === 'string');
        assert(typeof arg2 === 'string');
        this.recordEvent(new Event(type, this.addPathString(arg1), this.addPathString(arg2)));
        break;
      /* (fd, len) */
      case EventType.ftruncate:
      case EventType.ftruncateSync:
        assert(typeof arg1 === 'number');
        assert(typeof arg2 === 'number');
        this.recordEvent(new Event(type, this.getFdEvent(arg1), arg2));
        break;
      /* (path, len) */
      case EventType.truncate:
      case EventType.truncateSync:
        assert(typeof arg1 === 'string');
        assert(typeof arg2 === 'number');
        this.recordEvent(new Event(type, this.addPathString(arg1), arg2));
        break;
      /* (fd) */
      case EventType.fstat:
      case EventType.fstatSync:
      case EventType.close:
      case EventType.closeSync:
      case EventType.fsync:
      case EventType.fstatSync:
        assert(typeof arg1 === 'number');
        this.recordEvent(new Event(type, this.getFdEvent(arg1)));
        break;
      /* (path, mode?) */
      case EventType.mkdir:
      case EventType.mkdirSync:
        assert(typeof arg1 === 'string');
        this.recordEvent(new Event(type, this.addPathString(arg1), arg2));
        break;
      /* (path flags mode?) */
      case EventType.open:
        // Modify callback to capture fd.
        var openCbCapture = (cb: Function): Function => {
          var eventId = this.eventCount;
          return (err, fd): void => {
            if (!err) {
              this.registerFd(eventId, fd);
            }
            cb(err, fd);
          };
        };
        if (typeof arg3 === 'function') {
          arg3 = openCbCapture(arg3);
        } else if (typeof arg4 === 'function') {
          arg4 = openCbCapture(arg4);
        }
      case EventType.openSync:
        assert(typeof arg1 === 'string');
        assert(typeof arg2 === 'string');
        this.recordEvent(new Event(type, this.addPathString(arg1), flag2Enum(arg2), typeof arg3 !== 'function' ? arg3 : undefined));
        break;
      /* (fd buffer offset length position) */
      case EventType.read:
      case EventType.readSync:
      case EventType.write:
      case EventType.writeSync:
        assert(typeof arg1 === 'number');
        assert(Buffer.isBuffer(arg2));
        assert(typeof arg3 === 'number');
        assert(typeof arg4 === 'number');
        assert(typeof arg5 === 'number' || arg5 === null);
        // Reduce this information to (fd, length, position).
        // XXX: Use max u32 as null sentinel
        this.recordEvent(new Event(type, this.getFdEvent(arg1), arg4,
          arg5 === null ? 4294967295 : arg5));
        break;
      /* (path buff options?) */
      case EventType.writeFile:
      case EventType.writeFileSync:
      case EventType.appendFile:
      case EventType.appendFileSync:
        // Convert to path, length, options
        assert(typeof arg1 === 'string');
        assert(Buffer.isBuffer(arg2));
        this.recordEvent(new Event(type, this.addPathString(arg1), arg2.length, options2Number(arg3)));
        break;
      /* (path options?) */
      case EventType.readFile:
      case EventType.readFileSync:
        assert(typeof arg1 === 'string');
        this.recordEvent(new Event(type, this.addPathString(arg1), options2Number(arg2)));
        break;
      default:
        console.log("Ignoring and forwarding event type: " + methodName);
        break;
    }
    // Call the function.
    var rv: any;
    if (arg6 !== undefined) {
      rv = fs[methodName](arg1, arg2, arg3, arg4, arg5, arg6);
    } else if (arg5 !== undefined) {
      rv = fs[methodName](arg1, arg2, arg3, arg4, arg5);
    } else if (arg4 !== undefined) {
      rv = fs[methodName](arg1, arg2, arg3, arg4);
    } else if (arg3 !== undefined) {
      rv = fs[methodName](arg1, arg2, arg3);
    } else if (arg2 !== undefined) {
      rv = fs[methodName](arg1, arg2);
    } else {
      rv = fs[methodName](arg1);
    }
    if (methodName === 'openSync') {
      // XXX: Decrement 1 from eventCount, since we are already recorded.
      this.registerFd(this.eventCount - 1, rv);
    }
    return rv;
  }
}

export class Event {
  public data: NodeBuffer;
  /* Used during event recording. */
  constructor(type: EventType, arg1: number, arg2?: number, arg3?: number);
  /* Used during event replay. */
  constructor(data: NodeBuffer);
  constructor(td: any, arg1: number = 0, arg2: number = 0, arg3: number = 0) {
    if (Buffer.isBuffer(td)) {
      this.data = td;
    } else {
      this.data = new Buffer(13);
      this.data.writeUInt8(td, 0);
      if (typeof arg1 !== 'number') arg1 = 0;
      if (typeof arg2 !== 'number') arg2 = 0;
      if (typeof arg3 !== 'number') arg3 = 0;
      this.data.writeUInt32LE(arg1, 1);
      this.data.writeUInt32LE(arg2, 5);
      this.data.writeUInt32LE(arg3, 9);
    }
  }
  public type(): EventType { return this.data.readUInt8(0); }
  public arg1(): number { return this.data.readUInt32LE(1); }
  public arg2(): number { return this.data.readUInt32LE(5); }
  public arg3(): number { return this.data.readUInt32LE(9); }
}
