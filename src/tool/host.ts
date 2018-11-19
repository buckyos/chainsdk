#!/usr/bin/env node
import * as process from 'process';
import * as path from 'path';
import {initUnhandledRejection, parseCommand, host as chainhost, initLogger} from '../client';

Error.stackTraceLimit = 1000;

export async function run(argv: string[]) {
    let command = parseCommand(argv);
    if (!command) {
        console.error(`parse command error, exit.`);
        process.exit();
        return ;
    }
    if (command.options.has('dataDir')) {
        initUnhandledRejection(initLogger({
            loggerOptions: {console: true, file: {root: path.join(process.cwd(), command.options.get('dataDir')), filename: 'exception.log'}}
        }));
    }
    let exit: boolean = false;
    if (command.command === 'peer') {
        exit = !(await chainhost.initPeer(command.options)).ret;
    } else if (command.command === 'miner') {
        exit = !(await chainhost.initMiner(command.options)).ret;
    } else if (command.command === 'create') {
        await chainhost.createGenesis(command.options);
        exit = true;
    } else if (command.command === 'restore') {
        if (!command.options.has('height')) {
            console.log('Usage: --dataDir [dataDir] --height [blockHeight]');
            process.exit(1);
        }
        let options = new Map<string, any>();
        options.set('net', 'standalone');
        options.set('dataDir', command.options.get('dataDir'));
        options.set('loggerConsole', true);
        let ret = await chainhost.initPeer(options);
        if (ret.chain) {
            let height = parseInt(command.options.get('height'));
            let headerRet = await ret.chain.headerStorage.getHeader(height);
            if (headerRet.err) {
                console.log(`get header error ${headerRet.err}, exit.`);
            } else {
                console.log(`recovering storage for Block ${headerRet.header!.hash}...`);
                await ret.chain.storageManager.createStorage('temp', headerRet.header!.hash);
                console.log(`restore complete.`);
            }
            
        }
        process.exit(0);
    } else {
        console.error(`invalid action command ${command.command}`);
        exit = true;
    }
    if (exit) {
        process.exit();
    }
}

if (require.main === module) {
    run(process.argv);
}