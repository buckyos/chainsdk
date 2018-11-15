import * as path from 'path';
import * as fs from 'fs-extra';
import * as childProcess from 'child_process';
const assert = require('assert');

import { isNullOrUndefined, isString } from 'util';
import { ErrorCode } from '../error_code';
import { toStringifiable, fromStringifiable } from '../serializable';
import { ChainCreator } from '../chain_creator';
import { BufferReader } from '../lib/reader';
import { BufferWriter } from '../lib/writer';
import { LoggerInstance } from '../lib/logger_util';
import {Block} from '../block';
import {Storage} from '../storage';
import {SqliteStorage} from '../storage_sqlite/storage';
import {BlockExecutorRoutine, IBlockExecutorRoutineManager, BlockExecutorRoutineState} from './executor_routine';
import {Chain} from './chain';

enum RoutineType {
    execute, 
    verify
}

export type BlockExecutorWorkerRoutineParams = {
    type: RoutineType, 
    name: string, 
    chain: Chain,
    block: Block, 
    storage: Storage
};

export type BlockExecutorWorkerRoutineResult = {
        err: ErrorCode,
        chain: Chain, 
        name: string,
        type: RoutineType,   
        block?: Block, 
        storage?: Storage,
        valid?: ErrorCode
    };

export class BlockExecutorWorkerRoutine {
    constructor() {
    }

