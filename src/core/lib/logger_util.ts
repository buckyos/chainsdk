import {transports, LoggerInstance, Logger} from 'winston';
export {LoggerInstance} from 'winston';
import * as path from 'path';
import * as fs from 'fs-extra';
const {LogShim} = require('./log_shim');

export type LoggerOptions = {
    logger?: LoggerInstance;
    loggerOptions?: {console: boolean, file?: {root: string, filename?: string}, level?: string};
};

export function initLogger(options: LoggerOptions): LoggerInstance {
    if (options.logger) {
        return options.logger;
    } else if (options.loggerOptions) {
        const loggerTransports = [];
        if (options.loggerOptions.console) {
            loggerTransports.push(new transports.Console({
                level: options.loggerOptions.level ? options.loggerOptions.level : 'info',
                timestamp: true,
                handleExceptions: true,
                humanReadableUnhandledException: true
            }));
        }
        if (options.loggerOptions.file) {
            fs.ensureDirSync(options.loggerOptions.file.root);
            loggerTransports.push(new transports.File({
                json: false,
                level: options.loggerOptions.level ? options.loggerOptions.level : 'info',
                timestamp: true,
                filename: path.join(options.loggerOptions.file.root, options.loggerOptions.file.filename || 'info.log'),
                datePattern: 'yyyy-MM-dd.',
                prepend: true,
                handleExceptions: true,
                humanReadableUnhandledException: true
            }));
        }
        const logger = new Logger({
            level: options.loggerOptions.level || 'info',
            transports: loggerTransports
        });
        
        return new LogShim(logger).log;
    } else {
        const loggerTransports = [];
        loggerTransports.push(new transports.Console({
            level: 'info',
            timestamp: true,
            handleExceptions: true
        }));
        const logger = new Logger({
            level: 'info',
            transports: loggerTransports
        });
        return new LogShim(logger).log;
    }
}

export {LogShim};