const assert = require('assert');
import {EventEmitter} from 'events';

import {ErrorCode} from '../error_code';
import {LoggerInstance} from '../lib/logger_util';
import {NodeStorage, NodeStorageOptions} from './node_storage';
import {BlockHeader, Block} from './block';
import {IHeaderStorage} from './header_storage';
import {Transaction, Receipt} from './transaction';

import {INode, NodeConnection} from '../net';
const {LogShim} = require('../lib/log_shim');

export type BaseNodeOptions = {
    node: INode;
    dataDir: string;
    logger: LoggerInstance;
    headerStorage: IHeaderStorage;
    nodeCacheSize?: number;
    blockHeaderType: new () => BlockHeader;
    transactionType: new () => Transaction;
    receiptType: new () => Receipt;
    ignoreBan?: boolean;
};

export enum BAN_LEVEL {
    minute = 1,
    hour = 60,
    day = 24 * 60,
    month = 30 * 24 * 60,
    forever = 0,
}

export class BaseNode extends EventEmitter {
    constructor(options: BaseNodeOptions) {
        super();
        this.m_blockHeaderType = options.blockHeaderType;
        this.m_transactionType = options.transactionType;      
        this.m_receiptType = options.receiptType;  
        this.m_node = options.node;
        this.m_logger = new LogShim(options.logger).bind(`[peerid: ${this.peerid}]`, true).log;
        this.m_node.logger = options.logger;

        this.m_headerStorage = options.headerStorage;
        
        this.m_ignoreBan = !!options.ignoreBan;

        this.m_node.on('error', (conn: NodeConnection, err: ErrorCode) => {
            this.emit('error', conn.getRemote());
        });

        // 收到net/node的ban事件, 调用 ChainNode的banConnection方法做封禁处理
        // 日期先设置为按天
        this.m_node.on('ban', (remote: string) => {
            this.banConnection(remote, BAN_LEVEL.day);
        });

        this.m_nodeStorage = new NodeStorage({
            count: options.nodeCacheSize ? options.nodeCacheSize : 50, 
            dataDir: options.dataDir, 
            logger: this.m_logger});
    }
    protected m_node: INode;
    protected m_nodeStorage: NodeStorage;
    protected m_connecting: Set<string> = new Set();
    private m_logger: LoggerInstance;
    private m_headerStorage: IHeaderStorage;
    private m_blockHeaderType: new () => BlockHeader;
    private m_transactionType: new () => Transaction;
    private m_receiptType: new () => Receipt;
    private m_ignoreBan: boolean;

    on(event: 'outbound', listener: (conn: NodeConnection) => any): this;
    on(event: 'inbound', listener: (conn: NodeConnection) => any): this;
    on(event: 'ban', listener: (remote: string) => any): this;
    on(event: 'error', listener: (connRemotePeer: string, err: ErrorCode) => any): this;
    on(event: string, listener: any): this {
        return super.on(event, listener);
    }

    once(event: 'outbound', listener: (conn: NodeConnection) => any): this;
    once(event: 'inbound', listener: (conn: NodeConnection) => any): this;
    once(event: 'ban', listener: (remote: string) => any): this;
    once(event: 'error', listener: (connRemotePeer: string, err: ErrorCode) => any): this;
    once(event: string, listener: any): this {
        return super.once(event, listener);
    }   

    prependListener(event: 'outbound', listener: (conn: NodeConnection) => any): this;
    prependListener(event: 'inbound', listener: (conn: NodeConnection) => any): this;
    prependListener(event: 'ban', listener: (remote: string) => any): this;
    prependListener(event: 'error', listener: (connRemotePeer: string, err: ErrorCode) => any): this;
    prependListener(event: string, listener: any): this {
        return super.prependListener(event, listener);
    }   

    prependOnceListener(event: 'outbound', listener: (conn: NodeConnection) => any): this;
    prependOnceListener(event: 'inbound', listener: (conn: NodeConnection) => any): this;
    prependOnceListener(event: 'ban', listener: (remote: string) => any): this;
    prependOnceListener(event: 'error', listener: (connRemotePeer: string, err: ErrorCode) => any): this;
    prependOnceListener(event: string, listener: any): this {
        return super.prependOnceListener(event, listener);
    }   

