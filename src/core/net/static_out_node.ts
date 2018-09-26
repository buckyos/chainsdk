import {ErrorCode} from '../error_code';
import {INode} from './node';

export function instance(superClass: new(...args: any[]) => INode) {
    return class extends superClass {
        constructor(...args: any[]) {
            super(...args.slice(1));
            this.m_staticPeers = (args[0]).slice(0);
        }
        private m_staticPeers: string[];
        async randomPeers(count: number, excludes: string[]): Promise<{err: ErrorCode, peers: string[]}> {
            const doubleCount = 2 * count;
            if (this.m_staticPeers.length) {
                const ex = new Set(excludes);
                let inc = [];
                for (const peerid of this.m_staticPeers) {
                    if (!ex.has(peerid)) {
                        inc.push(peerid);
                    }
                }
                if (inc.length <= doubleCount) {
                    return {err: ErrorCode.RESULT_OK, peers: inc};
                } else {
                    const start = Math.floor(inc.length * Math.random());
                    let peers = [];
                    peers.push(...inc.slice(start));
                    if (peers.length <= doubleCount) {
                        peers.push(...inc.slice(doubleCount - peers.length));
                    }
                    return {err: ErrorCode.RESULT_OK, peers};
                }
            } else {
                return {err: ErrorCode.RESULT_SKIPPED, peers: []};
            }
        }
    };
}
