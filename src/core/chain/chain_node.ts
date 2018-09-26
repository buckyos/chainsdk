import * as assert from 'assert';
import {EventEmitter} from 'events';
import {isString} from 'util';
import {ErrorCode} from '../error_code';
import {LoggerInstance, } from '../lib/logger_util';
import { StorageManager, StorageLogger, StorageDumpSnapshot, JStorageLogger } from '../storage';

import {Transaction, BlockHeader, Block, BlockStorage, BaseNode, BAN_LEVEL} from '../block';

import { BufferReader } from '../lib/reader';
import { BufferWriter } from '../lib/writer';

import {INode, NodeConnection, PackageStreamWriter, Package, CMD_TYPE} from '../net';

export enum SYNC_CMD_TYPE {
    getHeader = CMD_TYPE.userCmd + 0,
    header = CMD_TYPE.userCmd + 1,
    getBlock = CMD_TYPE.userCmd + 2,
    block = CMD_TYPE.userCmd + 3,
    tx = CMD_TYPE.userCmd + 5,
    end = CMD_TYPE.userCmd + 6,
}

export type ChainNodeOptions = {
    node: BaseNode;
    initBlockWnd?: number;
    blockTimeout?: number;
    headersTimeout?: number;
    blockStorage: BlockStorage;
    storageManager: StorageManager;
};

type RequestingBlockConnection = {
    hashes: Set<string>, 
    wnd: number, 
    conn: NodeConnection
};

export type HeadersEventParams = {
    remote: string;
    headers: BlockHeader[]; 
    request: any;
    error: ErrorCode;
};

export type BlocksEventParams = {
    remote?: string;
    block: Block;
    storage?: StorageDumpSnapshot;
    redoLog?: StorageLogger;
};

export class ChainNode extends EventEmitter {
    constructor(options: ChainNodeOptions) {
        super();
        // net/node
        this.m_node = options.node;
        this.m_blockStorage = options.blockStorage;
        this.m_storageManager = options.storageManager;

        this.m_initBlockWnd = options.initBlockWnd ? options.initBlockWnd : 10;

        this.m_node.on('inbound', (conn: NodeConnection) => {
            this._beginSyncWithNode(conn);
        });
        this.m_node.on('outbound', (conn: NodeConnection) => {
            this._beginSyncWithNode(conn);
        });
        this.m_node.on('error', (connRemotePeer: string, err: ErrorCode) => {
            this._onConnectionError(connRemotePeer);
        });
        this.m_node.on('ban', (remote: string) => {
            this._onRemoveConnection(remote);
        });
        
        this.m_blockTimeout = options.blockTimeout ? options.blockTimeout : 10000;
        this.m_headersTimeout = options.headersTimeout ? options.headersTimeout : 30000;
        this.m_reqTimeoutTimer = setInterval(() => {
            this._onReqTimeoutTimer(Date.now() / 1000);
        }, 1000);
    }

    private m_node: BaseNode;
    private m_blockStorage: BlockStorage;
    private m_storageManager: StorageManager;

    on(event: 'blocks', listener: (params: BlocksEventParams) => any): this;
    on(event: 'headers', listener: (params: HeadersEventParams) => any): this;
    on(event: 'transactions', listener: (conn: NodeConnection, tx: Transaction[]) => any): this;
    on(event: string, listener: any): this {
        return super.on(event, listener);
    }

    once(event: 'blocks', listener: (params: BlocksEventParams) => any): this;
    once(event: 'headers', listener: (params: HeadersEventParams) => any): this;
    once(event: 'transactions', listener: (conn: NodeConnection, tx: Transaction[]) => any): this;
    once(event: string, listener: any): this {
        return super.once(event, listener);
    }   

    public async init(): Promise<ErrorCode> {
        await this.m_node.init();
        return this.m_node.initialOutbounds();
    }

    uninit(): Promise<any> {
        this.removeAllListeners('blocks');
        this.removeAllListeners('headers');
        this.removeAllListeners('transactions');
        return this.m_node.uninit();
    }

    public get logger(): LoggerInstance {
        return this.m_node.logger;
    }

