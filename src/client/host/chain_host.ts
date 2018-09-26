
import * as path from 'path';
import * as fs from 'fs-extra';

import {Options as CommandOptions} from '../lib/simple_command';

import {INode, initChainCreator, initLogger, Chain} from '../../core';

import {ChainServer} from './rpc';

type NetInstance = (commandOptions: CommandOptions) => INode|undefined;

export class ChainHost {
    constructor() {
        
    }

    public async initMiner(commandOptions: CommandOptions): Promise<boolean> {
        let dataDir = this._parseDataDir(commandOptions);
        if (!dataDir) {
            console.error('chain_host initMiner fail _parseDataDir');
            return false;
        }
        let logger = this._parseLogger(dataDir, commandOptions);
        let creator = initChainCreator({logger});
        let cr = await creator.createMinerInstance(dataDir);
        if (cr.err) {
            console.error('chain_host initMiner fail createMinerInstance');
            return false;
        }
        let node = this._parseNode(commandOptions);
        if (!node) {
            console.error('chain_host initMiner fail _parseNode');
            return false;
        }
        let pr = cr.miner!.parseInstanceOptions(node, commandOptions);
        if (pr.err) {
            console.error('chain_host initMiner fail parseInstanceOptions');
            return false;
        }
        let err = await cr.miner!.initialize(pr.value!);
        if (err) {
            console.error('chain_host initMiner fail initialize');
            return false;
        }
        this.m_server = new ChainServer(logger, cr.miner!.chain!, cr.miner!);
        this.m_server.init(commandOptions);
        return true;
    }

    public async initPeer(commandOptions: CommandOptions): Promise<boolean> {
        let dataDir = this._parseDataDir(commandOptions);
        if (!dataDir) {
            return false;
        }
        let logger = this._parseLogger(dataDir, commandOptions);
        let creator = initChainCreator({logger});
        let cr = await creator.createChainInstance(dataDir, {initComponents: true});
        if (cr.err) {
            return false;
        }
        let node = this._parseNode(commandOptions);
        if (!node) {
            return false;
        }
        let pr = cr.chain!.parseInstanceOptions(node, commandOptions);
        if (pr.err) {
            return false;
        }
        let err = await cr.chain!.initialize(pr.value!);
        if (err) {
            return false;
        }
        this.m_server = new ChainServer(logger, cr.chain!);
        this.m_server.init(commandOptions);
        return true;
    }

    private static CREATE_TIP = `command: create --package [packageDir] --dataDir [dataDir] --[genesisConfig] [genesisConfig] --[externalHandler]`;

    public async createGenesis(commandOptions: CommandOptions): Promise<boolean> {
        if (!commandOptions.get('package')) {
            console.error(ChainHost.CREATE_TIP);
            return false;
        }
        let _package = commandOptions.get('package');
        if (!path.isAbsolute(_package)) {
            _package = path.join(process.cwd(), _package);
        } 
        if (!commandOptions.get('dataDir')) {
            console.error(ChainHost.CREATE_TIP);
            return false;
        }
        let dataDir = commandOptions.get('dataDir');
        if (!path.isAbsolute(dataDir)) {
            dataDir = path.join(process.cwd(), dataDir);
        }
        if (!fs.existsSync(dataDir)) {
            fs.ensureDirSync(dataDir);
        } else {
            fs.removeSync(dataDir);
        }
        let logger = this._parseLogger(dataDir, commandOptions);
        let creator = initChainCreator({logger});
        let genesisOptions;
        if (commandOptions.get('genesisConfig')) {
            let _path = commandOptions.get('genesisConfig');
            if (!path.isAbsolute(_path)) {
                _path = path.join(process.cwd(), _path);
            }
            genesisOptions = fs.readJsonSync(_path);
        }
        let cr = await creator.createGenesis(_package, dataDir, genesisOptions, commandOptions.get('externalHandler'));
        if (cr.err) {
            return false;
        }
        return true;
    }

    protected _parseLogger(dataDir: string, commandOptions: CommandOptions): any {
        let loggerOptions = Object.create(null);
        loggerOptions.console = false;
        loggerOptions.level = 'error';
        if (commandOptions.get('loggerConsole')) {
            loggerOptions.console = true;
        }
        if (commandOptions.get('loggerLevel')) {
            loggerOptions.level = commandOptions.get('loggerLevel');
        }
        let loggerPath = path.join(dataDir, 'log');
        fs.ensureDir(loggerPath);
        loggerOptions.file = {root: loggerPath};
        return initLogger({loggerOptions});
    }

    protected _parseNode(commandOptions: CommandOptions): INode|undefined  {
        if (commandOptions.get('net')) {
            let ni = this.m_net.get(commandOptions.get('net'));
            if (!ni) {
                console.error('invalid net');
                return undefined;
            }
            return ni(commandOptions);
        }
    }

    protected _parseDataDir(commandOptions: CommandOptions): string|undefined {
        let dataDir = commandOptions.get('dataDir');
        if (!dataDir) {
            return undefined;
        }
        if (!path.isAbsolute(dataDir)) {
            dataDir = path.join(process.cwd(), dataDir);
        }
        if (commandOptions.has('forceClean')) {
            fs.removeSync(dataDir); 
        }
        
        if (Chain.dataDirValid(dataDir)) {
            return dataDir;
        } else {
            fs.ensureDirSync(dataDir);
        }

        if (!commandOptions.get('genesis')) {
            console.error('no genesis');
            return undefined;
        }
        let _path = commandOptions.get('genesis');
        if (!path.isAbsolute(_path)) {
            _path = path.join(process.cwd(), _path);
        }
        fs.copySync(_path, dataDir);   
        
        return dataDir;
    }

    public registerNet(net: string, instance: NetInstance) {
        this.m_net.set(net, instance);
    }

    private m_net: Map<string, NetInstance> = new Map();

    protected m_server?: ChainServer;
}