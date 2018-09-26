
import { Receipt, Transaction } from './transaction';
import { Serializable, BufferReader, BufferWriter, SerializableWithHash } from '../serializable';
import { ErrorCode } from '../error_code';
import * as merkle from '../lib/merkle';
import { Encoding } from '../lib/encoding';
import * as assert from 'assert';
const digest = require('../lib/digest');

export class BlockHeader extends SerializableWithHash {
    private m_number: number;
    private m_timestamp: number;
    // all Hash is return from digest.hash256
    // 32bit Buffer => hex, char[64]
    private m_storageHash: string;
    private m_preBlockHash: string;
    private m_merkleRoot: string;
    private m_receiptHash: string;

    constructor() {
        super();
        this.m_number = 0;
        this.m_storageHash = Encoding.NULL_HASH;
        this.m_preBlockHash = Encoding.NULL_HASH;
        this.m_receiptHash = Encoding.NULL_HASH;
        this.m_merkleRoot = Encoding.NULL_HASH;
        this.m_timestamp = -1;
    }

    get number(): number {
        return this.m_number;
    }

    get storageHash(): string {
        return this.m_storageHash;
    }

    set storageHash(h: string) {
        this.m_storageHash = h;
    }

    get preBlockHash(): string {
        return this.m_preBlockHash;
    }

    get timestamp(): number {
        return this.m_timestamp;
    }

    set timestamp(n: number) {
        this.m_timestamp = n;
    }

    public isPreBlock(header: BlockHeader): boolean {
        return (this.m_number + 1 === header.m_number) && (this.m_hash === header.m_preBlockHash);
    }

    public setPreBlock(header?: BlockHeader) {
        if (header) {
            this.m_number = header.m_number + 1;
            this.m_preBlockHash = header.hash;
        } else {
            // gensis block
            this.m_number = 0;
            this.m_preBlockHash = Encoding.NULL_HASH;
        }
    }

    get merkleRoot(): string {
        return this.m_merkleRoot;
    }

    public hasTransaction(txHash: string): boolean {
        // TODO: find hash from txHash
        return false;
    }

    private _genMerkleRoot(txs: Transaction[]): string {
        const leaves = [];
        for (const tx of txs) {
            leaves.push(Buffer.from(tx.hash, 'hex'));
        }
        const [root, malleated] = merkle.createRoot(leaves);
        if (malleated) {
            return Encoding.NULL_HASH;
        }
        return root.toString('hex');
    }

    private _genReceiptHash(receipts: IterableIterator<Receipt>): string {
        let writer = new BufferWriter();
        for (const receipt of receipts) {
            receipt.encode(writer);
        }
        return digest.hash256(writer.render()).toString('hex');
    }

    /**
     * virtual
     * verify hash here
     */
    public async verify(chain: any): Promise<{err: ErrorCode, valid?: boolean}> {
        return {err: ErrorCode.RESULT_OK, valid: true};
    }

    public verifyContent(content: BlockContent): boolean {
        if (this.m_merkleRoot !== this._genMerkleRoot(content.transactions)) {
            return false;
        }
        if (this.m_receiptHash !== this._genReceiptHash(content.receipts)) {
            return false;
        }
        return true;
    }

    public updateContent(content: BlockContent) {
        this.m_merkleRoot = this._genMerkleRoot(content.transactions);
        this.m_receiptHash = this._genReceiptHash(content.receipts);
    }

    protected _encodeHashContent(writer: BufferWriter): ErrorCode {
        try {
            writer.writeU32(this.m_number);
            writer.writeI32(this.m_timestamp);
            writer.writeHash(this.m_merkleRoot);
            writer.writeHash(this.m_storageHash);
            writer.writeHash(this.m_receiptHash);
            writer.writeHash(this.m_preBlockHash);
        } catch (e) {
            return ErrorCode.RESULT_INVALID_FORMAT;
        }
        
        return ErrorCode.RESULT_OK;
    }

    protected _decodeHashContent(reader: BufferReader): ErrorCode {
        try {
            this.m_number = reader.readU32();
            this.m_timestamp = reader.readI32();
            this.m_merkleRoot = reader.readHash('hex');
            this.m_storageHash = reader.readHash('hex');
            this.m_receiptHash = reader.readHash('hex');
            this.m_preBlockHash = reader.readHash('hex');
        } catch (e) {
            return ErrorCode.RESULT_INVALID_FORMAT;
        }
        
        return ErrorCode.RESULT_OK;
    }

    public stringify(): any {
        let obj = super.stringify();
        obj.number = this.number;
        obj.timestamp = this.timestamp;
        obj.preBlock = this.preBlockHash;
        obj.merkleRoot = this.merkleRoot;
        return obj;
    }
}

export class BlockContent implements Serializable {
    constructor(transactionType: new () => Transaction, receiptType: new () => Receipt) {
        this.m_transactions = new Array();
        this.m_receipts = new Map<string, Receipt>();
        this.m_transactionType = transactionType;
        this.m_receiptType = receiptType;
    }