    public async listen(): Promise<ErrorCode> {
        return this.m_node.listen();
    }

    public get base(): BaseNode {
        return this.m_node;
    }

    public broadcast(content: BlockHeader[]|Transaction[], options?: {count?: number, filter?: (conn: NodeConnection) => boolean}): ErrorCode {
        if (!content.length) {
            return ErrorCode.RESULT_OK;
        }
        let pwriter: PackageStreamWriter|undefined;
        if (content[0] instanceof BlockHeader) {
            let hwriter = new BufferWriter();
            for (let header of content) {
                let err = header.encode(hwriter);
                if (err) {
                    this.logger.error(`encode header ${header.hash} failed`);
                    return err;
                }
            }
            let raw = hwriter.render();
            pwriter = PackageStreamWriter.fromPackage(SYNC_CMD_TYPE.header, {count: content.length}, raw.length);
            pwriter.writeData(raw);
        } else if (content[0] instanceof Transaction) {
            let hwriter = new BufferWriter();
            for (let tx of content) {
                let err = tx.encode(hwriter);
                if (err) {
                    this.logger.error(`encode transaction ${tx.hash} failed`);
                    return err;
                }
            }
            let raw = hwriter.render();
            pwriter = PackageStreamWriter.fromPackage(SYNC_CMD_TYPE.tx, {count: content.length}, raw.length);
            pwriter.writeData(raw);
        }
        assert(pwriter);
        this.m_node.node.broadcast(pwriter!, options);
        return ErrorCode.RESULT_OK;
    }

    protected _beginSyncWithNode(conn: NodeConnection) {
        // TODO: node 层也要做封禁，比如发送无法解析的pkg， 过大， 过频繁的请求等等
        conn.on('pkg', async (pkg: Package) => {
            if (pkg.header.cmdType === SYNC_CMD_TYPE.tx) {
                let buffer = pkg.copyData();
                let txReader = new BufferReader(buffer);
                let txes: Transaction[] = [];
                let err = ErrorCode.RESULT_OK;
                for (let ix = 0; ix < pkg.body.count; ++ix) {
                    let tx = this.base.newTransaction();
                    if (tx.decode(txReader) !== ErrorCode.RESULT_OK) {
                        this.logger.warn(`receive invalid format transaction from ${conn.getRemote()}`);
                        err = ErrorCode.RESULT_INVALID_PARAM;
                        break;
                    }
                    if (!tx.verifySignature()) {
                        this.logger.warn(`receive invalid signature transaction ${tx.hash} from ${conn.getRemote()}`);
                        err = ErrorCode.RESULT_INVALID_TOKEN;
                        break;
                    }
                    txes.push(tx);
                }
                if (err) {
                    this.m_node.banConnection(conn.getRemote(), BAN_LEVEL.forever);
                } else {
                    if (txes.length) {
                        let hashs: string[] = [];
                        for (let tx of txes) {
                            hashs.push(tx.hash);
                        }
                        this.logger.debug(`receive transaction from ${conn.getRemote()} ${JSON.stringify(hashs)}`);
                        this.emit('transactions', conn, txes);
                    }
                }
            } else if (pkg.header.cmdType === SYNC_CMD_TYPE.header) {
                let time = Date.now() / 1000;
                let buffer = pkg.copyData();
                let headerReader = new BufferReader(buffer);
                let headers = [];
                if (!pkg.body.error) {
                    let err = ErrorCode.RESULT_OK;
                    let preHeader: BlockHeader|undefined;
                    for (let ix = 0; ix < pkg.body.count; ++ix) {
                        let header = this.base.newBlockHeader();
                        if (header.decode(headerReader) !== ErrorCode.RESULT_OK) {
                            this.logger.warn(`receive invalid format header from ${conn.getRemote()}`);
                            err = ErrorCode.RESULT_INVALID_BLOCK;
                            break;
                        }
                        if (!pkg.body.request || pkg.body.request.from) {
                            // 广播或者用from请求的header必须连续
                            if (preHeader) {
                                if (!preHeader.isPreBlock(header)) {
                                    this.logger.warn(`receive headers not in sequence from ${conn.getRemote()}`);
                                    err = ErrorCode.RESULT_INVALID_BLOCK;
                                    break;
                                }
                            }
                            preHeader = header;
                        }
                        headers.push(header); 
                    }
                    if (err) {
                        // 发错的header的peer怎么处理
                        this.m_node.banConnection(conn.getRemote(), BAN_LEVEL.forever);
                        return;
                    }
                    // 用from请求的返回的第一个跟from不一致
                    if (headers.length && pkg.body.request && headers[0].preBlockHash !== pkg.body.request.from) {
                        this.logger.warn(`receive headers ${headers[0].preBlockHash} not match with request ${pkg.body.request.from} from ${conn.getRemote()}`);
                        this.m_node.banConnection(conn.getRemote(), BAN_LEVEL.forever);
                        return;
                    }
                    // 任何返回 gensis 的都不对
                    if (headers.length) {
                        if (headers[0].number === 0) {
                            this.logger.warn(`receive genesis header from ${conn.getRemote()}`);
                            this.m_node.banConnection(conn.getRemote(), BAN_LEVEL.forever);
                            return;
                        }
                    }
                } else if (pkg.body.error === ErrorCode.RESULT_NOT_FOUND) {
                    let ghr = await this.base.headerStorage.getHeader(0);
                    if (ghr.err) {
                        return;
                    }
                    // from用gensis请求的返回没有
                    if (pkg.body.request && pkg.body.request.from === ghr.header!.hash) {
                        this.logger.warn(`receive can't get genesis header ${pkg.body.request.from} from ${conn.getRemote()}`);
                        this.m_node.banConnection(conn.getRemote(), BAN_LEVEL.forever);
                        return ;
                    }
                }

                if (!this._onRecvHeaders(conn.getRemote(), time, pkg.body.request)) {
                    return ;
                }
                this.emit('headers', {remote: conn.getRemote(), headers, request: pkg.body.request, error: pkg.body.error});
            } else if (pkg.header.cmdType === SYNC_CMD_TYPE.getHeader) {
                this._responseHeaders(conn, pkg.body);
            } else if (pkg.header.cmdType === SYNC_CMD_TYPE.block) {
                this._handlerBlockPackage(conn, pkg);
            } else if (pkg.header.cmdType === SYNC_CMD_TYPE.getBlock) {
                this._responseBlocks(conn, pkg.body);
            }
        });
    }
    
