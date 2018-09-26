import {ErrorCode} from '../error_code';
import * as path from 'path';
import {LoggerInstance} from '../lib/logger_util';
import * as fs from 'fs-extra';

export type NodeStorageOptions = {
    count: number;
    dataDir: string;
    logger: LoggerInstance
};

type BanInfo = {
    peerid: string;
    endtime: number; // 结束禁用的时间
};

export class NodeStorage {
    protected m_nodes: string[] = [];
    protected m_banNodes: BanInfo[] = [];
    protected m_file: string;
    protected m_bFlush = false;
    private m_logger: LoggerInstance;
    protected m_staticNodes: string[] = [];

    constructor(options: NodeStorageOptions) {
        this.m_file = path.join(options.dataDir, 'nodeinfo');
        this.m_logger = options.logger;
        try {
            fs.ensureDirSync(options.dataDir);
            if (fs.existsSync(this.m_file)) {
                let json: any = fs.readJsonSync(this.m_file);
                this.m_nodes = json['nodes'] ? json['nodes'] : [];
                this.m_banNodes = json['bans'] ? json['bans'] : [];
            }
        } catch (e) {
            this.m_logger.error(`[node_storage NodeStorage constructor] ${e.toString()}`);
        }

        // 在这里读一次staticnodes
        const staticFile = path.join(options.dataDir, 'staticnodes');
        if (fs.pathExistsSync(staticFile)) {
            this.m_staticNodes = fs.readJSONSync(staticFile);
        }

        setInterval(() => {
            this.flush();
        }, 60 * 1000);
    }

    public get(arg: number|'all'): string[] {
        let count = 0;
        if (arg === 'all') {
            count = this.m_nodes.length;
        } else {
            count = count > this.m_nodes.length ? this.m_nodes.length : arg;
        }
        let peerids: string[] = this.m_nodes.slice(0, count);

        return peerids;
    }

    get staticNodes(): string[] {
        return this.m_staticNodes;
    }

    public add(peerid: string): ErrorCode {
        let nIndex = this.getIndex(peerid); 
        if (nIndex !== -1) {
            this.m_nodes.splice(nIndex, 1);
        }

        this.m_nodes.splice(0, 0, peerid);
        this.m_bFlush = true;

        return ErrorCode.RESULT_OK;
    }

    public remove(peerid: string): ErrorCode {
        let nIndex = this.getIndex(peerid);
        if (nIndex === -1) {
            return ErrorCode.RESULT_NOT_FOUND;
        }
       
        this.m_nodes.splice(nIndex, 1);
        this.m_bFlush = true;

        return ErrorCode.RESULT_OK;
    }

    // time的单位为分钟
    public ban(peerid: string, time: number): ErrorCode {
        let nIndex = this.getIndex(peerid);
        if (nIndex !== -1) {
            this.m_nodes.splice(nIndex, 1);
        }
        nIndex = this.getBanIndex(peerid);
        if (nIndex !== -1) {
            this.m_banNodes.splice(nIndex, 1);
        }

        let info: BanInfo = {peerid,  endtime: time === 0 ? 0 : Date.now() +  time * 60 * 1000};

        let pos = 0;
        for (let i = 0; i < this.m_banNodes.length; i++) {
            pos++;
            if (info.endtime <= this.m_banNodes[i].endtime) {
                break;
            }
        }
        this.m_banNodes.splice(pos, 0, info);
        this.m_bFlush = true;

        return ErrorCode.RESULT_OK;
    }

    public isBan(peerid: string): boolean {
        let nIndex = this.getBanIndex(peerid);
        if (nIndex === -1) {
            return false;
        }

        if (this.m_banNodes[nIndex].endtime === 0) {
            return true;
        }

        if (Date.now() >= this.m_banNodes[nIndex].endtime) {
            this.m_banNodes.splice(nIndex, 1);
            this.m_bFlush = true;
            return true;
        }

        return false;
    }

    protected getIndex(peerid: string): number {
        for (let i = 0; i < this.m_nodes.length; i++) {
            if (this.m_nodes[i] === peerid) {
                return i;
            }
        }

        return -1;
    }

    protected getBanIndex(peerid: string): number {
        for (let i = 0; i < this.m_banNodes.length; i++) {
            if (this.m_banNodes[i].peerid === peerid) {
                return i;
            }
        }
        return -1;
    }

    protected flush() {
        if (!this.m_bFlush) {
            return;
        }

        try {
            let json: any = {};
            json['nodes'] = this.m_nodes;
            json['bans'] = this.m_banNodes;
            fs.writeJsonSync(this.m_file, json);
            this.m_bFlush = false;
        } catch (e) {
            this.m_logger.error(`[node_storage NodeStorage flush] ${e.toString()}`);
        }
    }
}