    private m_transactionType: new () => Transaction;
    private m_receiptType: new () => Receipt;
    private m_transactions: Transaction[];
    private m_receipts: Map<string, Receipt>;

    get transactions(): Transaction[] {
        const t = this.m_transactions;
        return t;
    }

    get receipts(): IterableIterator<Receipt> {
        return this.m_receipts.values();
    }

    public hasTransaction(txHash: string): boolean {
        for (const tx of this.m_transactions) {
            if (tx.hash === txHash) {
                return true;
            }
        }
        return false;
    }

    public getTransaction(arg: string | number): Transaction | null {
        if (typeof (arg) === 'string') {
            for (const tx of this.m_transactions) {
                if (tx.hash === arg) {
                    return tx;
                }
            }
        } else if (typeof (arg) === 'number') {
            if (arg >= 0 && arg < this.m_transactions.length) {
                return this.m_transactions[arg];
            }
        }
        return null;
    }

    public getReceipt(txHash: string): Receipt | undefined {
        return this.m_receipts.get(txHash);
    }

    public addTransaction(tx: Transaction) {
        this.m_transactions.push(tx);
    }

    public addReceipt(receipt: Receipt) {
        this.m_receipts.set(receipt.transactionHash, receipt);
    }

    public setReceipts(receipts: Receipt[]) {
        this.m_receipts.clear();
        for (let r of receipts) {
            this.m_receipts.set(r.transactionHash, r);
        }
    }

    public encode(writer: BufferWriter): ErrorCode {
        try {
            writer.writeU16(this.m_transactions.length);
            for (let tx of this.m_transactions) {
                let err = tx.encode(writer);
                if (err) {
                    return err;
                }
                let r = this.m_receipts.get(tx.hash);
                assert(r);
                err = r!.encode(writer);
                if (err) {
                    return err;
                }
            }
        } catch (e) {
            return ErrorCode.RESULT_INVALID_FORMAT;
        }
        
        return ErrorCode.RESULT_OK;
    }

    public decode(reader: BufferReader): ErrorCode {
        this.m_transactions = [];
        this.m_receipts = new Map();
        
        let txCount: number;
        try {
            txCount = reader.readU16();
        } catch (e) {
            return ErrorCode.RESULT_INVALID_FORMAT;
        }
        
        for (let ix = 0; ix < txCount; ++ix) {
            let tx = new this.m_transactionType();
            let err = tx.decode(reader);
            if (err !== ErrorCode.RESULT_OK) {
                return err;
            }
            this.m_transactions.push(tx);
            let receipt = new this.m_receiptType();
            err = receipt.decode(reader);
            if (err !== ErrorCode.RESULT_OK) {
                return err;
            }
            this.m_receipts.set(tx.hash, receipt);
        }
        return ErrorCode.RESULT_OK;
    }
}

export class Block implements Serializable {
    private m_header: BlockHeader;
    private m_content: BlockContent;
    private m_transactionType: new () => Transaction;
    private m_headerType: new () => BlockHeader;
    private m_receiptType: new () => Receipt;

    constructor(options: {
        header?: BlockHeader;
        headerType: new () => BlockHeader;
        transactionType: new () => Transaction;
        receiptType: new () => Receipt;
    }) {
        this.m_transactionType = options.transactionType;
        this.m_headerType = options.headerType;
        this.m_header = new this.m_headerType();
        this.m_receiptType = options.receiptType;
        if (options.header) {
            let writer: BufferWriter = new BufferWriter();
            let err = options.header.encode(writer);
            assert(!err, `encode header failed with err ${err}`);
            let reader: BufferReader = new BufferReader(writer.render());
            err = this.m_header.decode(reader);
            assert(!err, `clone header failed with err ${err}`);
        }
        this.m_content = new BlockContent(this.m_transactionType, this.m_receiptType);
    }

    clone(): Block {
        let writer: BufferWriter = new BufferWriter();
        let err = this.encode(writer);
        assert(!err, `encode block failed ${err}`);
        let reader: BufferReader = new BufferReader(writer.render());
        let newBlock = new Block({
            headerType: this.m_headerType,
            transactionType: this.m_transactionType,
            receiptType: this.m_receiptType,
        });
        err = newBlock.decode(reader);
        assert(!err, `clone block ${this.m_header.hash} failed for ${err}`);
        return newBlock;
    }

    get header(): BlockHeader {
        return this.m_header;
    }

    get content(): BlockContent {
        return this.m_content;
    }

    get hash(): string {
        return this.m_header.hash;
    }

    get number(): number {
        return this.m_header.number;
    }

    public encode(writer: BufferWriter): ErrorCode {
        let err = this.m_header.encode(writer);
        if (err) {
            return err;
        }
        return this.m_content.encode(writer);
    }

    public decode(reader: BufferReader): ErrorCode {
        let err = this.m_header.decode(reader);
        if (err !== ErrorCode.RESULT_OK) {
            return err;
        }
        return this.m_content.decode(reader);
    }

    public verify(): boolean {
        // 验证content hash
        return this.m_header.verifyContent(this.m_content);
    }
}