    static encodeParams(params: BlockExecutorWorkerRoutineParams): {err: ErrorCode, message?: any} {
        const writer = new BufferWriter();
        let err;
        if (params.type === RoutineType.execute) {
            err = params.block.encode(writer);
        } else if (params.type === RoutineType.verify) {
            err = params.block.encode(writer);
        } else {
            assert(false, `invalid routine type`);
            return {err: ErrorCode.RESULT_INVALID_PARAM};
        }

        if (err) {
            return {err};
        }
        const blockPath = params.chain.tmpManager.getPath(`${params.name}.block`);
        try {
            fs.writeFileSync(blockPath, writer.render());
        } catch (e) {
            params.chain.logger.error(`write block to ${blockPath} failed `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
        
        try {
            const message = {
                type: params.type, 
                name: params.name, 
                dataDir: params.chain.dataDir, 
                blockPath, 
                storagePath: params.storage.filePath
            };
            return {err: ErrorCode.RESULT_OK, message};
        } catch (e) {
            return {err: ErrorCode.RESULT_INVALID_PARAM};
        }
    }

    static async decodeParams(creator: ChainCreator, message: any): Promise<{err: ErrorCode, params?: BlockExecutorWorkerRoutineParams}> {
        let ccr = await creator.createChainInstance(message.dataDir, {
            readonly: true
        });
        if (ccr.err) {
            return {err: ccr.err};
        }
        const chain = ccr.chain!;
        
        let block = chain.newBlock();
        let blockRaw;
        let err;
        try {
            blockRaw = fs.readFileSync(message.blockPath);
        } catch (e) {
            chain.logger.error(`read block from ${message.blockPath} failed `, e);
            return {err: ErrorCode.RESULT_INVALID_PARAM};
        }
        if (message.type === RoutineType.execute) {
            err = block.decode(new BufferReader(blockRaw));
        } else if (message.type === RoutineType.verify) {
            err = block.decode(new BufferReader(blockRaw));
        } else {
            assert(false, `invalid routine type`);
            return {err: ErrorCode.RESULT_INVALID_PARAM};
        }
        
        if (err) {
            chain.logger.error(`decode block from params failed `, err);
            return {err};
        }

        const storage = new SqliteStorage({
            filePath: message.storagePath, 
            logger: chain.logger
        });
        err = await storage.init();
        if (err) {
            chain.logger.error(`init storage ${message.storagePath} failed `, err);
            return {err};
        }

        return {err: ErrorCode.RESULT_OK, params: {type: message.type, chain, storage, block, name: message.name}};
    }

    static encodeResult(result: BlockExecutorWorkerRoutineResult): {err: ErrorCode, message?: any} {
        const message = Object.create(null);
        message.name = result.name;
        message.err = result.err;
        message.type = result.type;
        
        if (result.type === RoutineType.execute) {
            if (result.block) {
                const writer = new BufferWriter();
                let err = result.block.encode(writer);
                if (err) {
                    return {err};
                }
                const blockPath = result.chain.tmpManager.getPath(`${result.name}.block`);
                try {
                    fs.writeFileSync(blockPath, writer.render());
                } catch (e) {
                    result.chain.logger.error(`write block to ${blockPath} failed `, e);
                    return {err: ErrorCode.RESULT_EXCEPTION};
                }
                message.blockPath = blockPath;
            }
        } else if (result.type === RoutineType.verify) {
            if (!isNullOrUndefined(result.valid)) {
                message.valid = result.valid;
            }
        } else {
            assert(false, `invalid result type`);
            return {err: ErrorCode.RESULT_INVALID_PARAM};
        }
        
        if (result.storage) {
            const writer = new BufferWriter();
            if (result.storage!.storageLogger) {
                let err = result.storage!.storageLogger!.encode(writer);
                if (err) {
                    return {err};
                }
                const redoPath = result.chain.tmpManager.getPath(`${result.name}.redo`);
                try {
                    fs.writeFileSync(redoPath, writer.render());
                } catch (e) {
                    result.chain.logger.error(`write redo log to ${redoPath} failed `, e);
                    return {err: ErrorCode.RESULT_EXCEPTION};
                }
                message.redoPath = redoPath;
            }
        }
        
        return {err: ErrorCode.RESULT_OK, message};
    }

    static decodeResult(params: BlockExecutorWorkerRoutineParams, message: any): {err: ErrorCode, result?: BlockExecutorWorkerRoutineResult} {
        let result: BlockExecutorWorkerRoutineResult = Object.create(null);
        result.name = message.name;
        result.chain = params.chain;
        result.type = message.type;
        assert(result.name === params.name, `routine params' name is ${params.name} while result name is ${result.name}`);
        if (result.name !== params.name) {
            params.chain.logger.error(`routine result name mismatch`);
            return {err: ErrorCode.RESULT_INVALID_PARAM};
        }
        result.err = message.err;
        
        if (message.type === RoutineType.execute) {
            if (message.blockPath) {
                let blockRaw;
                try {
                    blockRaw = fs.readFileSync(message.blockPath);
                } catch (e) {
                    params.chain.logger.error(`read block from ${message.blockPath} failed `, e);
                    return {err: ErrorCode.RESULT_INVALID_PARAM};
                }
    
                let reader = new BufferReader(blockRaw);
                let block = params.chain.newBlock();
                let err = block.decode(reader);
                if (err) {
                    params.chain.logger.error(`decode block from ${message.blockPath} failed `, err);
                    return {err};
                }
                result.block = block;
                params.chain.logger.debug(`about to remove tmp block `, message.blockPath);
                fs.removeSync(message.blockPath);
            }
        } else if (message.type === RoutineType.verify) {
            if (!isNullOrUndefined(message.valid)) {
                result.valid = message.valid;
            }
        } else {
            assert(false, `invalid routine type`);
            return {err: ErrorCode.RESULT_INVALID_PARAM};
        }
        
        if (message.redoPath) {
            let redoRaw;
            try {
                redoRaw = fs.readFileSync(message.redoPath);
            } catch (e) {
                params.chain.logger.error(`read redo log from ${message.redoPath} failed `, e);
                return {err: ErrorCode.RESULT_INVALID_PARAM};
            }
            let reader = new BufferReader(redoRaw);
            params.storage.createLogger();
            let err = params.storage.storageLogger!.decode(reader);
            if (err) {
                params.chain.logger.error(`decode redo log from ${message.redoPath} failed `, err);
                return {err};
            }
            params.chain.logger.debug(`about to remove tmp redo log `, message.redoPath);
            fs.removeSync(message.redoPath);
            result.storage = params.storage;
        }
        
        return {err: ErrorCode.RESULT_OK, result};
    }

    async run(params: BlockExecutorWorkerRoutineParams): Promise<BlockExecutorWorkerRoutineResult> {
        let result: BlockExecutorWorkerRoutineResult = Object.create(null);
        result.name = params.name;
        result.chain = params.chain;
        result.type = params.type;
        do {
            params.storage.createLogger();
            const nber = await params.chain.newBlockExecutor(params.block, params.storage);
            if (nber.err) {
                result.err = nber.err;
                break;
            }
            if (params.type === RoutineType.execute) {
                let err = await nber.executor!.execute();
                result.err = err;
                if (!result.err) {
                    result.block = params.block;
                    result.storage = params.storage;
                }
            } else if (params.type === RoutineType.verify) {
                let vr = await nber.executor!.verify();
                result.err = vr.err;
                if (!result.err) {
                    result.valid = vr.valid;
                    result.block = params.block;
                    result.storage = params.storage;
                }
            } else  {
                assert(false, `invalid routine type`);
                result.err = ErrorCode.RESULT_INVALID_PARAM;
            }
        } while (false);
        await params.storage.uninit();
        return result;
    }
}

export class InterprocessRoutineManager implements IBlockExecutorRoutineManager {
    constructor(chain: Chain) {
        this.m_chain = chain;
    }
    private m_chain: Chain;

    create(options: { name: string, block: Block, storage: Storage}): {err: ErrorCode, routine: BlockExecutorRoutine} {
        const routine = new InterprocessRoutine({
            name: options.name, 
            chain: this.m_chain,
            block: options.block,
            storage: options.storage
        });
        return {err: ErrorCode.RESULT_OK, routine};
    }
}

class InterprocessRoutine extends BlockExecutorRoutine {
    constructor(options: {
        name: string, 
        chain: Chain,
        block: Block,
        storage: Storage
    }) {
        super({
            name: options.name, 
            logger: options.chain.logger,
            block: options.block,
            storage: options.storage
        });
        this.m_chain = options.chain;
    }

    private m_chain: Chain;
    private m_worker?: WorkerProxy;
    private m_state: BlockExecutorRoutineState = BlockExecutorRoutineState.init;
    private m_cancelSet: boolean = false;

    protected async _executeOrVerify(type: RoutineType): Promise<any> {
        if (this.m_state !== BlockExecutorRoutineState.init) {
            return {err: ErrorCode.RESULT_INVALID_STATE};
        }
        this.m_state = BlockExecutorRoutineState.running;
        
        this.m_worker = new WorkerProxy(this.m_logger);
        const result = await this.m_worker.run({
            type, 
            name: this.m_name, 
            chain: this.m_chain, 
            block: this.m_block,
            storage: this.m_storage
        });
        if (this.m_cancelSet) {
            return {err: ErrorCode.RESULT_CANCELED};
        }
        if (result.block) {
            this.m_block = result.block;
        }
        if (result.storage) {
            this.m_storage = result.storage;
        }
        return {err: ErrorCode.RESULT_OK, result: {err: result.err, valid: result.valid}};
    }   

    async execute(): Promise<{err: ErrorCode, result?: {err: ErrorCode}}> {
        return this._executeOrVerify(RoutineType.execute);
    }

    async verify(): Promise<{err: ErrorCode, result?: {err: ErrorCode, valid?: ErrorCode}}> {
        return this._executeOrVerify(RoutineType.verify);
    }

    cancel(): void {
        if (this.m_state === BlockExecutorRoutineState.finished) {
            return ;
        } else if (this.m_state === BlockExecutorRoutineState.init) {
            this.m_state = BlockExecutorRoutineState.finished; 
            return ;
        }
        this.m_cancelSet = true;
        this.m_worker!.cancel();
    }
}

class WorkerProxy {
    constructor(logger: LoggerInstance) {
        this.m_logger = logger;
    }
    private m_logger: LoggerInstance;
    private m_childProcess?: childProcess.ChildProcess;

    async run(params: BlockExecutorWorkerRoutineParams): Promise<BlockExecutorWorkerRoutineResult> {
        await params.storage.uninit();
        const epr = BlockExecutorWorkerRoutine.encodeParams(params);
        if (epr.err) {
            return {err: ErrorCode.RESULT_INVALID_PARAM, type: params.type, chain: params.chain, name: params.name};
        }
        const workerPath = path.join(__dirname, '../../routine/executor_routine.js');
        if (this.m_logger.level === 'debug') {
            let command = JSON.stringify(epr.message).replace(/\\\\/g, '/').replace(/\"/g, '\\"');
            this.m_logger.debug('run command in worker routine: ', command);
        }
        this.m_childProcess = childProcess.fork(workerPath);
        if (!this.m_childProcess.send(epr.message!)) {  
            return {err: ErrorCode.RESULT_EXCEPTION, type: params.type, chain: params.chain, name: params.name};
        }
        const result = await new Promise<BlockExecutorWorkerRoutineResult>((resolve) => {
            const errListener = () => {
                this.m_logger.debug(`routine process error`);
                resolve({err: ErrorCode.RESULT_EXCEPTION, type: params.type, chain: params.chain, name: params.name});
            };
            this.m_childProcess!.on('error', errListener);
            this.m_childProcess!.on('message', (message) => {
                this.m_childProcess!.removeListener('error', errListener);
                if (this.m_logger.level === 'debug') {
                    const rawResult = JSON.stringify(message).replace(/\\\\/g, '/').replace(/\"/g, '\\"');
                    this.m_logger.debug('result of worker routine: ', rawResult);
                }
                const dr = BlockExecutorWorkerRoutine.decodeResult(params, message);
                if (dr.err) {
                    resolve({err: dr.err, type: params.type, name: params.name, chain: params.chain});
                } else {
                    resolve(dr.result);
                }
            });
        });
        return result;
    }

    cancel() {
        if (!this.m_childProcess || this.m_childProcess.killed) {
            return ;
        }
        this.m_logger.debug(`executor canceled, will kill routine process`);
        this.m_childProcess!.kill();
    }
}