    // 处理通过网络请求获取的block package
    // 然后emit到chain层
    // @param conn 网络连接
    // @param pgk  block 数据包
    private _handlerBlockPackage(conn: NodeConnection, pkg: Package) { 
        let buffer = pkg.copyData();
        let blockReader;
        let redoLogReader;
        let redoLog;

        // check body buffer 中是否包含了redoLog
        // 如果包含了redoLog 需要切割buffer
        if ( pkg.body.redoLog) {
            // 由于在传输时, redolog和block都放在package的data属性里（以合并buffer形式）
            // 所以需要根据body中的length 分配redo和block的buffer
            let blockBuffer = buffer.slice(0, pkg.body.blockLength);
            let redoLogBuffer = buffer.slice(pkg.body.blockLength, buffer.length);
            // console.log(pkg.body.blockLength, blockBuffer.length, pkg.body.redoLogLength, redoLogBuffer.length)
            // console.log('------------------')
            blockReader = new BufferReader(blockBuffer);
            redoLogReader = new BufferReader(redoLogBuffer);
            // 构造redo log 对象
            redoLog = new JStorageLogger();
            let redoDecodeError = redoLog.decode(redoLogReader);
            if (redoDecodeError) {
                return;
            }
        } else {
            blockReader = new BufferReader(buffer);
        }

        if (pkg.body.err === ErrorCode.RESULT_NOT_FOUND) {
            // 请求的block肯定已经从header里面确定remote有，直接禁掉
            this.m_node.banConnection(conn.getRemote(), BAN_LEVEL.forever);
            return ;
        }

        // 构造block对象
        let block = this.base.newBlock();
        if (block.decode(blockReader) !== ErrorCode.RESULT_OK) {
            this.logger.warn(`receive block invalid format from ${conn.getRemote()}`);
            this.m_node.banConnection(conn.getRemote(), BAN_LEVEL.forever);
            return;
        }
        if (!block.verify()) {
            this.logger.warn(`receive block not match header ${block.header.hash} from ${conn.getRemote()}`);
            this.m_node.banConnection(conn.getRemote(), BAN_LEVEL.day); // 可能分叉？
            return;
        }
        let err = this._onRecvBlock(block, conn.getRemote());
        if (err) {
            return ;
        }
        // 数据emit 到chain层
        this.emit('blocks', {remote: conn.getRemote(), block, redoLog});
    }

