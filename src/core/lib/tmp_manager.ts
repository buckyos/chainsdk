import * as path from 'path';
import * as fs from 'fs-extra';
import {ErrorCode} from '../error_code';
import { LoggerInstance } from './logger_util';

export class TmpManager {
    constructor(options: {root: string, logger: LoggerInstance}) {
        this.m_tmpDir = path.join(options.root, './tmp');
        this.m_logger = options.logger;
    }

    init(options: {clean: boolean}): ErrorCode {
        try {
            if (options.clean) {
                fs.removeSync(this.m_tmpDir);
            }
            fs.ensureDirSync(this.m_tmpDir);
        } catch (e) {
            this.m_logger.error(`init tmp dir ${this.m_tmpDir} failed `, e);
            return ErrorCode.RESULT_EXCEPTION;
        }
        return ErrorCode.RESULT_OK;
    }

    get tmpDir(): string {
        return this.m_tmpDir;
    }

    getPath(name: string): string {
        return path.join(this.m_tmpDir, name);
    }

    private m_tmpDir: string;
    private m_logger: LoggerInstance;
}