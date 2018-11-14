import { ErrorCode } from '../error_code';
import { IConnection } from './connection';
import { Package } from './package'; 
import { PackageStreamWriter, WRITER_EVENT } from './writer';
import { PackageStreamReader } from './reader';
import { EventEmitter } from 'events';
let assert = require('assert');
import {Version} from './version';
import { BufferReader } from '../lib/reader';
import { BufferWriter } from '../lib/writer';
import {LoggerOptions, LoggerInstance, initLogger} from '../lib/logger_util';
import { networkInterfaces } from 'os';

export enum CMD_TYPE {
    version= 0x01,
    versionAck = 0x02,

    userCmd = 0x10,
}

interface INodeConnection {
    addPendingWriter(writer: PackageStreamWriter): void;
    on(event: 'pkg', listener: (pkg: Package) => void): this;
    once(event: 'pkg', listener: (pkg: Package) => void): this;
    version?: Version;
}

export type NodeConnection = INodeConnection & IConnection & {fullRemote: string};

export class INode extends EventEmitter {
    public async randomPeers(count: number, excludes: string[]): Promise<{err: ErrorCode, peers: string[]}> {
        return {err: ErrorCode.RESULT_NO_IMP, peers: []};
    }

    static isValidPeerid(peerid: string): boolean {
        return -1 === peerid.indexOf('^');
    }

    static isValidNetwork(network: string): boolean {
        return -1 === network.indexOf('^');
    }
    
    static fullPeerid(network: string, peerid: string): string {
        return `${network}^${peerid}`;
    }

    static splitFullPeerid(fpeerid: string): undefined|{network: string, peerid: string} {
        const spliter = fpeerid.indexOf('^');
        if (-1 === spliter) {
            return undefined;
        }
        const parts = fpeerid.split('^');
        return {network: parts[0], peerid: parts[1]};
    }

    protected m_network: string;
    protected m_peerid: string;
    // chain的创始块的hash值，从chain_node传入， 可用于传输中做校验
    protected m_genesis?: string;

    protected m_inConn: NodeConnection[] = [];
    protected m_outConn: NodeConnection[] = [];
    protected m_remoteMap: Map<string, NodeConnection> = new Map();
    protected m_logger: LoggerInstance;

    constructor(options: {network: string, peerid: string} & LoggerOptions) {
        super();
        this.m_peerid = options.peerid;
        this.m_network = options.network;
        this.m_logger = initLogger(options);
    }

    set genesisHash(genesis_hash: string) {
        this.m_genesis = genesis_hash;
    }

    set logger(logger: LoggerInstance) {
        this.m_logger = logger;
    }

    get peerid() {
        return this.m_peerid;
    }

    get network() {
        return this.m_network;
    }

    public async init() {
    }

    public dumpConns() {
        let ret: string[] = [];
        this.m_inConn.forEach((element) => {
            ret.push(` <= ${element.remote!}`);
        });
        this.m_outConn.forEach((element) => {
            ret.push(` => ${element.remote!}`);
        });

        return ret;
    }

    uninit(): Promise<any> {
        this.removeAllListeners('inbound');
        this.removeAllListeners('error');
        this.removeAllListeners('ban');

        let ops = [];
        for (let conn of this.m_inConn) {
            ops.push(conn.destroy());
        }
        for (let conn of this.m_outConn) {
            ops.push(conn.destroy());
        }

        this.m_inConn = [];
        this.m_outConn = [];
        this.m_remoteMap.clear();

        return Promise.all(ops);
    }

    public async listen(): Promise<ErrorCode> {
        return ErrorCode.RESULT_NO_IMP;
    }