    public requestHeaders(from: NodeConnection|string, options: {from?: string, limit?: number}): ErrorCode {
        let conn;
        this.logger.debug(`request headers from ${isString(from) ? from : from.getRemote()} with options `, options);
        if (typeof from === 'string') {
            let connRequesting = this._getConnRequesting(from);
            if (!connRequesting) {
                this.logger.debug(`request headers from ${from} skipped for connection not found with options `, options);
                return ErrorCode.RESULT_NOT_FOUND;
            }
            conn = connRequesting.conn;
        } else {
            conn = from;
        }
        if (this.m_requestingHeaders.get(conn.getRemote())) {
            this.logger.warn(`request headers ${options} from ${conn.getRemote()} skipped for former headers request existing`);
            return ErrorCode.RESULT_ALREADY_EXIST;
        }
        this.m_requestingHeaders.set(conn.getRemote(), {
            time: Date.now() / 1000,
            req: Object.assign(Object.create(null), options)
        });
        let writer = PackageStreamWriter.fromPackage(SYNC_CMD_TYPE.getHeader, options);
        conn.addPendingWriter(writer);
        return ErrorCode.RESULT_OK;
    }

    // 这里必须实现成同步的
    public requestBlocks(options: {headers?: BlockHeader[], redoLog?: number}, from: string): ErrorCode {
        this.logger.debug(`request blocks from ${from} with options `, options);
        let connRequesting = this._getConnRequesting(from);
        if (!connRequesting) {
            this.logger.debug(`request blocks from ${from} skipped for connection not found with options `, options);
            return ErrorCode.RESULT_NOT_FOUND;
        }
        let requests: string[] = [];
        let addRequesting = (header: BlockHeader): boolean => {
            if (this.m_blockStorage.has(header.hash)) {
                let block = this.m_blockStorage.get(header.hash);
                assert(block, `block storage load block ${header.hash} failed while file exists`);
                if (block) {
                    setImmediate(() => {
                        this.emit('blocks', {block});
                    });
                    return false;
                }
            }
            let sources = this.m_blockFromMap.get(header.hash);
            if (!sources) {
                sources = new Set();
                this.m_blockFromMap.set(header.hash, sources);
            } 
            if (sources.has(from)) {
                return false;
            }
            sources.add(from);
            if (this.m_requestingBlock.hashMap.has(header.hash)) {
                return false;
            }
            requests.push(header.hash);
            return true;
        };
        
        if (options.headers) {
            for (let header of options.headers) {
                addRequesting(header);
            }
        } else {
            assert(false, `invalid block request ${options}`);
            return ErrorCode.RESULT_INVALID_PARAM;
        }
        
        for (let hash of requests) {
            if (connRequesting.wnd - connRequesting.hashes.size > 0) {
                this._requestBlockFromConnection(hash, connRequesting, options.redoLog);
                if (this.m_pendingBlock.hashes.has(hash)) {
                    this.m_pendingBlock.hashes.delete(hash);
                    this.m_pendingBlock.sequence.splice(this.m_pendingBlock.sequence.indexOf(hash), 1);
                }
            } else if (!this.m_pendingBlock.hashes.has(hash)) {
                this.m_pendingBlock.hashes.add(hash);
                this.m_pendingBlock.sequence.push(hash);
            }
        }
        return ErrorCode.RESULT_OK;
    }
 
