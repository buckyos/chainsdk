import * as readline from 'readline';
import * as process from 'process';
import {initLogger, ChainClient, BigNumber, ErrorCode, md5, sign, verify, addressFromSecretKey, ValueTransaction, parseCommand, initUnhandledRejection} from '../../../src/client';
import {AutoEntry} from './auto_entry';

initUnhandledRejection(initLogger({loggerOptions: {console: true}}));

function main() {
    let command = parseCommand(process.argv);
    if (!command) {
        console.error('invalid command');
        process.exit();
        return ;
    }
    let secret = command.options.get('secret');
    if (!secret) {
        console.error('no scret');
        process.exit();
        return ;
    }
    let address = addressFromSecretKey(secret)!;
    let host = command.options.get('host');
    let port = command.options.get('port');
    if (!host || !port) {
        console.error('no host');
        process.exit();
        return ;
    }

    let entry: AutoEntry = new AutoEntry({ secret: command.options.get('secret'), host: command.options.get('host'), port: parseInt(command.options.get('port')) });
    let cps: any = [
        {
            cp: 'newProcess', tag: 'create', param: {
                id: 'create', command: 'node', argv: ['./dist/blockchain-sdk/src/tool/host.js', 'create', '--package', './dist/blockchain-sdk/demo/dbft/chain',
                    '--externalHandler',
                    '--dataDir', './data/dbft/genesis',
                    '--loggerConsole',
                    '--loggerLevel', 'debug',
                    '--genesisConfig', './dist/blockchain-sdk/demo/dbft/chain/genesis.json',
                    '--forceClean'
                ]
            }, bestRet: {}
        },
        {
            cp: 'newProcess', tag: 'start superAddmin', param: {
                id: 'superminer', command: 'node', argv: ['./dist/blockchain-sdk/src/tool/host.js', 'miner', '--genesis', './data/dbft/genesis',
                    '--dataDir', './data/dbft/miner1',
                    '--loggerConsole',
                    '--loggerLevel', 'debug',
                    '--minerSecret', 'e109b61f011c9939ac51808fac542b66fcb358f69bf710f5d11eb5d1f3e82bc3',
                    '--net', 'bdt', '--host', '0.0.0.0', '--port', '0|13001', '--peerid', '13CS9dBwmaboedj2hPWx6Dgzt4cowWWoNZ', '--sn', 'SN_PEER_TEST@106.75.173.166@12999@12998', '--bdt_log_level', 'debug',
                    '--rpchost',
                    'localhost',
                    '--rpcport',
                    '18089'
                ]
            }, bestRet: {}
        },
        {
            cp: 'newProcess', tag: 'start miner2', param: {
                id: 'miner2', command: 'node', argv: ['./dist/blockchain-sdk/src/tool/host.js', 'miner', '--genesis', './data/dbft/genesis',
                    '--dataDir', './data/dbft/miner2',
                    '--loggerConsole',
                    '--loggerLevel', 'debug',
                    '--minerSecret', '64d8284297f40dc7475b4e53eb72bc052b41bef62fecbd3d12c5e99b623cfc11',
                    '--net', 'bdt', '--host', '0.0.0.0', '--port', '0|13002', '--peerid', '1EYLLvMtXGeiBJ7AZ6KJRP2BdAQ2Bof79', '--sn', 'SN_PEER_TEST@106.75.173.166@12999@12998', '--bdt_log_level', 'debug',
                ]
            }, bestRet: {}
        },
        {
            cp: 'newProcess', tag: 'start miner3', param: {
                id: 'miner3', command: 'node', argv: ['./dist/blockchain-sdk/src/tool/host.js', 'miner', '--genesis', './data/dbft/genesis',
                    '--dataDir', './data/dbft/miner3',
                    '--loggerConsole',
                    '--loggerLevel', 'debug',
                    '--minerSecret', 'c07ad83d2c5627acece18312362271e22d7aeffb6e2a6e0ffe1107371514fdc2',
                    '--net', 'bdt', '--host', '0.0.0.0', '--port', '0|13003', '--peerid', '12nD5LgUnLZDbyncFnoFB43YxhSFsERcgQ', '--sn', 'SN_PEER_TEST@106.75.173.166@12999@12998', '--bdt_log_level', 'debug',
                ]
            }, bestRet: {}
        },
        {
            cp: 'newProcess', tag: 'start miner4', param: {
                id: 'miner4', command: 'node', argv: ['./dist/blockchain-sdk/src/tool/host.js', 'miner', '--genesis', './data/dbft/genesis',
                    '--dataDir', './data/dbft/miner4',
                    '--loggerConsole',
                    '--loggerLevel', 'debug',
                    '--minerSecret', 'a33225073928f9b06e452a502b92a5d010fdec5840732489e5642d7360629524',
                    '--net', 'bdt', '--host', '0.0.0.0', '--port', '0|13004', '--peerid', '1F84ggQKWqRKr84buqXcbhYQZtaV5G4jqy', '--sn', 'SN_PEER_TEST@106.75.173.166@12999@12998', '--bdt_log_level', 'debug',
                ]
            }, bestRet: {}
        },
        {
            cp: 'register', tag: 'rigister miner2', param: {address: '1EYLLvMtXGeiBJ7AZ6KJRP2BdAQ2Bof79'}, bestRet: 0
        },
        {
            cp: 'minerExist', tag: 'ensure miner2 begin new block', param: {}, bestRet: {miner: '1EYLLvMtXGeiBJ7AZ6KJRP2BdAQ2Bof79', count: 20}
        },
        // {
        //     cp: 'register', tag: 'rigister miner3', param: {address: '12nD5LgUnLZDbyncFnoFB43YxhSFsERcgQ'}, bestRet: 0
        // },
        // {
        //     cp: 'minerExist', tag: 'ensure miner3 begin new block', param: {}, bestRet: {miner: '12nD5LgUnLZDbyncFnoFB43YxhSFsERcgQ', count: 20}
        // },
        // {
        //     cp: 'register', tag: 'rigister miner4', param: {address: '1F84ggQKWqRKr84buqXcbhYQZtaV5G4jqy'}, bestRet: 0
        // },
        // {
        //     cp: 'minerExist', tag: 'ensure miner4 begin new block', param: {}, bestRet: {miner: '1F84ggQKWqRKr84buqXcbhYQZtaV5G4jqy', count: 20}
        // },
        // {
        //     cp: 'unregister', tag: 'unrigister miner2', param: {address: '1EYLLvMtXGeiBJ7AZ6KJRP2BdAQ2Bof79'}, bestRet: 0
        // },
        // {
        //     cp: 'newBlock', tag: 'after unrigister miner2, ensure chain create new block', param: {timeout: 60}, bestRet: {}
        // },
        // {
        //     cp: 'minerNotExist', tag: 'ensure miner2 not miner', param: {}, bestRet: {miner: '1EYLLvMtXGeiBJ7AZ6KJRP2BdAQ2Bof79', count: 20}
        // },
        // {
        //     cp: 'register', tag: 'after unrigister,rigister miner2', param: {address: '1EYLLvMtXGeiBJ7AZ6KJRP2BdAQ2Bof79'}, bestRet: 0
        // },
        // {
        //     cp: 'minerExist', tag: 'after unrigister, ensure miner2 begin new block', param: {}, bestRet: {miner: '1EYLLvMtXGeiBJ7AZ6KJRP2BdAQ2Bof79', count: 20}
        // },
        // {
        //     cp: 'killProcess', tag: 'close miner2', param: {id: 'miner2'}, bestRet: {}
        // },
        {
            cp: 'newBlock', tag: 'after close miner2,ensure chain create new block', param: {timeout: 60}, bestRet: {}
        }
    ];

    entry.check(cps);
}

main();