import * as assert from 'assert';
import { ErrorCode } from '../error_code';
import { LoggerInstance } from '../lib/logger_util';
import {Block} from '../block';
import {StorageManager, Storage} from '../storage';
import { BlockExecutor } from '../executor';

export interface IBlockExecutorRoutineManager {
    create(options: { name: string, block: Block, storage: Storage}): {err: ErrorCode, routine: BlockExecutorRoutine};
}

export enum BlockExecutorRoutineState {
    init,
    running,
    finished,
}

export abstract class BlockExecutorRoutine {
    constructor(options: {
        name: string, 
        block: Block, 
        storage: Storage,
        logger: LoggerInstance
    }) {
        this.m_logger = options.logger;
        this.m_block = options.block;
        this.m_storage = options.storage;
        this.m_name = options.name;
    }

    get name(): string {
        return this.m_name;
    }

    get block(): Block {
        return this.m_block;
    }

    get storage(): Storage {
        return this.m_storage;
    }

    protected m_logger: LoggerInstance;
    protected m_storageManager?: StorageManager;
    protected m_block: Block;
    protected m_storage: Storage;
    protected m_name: string; 

    abstract execute(): Promise<{err: ErrorCode, result?: {err: ErrorCode}}>;
    abstract verify(): Promise<{err: ErrorCode, result?: {err: ErrorCode, valid?: ErrorCode}}>;
    abstract cancel(): void;
}