    protected m_initBlockWnd: number;
    protected m_requestingBlock: {
        connMap: Map<string, RequestingBlockConnection>,
        hashMap: Map<string, {from: string, time: number}>
     } = {
         connMap: new Map(),
         hashMap: new Map()
     };
    protected m_pendingBlock: {hashes: Set<string>, sequence: Array<string>} = {hashes: new Set(), sequence: new Array()};
    protected m_blockFromMap: Map<string, Set<string>> = new Map(); 
    protected m_requestingHeaders: Map<string, {
        time: number;
        req: any;
    }> = new Map();
    protected m_reqTimeoutTimer: any;
    protected m_blockTimeout: number;
    protected m_headersTimeout: number;

    protected m_cc = {
        onRecvBlock(node: ChainNode, block: Block, from: RequestingBlockConnection) {
            from.wnd += 1; 
            from.wnd = from.wnd > 3 * node.m_initBlockWnd ? 3 * node.m_initBlockWnd : from.wnd;
        },
        onBlockTimeout(node: ChainNode, hash: string, from: RequestingBlockConnection) {
            from.wnd = Math.floor(from.wnd / 2);
        }
    };

    protected _getConnRequesting(remote: string): RequestingBlockConnection|undefined  {
        let connRequesting = this.m_requestingBlock.connMap.get(remote);
        if (!connRequesting) {
            let conn = this.m_node.node.getConnection(remote);
            // TODO: 取不到这个conn的时候要处理
            assert(conn, `no connection to ${remote}`);
            if (!conn) {
                return ;
            }
            connRequesting =  {hashes: new Set(), wnd: this.m_initBlockWnd, conn: conn!};
            this.m_requestingBlock.connMap.set(remote, connRequesting);
        }
        return connRequesting;
    }

    protected _requestBlockFromConnection(hash: string, from: string|RequestingBlockConnection, redoLog: number = 0 ): ErrorCode {
        let connRequesting;
        if (typeof from === 'string') {
            connRequesting = this._getConnRequesting(from);
            if (!connRequesting) {
                return ErrorCode.RESULT_NOT_FOUND;
            }
        } else {
            connRequesting = from;
        }
        this.logger.debug(`request block ${hash} from ${connRequesting.conn.getRemote()}`);
        let writer = PackageStreamWriter.fromPackage(SYNC_CMD_TYPE.getBlock, { hash, redoLog });
        connRequesting.conn.addPendingWriter(writer);
        connRequesting.hashes.add(hash);
        this.m_requestingBlock.hashMap.set(hash, {from: connRequesting.conn.getRemote(), time: Date.now() / 1000});
        return ErrorCode.RESULT_OK;
    }

    protected _onFreeBlockWnd(connRequesting: RequestingBlockConnection) {
        let pending = this.m_pendingBlock;
        let index = 0;
        do {
            if (!pending.sequence.length) {
                break;
            }
            let hash = pending.sequence[index];
            let sources = this.m_blockFromMap.get(hash);
            assert(sources, `to request block ${hash} from unknown source`);
            if (!sources) {
                return ErrorCode.RESULT_EXCEPTION;
            }
            if (sources.has(connRequesting.conn.getRemote())) {
                this._requestBlockFromConnection(hash, connRequesting);
                pending.sequence.splice(index, 1);
                pending.hashes.delete(hash);
                if (connRequesting.wnd <= connRequesting.hashes.size) {
                    break;
                } else {
                    continue;
                }
            } 
            ++index;
        } while (true);
    }

    protected _onRecvHeaders(from: string, time: number, request?: any): boolean {
        let valid = true;
        if (request) {
            // 返回没有请求过的headers， 要干掉
            let rh = this.m_requestingHeaders.get(from);
            if (rh) {
                for (let key of Object.keys(request)) {
                    if (request![key] !== rh.req[key]) {
                        valid = false;
                        break;
                    }
                }
            } else {
                valid = false;
            }

            if (valid) {
                this.m_requestingHeaders.delete(from);
            }
        } else {
            // TODO: 过频繁的广播header, 要干掉
        }
        if (!valid) {
            this.m_node.banConnection(from, BAN_LEVEL.forever);
        }
        return valid;
    }

