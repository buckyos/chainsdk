import {ErrorCode, PowBlockHeader, BufferReader} from '../core/';

function _calcuteBlockHash(blockHeader: PowBlockHeader, nonceRange: { start: number, end: number }, nonce1Range: { start: number, end: number }) {
    // 这里做单线程的hash计算
    let errCode = ErrorCode.RESULT_FAILED;
    blockHeader.nonce = nonceRange.start;
    blockHeader.nonce1 = nonce1Range.start;
    while (true) {
        //
        if (blockHeader.verifyPOW()) {
            errCode = ErrorCode.RESULT_OK;
            break;
        }
        if (!_stepNonce(blockHeader, nonceRange, nonce1Range)) {
            errCode = ErrorCode.RESULT_OUT_OF_LIMIT;
            break;
        }
    }
    return errCode;
}

function _stepNonce(blockHeader: PowBlockHeader, nonceRange: { start: number, end: number }, nonce1Range: { start: number, end: number }) {
    if (blockHeader.nonce === nonceRange.end) {
        blockHeader.nonce = nonceRange.start;
        blockHeader.nonce1 += 1;
    } else {
        blockHeader.nonce += 1;
    }

    return blockHeader.nonce1 <= nonce1Range.end;
}

function work(_param: any) {
    let headerBuffer = Buffer.from(_param['data'], 'hex');

    let header = new PowBlockHeader();
    header.decode(new BufferReader(headerBuffer));

    let errCode = _calcuteBlockHash(header, _param['nonce'], _param['nonce1']);

    process.stdout.write(JSON.stringify({nonce: header.nonce, nonce1: header.nonce1}));
}

if (require.main === module) {
    let param = JSON.parse(process.argv[2]);
    if (!param) {
        process.stdout.write(`process argv error! ${process.argv[2]}`);
        process.exit(1);
    }
    work(param);
}
