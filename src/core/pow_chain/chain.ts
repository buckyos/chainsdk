import {ErrorCode} from '../error_code';
import {ValueChain, ChainTypeOptions, Block, Storage} from '../value_chain';
import {PowBlockHeader} from './block';
import * as consensus from './consensus';

export class PowChain extends ValueChain {
    protected _getBlockHeaderType() {
        return PowBlockHeader;
    }

    protected _onCheckGlobalOptions(globalOptions: any): boolean {
        if (!super._onCheckGlobalOptions(globalOptions)) {
            return false;
        }
        return consensus.onCheckGlobalOptions(globalOptions);
    }

    protected _onCheckTypeOptions(typeOptions: ChainTypeOptions): boolean {
        return typeOptions.consensus === 'pow';
    }

    async onCreateGenesisBlock(block: Block, storage: Storage, genesisOptions?: any): Promise<ErrorCode> {
        let err = await super.onCreateGenesisBlock(block, storage, genesisOptions);
        if (err) {
            return err;
        }
        let gkvr = await storage.getKeyValue(ValueChain.dbSystem, ValueChain.kvConfig);
        if (gkvr.err) {
            return gkvr.err;
        }
        let rpr = await gkvr.kv!.set('consensus', 'pow');
        if (rpr.err) {
            return rpr.err;
        }
        (block.header as PowBlockHeader).bits = this.globalOptions.basicBits;
        block.header.updateHash();
        return ErrorCode.RESULT_OK;
    }
}