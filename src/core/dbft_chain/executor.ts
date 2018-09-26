import {ErrorCode} from '../error_code';
import {ValueBlockExecutor, ValueBlockHeader} from '../value_chain';
import {DbftContext} from './context';

export class DbftBlockExecutor extends ValueBlockExecutor {
   
    public async executePostBlockEvent(): Promise<ErrorCode> {
        if (this.m_block.number > 0) {
            let dbftProxy: DbftContext = new DbftContext(this.m_storage, this.m_globalOptions, this.m_logger);
            if (DbftContext.isElectionBlockNumber(this.m_globalOptions, this.m_block.number)) {
                await dbftProxy.updateMiners(this.m_block.number);
            }
        }
        return await super.executePostBlockEvent();
    }    
}
