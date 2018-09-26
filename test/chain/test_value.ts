import 'mocha';
import * as path from 'path';
import * as fs from 'fs-extra';
const assert = require('assert');
import {INode, Chain, Miner, Block, BlockHeader, BufferReader, initLogger, LogShim, MinerInstanceOptions, BufferWriter, LoggerOptions, ErrorCode, staticPeeridIp, TcpNode, StaticOutNode, BaseHandler, Storage } from '../../src/core';

process.on('unhandledRejection', (reason, p) => {
    console.log('未处理的 rejection：', p, '原因：', reason);
    // 记录日志、抛出错误、或其他逻辑。
});

describe('value chain', () => {
    
});