    public async connectTo(peerid: string): Promise<{err: ErrorCode, peerid: string, conn?: NodeConnection}> {
        let result = await this._connectTo(peerid);
        if (!result.conn) {
            return {err: result.err, peerid};
        }
        let conn = result.conn;
        
        conn.remote = peerid;
        conn.network = this.network;
        let ver: Version = new Version();
        conn.version = ver;
        if (!this.m_genesis || !this.m_peerid) {
            this.m_logger.error(`connectTo failed for genesis or peerid not set`);
            assert(false, `${this.m_peerid} has not set genesis`);
            return {err: ErrorCode.RESULT_INVALID_STATE, peerid};
        }
        ver.genesis = this.m_genesis!;
        ver.peerid = this.m_peerid!;
        let err = await new Promise((resolve: (value: ErrorCode) => void) => {
            conn.once('pkg', (pkg) => {
                conn.removeListener('error', fn);
                if (pkg.header.cmdType === CMD_TYPE.versionAck) {
                    if (pkg.body.isSupport) {
                        // 忽略网络传输时间
                        let nTimeDelta = pkg.body.timestamp - Date.now();
                        conn.setTimeDelta(nTimeDelta);
                        resolve(ErrorCode.RESULT_OK);
                    } else {
                        conn.close();
                        resolve(ErrorCode.RESULT_VER_NOT_SUPPORT);
                    }
                } else {
                    conn.close();
                    resolve(ErrorCode.RESULT_INVALID_STATE);
                }
            });
            let writer: BufferWriter = new BufferWriter();
            let encodeErr = ver.encode(writer);
            if (encodeErr) {
                this.m_logger.error(`version instance encode failed `, ver);
                resolve(encodeErr);
                return ;
            }
            let buf: Buffer = writer.render();
            let verWriter = PackageStreamWriter.fromPackage(CMD_TYPE.version, {}, buf.length).writeData(buf);
            conn.addPendingWriter(verWriter);
            let fn = (_conn: IConnection, _err: ErrorCode) => {
                _conn.close(); 
                resolve(_err);
            };
            conn.once('error', fn);
        });
        if (err) {
            return {err, peerid}; 
        }
        let other = this.getConnection(peerid);
        if (other) {
            if (conn.version!.compare(other.version!) > 0) {
                conn.close();
                return {err: ErrorCode.RESULT_ALREADY_EXIST, peerid};
            } else {
                this.closeConnection(other);
            }
        }
        this.m_outConn.push(result.conn);
        this.m_remoteMap.set(peerid, result.conn);
        conn.on('error', (_conn: IConnection, _err: ErrorCode) => {
            this.closeConnection(result.conn!);
            this.emit('error', result.conn, _err);
        });
        return {err: ErrorCode.RESULT_OK, peerid, conn};
    }

    public async broadcast(writer: PackageStreamWriter, options?: {count?: number, filter?: (conn: NodeConnection) => boolean}): Promise<{err: ErrorCode, count: number}> {
        let nSend: number = 0;
        let nMax: number = 999999999;
        if (options && options.count) {
            nMax = options.count;
        }
        let sent: Map<string, number> = new Map();
        for (let conn of this.m_inConn) {
            if (nSend === nMax) {
                return {err: ErrorCode.RESULT_OK, count: nSend};
            }
            if (sent.has(conn.remote!)) {
                continue;
            }
            if (!options || !options.filter || options!.filter!(conn)) {
                conn.addPendingWriter(writer.clone());
                nSend++;
                sent.set(conn.remote!, 1);
            }
        }

        for (let conn of this.m_outConn) {
            if (nSend === nMax) {
                return {err: ErrorCode.RESULT_OK, count: nSend};
            }
            if (sent.has(conn.remote!)) {
                continue;
            }
            if (!options || !options.filter || options!.filter!(conn)) {
                conn.addPendingWriter(writer.clone());
                nSend++;
                sent.set(conn.remote!, 1);
            }
        }
        return {err: ErrorCode.RESULT_OK, count: nSend};
    } 

    public isInbound(conn: NodeConnection): boolean {
        for (let c of this.m_inConn) {
            if (c === conn) {
                return true;
            }
        }
        return false;
    }

    public getOutbounds(): NodeConnection[] {
        const c = this.m_outConn;
        return c;
    }

    public getInbounds(): NodeConnection[] {
        const c = this.m_inConn;
        return c;
    }

    public getConnnectionCount(): number {
        return this.m_outConn.length + this.m_inConn.length;
    }

    public getConnection(remote: string): NodeConnection|undefined {
        return this.m_remoteMap.get(remote);
    }

    public isOutbound(conn: NodeConnection): boolean {
        for (let c of this.m_outConn) {
            if (c === conn) {
                return true;
            }
        }
        return false;
    }

    public banConnection(remote: string): void {
        let conn = this.m_remoteMap.get(remote);
        if (conn) {
            this.closeConnection(conn, true);
        }
    }
    
    public closeConnection(conn: NodeConnection, destroy = false): void {
        conn.removeAllListeners('error');
        conn.removeAllListeners('pkg');
        let index: number = 0;
        do {
            for (let c of this.m_outConn) {
                if (c === conn) {
                    this.m_outConn.splice(index, 1);
                    break;
                }
                index++;
            }
            index = 0;
            for (let c of this.m_inConn) {
                if (c === conn) {
                    this.m_inConn.splice(index, 1);
                    break;
                }
                index++;
            }
        } while (false);
        this.m_remoteMap.delete(conn.remote!);
        if (destroy) {
            conn.destroy();
        } else {
            conn.close();
        }
    }

