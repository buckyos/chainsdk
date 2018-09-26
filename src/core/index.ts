export {BigNumber} from 'bignumber.js';
export * from './serializable';
export * from './error_code';
export * from './address';
export * from './lib/logger_util';
export * from './lib/decimal_transfer';
export * from './chain';
export * from './value_chain';
export * from './pow_chain';
export * from './dpos_chain';
export * from './net';
export * from './dbft_chain';
export {TcpNode} from './net_tcp/node';
export {BdtNode} from './net_bdt/node';
export {ChainCreator} from './chain_creator';
export * from './lib/digest';
export * from './lib/encoding';

import { ChainCreator, ChainCreatorConfig } from './chain_creator';
import { ChainTypeOptions, ValueHandler } from './value_chain';
import { PowChain, PowMiner } from './pow_chain';
import { DposChain, DposMiner } from './dpos_chain';
import { DbftChain, DbftMiner } from './dbft_chain';
import { initLogger, LoggerOptions } from './lib/logger_util';

export function initChainCreator(options: LoggerOptions): ChainCreator {
    let _creator = new ChainCreator(options);
    _creator.registerChainType('pow', { 
        newHandler(creator: ChainCreator, typeOptions: ChainTypeOptions): ValueHandler {
            return new ValueHandler();
        }, 
        newChain(creator: ChainCreator, dataDir: string, config: ChainCreatorConfig): PowChain {
            return new PowChain({logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions});
        },
        newMiner(creator: ChainCreator, dataDir: string, config: ChainCreatorConfig): PowMiner {
            return new PowMiner({logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions});
        }
    });
    _creator.registerChainType('dpos', { 
        newHandler(creator: ChainCreator, typeOptions: ChainTypeOptions): ValueHandler {
            return new ValueHandler();
        }, 
        newChain(creator: ChainCreator, dataDir: string, config: ChainCreatorConfig): DposChain {
            return new DposChain({logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions});
        },
        newMiner(creator: ChainCreator, dataDir: string, config: ChainCreatorConfig): DposMiner {
            return new DposMiner({logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions});
        }
    });
    _creator.registerChainType('dbft', { 
        newHandler(creator: ChainCreator, typeOptions: ChainTypeOptions): ValueHandler {
            return new ValueHandler();
        }, 
        newChain(creator: ChainCreator, dataDir: string, config: ChainCreatorConfig): DbftChain {
            return new DbftChain({logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions});
        },
        newMiner(creator: ChainCreator, dataDir: string, config: ChainCreatorConfig): DbftMiner {
            return new DbftMiner({logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions});
        }
    });
    return _creator;
}

export * from './chain_debuger';
