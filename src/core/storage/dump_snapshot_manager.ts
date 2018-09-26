import * as path from 'path';
import * as fs from 'fs-extra';

import { ErrorCode } from '../error_code';
import { Storage } from './storage';
import { StorageDumpSnapshot, IStorageSnapshotManager } from './dump_snapshot';
import { LoggerInstance } from '../lib/logger_util';

export class StorageDumpSnapshotManager implements IStorageSnapshotManager {
    constructor(options: {logger: LoggerInstance, path: string, readonly?: boolean}) {
        this.m_path = path.join(options.path, 'dump');
        this.m_logger = options.logger;
        this.m_readonly = !!(options && options.readonly);
    }
    protected m_logger: LoggerInstance;
    protected m_path: string;
    private m_readonly: boolean;

    public recycle() {

    }

    public async init(): Promise<ErrorCode> {
        if (!this.m_readonly) {
            fs.ensureDirSync(this.m_path);
        }
        
        return ErrorCode.RESULT_OK;
    }

    uninit() {
        // do nothing
    }

    public listSnapshots(): StorageDumpSnapshot[] {
        let blocks = fs.readdirSync(this.m_path);
        return blocks.map((blockHash) => {
            return new StorageDumpSnapshot(blockHash, this.getSnapshotFilePath(blockHash));
        });
    }

    public getSnapshotFilePath(blockHash: string): string {
        return path.join(this.m_path!, blockHash);
    }

    public async createSnapshot(from: Storage, blockHash: string): Promise<{err: ErrorCode, snapshot?: StorageDumpSnapshot}> {
        this.m_logger.info(`creating snapshot ${blockHash}`);
        const snapshot = new StorageDumpSnapshot(blockHash, this.getSnapshotFilePath(blockHash));
        fs.copyFileSync(from.filePath, snapshot.filePath);
        return {err: ErrorCode.RESULT_OK, snapshot};
    }

    public async getSnapshot(blockHash: string): Promise<{err: ErrorCode, snapshot?: StorageDumpSnapshot}> {
        const snapshot = new StorageDumpSnapshot(blockHash, this.getSnapshotFilePath(blockHash));
        if (snapshot.exists()) {
            return { err: ErrorCode.RESULT_OK, snapshot };
        } else {
            return { err: ErrorCode.RESULT_NOT_FOUND };
        }
    }

    public releaseSnapshot(blockHash: string): void {

    }

    public removeSnapshot(blockHash: string): ErrorCode {
        const snapshot = new StorageDumpSnapshot(blockHash, this.getSnapshotFilePath(blockHash));
        try {
            fs.removeSync(snapshot.filePath);
        } catch (e) {
            this.m_logger.error(`removeSnapshot ${blockHash} `, e);
            return ErrorCode.RESULT_EXCEPTION;
        }
        
        return ErrorCode.RESULT_OK;
    }
}
