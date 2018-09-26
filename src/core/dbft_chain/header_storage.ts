import * as sqlite from 'sqlite';
import * as sqlite3 from 'sqlite3';
import {ErrorCode} from '../error_code';
import { LoggerInstance } from '../lib/logger_util';
import {IHeaderStorage, IReadableStorage, StorageManager} from '../chain';
import {LRUCache} from '../lib/LRUCache';
import {DbftBlockHeader} from './block';
import {DbftContext} from './context';

const initHeadersSql = 'CREATE TABLE IF NOT EXISTS "miners"("hash" CHAR(64) PRIMARY KEY NOT NULL UNIQUE, "miners" TEXT NOT NULL, "totalView" INTEGER NOT NULL);';
const addHeaderSql = 'INSERT INTO miners (hash, miners, totalView) values ($hash, $miners, $totalView)';
const getHeaderSql = 'SELECT miners, totalView FROM miners WHERE hash=$hash';

export class DbftHeaderStorage {
    public constructor(options: {
        db: sqlite.Database,
        headerStorage: IHeaderStorage,
        logger: LoggerInstance,
        globalOptions: any,
        readonly?: boolean,
    }) {
        this.m_readonly = !!(options && options.readonly);
        this.m_db = options.db;
        this.m_logger = options.logger;
        this.m_headerStorage = options.headerStorage;
        this.m_globalOptions = options.globalOptions;
    }
    private m_readonly: boolean;
    protected m_db: sqlite.Database;
    protected m_logger: LoggerInstance;
    protected m_cache: LRUCache<string, {m: string[], v: number}> = new LRUCache(12);
    protected m_globalOptions: any;
    protected m_headerStorage: IHeaderStorage;

    public async init(): Promise<ErrorCode> {
        if (!this.m_readonly) {
            try {
                await this.m_db!.run(initHeadersSql);
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

    public updateGlobalOptions(globalOptions: any) {
        this.m_globalOptions = globalOptions;
    }

    public async _getHeader(hash: string): Promise<{err: ErrorCode, miners?: string[], totalView?: number}> {
        let c = this.m_cache.get(hash);
        if (c) {
            return {err: ErrorCode.RESULT_OK, miners: c.m, totalView: c.v};
        }

        try {
            const gm = await this.m_db!.get(getHeaderSql, {$hash: hash});
            if (!gm || !gm.miners) {
                this.m_logger.error(`getMinersSql error,election block hash=${hash}`);
                return {err: ErrorCode.RESULT_NOT_FOUND};
            }
            let miners = JSON.parse(gm.miners);
            this.m_cache.set(hash, {m: miners, v: gm.totalView});
            return {err: ErrorCode.RESULT_OK, miners: miners!, totalView: gm.totalView};
        } catch (e) {
            this.m_logger.error(e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async addHeader(header: DbftBlockHeader, storageManager: StorageManager ): Promise<ErrorCode> {
        let miners: string[] = [];
        if (DbftContext.isElectionBlockNumber(this.m_globalOptions, header.number)) {
            const gs = await storageManager.getSnapshotView(header.hash);
            if (gs.err) {
                return gs.err;
            }
            const context = new DbftContext(gs.storage!, this.m_globalOptions, this.m_logger);
            const gmr = await context.getMiners();
            storageManager.releaseSnapshotView(header.hash);
            if (gmr.err) {
                return gmr.err;
            }
            miners =  gmr.miners!;
        }
        let totalView = 0;
        if (header.number !== 0) {
            const ghr = await this._getHeader(header.preBlockHash);
            if (ghr.err) {
                return ghr.err;
            }
            totalView = ghr.totalView!;
        }
        totalView += Math.pow(2, header.view + 1) - 1;
        try {
            await this.m_db!.run(addHeaderSql, {$hash: header.hash, $miners: JSON.stringify(miners), $totalView: totalView});
            return ErrorCode.RESULT_OK;
        } catch (e) {
            this.m_logger.error(e);
            return ErrorCode.RESULT_EXCEPTION;
        }
    }

    public async getTotalView(header: DbftBlockHeader): Promise<{err: ErrorCode, totalView?: number}> {
        this.m_logger.debug(`getTotalView, hash=${header.hash}`);
        return await this._getHeader(header.hash);
    }

    public async getMiners(header: DbftBlockHeader): Promise<{err: ErrorCode, miners?: string[]}> {
        return await this._getMiners(header, false);
    }

    public async getNextMiners(header: DbftBlockHeader): Promise<{err: ErrorCode, miners?: string[]}> {
        return await this._getMiners(header, true);
    }

    protected async _getMiners(header: DbftBlockHeader, bNext: boolean): Promise<{err: ErrorCode, miners?: string[]}> {
        let en = DbftContext.getElectionBlockNumber(this.m_globalOptions, bNext ? header.number + 1 : header.number);
        let electionHeader: DbftBlockHeader;
        if (header.number === en) {
            electionHeader = header;
        } else {
            let hr = await this.m_headerStorage.getHeader(header.preBlockHash, en - header.number + 1);
            if (hr.err) {
                this.m_logger.error(`dbft get electionHeader error,number=${header.number},prevblockhash=${header.preBlockHash}`);
                return { err: hr.err };
            }
            electionHeader = hr.header as DbftBlockHeader;
        }
        
        return this._getHeader(electionHeader.hash);
    }

    async getDueMiner(header: DbftBlockHeader, miners: string[]): Promise<{err: ErrorCode, miner?: string}> {
        if (header.number === 0) {
            return {err: ErrorCode.RESULT_OK, miner: header.miner};
        }
        const hr = await this.m_headerStorage.getHeader(header.preBlockHash);
        if (hr.err) {
            this.m_logger.error(`getDueMiner failed for get pre block failed `, hr.err);
            return {err: hr.err};
        }
        let due = DbftContext.getDueNextMiner(this.m_globalOptions, hr.header! as DbftBlockHeader, miners, header.view);
        return {err: ErrorCode.RESULT_OK, miner: due};
    }
}