    on(event: 'inbound', listener: (conn: NodeConnection) => void): this;
    on(event: 'error', listener: (conn: NodeConnection, err: ErrorCode) => void): this;
    on(event: 'ban', listener: (remote: string) => void): this;
    on(event: string, listener: any): this {
        return super.on(event, listener);
    }
    once(event: 'inbound', listener: (conn: NodeConnection) => void): this;
    once(event: 'error', listener: (conn: NodeConnection, err: ErrorCode) => void): this;
    once(event: string, listener: any): this {
        return super.once(event, listener);
    }

    protected _onInbound(inbound: NodeConnection) {
        inbound.once('pkg', (pkg) => {
            inbound.removeListener('error', fn);
            if (pkg.header.cmdType === CMD_TYPE.version) {
                let buff = pkg.data[0];
                let dataReader: BufferReader = new BufferReader(buff);
                let ver: Version = new Version();
                inbound.version = ver;
                let err = ver.decode(dataReader);
                if (err) {
                    this.m_logger.warn(`recv version in invalid format from ${inbound.remote!} `);
                    inbound.close();
                    return;
                }
                // 检查对方包里的genesis_hash是否对应得上
                if ( ver.genesis !== this.m_genesis ) {
                    this.m_logger.warn(`recv version genesis ${ver.genesis} not match ${this.m_genesis} from ${inbound.remote!} `);
                    inbound.close();
                    return;
                }
                // 忽略网络传输时间
                let nTimeDelta = ver.timestamp - Date.now();
                inbound.remote = ver.peerid;
                inbound.network = this.network;
                inbound.setTimeDelta(nTimeDelta);
                let isSupport = true;
                let ackWriter = PackageStreamWriter.fromPackage(CMD_TYPE.versionAck, { isSupport, timestamp: Date.now() }, 0);
                inbound.addPendingWriter(ackWriter);
                if (!isSupport) {
                    inbound.close();
                    return;
                }
                let other = this.getConnection(inbound.remote!);
                if (other) {
                    if (inbound.version!.compare(other.version!) > 0) {
                        inbound.close();
                        return ;
                    } else {
                        this.closeConnection(other);
                    }
                }
                this.m_inConn.push(inbound);
                this.m_remoteMap.set(ver.peerid, inbound);
                inbound.on('error', (conn: IConnection, _err: ErrorCode) => {
                    this.closeConnection(inbound);
                    this.emit('error', inbound, _err);
                });
                this.emit('inbound', inbound);
            } else {
                inbound.close();
            }
        });
        let fn = () => {
            inbound.close();
        };
        inbound.once('error', fn);
    }

    protected async _connectTo(peerid: string): Promise<{err: ErrorCode, conn?: NodeConnection}> {
        return {err: ErrorCode.RESULT_NO_IMP};
    }
    protected _connectionType(): new(...args: any[]) => IConnection {
        return IConnection;
    }
    protected _nodeConnectionType() {
        let superClass = this._connectionType();
        return class extends superClass {
            constructor(...args: any[]) {
                assert(args.length);
                let thisNode = args[0];
                super(...(args.slice(1)));
                this.m_pendingWriters = [];
                this.m_reader = new PackageStreamReader();
                this.m_reader.start(this);
                this.m_reader.on('pkg', (pkg) => {
                    super.emit('pkg', pkg);
                });

                // 接收到 reader的传出来的error 事件后, emit ban事件, 给上层的chain_node去做处理
                // 这里只需要emit给上层, 最好不要处理其他逻辑
                this.m_reader.on('error', (err: ErrorCode, column: string ) => {
                    let remote = this.remote!;
                    thisNode.emit('ban', remote);
                });
            }

            get fullRemote(): string {
                return INode.fullPeerid(this.network!, this.remote!);
            }
            private m_pendingWriters: PackageStreamWriter[];
            private m_reader: PackageStreamReader;
            addPendingWriter(writer: PackageStreamWriter): void {
                let onFinish = () => {
                    let _writer = this.m_pendingWriters.splice(0, 1)[0];
                    _writer.close();
                    if (this.m_pendingWriters.length) {
                        this.m_pendingWriters[0].on(WRITER_EVENT.finish, onFinish);
                        this.m_pendingWriters[0].on(WRITER_EVENT.error, onFinish);
                        this.m_pendingWriters[0].bind(this);
                    }
                };
                if (!this.m_pendingWriters.length) {
                    writer.on(WRITER_EVENT.finish, onFinish);
                    writer.on(WRITER_EVENT.error, onFinish);
                    writer.bind(this);
                } 
                this.m_pendingWriters.push(writer);
            }

            async close(): Promise<ErrorCode> {
                for (let w of this.m_pendingWriters) {
                    w.close();
                }
                this.m_pendingWriters = [];
                return await super.close();
            }
        };
    }
}