    public async init() {
        // 读取创始块的hash值， 并将其传入 net/node
        const result = await this.m_headerStorage.getHeader(0);
        const genesis_hash: string = result.header!.hash;
        this.m_node.genesisHash = genesis_hash;

        await this.m_node.init();
    }

    uninit(): Promise<any> {
        return this.m_node.uninit();
    }

    public newTransaction(): Transaction {
        return new this.m_transactionType();
    }

    public newBlockHeader(): BlockHeader {
        return new this.m_blockHeaderType();
    }

    public newBlock(header?: BlockHeader): Block {
        let block = new Block({
            header,
            headerType: this.m_blockHeaderType, 
            transactionType: this.m_transactionType,
            receiptType: this.m_receiptType});
        return block;
    }

    public async initialOutbounds(): Promise<ErrorCode> {
        return ErrorCode.RESULT_OK;
    }

    public get logger(): LoggerInstance {
        return this.m_logger;
    }

    public get node(): INode {
        return this.m_node;
    }

    public get peerid(): string {
        return this.m_node.peerid!;
    }

    public get headerStorage(): IHeaderStorage {
        return this.m_headerStorage;
    }

    protected async _connectTo(willConn: Set<string>, callback?: (count: number) => void): Promise<ErrorCode> {
        if (!willConn.size) {
            if (callback) {
                callback(0);
            }
            return ErrorCode.RESULT_OK;
        }

        let ops = [];
        for (let peer of willConn) {
            if (this._onWillConnectTo(peer)) {
                this.m_connecting.add(peer);
                ops.push(this.m_node.connectTo(peer));
            }
        }
        if (ops.length === 0) {
            if (callback) {
                callback(0);
            }
            return ErrorCode.RESULT_OK;
        }
        
        Promise.all(ops).then((results) => {
            let connCount = 0;
            for (let r of results) {
                this.m_connecting.delete(r.peerid);
                this.logger.debug(`connect to ${r.peerid} err: `, r.err);
                if (r.conn) {
                    this.m_nodeStorage.add(r.conn.getRemote());
                    this.emit('outbound', r.conn);
                    ++ connCount;
                } else {
                    if (r.err !== ErrorCode.RESULT_ALREADY_EXIST) {
                        this.m_nodeStorage.remove(r.peerid);
                    }
                    if (r.err === ErrorCode.RESULT_VER_NOT_SUPPORT) {
                        this.m_nodeStorage.ban(r.peerid, BAN_LEVEL.month);
                    }
                }
            }
            if (callback) {
                callback(connCount);
            }
        });
        return ErrorCode.RESULT_OK;
    }

    protected _isBan(peerid: string): boolean {
        if (this.m_ignoreBan) {
            return false;
        }
        return this.m_nodeStorage.isBan(peerid);
    }

    public async listen(): Promise<ErrorCode> {
        this.m_node.on('inbound', (inbound: NodeConnection) => {
            if (this._isBan(inbound.getRemote())) {
                this.logger.warn(`new inbound from ${inbound.getRemote()} ignored for ban`);
                this.m_node.closeConnection(inbound);
            } else {
                this.logger.info(`new inbound from `, inbound.getRemote());
                this.emit('inbound', inbound);
            }
        });
        return await this.m_node.listen();
    }

    public banConnection(remote: string, level: BAN_LEVEL) {
        if (this.m_ignoreBan) {
            return ;
        }
        this.m_logger.warn(`banned peer ${remote} for ${level}`);
        this.m_nodeStorage.ban(remote, level);
        this.m_node.banConnection(remote);
        this.emit('ban', remote);
    }

    protected _onWillConnectTo(peerid: string): boolean {
        if (this._isBan(peerid)) {
            return false;
        }

        if (this.m_node.getConnection(peerid)) {
            return false;
        }

        if (this.m_connecting.has(peerid)) {
            return false;
        }

        if (this.m_node.peerid === peerid) {
            return false;
        }

        return true;
    }
}