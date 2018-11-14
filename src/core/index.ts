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
export {StandaloneNode} from './net_standalone/node';
export {ChainCreator} from './chain_creator';
export * from './lib/digest';
export * from './lib/encoding';

import * as fs from 'fs-extra';
import {NetworkCreator} from './block/network';
import { ChainCreator, ChainCreatorConfig } from './chain_creator';
import { ChainTypeOptions, ValueHandler } from './value_chain';
import { PowChain, PowMiner } from './pow_chain';
import { DposChain, DposMiner } from './dpos_chain';
import { DbftChain, DbftMiner } from './dbft_chain';
import { initLogger, LoggerOptions } from './lib/logger_util';
import {TcpNode} from './net_tcp/node';
import {StandaloneNode} from './net_standalone/node';
import {StaticOutNode, staticPeeridIp} from './net';
import {BdtNode} from './net_bdt/node';
import {RandomOutNetwork} from './block/random_outbound_network';
import {ValidatorsNetwork} from './dbft_chain/validators_network';

export function initChainCreator(options: LoggerOptions): ChainCreator {
    const logger = initLogger(options);
    const networkCreator = new NetworkCreator({logger});
    networkCreator.registerNode('tcp', (commandOptions: Map<string, any>): any => {
        let network = commandOptions.get('network');
        if (!network) {
            network = 'default';
        }
        let _host = commandOptions.get('host');
        if (!_host) {
            console.error('invalid tcp host');
            return ;
        }
        let port = commandOptions.get('port');
        if (!port) {
            console.error('invalid tcp port');
            return ;
        }
        let peers = commandOptions.get('peers');
        if (!peers) {
            peers = [];
        } else {
            peers = (peers as string).split(';');
        }
        let nodeType = staticPeeridIp.splitInstance(StaticOutNode(TcpNode));
        return new nodeType(peers, {network, peerid: `${_host}:${port}` , host: _host, port});
    });
    
    networkCreator.registerNode('standalone', (commandOptions: Map<string, any>): any => {
        let network = commandOptions.get('network');
        if (!network) {
            network = 'default';
        }
        let peerid = commandOptions.get('peerid');
        if (!peerid) {
            peerid = 'default';
        }
        return new StandaloneNode(network, peerid);
    });
    
    networkCreator.registerNode('bdt', (commandOptions: Map<string, any>): any => {
        let network = commandOptions.get('network');
        if (!network) {
            network = 'default';
        }
        let _host = commandOptions.get('host');
        if (!_host) {
            console.error('invalid bdt host');
            return ;
        }
        let port = commandOptions.get('port');
        if (!port) {
            console.error('no bdt port');
            return ;
        }
    
        port = (port as string).split('|');
        let udpport = 0;
        let tcpport = parseInt(port[0]);
    
        if (port.length === 1) {
            udpport = tcpport + 10;
        } else {
            udpport = parseInt(port[1]);
        }
    
        if (isNaN(tcpport) || isNaN(udpport)) {
            console.error('invalid bdt port');
            return ;
        }
    
        let peerid = commandOptions.get('peerid');
        if (!peerid) {
            peerid = `${_host}:${port}`;
        }
        let snPeers = commandOptions.get('sn');
        if (!snPeers) {
            console.error('no sn');
            return ;
        }
        let snconfig = (snPeers as string).split('@');
        if (snconfig.length !== 4) {
            console.error('invalid sn: <SN_PEERID>@<SN_IP>@<SN_TCP_PORT>@<SN_UDP_PORT>');
        }
        const snPeer = {
            peerid: `${snconfig[0]}`,
            eplist: [
                `4@${snconfig[1]}@${snconfig[2]}@t`,
                `4@${snconfig[1]}@${snconfig[3]}@u`
            ]
        };
        let bdt_logger = {
            level: commandOptions.get('bdt_log_level') || 'info',
            // 设置log目录
            file_dir: commandOptions.get('dataDir') + '/log',
            file_name: commandOptions.get('bdt_log_name') || 'bdt',
        };
    
        let initDHTEntry;
        const initDHTFile = commandOptions.get('dataDir') + '/peers';
        if (fs.pathExistsSync(initDHTFile)) {
            initDHTEntry = fs.readJSONSync(initDHTFile);
        }
    
        return new BdtNode({network, host: _host, tcpport, udpport, peerid, snPeer, bdtLoggerOptions: bdt_logger, initDHTEntry});
    });

    networkCreator.registerNetwork('random', RandomOutNetwork);
    networkCreator.registerNetwork('validators', ValidatorsNetwork);

    let _creator = new ChainCreator({logger, networkCreator});
    _creator.registerChainType('pow', { 
        newHandler(creator: ChainCreator, typeOptions: ChainTypeOptions): ValueHandler {
            return new ValueHandler();
        }, 
        newChain(creator: ChainCreator, dataDir: string, config: ChainCreatorConfig): PowChain {
            return new PowChain({networkCreator, logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions});
        },
        newMiner(creator: ChainCreator, dataDir: string, config: ChainCreatorConfig): PowMiner {
            return new PowMiner({networkCreator, logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions});
        }
    });
    _creator.registerChainType('dpos', { 
        newHandler(creator: ChainCreator, typeOptions: ChainTypeOptions): ValueHandler {
            return new ValueHandler();
        }, 
        newChain(creator: ChainCreator, dataDir: string, config: ChainCreatorConfig): DposChain {
            return new DposChain({networkCreator, logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions});
        },
        newMiner(creator: ChainCreator, dataDir: string, config: ChainCreatorConfig): DposMiner {
            return new DposMiner({networkCreator, logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions});
        }
    });
    _creator.registerChainType('dbft', { 
        newHandler(creator: ChainCreator, typeOptions: ChainTypeOptions): ValueHandler {
            return new ValueHandler();
        }, 
        newChain(creator: ChainCreator, dataDir: string, config: ChainCreatorConfig): DbftChain {
            return new DbftChain({networkCreator, logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions});
        },
        newMiner(creator: ChainCreator, dataDir: string, config: ChainCreatorConfig): DbftMiner {
            return new DbftMiner({networkCreator, logger: creator.logger, handler: config.handler, dataDir, globalOptions: config.globalOptions});
        }
    });
    return _creator;
}

export * from './chain_debuger';