    protected _onRecvBlock(block: Block, from: string): ErrorCode {
        let stub = this.m_requestingBlock.hashMap.get(block.hash);
        assert(stub, `recv block ${block.hash} from ${from} that never request`);
        if (!stub) {
            this.m_node.banConnection(from, BAN_LEVEL.day);
            return ErrorCode.RESULT_INVALID_BLOCK;
        }
        this.logger.debug(`recv block hash: ${block.hash} number: ${block.number} from ${from}`);
        this.m_blockStorage!.add(block);
        assert(stub!.from === from, `request ${block.hash} from ${stub!.from} while recv from ${from}`);
        this.m_requestingBlock.hashMap.delete(block.hash);
        let connRequesting = this.m_requestingBlock.connMap.get(stub!.from);
        assert(connRequesting, `requesting info on ${stub!.from} missed`);
        if (!connRequesting) {
            return ErrorCode.RESULT_EXCEPTION;
        }
        connRequesting.hashes.delete(block.hash);
        this.m_blockFromMap.delete(block.hash);
        this.m_cc.onRecvBlock(this, block, connRequesting);
        this._onFreeBlockWnd(connRequesting);
        return ErrorCode.RESULT_OK;
    }

    protected _onConnectionError(remote: string) {
        this.logger.warn(`connection from ${remote} break, close it.`);
        this._onRemoveConnection(remote);
    }

    protected _onRemoveConnection(remote: string) {
        let connRequesting = this.m_requestingBlock.connMap.get(remote);
        if (connRequesting) {
            let toPending = new Array();
            for (let hash of connRequesting.hashes) {
                this.m_pendingBlock.hashes.add(hash);   
                toPending.push(hash);
                this.m_requestingBlock.hashMap.delete(hash);
            }
            this.m_pendingBlock.sequence.unshift(...toPending);
        }
        this.m_requestingBlock.connMap.delete(remote);
        for (let hash of this.m_blockFromMap.keys()) {
            let sources = this.m_blockFromMap.get(hash)!;
            if (sources.has(remote)) {
                sources.delete(remote);
                if (!sources.size) {
                    this.m_pendingBlock.sequence.splice(this.m_pendingBlock.sequence.indexOf(hash), 1);
                } else {
                    for (let from of sources) {
                        let fromRequesting = this.m_requestingBlock.connMap.get(from);
                        assert(fromRequesting, `block requesting connection ${from} not exists`);
                        if (fromRequesting!.hashes.size < fromRequesting!.wnd) {
                            this._requestBlockFromConnection(hash, fromRequesting!);
                        }
                    }
                }
            }
        }
        this.m_requestingHeaders.delete(remote);
    }

    protected _onReqTimeoutTimer(now: number) {
        for (let hash of this.m_requestingBlock.hashMap.keys()) {
            let stub = this.m_requestingBlock.hashMap.get(hash)!;
            let fromRequesting = this.m_requestingBlock.connMap.get(stub.from)!;
            if (now - stub.time > this.m_blockTimeout) {
                this.m_cc.onBlockTimeout(this, hash, fromRequesting);
                // close it 
                if (fromRequesting.wnd < 1) {
                    this.m_node.banConnection(stub.from, BAN_LEVEL.hour);
                }
            }
        }
        // 返回headers超时
        for (let remote of this.m_requestingHeaders.keys()) {
            let rh = this.m_requestingHeaders.get(remote)!;
            if (now - rh.time > this.m_headersTimeout) {
                this.logger.debug(`header request timeout from ${remote} timeout with options `, rh.req);
                this.m_node.banConnection(remote, BAN_LEVEL.hour);
            }
        }
    }

