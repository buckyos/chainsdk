const assert = require('assert');
import {EventEmitter} from 'events';

import {ErrorCode} from '../error_code';
import {LoggerInstance} from '../lib/logger_util';
import {NodeStorage, NodeStorageOptions} from './node_storage';
import {BlockHeader, Block} from './block';
import {IHeaderStorage} from './header_storage';
import {Transaction, Receipt} from './transaction';

import {INode, NodeConnection} from '../net';
import { isNullOrUndefined } from 'util';
const {LogShim} = require('../lib/log_shim');

export type NetworkOptions = {
    node: INode;
    logger: LoggerInstance;
    dataDir: string;
    blockHeaderType: new () => BlockHeader;
    transactionType: new () => Transaction;
    receiptType: new () => Receipt;
    headerStorage: IHeaderStorage;
};

export type NetworkInstanceOptions = {
    nodeCacheSize?: number;
    ignoreBan?: boolean;
};

export enum BAN_LEVEL {
    minute = 1,
    hour = 60,
    day = 24 * 60,
    month = 30 * 24 * 60,
    forever = 0,
}

export class Network extends EventEmitter {
    constructor(options: NetworkOptions) {
        super();

        this.m_node = options.node;
        this.m_node.logger = options.logger;
        this.m_logger = new LogShim(options.logger).bind(`[network: ${this.name} peerid: ${this.peerid}]`, true).log;

        this.m_dataDir = options.dataDir;
        this.m_blockHeaderType = options.blockHeaderType;
        this.m_transactionType = options.transactionType;  
        this.m_receiptType = options.receiptType;  
        this.m_headerStorage = options.headerStorage;
    }

    protected m_node: INode;
    protected m_connecting: Set<string> = new Set();
    private m_logger: LoggerInstance;
    protected m_nodeStorage?: NodeStorage;

    private m_headerStorage: IHeaderStorage;
    private m_blockHeaderType: new () => BlockHeader;
    private m_transactionType: new () => Transaction;
    private m_receiptType: new () => Receipt;
    private m_ignoreBan: boolean = false;
    private m_dataDir: string;

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
    
    parseInstanceOptions(options: {parsed: any, origin: Map<string, any>}): {err: ErrorCode, value?: any} {
        let value = Object.create(null);
        value.ignoreBan = options.origin.get('ignoreBan');
        value.nodeCacheSize = options.origin.get('nodeCacheSize');
        return {err: ErrorCode.RESULT_OK, value};
    }

    setInstanceOptions(options: any) {
        this.m_ignoreBan = !!options.ignoreBan;
        this.m_nodeStorage = new NodeStorage({
            count: options.nodeCacheSize ? options.nodeCacheSize : 50, 
            dataDir: this.m_dataDir, 
            logger: this.m_logger});
    }

    async init(): Promise<ErrorCode> {
        this.m_node.on('error', (conn: NodeConnection, err: ErrorCode) => {
            this.emit('error', conn.network, conn.remote);
        });

        // 收到net/node的ban事件, 调用 ChainNode的banConnection方法做封禁处理
        // 日期先设置为按天
        this.m_node.on('ban', (remote: string) => {
            this.banConnection(remote, BAN_LEVEL.day);
        });

        // 读取创始块的hash值， 并将其传入 net/node
        const result = await this.m_headerStorage!.getHeader(0);
        const genesis_hash: string = result.header!.hash;
        this.m_node.genesisHash = genesis_hash;

        await this.m_node.init();

        return ErrorCode.RESULT_OK;
    }

    uninit(): Promise<any> {
        return this.m_node.uninit();
    }

    public newTransaction(): Transaction {
        return new this.m_transactionType!();
    }

    public newBlockHeader(): BlockHeader {
        return new this.m_blockHeaderType!();
    }

