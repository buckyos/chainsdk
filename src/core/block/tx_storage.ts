import * as sqlite from 'sqlite';
import {ErrorCode} from '../error_code';
import { BlockHeader, Block } from './block';
import { LoggerInstance } from '../lib/logger_util';
import {BlockStorage} from './block_storage';
let assert = require('assert');

export interface ITxStorage {
    init(): Promise<ErrorCode>;

    uninit(): void;

    add(blockhash: string): Promise<ErrorCode>;

    remove(nBlockHeight: number): Promise<ErrorCode>;

    get(txHash: string): Promise<{err: ErrorCode, blockhash?: string}>;

    getCountByAddress(address: string): Promise<{err: ErrorCode, count?: number}>;
}

const initSql = 'CREATE TABLE IF NOT EXISTS "txview"("txhash" CHAR(64) PRIMARY KEY NOT NULL UNIQUE, "address" CHAR(64) NOT NULL, "blockheight" INTEGER NOT NULL, "blockhash" CHAR(64) NOT NULL);';

export class TxStorage implements ITxStorage {
    private m_db: sqlite.Database;
    private m_logger: LoggerInstance;
    private m_blockStorage: BlockStorage;
    private m_readonly: boolean;

    constructor(options: {
        logger: LoggerInstance;
        db: sqlite.Database;
        blockstorage: BlockStorage;
        readonly?: boolean;
    }) {
        this.m_readonly = !!(options && options.readonly);
        this.m_db = options.db;
        this.m_logger = options.logger;
        this.m_blockStorage = options.blockstorage;
    }

    public async init(): Promise<ErrorCode> {
        if (!this.m_readonly) {
            try {
                await this.m_db.run(initSql);
            } catch (e) {
                this.m_logger.error(e);
                return ErrorCode.RESULT_EXCEPTION;
            }
        }
        return ErrorCode.RESULT_OK;
    }

    uninit() {
        // do nothing
    }

    public async add(blockhash: string): Promise<ErrorCode> {
        if (!this.m_blockStorage.has(blockhash)) {
            assert(false, `can't find block ${blockhash} when update tx storage`);
            return ErrorCode.RESULT_NOT_FOUND;
        }
        let block = this.m_blockStorage.get(blockhash);
        if (!block) {
            this.m_logger.error(`can't load ${blockhash} when update tx storage`);
            return ErrorCode.RESULT_INVALID_BLOCK;
        } 

        try {
            for (let tx of block.content.transactions) { 
                await this.m_db.run(`insert into txview (txhash, address, blockheight, blockhash) values ("${tx.hash}","${tx.address}", ${block.number}, "${block.hash}")`);
            }    
        } catch (e) {
            this.m_logger.error(`add exception,error=${e},blockhash=${blockhash}`);
            return ErrorCode.RESULT_EXCEPTION;
        }

        return ErrorCode.RESULT_OK;
    }

    public async remove(nBlockHeight: number): Promise<ErrorCode> {
        try {
            await this.m_db.run(`delete from txview where blockheight > ${nBlockHeight}`);
        } catch (e) {
            this.m_logger.error(`remove exception,error=${e},height=${nBlockHeight}`);
            return ErrorCode.RESULT_EXCEPTION;
        }

        return ErrorCode.RESULT_OK;
    }

    public async get(txHash: string): Promise<{err: ErrorCode, blockhash?: string}> {
        try {
            let result = await this.m_db.get(`select blockhash from txview where txhash="${txHash}"`);
            if (!result || result.blockhash === undefined) { 
                return {err: ErrorCode.RESULT_NOT_FOUND};
            }

            return {err: ErrorCode.RESULT_OK, blockhash: result.blockhash};
        } catch (e) {
            this.m_logger.error(`get exception,error=${e},txHash=${txHash}`);
            return {err: ErrorCode.RESULT_EXCEPTION };
        }
    }

    public async getCountByAddress(address: string): Promise<{err: ErrorCode, count?: number}> {
        try {
            let result = await this.m_db.get(`select count(*) as value from txview where address="${address}"`);
            if (!result || result.value === undefined) {
                return {err: ErrorCode.RESULT_FAILED};
            }

            return {err: ErrorCode.RESULT_OK, count: result.value as number};
        } catch (e) {
            this.m_logger.error(`getCountByAddress exception,error=${e},address=${address}`);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }
}