    protected async _responseBlocks(conn: NodeConnection, req: any): Promise<ErrorCode> {
        assert(this.m_blockStorage);
        this.logger.info(`receive block request from ${conn.getRemote()} with ${JSON.stringify(req)}`);
        let bwriter = new BufferWriter();
        let block = this.m_blockStorage!.get(req.hash);
        if (!block) {
            this.logger.crit(`cannot get Block ${req.hash} from blockStorage`);
            assert(false, `${this.m_node.peerid} cannot get Block ${req.hash} from blockStorage`);
            return ErrorCode.RESULT_OK;
        }
        let err = block.encode(bwriter);
        if (err) {
            this.logger.error(`encode block ${block.hash} failed`);
            return err;
        }
        let rawBlocks = bwriter.render();

        // 如果请求参数里设置了redoLog,  则读取redoLog, 合并在返回的包里
        if ( req.redoLog === 1 ) {
            let redoLogWriter = new BufferWriter();
            // 从本地文件中读取redoLog, 处理raw 拼接在block后
            let redoLog = this.m_storageManager.getRedoLog(req.hash);
            err = redoLog!.encode(redoLogWriter);
            if (err) {
                this.logger.error(`encode redolog ${req.hash} failed`);
                return err;
            }
            let redoLogRaw = redoLogWriter.render();

            let dataLength = rawBlocks.length + redoLogRaw.length;
            let pwriter = PackageStreamWriter.fromPackage(SYNC_CMD_TYPE.block, {
                blockLength: rawBlocks.length,
                redoLogLength: redoLogRaw.length,
                redoLog: 1,
            }, dataLength);
            conn.addPendingWriter(pwriter);
            pwriter.writeData(rawBlocks);
            pwriter.writeData(redoLogRaw);
        } else {
            let pwriter = PackageStreamWriter.fromPackage(SYNC_CMD_TYPE.block, {redoLog: 0}, rawBlocks.length);
            conn.addPendingWriter(pwriter);
            pwriter.writeData(rawBlocks);
        }
        return ErrorCode.RESULT_OK;
    }

    protected async _responseHeaders(conn: NodeConnection, req: any): Promise<ErrorCode> {
        this.logger.info(`receive header request from ${conn.getRemote()} with ${JSON.stringify(req)}`);
        if (req.from) {
            let hwriter = new BufferWriter();
            let respErr = ErrorCode.RESULT_OK;
            let headerCount = 0;
            do {
                let tipResult = await this.base.headerStorage.getHeader('latest');
                if (tipResult.err) {
                    return tipResult.err;
                }
                
                let heightResult = await this.m_node.headerStorage!.getHeightOnBest(req.from);
                if (heightResult.err === ErrorCode.RESULT_NOT_FOUND) {
                    respErr = ErrorCode.RESULT_NOT_FOUND;
                    break;
                }
                assert(tipResult.header);
                if (tipResult.header!.hash === req.from) {
                    // 没有更多了
                    respErr = ErrorCode.RESULT_SKIPPED;
                    break;
                }
     
                if (!req.limit || heightResult.height! + req.limit > tipResult.header!.number) {
                    headerCount = tipResult.header!.number - heightResult.height!;
                } else {
                    headerCount = req.limit;
                }
                
                let hr = await this.base.headerStorage.getHeader(heightResult.height! + headerCount);
                if (hr.err) {
                    // 中间changeBest了，返回not found
                    if (hr.err === ErrorCode.RESULT_NOT_FOUND) {
                        respErr = ErrorCode.RESULT_NOT_FOUND;
                        break;
                    } else {
                        return hr.err;
                    }
                }

                let hsr = await this.base.headerStorage.getHeader(hr.header!.hash, -headerCount + 1);
                if (hsr.err) {
                    return hsr.err;
                }
                if (hsr.headers![0].preBlockHash !== req.from) {
                    // 中间changeBest了，返回not found
                    respErr = ErrorCode.RESULT_NOT_FOUND;
                    break;
                }
                for (let h of hsr.headers!) {
                    let err = h.encode(hwriter);
                    if (err) {
                        this.logger.error(`encode header ${h.hash} failed`);
                        respErr = ErrorCode.RESULT_NOT_FOUND;
                    }
                }
            } while (false);
            
            let rawHeaders = hwriter.render();
            let pwriter = PackageStreamWriter.fromPackage(SYNC_CMD_TYPE.header, {count: headerCount, request: req, error: respErr}, rawHeaders.length);
            conn.addPendingWriter(pwriter);
            pwriter.writeData(rawHeaders);
            return ErrorCode.RESULT_OK;
        } else {
            return ErrorCode.RESULT_INVALID_PARAM;
        }
    }
    
}