    public newBlock(header?: BlockHeader): Block {
        let block = new Block({
            header,
            headerType: this.m_blockHeaderType!, 
            transactionType: this.m_transactionType!,
            receiptType: this.m_receiptType!});
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

    public get name(): string {
        return this.m_node.network;
    }

    public get headerStorage(): IHeaderStorage {
        return this.m_headerStorage!;
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
                    this.m_nodeStorage!.add(r.conn.remote!);
                    this.emit('outbound', r.conn);
                    ++ connCount;
                } else {
                    if (r.err !== ErrorCode.RESULT_ALREADY_EXIST) {
                        this.m_nodeStorage!.remove(r.peerid);
                    }
                    if (r.err === ErrorCode.RESULT_VER_NOT_SUPPORT) {
                        this.m_nodeStorage!.ban(r.peerid, BAN_LEVEL.month);
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
        return this.m_nodeStorage!.isBan(peerid);
    }

    public async listen(): Promise<ErrorCode> {
        this.m_node.on('inbound', (inbound: NodeConnection) => {
            if (this._isBan(inbound.remote!)) {
                this.logger.warn(`new inbound from ${inbound.remote!} ignored for ban`);
                this.m_node.closeConnection(inbound);
            } else {
                this.logger.info(`new inbound from `, inbound.remote!);
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
        this.m_nodeStorage!.ban(remote, level);
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

type NodeInstance = (commandOptions: Map<string, any>) => INode;

export class NetworkCreator {
    constructor(options: {
        logger: LoggerInstance,
    }) {
        this.m_logger = options.logger;
    }
    private m_logger: LoggerInstance;

    create(options: {parsed: any, origin: Map<string, any>}): {err: ErrorCode, network?: Network} {
        let pnr = this._parseNetwork(options);
        if (pnr.err) {
            this.m_logger.error(`parseNetwork failed, err ${pnr.err}`);
            return {err: pnr.err};
        }
        const network = pnr.network!;
        return {err: ErrorCode.RESULT_OK, network};
    }

    registerNetwork(type: string, instance: new (...args: any[]) => Network) {
        this.m_network.set(type, instance);
    }

    protected _parseNetwork(options: {parsed: any, origin: Map<string, any>}): {err: ErrorCode, network?: Network} {
        const {parsed} = options;
        if (!parsed.dataDir 
            || !parsed.blockHeaderType 
            || !parsed.headerStorage 
            || !parsed.receiptType 
            || !parsed.transactionType
            || !parsed.logger
            ) {
            this.m_logger.error(`parsed should has contructor options`);
            return {err: ErrorCode.RESULT_PARSE_ERROR};
        } 
        let type = options.parsed.netType;
        if (!type) {
            type = options.origin.get('netType');
        }
        if (!type) {
            this.m_logger.error(`parse network failed for netype missing`);
            return {err: ErrorCode.RESULT_INVALID_PARAM};
        }

        let node = options.parsed.node;
        if (!node) {
            const pr = this._parseNode(options.origin);
            if (pr.err) {
                this.m_logger.error(`parseNode failed, err ${pr.err}`);
                return {err: pr.err};
            }
            node = pr.node;
        } 

        const instance = this.m_network.get(type);
        if (!instance) {
            this.m_logger.error(`parse network failed for invalid netType ${type}`);
            return {err: ErrorCode.RESULT_INVALID_PARAM};
        }
        let ops = Object.create(parsed);
        ops.node = node;
        ops.logger = this.m_logger;
        const ins = new instance(ops);

        return {err: ErrorCode.RESULT_OK, network: ins};
    }

    private m_network: Map<string, new (...args: any[]) => Network> = new Map();

    registerNode(type: string, instance: NodeInstance) {
        this.m_node.set(type, instance);
    }

    protected _parseNode(commandOptions: Map<string, any>): {err: ErrorCode, node?: INode}  {
        const type = commandOptions.get('net');
        if (type) {
            let ni = this.m_node.get(type);
            if (!ni) {
                this.m_logger.error(`parse node failed for invalid node ${type}`);
                return {err: ErrorCode.RESULT_INVALID_PARAM};
            }
            return {err: ErrorCode.RESULT_OK, node: ni(commandOptions)};
        } else {
            this.m_logger.error(`parse node failed for node missing`);
            return {err: ErrorCode.RESULT_INVALID_PARAM};
        }
    }

    private m_node: Map<string, NodeInstance> = new Map();
}