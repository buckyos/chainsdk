import 'mocha';
import * as path from 'path';
import * as fs from 'fs-extra';
const assert = require('assert');
import * as sqlite from 'sqlite';
import * as sqlite3 from 'sqlite3';
import {Transaction, BlockStorage, BlockHeader, initLogger, HeaderStorage } from '../../src/core';
import {FakeTxStorage} from '../fake/tx_storage';

// TODO: