import { Block, BlockHeader, BlockContent } from './block';
import { BufferWriter, BufferReader } from '../serializable';
import { LoggerInstance } from '../lib/logger_util';
import { Transaction, Receipt } from './transaction';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ErrorCode } from '../../client';

export interface IBlockStorage {
    init(): ErrorCode;
    has(blockHash: string): boolean;
    get(blockHash: string): Block | undefined;
    add(block: Block): ErrorCode;
    getSize(blockHash: string): number;
}

export class BlockStorage implements IBlockStorage {
    constructor(options: {
        path: string,
        blockHeaderType: new () => BlockHeader,
        transactionType: new () => Transaction,
        receiptType: new () => Receipt,
        logger: LoggerInstance,
        readonly?: boolean
    }) {
        this.m_path = path.join(options.path, 'Block');
        this.m_blockHeaderType = options.blockHeaderType;
        this.m_transactionType = options.transactionType;
        this.m_receiptType = options.receiptType;
        this.m_logger = options.logger;
        this.m_readonly = !!options.readonly;
    }

    private m_readonly: boolean;
    private m_blockHeaderType: new () => BlockHeader;
    private m_transactionType: new () => Transaction;
    private m_receiptType: new () => Receipt;
    private m_path: string;
    private m_logger: LoggerInstance;

    public init(): ErrorCode {
        if (!this.m_readonly) {
            fs.mkdirsSync(this.m_path);
        }
        return ErrorCode.RESULT_OK;
    }

    public uninit(): void {
        // do nothing
    }

    public has(blockHash: string): boolean {
        return fs.existsSync(this._pathOfBlock(blockHash));
    }

    private _pathOfBlock(hash: string): string {
        return path.join(this.m_path, hash);
    }

    public get(blockHash: string): Block | undefined {
        let blockRaw;
        try {
            blockRaw = fs.readFileSync(this._pathOfBlock(blockHash));
        } catch (error) {
            this.m_logger.warn(`readBlockFile ${this._pathOfBlock(blockHash)} failed.`);
        }
        
        if (blockRaw) {
            let block = new Block({ headerType: this.m_blockHeaderType, transactionType: this.m_transactionType, receiptType: this.m_receiptType });
            let err = block.decode(new BufferReader(blockRaw));
            if (err) {
                this.m_logger.error(`load block ${blockHash} from storage failed!`);
                return undefined;
            }
            return block;
        } else {
            return undefined;
        }
    }

    private _add(hash: string, blockRaw: Buffer) {
        fs.writeFileSync(this._pathOfBlock(hash), blockRaw);
    }

    public add(block: Block): ErrorCode {
        if (this.m_readonly) {
            return ErrorCode.RESULT_NOT_SUPPORT;
        }
        let hash = block.hash;
        if (this.has(hash)) {
            return ErrorCode.RESULT_ALREADY_EXIST;
        }
        let writer = new BufferWriter();
        let err = block.encode(writer);
        if (err) {
            this.m_logger.error(`invalid block `, block);
            return err;
        }
        this._add(hash, writer.render());
        return ErrorCode.RESULT_OK;
    }

    public getSize(blockHash: string): number {
        if (!this.has(blockHash)) {
            return -1;
        }
        let stat = fs.statSync(this._pathOfBlock(blockHash));
        return stat.size;
    }
}