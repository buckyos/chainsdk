import {Package, PackageHeader} from './package';
import {EventEmitter} from 'events';
import {ErrorCode} from '../error_code';
import {IConnection} from './connection';
import { IpcNetConnectOpts } from 'net';
const msgpack = require('msgpack-lite');
const assert = require('assert');

export enum WRITER_EVENT {
    error = 'error',
    finish = 'finish',
}

export class PackageStreamWriter extends EventEmitter {
    private m_connection?: IConnection;
    private m_pending: Buffer[];
    private m_toSendLength: number;
    private m_writtenLength: number;
    private m_sentLength: 0;
    private m_drainListener?: () => void; 
    constructor() {
        super();
        this.m_pending = [];
        this.m_toSendLength = 0;
        this.m_writtenLength = 0;
        this.m_sentLength = 0;
    }

    static fromPackage(cmdType: number, body: any, dataLength: number = 0): PackageStreamWriter {
        let writer = new PackageStreamWriter();
        let writeHeader: PackageHeader = {
            version: 0,
            magic: Package.magic,
            flags: 0, 
            bodyLength: 0,
            totalLength: 0,
            cmdType,
        };
        
        let bodyBuffer = null;
        writeHeader.bodyLength = 0;
        if (body) {
            bodyBuffer = msgpack.encode(body);
            writeHeader.bodyLength = bodyBuffer.length;
        }
        writeHeader.totalLength = Package.headerLength + writeHeader.bodyLength + dataLength;
        let headerBuffer = Buffer.alloc(Package.headerLength);
        let offset = 0;
        offset = headerBuffer.writeUInt16BE(writeHeader.magic, offset);
        offset = headerBuffer.writeUInt16BE(writeHeader.version, offset);
        offset = headerBuffer.writeUInt16BE(writeHeader.flags, offset);
        offset = headerBuffer.writeUInt16BE(writeHeader.cmdType, offset);
        offset = headerBuffer.writeUInt32BE(writeHeader.totalLength, offset);
        offset = headerBuffer.writeUInt32BE(writeHeader.bodyLength, offset);

        writer.m_toSendLength = writeHeader.totalLength;
        writer.m_writtenLength = Package.headerLength + writeHeader.bodyLength;
        writer.m_pending.push(headerBuffer);
        if (bodyBuffer) {
            writer.m_pending.push(bodyBuffer);
        }
        return writer;
    }

    bind(connection: IConnection): this {
        assert(!this.m_connection);
        if (this.m_connection) {
            return this;
        }
        this.m_connection = connection;
        this._doSend();
        return this;
    }

    clone() {
        let writer = new PackageStreamWriter();
        for (let buf of this.m_pending) {
            let _buf: any = buf;
            writer.m_pending.push(Buffer.from(_buf.buffer, _buf.offset, _buf.length));
        }
        writer.m_toSendLength = this.m_toSendLength;
        writer.m_writtenLength = 0;
        writer.m_sentLength = 0;
        writer.m_drainListener = undefined;
        return writer;
    }

    writeData(buffer: Buffer): this {
        if (!buffer.length) {
            return this;
        }
        if (this.m_writtenLength + buffer.length > this.m_toSendLength) {
            return this;
        }
        this.m_writtenLength += buffer.length;
        this.m_pending.push(buffer);
        this._doSend();
        return this;
    }

    async _doSend() {
        if (!this.m_connection) {
            return ;
        }
        if (this.m_drainListener) {
            return ;
        }
        let spliceTo = 0;
        for (; spliceTo < this.m_pending.length; ++spliceTo) {
            let buffer: any = this.m_pending[spliceTo];
            let sent = this.m_connection.send(buffer);
            if (sent < 0) {
                setImmediate(() => {this.emit(WRITER_EVENT.error); });
                return;
            }
            this.m_sentLength += sent;
            if (sent < buffer.length) {
                assert(!this.m_drainListener);
                this.m_drainListener = () => {
                    this.m_drainListener = undefined;
                    this._doSend();
                };
                this.m_pending[spliceTo] = Buffer.from(buffer.buffer, buffer.offset + sent, buffer.length - sent);
                this.m_connection.once('drain', this.m_drainListener);
                break;
            } 
        }
        this.m_pending.splice(0, spliceTo);
        assert(this.m_sentLength <= this.m_toSendLength);
        if (this.m_sentLength === this.m_toSendLength) {
            setImmediate(() => {this.emit(WRITER_EVENT.finish); });
        }
    }

    close() {
        if (this.m_connection && this.m_drainListener) {
            this.m_connection.removeListener('drain', this.m_drainListener);
        }
        this.removeAllListeners(WRITER_EVENT.finish);
        this.removeAllListeners(WRITER_EVENT.error);
        this.m_connection = undefined;
        this.m_drainListener = undefined;
        return;
    }
}