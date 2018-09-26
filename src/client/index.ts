export * from '../core';
export * from './client/client';
export * from './lib/simple_command';
export {init as initUnhandledRejection} from './lib/unhandled_rejection';
export {rejectifyValue, rejectifyErrorCode} from './lib/rejectify';

export * from './host/chain_host';
import {ChainHost} from './host/chain_host';
import {Options as CommandOptions} from './lib/simple_command';
import {StaticOutNode, TcpNode, BdtNode} from '../core';
let host = new ChainHost();
host.registerNet('tcp', (commandOptions: CommandOptions): any => {
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
    let nodeType = StaticOutNode(TcpNode);
    return new nodeType(peers, {host: _host, port});
});

host.registerNet('bdt', (commandOptions: CommandOptions): any => {
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
        peerid = `${host}:${port}`;
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
    };

    return new BdtNode({host: _host, tcpport, udpport, peerid, snPeer, bdtLoggerOptions: bdt_logger});
});

export {host};

import {initChainCreator, createValueDebuger, ErrorCode, ValueIndependDebugSession, ValueChainDebugSession} from '../core';
const valueChainDebuger = {
    async createIndependSession(loggerOptions: {console: boolean, file?: {root: string, filename?: string}, level?: string}, dataDir: string): Promise<{err: ErrorCode, session?: ValueIndependDebugSession}> {
        const cdr = await createValueDebuger(initChainCreator({loggerOptions}), dataDir);
        if (cdr.err) {
            return {err: cdr.err};
        }
        return {err: ErrorCode.RESULT_OK, session: cdr.debuger!.createIndependSession()};
    },

    async createChainSession(loggerOptions: {console: boolean, file?: {root: string, filename?: string}, level?: string}, dataDir: string, debugerDir: string): Promise<{err: ErrorCode, session?: ValueChainDebugSession}> {
        const cdr = await createValueDebuger(initChainCreator({loggerOptions}), dataDir);
        if (cdr.err) {
            return {err: cdr.err};
        }
        return cdr.debuger!.createChainSession(debugerDir);
    }
};
export {valueChainDebuger};