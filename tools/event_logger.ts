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
  if (options != null) {
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
  private stringPool: {[name: string]: number} = {};
  private stringPoolCount: number = 0;
  private fdMap: {[eventId: number]: number} = {};
  /**
   * File descriptor for the file holding the string pool.
   * @todo Use a stream.
   */
  private stringPoolFd: number;
  /**
   * File descriptor for the file holding the events.
   */
  private eventFd: number;
  constructor(fname: string) {
    // @todo Open up a file for events.

    // @todo Open up a file for strings.
  }
  public addString(str: string): number {
    // Check if present, otherwise write.
    if (this.stringPool[str] == null) {
      this.stringPool[str] = this.stringPoolCount++;
      // @todo Write to file.
    }
    return this.stringPool[str];
  }
  public addPathString(p: string): number { return this.addString(path.resolve(p)); }

  public registerFd(eventId: number, fd: number): void {
    this.fdMap[fd] = eventId;
  }
  public getFdEvent(fd: number): number {
    if (this.fdMap[fd] == null) {
      throw new Error("Invalid fd.");
    }
    return this.fdMap[fd];
  }

  public addEvent(type: EventType, arg1: any, arg2?: any, arg3?: any, arg4?: any, arg5?: any): void {
    var ev: Event = this._addEvent(type, arg1, arg2, arg3, arg4, arg5);
    // Fix callback.
    // Done.
  }

  private _addEvent(type: EventType, arg1: any, arg2?: any, arg3?: any, arg4?: any, arg5?: any): Event {
    switch(type) {
      /* (path) */
      case EventType.stat:
      case EventType.statSync:
      case EventType.lstat:
      case EventType.lstatSync:
      case EventType.unlink:
      case EventType.unlinkSync:
      case EventType.rmdir:
      case EventType.rmdirSync:
      case EventType.readdir:
      case EventType.readdirSync:
      case EventType.exists:
      case EventType.existsSync:
        assert(typeof arg1 === 'string');
        return new Event(type, this.addPathString(arg1));
      /* (path, path) */
      case EventType.rename:
      case EventType.renameSync:
        assert(typeof arg1 === 'string');
        assert(typeof arg2 === 'string');
        return new Event(type, this.addPathString(arg1), this.addPathString(arg2));
      /* (fd, len) */
      case EventType.ftruncate:
      case EventType.ftruncateSync:
        assert(typeof arg1 === 'number');
        assert(typeof arg2 === 'number');
        return new Event(type, this.getFdEvent(arg1), arg2);
      /* (path, len) */
      case EventType.truncate:
      case EventType.truncateSync:
        assert(typeof arg1 === 'string');
        assert(typeof arg2 === 'number');
        return new Event(type, this.addPathString(arg1), arg2);
      /* (fd) */
      case EventType.fstat:
      case EventType.fstatSync:
      case EventType.close:
      case EventType.closeSync:
      case EventType.fsync:
      case EventType.fstatSync:
        assert(typeof arg1 === 'number');
        return new Event(type, this.getFdEvent(arg1));
      /* (path, mode?) */
      case EventType.mkdir:
      case EventType.mkdirSync:
        assert(typeof arg1 === 'string');
        return new Event(type, this.addPathString(arg1), arg2);
      /* (path flags mode?) */
      case EventType.open:
      case EventType.openSync:
        assert(typeof arg1 === 'string');
        assert(typeof arg2 === 'string');
        return new Event(type, this.addPathString(arg1), flag2Enum(arg2), arg3);
      /* (fd buffer offset length position) */
      case EventType.read:
      case EventType.readSync:
      case EventType.write:
      case EventType.writeSync:
        assert(typeof arg1 === 'number');
        assert(Buffer.isBuffer(arg2));
        assert(typeof arg3 === 'number');
        assert(typeof arg4 === 'number');
        // XXX: Use max u32 as null sentinel
        if (arg5 === null) {
          arg5 = 4294967295;
        }
        assert(typeof arg5 === 'number');
        // Reduce this information to (fd, length, position).
        return new Event(type, this.getFdEvent(arg1), arg4, arg5);
      /* (path buff options?) */
      case EventType.writeFile:
      case EventType.writeFileSync:
      case EventType.appendFile:
      case EventType.appendFileSync:
        // Convert to path, length, options
        assert(typeof arg1 === 'string');
        assert(Buffer.isBuffer(arg2));
        return new Event(type, this.addPathString(arg1), arg2.length, options2Number(arg3));
      /* (path options?) */
      case EventType.readFile:
      case EventType.readFileSync:
        assert(typeof arg1 === 'string');
        return new Event(type, this.addPathString(arg1), options2Number(arg2));
      /* (eventId) */
      case EventType.EVENT_END:
        assert(typeof arg1 === 'number');
        return new Event(type, arg1);
      default:
        throw new Error("Invalid event type: " + type);
    }
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
